const crypto=require("crypto");

const SESSION_COOKIE="__Host-futorion_session";
const SESSION_TTL_MS=1000*60*60*6;
const BODY_MAX=65536;
const RATE_WINDOW_MS=60*1000;
const RATE_LIMIT=20;
const FAIL_WINDOW_MS=15*60*1000;
const FAIL_LIMIT=10;
const BASE_DELAY_MS=400;
const MAX_DELAY_MS=5000;
const ipState=new Map();

const AVAILABLE_MODELS={
  "gemini-2.5-flash":"models/gemini-2.5-flash",
  "gemini-3-flash":"models/gemini-3-flash",
  "gemma-3-27b":"models/gemma-3-27b"
};

function json(res,status,payload){
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function setSecurityHeaders(res){
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","no-referrer");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma","no-cache");
  res.setHeader("Expires","0");
}

function setCorsHeaders(req,res){
  const requestOrigin=String(req.headers.origin||"");
  const allowedOrigin=String(process.env.FUTORION_ORIGIN||"https://www.alexsjsju.eu");
  if(requestOrigin&&requestOrigin===allowedOrigin){
    res.setHeader("Access-Control-Allow-Origin",allowedOrigin);
    res.setHeader("Vary","Origin");
    res.setHeader("Access-Control-Allow-Credentials","true");
    res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers","Content-Type, Accept");
    res.setHeader("Access-Control-Max-Age","86400");
    return true;
  }
  return false;
}

function getClientIp(req){
  const xff=String(req.headers["x-forwarded-for"]||"");
  const first=xff.split(",")[0].trim();
  if(first)return first;
  return String(req.socket?.remoteAddress||"unknown");
}

function getState(ip){
  const now=Date.now();
  const current=ipState.get(ip)||{requests:[],fails:[],lastFailAt:0};
  current.requests=current.requests.filter(ts=>now-ts<RATE_WINDOW_MS);
  current.fails=current.fails.filter(ts=>now-ts<FAIL_WINDOW_MS);
  if(current.requests.length===0&&current.fails.length===0&&now-current.lastFailAt>FAIL_WINDOW_MS){
    ipState.delete(ip);
    return {requests:[],fails:[],lastFailAt:0};
  }
  ipState.set(ip,current);
  return current;
}

function shouldRateLimit(state){
  return state.requests.length>=RATE_LIMIT||state.fails.length>=FAIL_LIMIT;
}

function wait(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function safeEqualText(a,b){
  const ha=crypto.createHash("sha256").update(String(a)).digest();
  const hb=crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha,hb);
}

function b64urlEncode(v){
  return Buffer.from(v).toString("base64url");
}

function b64urlDecode(v){
  return Buffer.from(v,"base64url").toString("utf8");
}

function deriveSecret(){
  const pass=String(process.env.PPS_FUTORION||"");
  const codex=String(process.env.CODEX_FUTORION||"");
  if(!pass||!codex)return null;
  return crypto.createHash("sha256").update(`futorion:${pass}:${codex.length}`).digest();
}

function signPayload(payload,secret){
  return crypto.createHmac("sha256",secret).update(payload).digest("base64url");
}

function makeSessionToken(secret,ip){
  const now=Date.now();
  const payloadObj={
    sub:"futorion",
    iat:now,
    exp:now+SESSION_TTL_MS,
    nonce:crypto.randomBytes(16).toString("hex"),
    iph:crypto.createHash("sha256").update(ip).digest("hex")
  };
  const payload=b64urlEncode(JSON.stringify(payloadObj));
  const sig=signPayload(payload,secret);
  return `${payload}.${sig}`;
}

function parseCookies(req){
  const raw=String(req.headers.cookie||"");
  if(!raw)return {};
  return raw.split(";").reduce((acc,pair)=>{
    const i=pair.indexOf("=");
    if(i<=0)return acc;
    const k=pair.slice(0,i).trim();
    const v=pair.slice(i+1).trim();
    acc[k]=v;
    return acc;
  },{});
}

function verifySession(token,secret,ip){
  if(!token||typeof token!=="string")return false;
  const parts=token.split(".");
  if(parts.length!==2)return false;
  const [payload,sig]=parts;
  const expected=signPayload(payload,secret);
  const sigBuf=Buffer.from(sig);
  const expBuf=Buffer.from(expected);
  if(sigBuf.length!==expBuf.length)return false;
  if(!crypto.timingSafeEqual(sigBuf,expBuf))return false;
  let parsed;
  try{parsed=JSON.parse(b64urlDecode(payload));}catch(e){return false;}
  if(!parsed||parsed.sub!=="futorion")return false;
  if(typeof parsed.exp!=="number"||Date.now()>parsed.exp)return false;
  const ipHash=crypto.createHash("sha256").update(ip).digest("hex");
  if(!safeEqualText(parsed.iph||"",ipHash))return false;
  return true;
}

function readBody(req,limit){
  return new Promise((resolve,reject)=>{
    let size=0;
    const chunks=[];
    req.on("data",chunk=>{
      size+=chunk.length;
      if(size>limit){
        reject(new Error("too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end",()=>resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error",()=>reject(new Error("bad_stream")));
  });
}

function normalizeHistory(v){
  if(!Array.isArray(v))return [];
  return v.filter(x=>typeof x==="string").map(x=>x.trim()).filter(Boolean).slice(0,80);
}

function normalizeComments(v){
  if(!Array.isArray(v))return [];
  return v.filter(x=>typeof x==="string").map(x=>x.trim()).filter(Boolean).slice(0,80);
}

function sanitizeText(v,max){
  if(typeof v!=="string")return "";
  return v.trim().slice(0,max);
}

function extractJson(text){
  if(!text||typeof text!=="string")return null;
  let t=text.trim();
  if(t.startsWith("```")){
    t=t.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
  }
  try{
    return JSON.parse(t);
  }catch(e){
    return null;
  }
}

async function generatePredict(body){
  const apiKey=String(process.env.GEMINI_API_KEY||"");
  if(!apiKey){
    return {status:500,payload:{results:[]}};
  }
  const history=normalizeHistory(body.history);
  const comments=normalizeComments(body.comments);
  const selected=sanitizeText(body.selected,500);
  const requestedModel=sanitizeText(body.model,80);
  const modelPath=AVAILABLE_MODELS[requestedModel]||AVAILABLE_MODELS["gemini-2.5-flash"];
  const context=history.join(" → ");
  const commentsText=comments.join(" | ");
  const prompt=`Sei un sistema di previsione del futuro estremamente preciso.

INPUT:
${context}

SCELTA ATTUALE:
${selected}

COMMENTI AGGIUNTIVI:
${commentsText}

ISTRUZIONI:
1. Valuta se hai abbastanza dettagli (chi, cosa, quando, dove, contesto, rischi).
2. Se i dati sono troppo vaghi → restituisci SOLO JSON con domande:
{
  "questions": ["Domanda specifica 1?", "Domanda specifica 2?"],
  "message": "Per una previsione più accurata rispondi a queste domande"
}

3. Altrimenti genera fino a 8-10 futuri realistici (non limitarti a 3) usando logica quantistica (molti mondi / rami possibili) e rispondi SOLO con:
{
  "results": [
    {"title": "...", "description": "...", "probability": 0}
  ]
}

Titoli max 4 parole. Descrizioni 2-4 frasi realistiche. Puoi generare da 2 a 10 rami in base alla complessità.`;
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})
    });
    if(!r.ok){
      return {status:500,payload:{results:[]}};
    }
    const raw=await r.json();
    const text=((raw?.candidates||[])[0]?.content?.parts||[]).map(p=>String(p?.text||"")).join("\n").trim();
    const parsed=extractJson(text);
    return {status:200,payload:parsed||{results:[]}};
  }catch(e){
    return {status:500,payload:{results:[]}};
  }
}

module.exports=async function handler(req,res){
  setSecurityHeaders(res);
  const corsAllowed=setCorsHeaders(req,res);

  if(req.method==="OPTIONS"){
    if(!corsAllowed){
      return json(res,403,{error:"Origin non consentita"});
    }
    res.statusCode=204;
    return res.end();
  }

  const secret=deriveSecret();
  if(!secret){
    return json(res,500,{error:"Server non configurato"});
  }

  const ip=getClientIp(req);
  const state=getState(ip);
  state.requests.push(Date.now());

  if(shouldRateLimit(state)){
    res.setHeader("Retry-After","60");
    return json(res,429,{error:"Troppi tentativi, riprova dopo"});
  }

  if(req.method==="POST"){
    const ctype=String(req.headers["content-type"]||"").toLowerCase();
    if(!ctype.startsWith("application/json")){
      return json(res,415,{error:"Content-Type non supportato"});
    }

    let bodyText="";
    try{
      bodyText=await readBody(req,BODY_MAX);
    }catch(e){
      if(e.message==="too_large")return json(res,413,{error:"Payload troppo grande"});
      return json(res,400,{error:"Body non valido"});
    }

    let body;
    try{
      body=JSON.parse(bodyText||"{}");
    }catch(e){
      return json(res,400,{error:"JSON non valido"});
    }

    if(body&&body.action==="predict"){
      const cookies=parseCookies(req);
      const token=cookies[SESSION_COOKIE];
      const valid=verifySession(token,secret,ip);
      if(!valid){
        return json(res,401,{error:"Sessione non valida"});
      }
      const out=await generatePredict(body);
      return json(res,out.status,out.payload);
    }

    const password=typeof body.password==="string"?body.password.trim():"";
    if(password.length<4||password.length>256){
      return json(res,400,{error:"Password non valida"});
    }

    const expected=String(process.env.PPS_FUTORION||"");
    const ok=expected&&safeEqualText(password,expected);
    if(!ok){
      state.fails.push(Date.now());
      state.lastFailAt=Date.now();
      const delay=Math.min(MAX_DELAY_MS,BASE_DELAY_MS*Math.pow(2,Math.max(0,state.fails.length-1)));
      await wait(delay);
      return json(res,401,{error:"Credenziali errate"});
    }

    state.fails=[];
    const token=makeSessionToken(secret,ip);
    const cookieParts=[
      `${SESSION_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=None",
      `Max-Age=${Math.floor(SESSION_TTL_MS/1000)}`
    ];
    res.setHeader("Set-Cookie",cookieParts.join("; "));
    return json(res,200,{ok:true});
  }

  if(req.method==="GET"){
    const u=new URL(req.url||"/",`https://${req.headers.host||"localhost"}`);

    if(u.searchParams.get("action")==="status"){
      return json(res,200,{
        status:"ok",
        current_model:"gemini-2.5-flash",
        available_models:Object.keys(AVAILABLE_MODELS)
      });
    }

    const cookies=parseCookies(req);
    const token=cookies[SESSION_COOKIE];
    const valid=verifySession(token,secret,ip);
    if(!valid){
      return json(res,401,{error:"Sessione non valida"});
    }

    const content=String(process.env.CODEX_FUTORION||"");
    if(!content){
      return json(res,500,{error:"Contenuto non configurato"});
    }
    return json(res,200,{content});
  }

  res.setHeader("Allow","GET, POST, OPTIONS");
  return json(res,405,{error:"Metodo non consentito"});
};

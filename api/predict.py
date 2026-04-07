import os,json,logging,re
from flask import Flask,request,jsonify
from flask_cors import CORS
import google.generativeai as genai

app=Flask(__name__)
CORS(app)
api_key=os.environ.get("GEMINI_API_KEY")
logging.basicConfig(level=logging.INFO)

if api_key: genai.configure(api_key=api_key)
else: logging.warning("GEMINI_API_KEY non trovata.")

def get_available_model(preferred_version="2.5-flash"):
    fallback_models=["Gemini 2.5 Flash","Gemini 3 Flash","Gemini 2.5 Flash Lite","Gemma 3 27B","Gemma 3 12B","Gemma 3 4B","Gemma 3 2B","Gemma 3 1B"]
    try:
        models=genai.list_models()
        available=[m.name for m in models if "generateContent" in m.supported_generation_methods]
        for m in available:
            if preferred_version in m:
                return m
        return available[0] if available else fallback_models[0]
    except Exception as e:
        logging.error(f"Errore list_models: {e}")
        return fallback_models[0]

MODEL_NAME=get_available_model()
logging.info(f"Uso modello: {MODEL_NAME}")
model=genai.GenerativeModel(MODEL_NAME)
BAD={"nuovo","altro","fallback","idea","alternativa","generico","generale","variazione"}

def extract_json(text):
    if not text: return None
    t=text.strip()
    if t.startswith("```"):
        t=re.sub(r"^```(?:json)?\s*|\s*```$","",t,flags=re.I|re.S).strip()
    m=re.search(r"\{.*\}",t,re.S)
    if m: t=m.group(0)
    try: return json.loads(t)
    except: return None

def clean_options(items,history):
    seen={str(x).strip().lower() for x in history if str(x).strip()}
    out=[]
    out_seen=set()
    for x in items or []:
        s=" ".join(str(x).split()).strip()
        if not s: continue
        k=s.lower()
        if k in seen or k in BAD or k in out_seen: continue
        out.append(s)
        out_seen.add(k)
        if len(out)>=20: break
    return out

@app.route("/api/predict",methods=["POST","OPTIONS"])
def predict():
    if request.method=="OPTIONS": return jsonify({}),200
    data=request.json or {}
    history=[str(x).strip() for x in data.get("history",[]) if str(x).strip()]
    selected=str(data.get("selected","")).strip()
    depth=int(data.get("depth",len(history)))
    percorso=" -> ".join(history)
    prompt=f"""
Sei un generatore di tassonomie.

Contesto attuale: {percorso}
Scelta corrente: {selected}
Livello: {depth}

Regole:
- genera esattamente 20 opzioni
- tutte in italiano
- ogni opzione deve essere breve ma concreta
- devono essere più specifiche del livello precedente
- niente parole generiche o vuote
- vietate: nuovo, altro, idea, alternativa, fallback, generico, generale
- niente spiegazioni, niente testo extra

Restituisci solo JSON valido:
{{"options":["..."]}}
"""
    try:
        response=model.generate_content(prompt,generation_config={"response_mime_type":"application/json","temperature":0.9,"top_p":0.95})
        parsed=extract_json(response.text or "")
        options=clean_options(parsed.get("options",[]) if isinstance(parsed,dict) else [],history)
        return jsonify({"options":options})
    except Exception as e:
        logging.exception("Errore generazione")
        return jsonify({"options":[]}),500

@app.route("/")
def health():
    return jsonify({"status":"ok","model":MODEL_NAME})

if __name__=="__main__":
    app.run(host="0.0.0.0",port=8080)

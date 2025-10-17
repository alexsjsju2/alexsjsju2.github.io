const admin = require("firebase-admin");
const { createClient } = require("@supabase/supabase-js");

let firebaseInitialized = false;
function ensureFirebase() {
  if (firebaseInitialized) return;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT missing on server");
  }
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  firebaseInitialized = true;
}

let supabase = null;
function initSupabase() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
  supabase = createClient(url, key, { auth: { persistSession: false } });
  return supabase;
}

function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function jsonError(res, status=400, msg="Bad request") {
  setCORSHeaders(res);
  return res.status(status).json({ ok: false, error: msg });
}

function jsonOk(res, data) {
  setCORSHeaders(res);
  return res.status(200).json({ ok: true, data });
}

function replaceServerTimestamps(obj) {
  ensureFirebase();
  const FieldValue = admin.firestore.FieldValue;
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    if (Object.keys(obj).length === 1 && obj._serverTimestamp === true) {
      return FieldValue.serverTimestamp();
    }
    const out = Array.isArray(obj) ? [] : {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      out[k] = (v && typeof v === "object") ? replaceServerTimestamps(v) : v;
    }
    return out;
  } else if (Array.isArray(obj)) {
    return obj.map(replaceServerTimestamps);
  }
  return obj;
}

function applyFirestoreWhere(q, whereArr) {
  if (!Array.isArray(whereArr)) return q;
  for (const w of whereArr) {
    if (!w || !w.field || !w.op) continue;
    q = q.where(w.field, w.op, w.value);
  }
  return q;
}

async function verifyFirebaseToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || !auth.startsWith("Bearer ")) throw new Error("Missing Authorization Bearer token");
  const token = auth.split(" ")[1];
  ensureFirebase();
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded;
  } catch (err) {
    throw new Error("Invalid Firebase ID token");
  }
}

function getCollectionRef(collectionPath, db) {
  const parts = collectionPath.split('/').filter(p => p);
  if (parts.length % 2 === 0) throw new Error("Invalid collectionPath: must point to a collection (odd number of parts)");
  let ref = db;
  for (let i = 0; i < parts.length - 1; i += 2) {
    ref = ref.collection(parts[i]).doc(parts[i + 1]);
  }
  return ref.collection(parts[parts.length - 1]);
}

async function getDocRef(collectionPath, docId, db) {
  const collRef = getCollectionRef(collectionPath, db);
  return collRef.doc(docId);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCORSHeaders(res);
    res.status(200).end();
    return;
  }

  try {
    const payload = req.method === "GET" ? req.query : req.body;
    if (!payload || !payload.database || !payload.action) return jsonError(res, 400, "Missing database/action");
    let user = null;
    if (!payload.public) {
      try {
        user = await verifyFirebaseToken(req);
      } catch (err) {
        return jsonError(res, 401, err.message || "Unauthorized");
      }
    }
    if (payload.database === "firestore") {
      ensureFirebase();
      const db = admin.firestore();
      const action = payload.action;
      let collectionPath = payload.collectionPath || payload.collection;
      switch(action) {
        case "getDoc": {
          if (!collectionPath || !payload.docId) return jsonError(res,400,"collectionPath/docId required");
          const docRef = await getDocRef(collectionPath, payload.docId, db);
          const doc = await docRef.get();
          if (!doc.exists) return jsonOk(res, null);
          return jsonOk(res, { id: doc.id, ...doc.data() });
        }
        case "getCollection": {
          if (!collectionPath) return jsonError(res,400,"collectionPath required");
          let q = getCollectionRef(collectionPath, db);
          if (payload.query) {
            if (payload.query.where) q = applyFirestoreWhere(q, payload.query.where);
            if (payload.query.orderBy) { const ob = payload.query.orderBy; q = q.orderBy(ob.field, ob.direction || "asc"); }
            if (payload.query.limit) q = q.limit(parseInt(payload.query.limit,10));
            if (payload.query.offset) q = q.offset(parseInt(payload.query.offset,10));
          }
          const snap = await q.get();
          const items = [];
          snap.forEach(d => items.push({ id:d.id, ...d.data() }));
          return jsonOk(res, items);
        }
        case "setDoc": {
          if (!collectionPath || !payload.docId || typeof payload.data === "undefined") return jsonError(res,400,"collectionPath/docId/data required");
          const data = replaceServerTimestamps(payload.data);
          const docRef = await getDocRef(collectionPath, payload.docId, db);
          await docRef.set(data, { merge: payload.merge || false });
          return jsonOk(res, { success:true });
        }
        case "updateDoc": {
          if (!collectionPath || !payload.docId || typeof payload.data === "undefined") return jsonError(res,400,"collectionPath/docId/data required");
          const data = replaceServerTimestamps(payload.data);
          const docRef = await getDocRef(collectionPath, payload.docId, db);
          await docRef.update(data);
          return jsonOk(res, { success:true });
        }
        case "addDoc": {
          if (!collectionPath || typeof payload.data === "undefined") return jsonError(res,400,"collectionPath/data required");
          const data = replaceServerTimestamps(payload.data);
          const collRef = getCollectionRef(collectionPath, db);
          const ref = await collRef.add(data);
          return jsonOk(res, { id: ref.id });
        }
        case "deleteDoc": {
          if (!collectionPath || !payload.docId) return jsonError(res,400,"collectionPath/docId required");
          const docRef = await getDocRef(collectionPath, payload.docId, db);
          await docRef.delete();
          return jsonOk(res, { success:true });
        }
        default:
          return jsonError(res,400,"Unsupported firestore action");
      }
    }
    if (payload.database === "supabase") {
      const sb = initSupabase();
      const action = payload.action;
      switch(action) {
        case "supabase_select": {
          if (!payload.table) return jsonError(res,400,"table required");
          let q = sb.from(payload.table).select(payload.columns || "*");
          if (payload.query && Array.isArray(payload.query.where)) {
            for (const w of payload.query.where) {
              const op = (w.op || "eq").toLowerCase();
              if (op === "eq") q = q.eq(w.col, w.val);
              else if (op === "neq") q = q.neq(w.col, w.val);
              else if (op === "lt") q = q.lt(w.col, w.val);
              else if (op === "lte") q = q.lte(w.col, w.val);
              else if (op === "gt") q = q.gt(w.col, w.val);
              else if (op === "gte") q = q.gte(w.col, w.val);
              else if (op === "like") q = q.like(w.col, w.val);
              else if (op === "ilike") q = q.ilike(w.col, w.val);
            }
          }
          if (payload.query && payload.query.limit) q = q.limit(payload.query.limit);
          if (payload.query && payload.query.order) q = q.order(payload.query.order.col, { ascending: payload.query.order.asc !== false });
          const { data, error } = await q;
          if (error) throw error;
          return jsonOk(res, data);
        }
        case "supabase_insert": {
          if (!payload.table || typeof payload.values === "undefined") return jsonError(res,400,"table/values required");
          const { data, error } = await sb.from(payload.table).insert(payload.values).select();
          if (error) throw error;
          return jsonOk(res, data);
        }
        case "supabase_update": {
          if (!payload.table || typeof payload.values === "undefined" || !payload.query || !Array.isArray(payload.query.where)) return jsonError(res,400,"table/values/query.where required");
          let q = sb.from(payload.table);
          for (const w of payload.query.where) q = q.eq(w.col, w.val);
          const { data, error } = await q.update(payload.values).select();
          if (error) throw error;
          return jsonOk(res, data);
        }
        case "supabase_delete": {
          if (!payload.table || !payload.query || !Array.isArray(payload.query.where)) return jsonError(res,400,"table/query.where required");
          let q = sb.from(payload.table);
          for (const w of payload.query.where) q = q.eq(w.col, w.val);
          const { data, error } = await q.delete().select();
          if (error) throw error;
          return jsonOk(res, data);
        }
        default:
          return jsonError(res,400,"Unsupported supabase action");
      }
    }
    return jsonError(res,400,"Unknown database: use 'firestore' or 'supabase'");
  } catch (err) {
    console.error("universal error:", err);
    setCORSHeaders(res);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
};

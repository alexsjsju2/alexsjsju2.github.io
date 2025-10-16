

const admin = require("firebase-admin");
const { createClient } = require("@supabase/supabase-js");

let db = null;
function initFirebase() {
  if (db) return db;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env var");
  }
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
    });
  }
  db = admin.firestore();
  return db;
}

let supabase = null;
function initSupabase() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var");
  supabase = createClient(url, key, { auth: { persistSession: false } });
  return supabase;
}

function jsonError(res, status = 400, message = "Bad request") {
  return res.status(status).json({ ok: false, error: message });
}
function jsonOk(res, data) {
  return res.status(200).json({ ok: true, data });
}

function replaceServerTimestamps(obj) {
  const FieldValue = admin.firestore.FieldValue;
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    if (Object.keys(obj).length === 1 && obj._serverTimestamp === true) {
      return FieldValue.serverTimestamp();
    }
    const out = Array.isArray(obj) ? [] : {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v && typeof v === "object") out[k] = replaceServerTimestamps(v);
      else out[k] = v;
    }
    return out;
  } else if (Array.isArray(obj)) {
    return obj.map(replaceServerTimestamps);
  }
  return obj;
}

function applyFirestoreWhere(q, whereArr = []) {
  if (!Array.isArray(whereArr)) return q;
  for (const w of whereArr) {
    if (!w || !w.field || !w.op) continue;
    q = q.where(w.field, w.op, w.value);
  }
  return q;
}

module.exports = async (req, res) => {
  try {
    const secretHeader = req.headers["x-api-secret"];
    if (!process.env.API_SECRET) {
      console.error("API_SECRET not set on server");
      return jsonError(res, 500, "Server misconfigured");
    }
    if (!secretHeader || secretHeader !== process.env.API_SECRET) {
      return jsonError(res, 401, "Unauthorized");
    }

    const payload = req.method === "GET" ? req.query : req.body;
    if (!payload || !payload.database || !payload.action) {
      return jsonError(res, 400, "Missing required fields: database and action");
    }

    if (payload.database === "firestore") {
      const db = initFirebase();
      const action = payload.action;

      switch (action) {
        case "getDoc": {
          if (!payload.collection || !payload.docId) return jsonError(res, 400, "collection/docId required");
          const doc = await db.collection(payload.collection).doc(payload.docId).get();
          if (!doc.exists) return jsonOk(res, null);
          return jsonOk(res, { id: doc.id, ...doc.data() });
        }

        case "getCollection": {
          if (!payload.collection) return jsonError(res, 400, "collection required");
          let q = db.collection(payload.collection);
          if (payload.query) {
            if (payload.query.where) q = applyFirestoreWhere(q, payload.query.where);
            if (payload.query.orderBy) {
              const ob = payload.query.orderBy; 
              q = q.orderBy(ob.field, ob.direction || "asc");
            }
            if (payload.query.limit) q = q.limit(parseInt(payload.query.limit, 10));
            if (payload.query.offset) q = q.offset(parseInt(payload.query.offset, 10));
          }
          const snap = await q.get();
          const items = [];
          snap.forEach(d => items.push({ id: d.id, ...d.data() }));
          return jsonOk(res, items);
        }

        case "setDoc": {
          if (!payload.collection || !payload.docId || typeof payload.data === "undefined")
            return jsonError(res, 400, "collection/docId/data required");
          const data = replaceServerTimestamps(payload.data);
          await db.collection(payload.collection).doc(payload.docId).set(data, { merge: false });
          return jsonOk(res, { success: true });
        }

        case "updateDoc": {
          if (!payload.collection || !payload.docId || typeof payload.data === "undefined")
            return jsonError(res, 400, "collection/docId/data required");
          const data = replaceServerTimestamps(payload.data);
          await db.collection(payload.collection).doc(payload.docId).update(data);
          return jsonOk(res, { success: true });
        }

        case "addDoc": {
          if (!payload.collection || typeof payload.data === "undefined")
            return jsonError(res, 400, "collection/data required");
          const data = replaceServerTimestamps(payload.data);
          const ref = await db.collection(payload.collection).add(data);
          return jsonOk(res, { id: ref.id });
        }

        case "deleteDoc": {
          if (!payload.collection || !payload.docId) return jsonError(res, 400, "collection/docId required");
          await db.collection(payload.collection).doc(payload.docId).delete();
          return jsonOk(res, { success: true });
        }

        default:
          return jsonError(res, 400, "Unsupported action for firestore");
      }
    }

    if (payload.database === "supabase") {
      const sb = initSupabase();
      const action = payload.action;

      switch (action) {
        case "supabase_select": {
          if (!payload.table) return jsonError(res, 400, "table required");
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
          if (!payload.table || typeof payload.values === "undefined") return jsonError(res, 400, "table/values required");
          const { data, error } = await sb.from(payload.table).insert(payload.values).select();
          if (error) throw error;
          return jsonOk(res, data);
        }

        case "supabase_update": {
          if (!payload.table || typeof payload.values === "undefined" || !payload.query || !Array.isArray(payload.query.where))
            return jsonError(res, 400, "table/values/query.where required");
          let q = sb.from(payload.table);
          for (const w of payload.query.where) q = q.eq(w.col, w.val);
          const { data, error } = await q.update(payload.values).select();
          if (error) throw error;
          return jsonOk(res, data);
        }

        case "supabase_delete": {
          if (!payload.table || !payload.query || !Array.isArray(payload.query.where))
            return jsonError(res, 400, "table/query.where required");
          let q = sb.from(payload.table);
          for (const w of payload.query.where) q = q.eq(w.col, w.val);
          const { data, error } = await q.delete().select();
          if (error) throw error;
          return jsonOk(res, data);
        }

        default:
          return jsonError(res, 400, "Unsupported action for supabase");
      }
    }

    return jsonError(res, 400, "Unknown database, use 'firestore' or 'supabase'");
  } catch (err) {
    console.error("universal API error:", err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
};

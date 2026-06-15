const admin = require('firebase-admin');

let db;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  db = admin.firestore();
} catch (error) {}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!db) return res.status(500).json({ error: 'DB error' });

  if (req.method === 'POST') {
    try {
      const { action, id, target, data } = req.body;
      const ref = db.collection('webrtc_signals');
      const now = admin.firestore.FieldValue.serverTimestamp();
      
      const oldDocs = await ref.where('timestamp', '<', new Date(Date.now() - 60000)).get();
      const batch = db.batch();
      oldDocs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      if (action === 'getConfig') {
        let iceServers = [];
        try {
          if(process.env.SCALL_CRED) iceServers = JSON.parse(process.env.SCALL_CRED);
        } catch(e) {}
        return res.status(200).json({ iceServers });
      }

      if (action === 'send') {
        await ref.add({ id, target, data, timestamp: now });
        return res.status(200).json({ success: true });
      }

      if (action === 'poll') {
        const snap = await ref.where('target', '==', id).get();
        const signals = [];
        const readBatch = db.batch();
        snap.forEach(doc => {
          signals.push(doc.data());
          readBatch.delete(doc.ref);
        });
        await readBatch.commit();
        return res.status(200).json(signals);
      }
      
      return res.status(400).end();
    } catch (err) {
      return res.status(500).json({ error: 'Sync error' });
    }
  } else {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).end();
  }
}

import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error("Firebase Auth Error");
  }
}

const db = admin.apps.length ? admin.firestore() : null;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { action, payload, user } = req.body;

  if (action === 'login') {
    if (payload === process.env.PSW_CHAT) return res.status(200).json({ role: 'admin' });
    return res.status(200).json({ role: 'user' });
  }

  if (!db) return res.status(500).json({ error: 'Database non connesso' });

  try {
    if (action === 'send') {
      await db.collection('schat_messages').doc(payload.id).set(payload);

      if (process.env.WEBHOOK_DCC) {
        try {
          await fetch(process.env.WEBHOOK_DCC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `Hai un messaggio su SChat, vai a vedere! da parte di: ${payload.from}`
            })
          });
        } catch (err) {}
      }

      return res.status(200).json({ success: true });
    }

    if (action === 'poll') {
      const messagesRef = db.collection('schat_messages');
      const snapshot = await messagesRef.where('to', '==', user).get();
      
      let messages = [];
      let batch = db.batch();
      
      snapshot.forEach(doc => {
        messages.push(doc.data());
        batch.delete(doc.ref);
      });
      
      if (messages.length > 0) await batch.commit();
      return res.status(200).json({ messages });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  return res.status(400).json({ error: 'Bad Request' });
}

const admin = require('firebase-admin');

if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error("Firebase init error", error);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Database non configurato' });
  }

  const db = admin.firestore();
  const messagesRef = db.collection('transit_messages');
  const ADMIN_PASSWORD = process.env.PSW_CHAT || 'admin_secret';

  if (req.method === 'POST') {
    try {
      const { token, message } = req.body;
      if (message.sender === 'Admin' && token !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Non autorizzato' });
      }
      
      await messagesRef.doc(message.id).set({
        ...message,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Errore invio' });
    }
  }

  if (req.method === 'GET') {
    try {
      const { receiver, token } = req.query;
      
      if (receiver === 'Admin' && token !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Non autorizzato' });
      }

      if (!receiver) {
        return res.status(400).json({ error: 'Receiver mancante' });
      }

      const snapshot = await messagesRef.where('receiver', '==', receiver).get();
      const messages = [];
      const batch = db.batch();

      snapshot.forEach(doc => {
        messages.push(doc.data());
        batch.delete(doc.ref); 
      });

      if (messages.length > 0) {
        await batch.commit();
      }

      return res.status(200).json({ messages });
    } catch (error) {
      return res.status(500).json({ error: 'Errore lettura' });
    }
  }

  return res.status(405).json({ error: 'Metodo non consentito' });
}

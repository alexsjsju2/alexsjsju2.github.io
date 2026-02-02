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
} catch (error) {
  console.error('Errore nell\'inizializzazione di Firebase:', error);
}

export default async function handler(req, res) {
  if (!db) {
    return res.status(500).json({ error: 'Errore di configurazione del server' });
  }

  const docRef = db.collection('links').doc('current');

  if (req.method === 'GET') {
    try {
      const doc = await docRef.get();
      if (doc.exists) {
        res.status(200).json({ link: doc.data().link });
      } else {
        res.status(200).json({ link: null });
      }
    } catch (error) {
      console.error('Errore nel recupero del link:', error);
      res.status(500).json({ error: 'Errore nel recupero del link' });
    }
  } else if (req.method === 'POST') {
    try {
      const { link } = req.body;
      if (!link) {
        return res.status(400).json({ error: 'Link mancante' });
      }
      await docRef.set({ link });
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Errore nel salvataggio del link:', error);
      res.status(500).json({ error: 'Errore nel salvataggio del link' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Metodo ${req.method} non consentito`);
  }
}

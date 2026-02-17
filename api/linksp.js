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
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!db) {
    return res.status(500).json({ error: 'Errore di configurazione del server' });
  }

  const notesCollection = db.collection('notes');
  const id = req.query.id;

  if (req.method === 'GET') {
    if (!id) {
      return res.status(400).json({ error: 'ID mancante' });
    }
    try {
      const doc = await notesCollection.doc(id).get();
      if (doc.exists) {
        res.status(200).json({ id: doc.id, content: doc.data().content });
      } else {
        res.status(404).json({ error: 'Nota non trovata' });
      }
    } catch (error) {
      console.error('Errore nel recupero della nota:', error);
      res.status(500).json({ error: 'Errore nel recupero della nota' });
    }
  } else if (req.method === 'POST') {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ error: 'Contenuto mancante' });
      }
      const newDocRef = await notesCollection.add({ content });
      res.status(200).json({ id: newDocRef.id, success: true });
    } catch (error) {
      console.error('Errore nel salvataggio della nota:', error);
      res.status(500).json({ error: 'Errore nel salvataggio della nota' });
    }
  } else if (req.method === 'PUT') {
    if (!id) {
      return res.status(400).json({ error: 'ID mancante' });
    }
    try {
      const { content } = req.body;
      if (content === undefined) {
        return res.status(400).json({ error: 'Contenuto mancante' });
      }
      await notesCollection.doc(id).set({ content });
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Errore nell\'aggiornamento della nota:', error);
      res.status(500).json({ error: 'Errore nell\'aggiornamento della nota' });
    }
  } else if (req.method === 'DELETE') {
    if (!id) {
      return res.status(400).json({ error: 'ID mancante' });
    }
    try {
      await notesCollection.doc(id).delete();
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Errore nella eliminazione della nota:', error);
      res.status(500).json({ error: 'Errore nella eliminazione della nota' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
    res.status(405).end(`Metodo ${req.method} non consentito`);
  }
}

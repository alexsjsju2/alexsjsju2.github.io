import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  const docRef = db.collection('links').doc('main'); 

  try {
    if (req.method === 'GET') {
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(200).json({ value: '' });
      }
      return res.status(200).json({ value: doc.data().url });
    } 
    
    if (req.method === 'POST') {
      const { value } = req.body;
      if (!value || typeof value !== 'string') {
        return res.status(400).json({ error: 'Link mancante o non valido' });
      }

      await docRef.set({ url: value });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Metodo non consentito' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

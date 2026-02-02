import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let db;

if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    const app = initializeApp({
        credential: cert(serviceAccount)
    });
    db = getFirestore(app);
}

export default async function handler(req, res) {
    const docRef = db.collection('links').doc('mainLink');

    try {
        if (req.method === 'POST') {
            const { link } = req.body;
            if (!link) return res.status(400).json({ success: false, message: 'Link mancante' });

            await docRef.set({ link });
            return res.status(200).json({ success: true, message: 'Link salvato' });

        } else if (req.method === 'GET') {
            const doc = await docRef.get();
            if (!doc.exists) return res.status(404).json({ success: false, message: 'Link non trovato' });

            return res.status(200).json({ success: true, link: doc.data().link });
        } else {
            return res.status(405).json({ success: false, message: 'Metodo non supportato' });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Errore server' });
    }
}

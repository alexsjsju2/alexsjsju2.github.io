const admin = require('firebase-admin');
const crypto = require('crypto');

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.error(error);
    }
}

const db = admin.firestore();
const hash = str => crypto.createHash('sha256').update(String(str)).digest('hex');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: "Method Not Allowed" });

    try {
        const { action, num, pass, to, data, ids } = req.body;

        if (!num || !pass) return res.status(400).json({ error: "Credenziali mancanti" });

        const cleanNum = String(num).replace(/[^0-9]/g, '');
        const userRef = db.collection('numbers').doc(cleanNum);

        if (action === 'register') {
            const userDoc = await userRef.get();
            if (userDoc.exists) return res.status(400).json({ error: "Numero già in uso" });
            await userRef.set({ password: hash(pass), createdAt: admin.firestore.FieldValue.serverTimestamp() });
            return res.status(200).json({ message: "Numero creato con successo" });
        }

        const userDoc = await userRef.get();
        if (!userDoc.exists) return res.status(404).json({ error: "Numero inesistente" });
        if (userDoc.data().password !== hash(pass)) return res.status(401).json({ error: "Password errata" });

        if (action === 'send') {
            if (!to || !data) return res.status(400).json({ error: "Dati incompleti" });
            const cleanTo = String(to).replace(/[^0-9]/g, '');
            
            await db.collection('messages').add({
                from: cleanNum,
                to: cleanTo,
                data: data,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            return res.status(200).json({ success: true });
        }

        if (action === 'receive') {
            const snap = await db.collection('messages').where('to', '==', cleanNum).get();
            const messages = [];
            snap.forEach(doc => {
                const docData = doc.data();
                messages.push({ id: doc.id, from: docData.from, data: docData.data });
            });
            return res.status(200).json({ messages });
        }

        if (action === 'delete') {
            if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "Nessun ID fornito" });
            const batch = db.batch();
            ids.forEach(id => {
                const msgRef = db.collection('messages').doc(String(id));
                batch.delete(msgRef);
            });
            await batch.commit();
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: "Azione non valida" });
    } catch (error) {
        return res.status(500).json({ error: "Errore interno del server" });
    }
}

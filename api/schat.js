const admin = require('firebase-admin');
const crypto = require('crypto');

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '1mb',
        },
    },
};

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.error("Firebase init error:", error);
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

        if (!num || !pass || (typeof num !== 'string' && typeof num !== 'number') || (typeof pass !== 'string' && typeof pass !== 'number')) {
            return res.status(400).json({ error: "Credenziali mancanti o formato non valido" });
        }

        const passStr = String(pass);
        const cleanNum = String(num).replace(/[^0-9]/g, '');
        
        if (cleanNum.length === 0 || cleanNum.length > 20 || passStr.length < 4 || passStr.length > 100) {
            return res.status(400).json({ error: "Credenziali non valide" });
        }

        const userRef = db.collection('numbers').doc(cleanNum);

        if (action === 'register') {
            const userDoc = await userRef.get();
            if (userDoc.exists) return res.status(400).json({ error: "Numero già in uso" });
            
            await userRef.set({ 
                password: hash(passStr), 
                createdAt: admin.firestore.FieldValue.serverTimestamp() 
            });
            return res.status(200).json({ message: "Numero creato con successo" });
        }

        const userDoc = await userRef.get();
        if (!userDoc.exists) return res.status(404).json({ error: "Numero inesistente" });

        const storedHash = userDoc.data().password;
        const inputHash = hash(passStr);
        
        const storedBuffer = Buffer.from(storedHash, 'hex');
        const inputBuffer = Buffer.from(inputHash, 'hex');

        if (storedBuffer.length !== inputBuffer.length || !crypto.timingSafeEqual(storedBuffer, inputBuffer)) {
            return res.status(401).json({ error: "Password errata" });
        }

        if (action === 'verify') {
            try {
                const { target } = req.body;
                if (!target) {
                    return res.status(400).json({ error: "Destinatario mancante" });
                }
                
                const cleanTarget = String(target).replace(/[^0-9]/g, '');
                if (cleanTarget.length === 0) {
                    return res.status(400).json({ error: "Numero non valido" });
                }

                const targetDoc = await db.collection('numbers').doc(cleanTarget).get();
                
                if (!targetDoc.exists) {
                    return res.status(404).json({ error: "Numero inesistente" });
                }
                
                return res.status(200).json({ success: true });
            } catch (verifyError) {
                console.error("Verify Error details:", verifyError);
                return res.status(500).json({ error: "Errore interno durante la verifica" });
            }
        }


        if (action === 'send') {
            if (!to || !data) return res.status(400).json({ error: "Dati incompleti" });
            
            if (typeof data !== 'string' || data.length > 10000) return res.status(400).json({ error: "Dati non validi o troppo lunghi" });
            
            const cleanTo = String(to).replace(/[^0-9]/g, '');
            if (cleanTo.length === 0 || cleanTo.length > 20) return res.status(400).json({ error: "Destinatario non valido" });
            
            await db.collection('messages').add({
                from: cleanNum,
                to: cleanTo,
                data: data,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            return res.status(200).json({ success: true });
        }

        if (action === 'receive') {
            const snap = await db.collection('messages')
                .where('to', '==', cleanNum)
                .orderBy('timestamp', 'desc')
                .limit(100) 
                .get();
                
            const messages = [];
            snap.forEach(doc => {
                const docData = doc.data();
                messages.push({ id: doc.id, from: docData.from, data: docData.data });
            });
            return res.status(200).json({ messages });
        }

        if (action === 'delete') {
            if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "Nessun ID fornito" });
            
            if (ids.length > 100) return res.status(400).json({ error: "Troppi ID da eliminare contemporaneamente" });

            const validIds = ids.filter(id => typeof id === 'string' || typeof id === 'number');
            if (validIds.length === 0) return res.status(400).json({ error: "ID malformati" });

            const refs = validIds.map(id => db.collection('messages').doc(String(id)));
            const docs = await db.getAll(...refs);
            const batch = db.batch();
            
            docs.forEach(doc => {
                if (doc.exists && doc.data().to === cleanNum) {
                    batch.delete(doc.ref);
                }
            });
            
            await batch.commit();
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: "Azione non valida" });
    } catch (error) {
        console.error("API Error:", error); 
        return res.status(500).json({ error: "Errore interno del server" });
    }
}

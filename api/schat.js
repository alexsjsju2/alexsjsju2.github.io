const admin = require('firebase-admin');
const crypto = require('crypto');

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
            })
        });
    } catch (e) {
        console.error('Firebase initialization error:', e);
    }
}

const db = admin.firestore();

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
        return res.status(413).json({ error: 'Payload too large (max 1MB)' });
    }

    try {
        const { action, number, password, from, to, data, messageIds } = req.body || {};

        if (!action) {
            return res.status(400).json({ error: 'Missing action parameter' });
        }

        const sanitizeNumber = (num) => String(num || '').replace(/[^0-9+]/g, '').trim();

        switch (action) {
            case 'register': {
                const cleanNum = sanitizeNumber(number);
                if (!cleanNum || !password) {
                    return res.status(400).json({ error: 'Numero o password non validi' });
                }

                const docRef = db.collection('numbers').doc(cleanNum);
                const doc = await docRef.get();
                if (doc.exists) {
                    return res.status(409).json({ error: 'Il numero è già registrato' });
                }

                const hash = crypto.createHash('sha256').update(password).digest('hex');
                await docRef.set({
                    password: hash,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                return res.status(200).json({ success: true, message: 'Account registrato con successo' });
            }

            case 'verify': {
                const cleanNum = sanitizeNumber(number);
                if (!cleanNum) {
                    return res.status(400).json({ error: 'Numero non valido' });
                }

                const docRef = db.collection('numbers').doc(cleanNum);
                const doc = await docRef.get();
                if (!doc.exists) {
                    return res.status(404).json({ error: 'Numero non trovato nel database' });
                }

                if (password) {
                    const storedHash = doc.data().password;
                    const inputHash = crypto.createHash('sha256').update(password).digest('hex');

                    const bufStored = Buffer.from(storedHash, 'hex');
                    const bufInput = Buffer.from(inputHash, 'hex');

                    if (bufStored.length !== bufInput.length || !crypto.timingSafeEqual(bufStored, bufInput)) {
                        return res.status(401).json({ error: 'Password errata' });
                    }
                }

                return res.status(200).json({ success: true, exists: true });
            }

            case 'send': {
                const cleanFrom = sanitizeNumber(from);
                const cleanTo = sanitizeNumber(to);

                if (!cleanFrom || !cleanTo || !data) {
                    return res.status(400).json({ error: 'Campi del messaggio mancanti' });
                }

                if (typeof data !== 'string' || data.length > 500000) {
                    return res.status(400).json({ error: 'Dimensione dati non valida' });
                }

                await db.collection('messages').add({
                    from: cleanFrom,
                    to: cleanTo,
                    data: data,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });

                return res.status(200).json({ success: true });
            }

            case 'receive': {
                const cleanNum = sanitizeNumber(number);
                if (!cleanNum) {
                    return res.status(400).json({ error: 'Numero non valido' });
                }

                const snapshot = await db.collection('messages')
                    .where('to', '==', cleanNum)
                    .orderBy('timestamp', 'desc')
                    .limit(100)
                    .get();

                const messages = [];
                snapshot.forEach(doc => {
                    const d = doc.data();
                    messages.push({
                        id: doc.id,
                        from: d.from,
                        to: d.to,
                        data: d.data,
                        timestamp: d.timestamp ? d.timestamp.toMillis() : Date.now()
                    });
                });

                return res.status(200).json({ success: true, messages });
            }

            case 'delete': {
                if (!Array.isArray(messageIds) || messageIds.length === 0) {
                    return res.status(400).json({ error: 'ID messaggi non validi' });
                }
                if (messageIds.length > 100) {
                    return res.status(400).json({ error: 'Massimo 100 ID per richiesta' });
                }

                const batch = db.batch();
                messageIds.forEach(id => {
                    const ref = db.collection('messages').doc(id);
                    batch.delete(ref);
                });
                await batch.commit();

                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: 'Azione sconosciuta' });
        }
    } catch (err) {
        console.error('API Error:', err);
        return res.status(500).json({ error: 'Errore interno del server', details: err.message });
    }
}

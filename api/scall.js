import admin from 'firebase-admin';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

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

const SCALL_CRED = process.env.SCALL_CRED
  ? JSON.parse(process.env.SCALL_CRED)
  : {
      iceServers: [
        { urls: "stun:stun.relay.metered.ca:80" }
      ]
    };

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let action = (req.body && req.body.action) || 
                     (req.query && req.query.action) || 
                     (req.url ? req.url.split('?')[0].split('/').filter(Boolean).pop() : null);

        const api1Actions = ['register', 'send', 'receive', 'delete'];
        
        if (api1Actions.includes(action)) {
            if (req.method !== 'POST') return res.status(405).json({ error: "Method Not Allowed" });

            const { num, pass, to, data, ids } = req.body;

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
            if (!storedHash) return res.status(401).json({ error: "Password mancante o account non compatibile" });

            const inputHash = hash(passStr);
            const storedBuffer = Buffer.from(storedHash, 'hex');
            const inputBuffer = Buffer.from(inputHash, 'hex');

            if (storedBuffer.length !== inputBuffer.length || !crypto.timingSafeEqual(storedBuffer, inputBuffer)) {
                return res.status(401).json({ error: "Password errata" });
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
        }

        
        if (action === "get-ice-servers") {
            return res.json(SCALL_CRED);
        }

        if (action === "create-number") {
            let numStr;
            let formatted;
            let attempts = 0;

            do {
                const random = Math.floor(100000 + Math.random() * 900000).toString();
                numStr = random;
                formatted = random.slice(0,3) + " " + random.slice(3);
                attempts++;

                if (attempts > 50) return res.status(500).json({ error: "Impossibile generare numero unico" });
            } while ((await db.collection('numbers').doc(numStr).get()).exists);

            const password = Array.from({length:10}, () =>
                "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random()*36)]
            ).join('');

            const hashed = await bcrypt.hash(password, 10);

            await db.collection('numbers').doc(numStr).set({
                hashedPassword: hashed,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastActivity: admin.firestore.FieldValue.serverTimestamp()
            });

            return res.json({ success: true, numberFormatted: formatted, numberRaw: numStr, password });
        }

        if (action === "login") {
            const { number, password } = req.body || {};
            if (!number || !password) return res.status(400).json({ success: false });

            const doc = await db.collection('numbers').doc(number).get();
            if (!doc.exists || !doc.data().hashedPassword) return res.status(404).json({ success: false });

            const valid = await bcrypt.compare(password, doc.data().hashedPassword);
            if (!valid) return res.status(401).json({ success: false });

            await db.collection('numbers').doc(number).update({
                lastActivity: admin.firestore.FieldValue.serverTimestamp()
            });

            return res.json({ success: true });
        }

        if (action === "create-room") {
            const { caller, callee } = req.body || {};
            const callerDoc = await db.collection('numbers').doc(caller).get();
            if (!callerDoc.exists) return res.status(404).json({ success: false, error: "Caller not found" });
            
            const calleeDoc = await db.collection('numbers').doc(callee).get();
            if (!calleeDoc.exists) return res.status(404).json({ success: false, error: "Callee not found" });

            const roomId = crypto.randomUUID();

            await db.collection('rooms').doc(roomId).set({
                caller, callee,
                status: "pending",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                offer: null, answer: null
            });

            return res.json({ roomId });
        }

        if (action === "get-room") {
            const roomId = req.query.roomId;
            const doc = await db.collection('rooms').doc(roomId).get();
            if (!doc.exists) return res.json(null);

            let data = doc.data();
            const candSnap = await db.collection('rooms').doc(roomId).collection('candidates').get();
            data.iceCandidates = candSnap.docs.map(d => d.data());

            return res.json(data);
        }

        if (action === "update-room") {
            const roomId = req.query.roomId;
            const actor = req.query.actor;
            const { offer, answer, iceCandidate } = req.body || {};

            const roomDoc = await db.collection('rooms').doc(roomId).get();
            if (!roomDoc.exists) return res.status(404).json({ success: false });
            
            const room = roomDoc.data();
            if (actor && actor !== room.caller && actor !== room.callee) {
                return res.status(403).json({ success: false });
            }

            const ref = db.collection('rooms').doc(roomId);

            if (offer) await ref.update({ offer });
            if (answer) await ref.update({ answer, status: "connected"});
            if (iceCandidate) await ref.collection('candidates').add(iceCandidate);

            return res.json({ success: true });
        }

        if (action === "delete-room") {
            const roomId = req.query.roomId;
            const actor = req.query.actor;

            const roomDoc = await db.collection('rooms').doc(roomId).get();
            if (!roomDoc.exists) return res.json({ success: true });
            
            const room = roomDoc.data();
            if (actor && actor !== room.caller && actor !== room.callee) {
                return res.status(403).json({ success: false });
            }

            const candSnap = await db.collection('rooms').doc(roomId).collection('candidates').get();
            const batch = db.batch();
            candSnap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            await db.collection('rooms').doc(roomId).delete();

            return res.json({ success: true });
        }

        if (action === "incoming-calls") {
            const myNumber = req.query.myNumber;
            const snapshot = await db.collection('rooms')
                .where('callee', '==', myNumber)
                .where('status', '==', 'pending')
                .get();

            const calls = snapshot.docs.map(d => ({
                roomId: d.id,
                caller: d.data().caller
            }));

            return res.json(calls);
        }

        if (action === "delete-number") {
            const { number, password } = req.body || {};
            if (!number || !password) return res.status(400).json({ success: false });

            const doc = await db.collection('numbers').doc(number).get();
            if (!doc.exists || !doc.data().hashedPassword) return res.status(404).json({ success: false });

            const valid = await bcrypt.compare(password, doc.data().hashedPassword);
            if (!valid) return res.status(401).json({ success: false });

            await db.collection('numbers').doc(number).delete();

            const rooms = await db.collection('rooms').where('caller', '==', number).get();
            for (const roomDoc of rooms.docs) {
                await roomDoc.ref.delete();
            }

            return res.json({ success: true });
        }

        if (action === "cleanup") {
            const thirtyDaysAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30*24*60*60*1000));
            const numSnapshot = await db.collection('numbers').where('lastActivity', '<', thirtyDaysAgo).get();

            const batch = db.batch();
            numSnapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            const fiveMinutesAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 5*60*1000));
            const roomSnapshot = await db.collection('rooms').where('createdAt', '<', fiveMinutesAgo).get();

            const roomBatch = db.batch();
            roomSnapshot.docs.forEach(doc => roomBatch.delete(doc.ref));
            await roomBatch.commit();

            return res.json({ cleaned: true });
        }

        return res.status(404).json({ error: "Azione non trovata o metodo non valido" });

    } catch (error) {
        console.error("API Combined Error:", error); 
        return res.status(500).json({ error: "Errore interno del server" });
    }
}

const admin = require('firebase-admin');

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

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; 
const MAX_REQUESTS = 100;

function checkRateLimit(ip) {
    const now = Date.now();
    const userReqs = rateLimitMap.get(ip) || [];
    const validReqs = userReqs.filter(time => now - time < RATE_LIMIT_WINDOW);
    if (validReqs.length >= MAX_REQUESTS) return false;
    validReqs.push(now);
    rateLimitMap.set(ip, validReqs);
    return true;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.alextools.online');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ error: "Rate limit superato." });
    }

    try {
        if (req.method === 'POST') {
            const { action, owner, listId, data, secret } = req.body;

            if (action === 'get_list') {
                if (!owner || !listId) return res.status(400).json({ error: "Parametri mancanti" });
                const doc = await db.collection(`anime_${owner}`).doc(listId).get();
                if (!doc.exists) return res.status(200).json({ items: [] });
                return res.status(200).json(doc.data());
            }

            if (action === 'save_list') {
                if (!owner || !listId || !data) return res.status(400).json({ error: "Parametri mancanti" });
                if (secret !== process.env.API_SECRET) return res.status(401).json({ error: "Non autorizzato" });
                
                await db.collection(`anime_${owner}`).doc(listId).set({ items: data, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
                return res.status(200).json({ success: true });
            }

            if (action === 'export_all') {
                const snapshot = await db.collection(`anime_${owner}`).get();
                const allData = {};
                snapshot.forEach(doc => { allData[doc.id] = doc.data().items; });
                return res.status(200).json(allData);
            }
        }
        return res.status(405).json({ error: "Metodo non consentito" });
    } catch (error) {
        return res.status(500).json({ error: "Errore interno" });
    }
}

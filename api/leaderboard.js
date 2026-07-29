const admin = require('firebase-admin');

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        console.error('Firebase config error:', error);
    }
}

const db = admin.firestore();

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const snapshot = await db.collection('leaderboard')
                .orderBy('score', 'desc')
                .limit(10)
                .get();
                
            const leaders = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                leaders.push({
                    name: data.name,
                    score: data.score,
                    mode: data.mode
                });
            });
            
            return res.status(200).json(leaders);
        } 
        
        else if (req.method === 'POST') {
            const { name, score, mode } = req.body;

            if (!name || typeof name !== 'string' || name.length > 20 || name.length < 3) {
                return res.status(400).json({ error: "Nome invalido o malevolo" });
            }
            
            if (typeof score !== 'number' || score < 0 || score > 100000) {
                return res.status(400).json({ error: "Punteggio manomesso rilevato" });
            }
            
            const allowedModes = ['classico', 'tempo', 'vite', 'associazione', 'allenamento'];
            if (!allowedModes.includes(mode)) {
                return res.status(400).json({ error: "Modalità sconosciuta" });
            }
            const sanitizedName = name.replace(/[^a-zA-Z0-9_]/g, '');
            await db.collection('leaderboard').add({
                name: sanitizedName,
                score: parseInt(score),
                mode: mode,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return res.status(201).json({ message: "Score salvato in sicurezza!" });
        }
        
        return res.status(405).json({ error: "Metodo non consentito" });
        
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Errore interno del server" });
    }
}

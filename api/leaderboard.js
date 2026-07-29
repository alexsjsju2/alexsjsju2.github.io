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
                    mode: data.mode || 'Misto'
                });
            });
            
            return res.status(200).json(leaders);
        } 
        
        else if (req.method === 'POST') {
            const { action, name, passwordHash, score, mode, token, newName, newPasswordHash } = req.body;

            if (action === 'login') {
                if (!name || !passwordHash) {
                    return res.status(400).json({ error: "Nome e Password obbligatori" });
                }

                const sanitizedName = name.replace(/[^a-zA-Z0-9_]/g, '');
                const userRef = db.collection('leaderboard').doc(sanitizedName);
                const userDoc = await userRef.get();

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    if (userData.passwordHash !== passwordHash) {
                        return res.status(401).json({ error: "Password errata!" });
                    }
                    return res.status(200).json({ 
                        message: "Login effettuato!", 
                        token: userData.token,
                        score: userData.score || 0
                    });
                } else {
                    const crypto = require('crypto');
                    const newToken = crypto.randomUUID();

                    await userRef.set({
                        name: sanitizedName,
                        passwordHash: passwordHash,
                        token: newToken,
                        score: 0,
                        mode: mode || 'Classico',
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    return res.status(201).json({ 
                        message: "Utente registrato!", 
                        token: newToken,
                        isNew: true
                    });
                }
            }

            else if (action === 'update_profile') {
                if (!token) return res.status(400).json({ error: "Token segreto mancante" });

                const snapshot = await db.collection('leaderboard').where('token', '==', token).get();
                
                if (snapshot.empty) {
                    return res.status(403).json({ error: "Token segreto non valido!" });
                }

                const userDoc = snapshot.docs[0];
                const oldSanitizedName = userDoc.id;
                const userData = userDoc.data();

                let updates = {
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                };

                if (newPasswordHash) {
                    updates.passwordHash = newPasswordHash;
                }

                if (newName && newName !== oldSanitizedName) {
                    const sanitizedNewName = newName.replace(/[^a-zA-Z0-9_]/g, '');
                    const newDocRef = db.collection('leaderboard').doc(sanitizedNewName);
                    const checkExists = await newDocRef.get();

                    if (checkExists.exists) {
                        return res.status(400).json({ error: "Il nuovo nome utente è già occupato!" });
                    }

                    await newDocRef.set({
                        ...userData,
                        ...updates,
                        name: sanitizedNewName
                    });

                    await db.collection('leaderboard').doc(oldSanitizedName).delete();

                    return res.status(200).json({ message: "Profilo e Nome aggiornati con successo!" });
                }

                await userDoc.ref.update(updates);
                return res.status(200).json({ message: "Password aggiornata con successo!" });
            }

            else {
                if (!name || typeof name !== 'string' || name.length > 20 || name.length < 3) {
                    return res.status(400).json({ error: "Nome invalido" });
                }
                
                if (typeof score !== 'number' || score < 0 || score > 100000) {
                    return res.status(400).json({ error: "Punteggio invalido" });
                }

                const sanitizedName = name.replace(/[^a-zA-Z0-9_]/g, '');
                const userRef = db.collection('leaderboard').doc(sanitizedName);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                    return res.status(404).json({ error: "Utente non trovato" });
                }

                const userData = userDoc.data();
                if (passwordHash && userData.passwordHash !== passwordHash) {
                    return res.status(401).json({ error: "Autenticazione fallita" });
                }

                const currentScore = userData.score || 0;
                await userRef.update({
                    score: currentScore + parseInt(score),
                    mode: mode || 'Misto',
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });

                return res.status(200).json({ message: "Punteggio aggiornato con successo!" });
            }
        }
        
        return res.status(405).json({ error: "Metodo non consentito" });
        
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Errore interno del server" });
    }
}

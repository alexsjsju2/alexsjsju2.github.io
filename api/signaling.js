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
  console.error("Errore di inizializzazione Firebase:", error);
}
function getIceServers() {
  try {
    if (process.env.SCALL_CRED) {
      return JSON.parse(process.env.SCALL_CRED);
    }
  } catch (error) {
    console.error("Errore nel parsing di SCALL_CRED:", error);
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!db) {
    return res.status(500).json({ error: 'Database non inizializzato' });
  }

  if (req.method === 'POST') {
    try {
      const { action, targetId, data } = req.body;

      if (!action) {
        return res.status(400).json({ error: 'Azione mancante nel payload' });
      }

      switch (action) {
        case 'get_config': {
          const configDoc = await db.collection('webrtc_system').doc('config').get();
          const pcActive = configDoc.exists ? configDoc.data().pcActive : false;
          
          return res.status(200).json({ 
            iceServers: getIceServers(), 
            pcActive 
          });
        }
        case 'update_pc_status': {
          await db.collection('webrtc_system').doc('config').set({ 
            pcActive: data.active,
            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          if (!data.active) {
            const batch = db.batch();
            const signalsSnapshot = await db.collection('webrtc_signals').get();
            signalsSnapshot.docs.forEach((doc) => {
              batch.delete(doc.ref);
            });
            await batch.commit();
          }

          return res.status(200).json({ success: true });
        }
        case 'send_signal': {
          if (!targetId || !data) return res.status(400).json({ error: 'Parametri mancanti per send_signal' });
          
          await db.collection('webrtc_signals').doc(targetId).set({
            ...data,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
          
          return res.status(200).json({ success: true });
        }
        case 'get_signals': {
          const snapshot = await db.collection('webrtc_signals').get();
          let signals = {};
          
          snapshot.forEach(doc => {
            signals[doc.id] = doc.data();
          });
          
          return res.status(200).json({ signals });
        }
        case 'remove_signal': {
          if (!targetId) return res.status(400).json({ error: 'targetId mancante' });
          
          await db.collection('webrtc_signals').doc(targetId).delete();
          return res.status(200).json({ success: true });
        }

        default:
          return res.status(400).json({ error: 'Azione non riconosciuta' });
      }

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Errore interno del server' });
    }
  } else {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).end();
  }
}

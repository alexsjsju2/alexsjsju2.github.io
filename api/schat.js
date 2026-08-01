const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');

if (!getApps().length) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = cert(serviceAccount);
    } catch (e) {
      console.error("Errore nel parsing di FIREBASE_SERVICE_ACCOUNT:", e);
    }
  }
  if (!credential && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
    credential = cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
  }
  if (credential) {
    initializeApp({ credential });
  } else {
    initializeApp();
  }
}

const db = getFirestore();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function safeEqualHex(hex1, hex2) {
  try {
    const buf1 = Buffer.from(hex1, 'hex');
    const buf2 = Buffer.from(hex2, 'hex');
    if (buf1.length !== buf2.length) return false;
    return crypto.timingSafeEqual(buf1, buf2);
  } catch (e) {
    return false;
  }
}

function sanitizeNumber(num) {
  if (typeof num !== 'string') return '';
  return num.replace(/[^0-9+\-_]/g, '').trim();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito. Utilizzare POST.' });
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 1024 * 1024) {
    return res.status(413).json({ error: 'Payload troppo grande (limite 1 MB).' });
  }

  try {
    const { action, number, password, to, data, messageIds } = req.body || {};
    const cleanNumber = sanitizeNumber(number);

    if (!action) {
        return res.status(400).json({ error: 'Action mancante.' });
    }

    switch (action) {
      case 'register': {
        if (!cleanNumber || !password) {
          return res.status(400).json({ error: 'Numero e password obbligatori.' });
        }
        const docRef = db.collection('numbers').doc(cleanNumber);
        const doc = await docRef.get();
        if (doc.exists) {
          return res.status(409).json({ error: 'Il numero esiste già.' });
        }
        const hashed = hashPassword(password);
        await docRef.set({
          password: hashed,
          createdAt: FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true, message: 'Account registrato con successo.' });
      }

      case 'verify': {
        if (!cleanNumber || !password) {
          return res.status(400).json({ error: 'Numero e password obbligatori.' });
        }
        const docRef = db.collection('numbers').doc(cleanNumber);
        const doc = await docRef.get();
        if (!doc.exists) {
          return res.status(404).json({ error: 'Numero non trovato.' });
        }
        const storedHash = doc.data().password;
        const inputHash = hashPassword(password);
        
        if (!safeEqualHex(storedHash, inputHash)) {
          return res.status(401).json({ error: 'Password non valida.' });
        }
        return res.status(200).json({ success: true, message: 'Verifica riuscita.' });
      }

      case 'send': {
        if (!cleanNumber || !password || !to || !data) {
          return res.status(400).json({ error: 'Campi obbligatori mancanti per l\'invio.' });
        }
        const senderRef = db.collection('numbers').doc(cleanNumber);
        const senderDoc = await senderRef.get();
        if (!senderDoc.exists || !safeEqualHex(senderDoc.data().password, hashPassword(password))) {
          return res.status(401).json({ error: 'Autenticazione mittente fallita.' });
        }

        const cleanTo = sanitizeNumber(to);
        const recipientRef = db.collection('numbers').doc(cleanTo);
        const recipientDoc = await recipientRef.get();
        if (!recipientDoc.exists) {
          return res.status(404).json({ error: 'Il destinatario non esiste.' });
        }

        await db.collection('messages').add({
          from: cleanNumber,
          to: cleanTo,
          data: typeof data === 'string' ? data : JSON.stringify(data),
          timestamp: FieldValue.serverTimestamp()
        });

        return res.status(200).json({ success: true, message: 'Messaggio inviato.' });
      }

      case 'receive': {
        if (!cleanNumber || !password) {
          return res.status(400).json({ error: 'Credenziali obbligatorie.' });
        }
        const userRef = db.collection('numbers').doc(cleanNumber);
        const userDoc = await userRef.get();
        if (!userDoc.exists || !safeEqualHex(userDoc.data().password, hashPassword(password))) {
          return res.status(401).json({ error: 'Autenticazione fallita.' });
        }

        const snapshot = await db.collection('messages')
          .where('to', '==', cleanNumber)
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
        if (!cleanNumber || !password || !Array.isArray(messageIds)) {
          return res.status(400).json({ error: 'Parametri non validi per la cancellazione.' });
        }
        const userRef = db.collection('numbers').doc(cleanNumber);
        const userDoc = await userRef.get();
        if (!userDoc.exists || !safeEqualHex(userDoc.data().password, hashPassword(password))) {
          return res.status(401).json({ error: 'Autenticazione fallita.' });
        }

        const idsToDelete = messageIds.slice(0, 100);
        const batch = db.batch();

        for (const id of idsToDelete) {
          const msgRef = db.collection('messages').doc(id);
          const msgDoc = await msgRef.get();
          if (msgDoc.exists && msgDoc.data().to === cleanNumber) {
            batch.delete(msgRef);
          }
        }

        await batch.commit();
        return res.status(200).json({ success: true, message: 'Messaggi eliminati.' });
      }

      default:
        return res.status(400).json({ error: 'Azione non riconosciuta.' });
    }
  } catch (err) {
    console.error('Errore API:', err);
    return res.status(500).json({ error: 'Errore interno del server.' });
  }
};

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
  console.error('Errore nell\'inizializzazione di Firebase:', error);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const docRef = db?.collection('links').doc('current');

  if (req.method === 'GET') {
    if (!db) {
      return res.status(500).json({ error: 'Errore di configurazione del server' });
    }
    try {
      const doc = await docRef.get();
      return res.status(200).json({ link: doc.exists ? doc.data().link : null });
    } catch (error) {
      console.error('Errore nel recupero del link:', error);
      return res.status(500).json({ error: 'Errore nel recupero del link' });
    }
  }

  if (req.method === 'POST') {
    const { type, password, link, count, timestamp } = req.body || {};

    if (link) {
      if (!db) {
        return res.status(500).json({ error: 'Errore di configurazione del server' });
      }
      try {
        await docRef.set({ link });
        return res.status(200).json({ success: true });
      } catch (error) {
        console.error('Errore nel salvataggio del link:', error);
        return res.status(500).json({ error: 'Errore nel salvataggio del link' });
      }
    }

    if (type === 'verify') {
      if (!password || typeof password !== 'string' || password.trim().length > 100) {
        return res.status(400).json({ success: false });
      }
      if (password.trim() === process.env.PS_BUTT) {
        return res.status(200).json({ success: true });
      }
      return res.status(401).json({ success: false });
    }

    if (type === 'send') {
      const webhook = process.env.WEBHOOK_DCC;
      if (!webhook) {
        console.error('DISCORD_WEBHOOK non configurato');
        return res.status(200).json({ success: true });
      }
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `**🔥**\n\n**Count:** ${count}\n**Data:** ${new Date(timestamp).toLocaleString('it-IT')}\n ${req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'sconosciuto'}`
          })
        });
      } catch (err) {
        console.error('Errore webhook:', err);
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: 'Tipo o dati non validi' });
  }

  res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
  return res.status(405).end(`Metodo ${req.method} non consentito`);
}

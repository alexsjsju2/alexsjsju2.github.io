const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

let db;
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let numStr;
  let formatted;
  let password;
  let attempts = 0;

  do {
    const random = Math.floor(100000 + Math.random() * 900000).toString();
    numStr = random;
    formatted = random.slice(0,3) + " " + random.slice(3);
    attempts++;
    if (attempts > 50) return res.status(500).json({ error: "Impossibile generare numero unico" });
  } while ((await db.collection('numbers').doc(numStr).get()).exists);

  password = Array.from({length:10}, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random()*36)]).join('');
  const hashed = await bcrypt.hash(password, 10);

  await db.collection('numbers').doc(numStr).set({
    hashedPassword: hashed,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastActivity: admin.firestore.FieldValue.serverTimestamp()
  });

  res.json({ success: true, numberFormatted: formatted, numberRaw: numStr, password });
};

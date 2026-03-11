const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

let db;
if (!admin.apps.length) {
  db = admin.firestore();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.alexsjsju.eu');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { number, password } = req.body;
  if (!number || !password) return res.status(400).json({ success: false });

  const doc = await db.collection('numbers').doc(number).get();
  if (!doc.exists) return res.status(404).json({ success: false });

  const valid = await bcrypt.compare(password, doc.data().hashedPassword);
  if (!valid) return res.status(401).json({ success: false });

  await db.collection('numbers').doc(number).update({
    lastActivity: admin.firestore.FieldValue.serverTimestamp()
  });

  res.json({ success: true });
};

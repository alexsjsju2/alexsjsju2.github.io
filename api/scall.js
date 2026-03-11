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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action || req.path.split('/').pop();

  if (action === "create-room") {
    const { caller, callee } = req.body;
    const roomId = crypto.randomUUID();
    await db.collection('rooms').doc(roomId).set({
      caller, callee, status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      offer: null, answer: null, iceCandidates: []
    });
    return res.json({ roomId });
  }

  if (action === "get-room") {
    const roomId = req.query.roomId;
    const doc = await db.collection('rooms').doc(roomId).get();
    return res.json(doc.exists ? doc.data() : null);
  }

  if (action === "update-room") {
    const roomId = req.query.roomId;
    const { offer, answer, iceCandidate } = req.body;
    const ref = db.collection('rooms').doc(roomId);
    if (offer) await ref.update({ offer });
    if (answer) await ref.update({ answer });
    if (iceCandidate) {
      await ref.update({ iceCandidates: admin.firestore.FieldValue.arrayUnion(iceCandidate) });
    }
    return res.json({ success: true });
  }

  if (action === "delete-room") {
    const roomId = req.query.roomId;
    await db.collection('rooms').doc(roomId).delete();
    return res.json({ success: true });
  }

  if (action === "incoming-calls") {
    const myNumber = req.query.myNumber;
    const snapshot = await db.collection('rooms')
      .where('callee', '==', myNumber)
      .where('status', '==', 'pending')
      .get();
    const calls = snapshot.docs.map(d => ({ roomId: d.id, caller: d.data().caller }));
    return res.json(calls);
  }

  if (action === "delete-number") {
    const { number } = req.body;
    await db.collection('numbers').doc(number).delete();
    const rooms = await db.collection('rooms').where('caller', '==', number).get();
    rooms.docs.forEach(d => d.ref.delete());
    return res.json({ success: true });
  }

  if (action === "cleanup") {
    const thirtyDaysAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30*24*60*60*1000));
    const numSnapshot = await db.collection('numbers').where('lastActivity', '<', thirtyDaysAgo).get();
    const batch = db.batch();
    numSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    const twoHoursAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 2*60*60*1000));
    const roomSnapshot = await db.collection('rooms').where('createdAt', '<', twoHoursAgo).get();
    const roomBatch = db.batch();
    roomSnapshot.docs.forEach(doc => roomBatch.delete(doc.ref));
    await roomBatch.commit();

    return res.json({ cleaned: true });
  }

  res.status(404).json({ error: "Action non trovata" });
};

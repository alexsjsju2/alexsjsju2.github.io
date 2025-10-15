import { initFirebase, verifySecret } from "./_initFirebase.js";

export default async function handler(req, res) {
  try {
    verifySecret(req);

    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: "Missing userId" });

    const db = initFirebase();
    const snapshot = await db.collection("alexshare").doc("notes").get();

    const notes = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.meta?.owner === userId) notes.push({ id: doc.id, ...data });
    });

    res.status(200).json({ success: true, notes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
}

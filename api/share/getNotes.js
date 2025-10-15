import { initFirebase } from "../_initFirebase.js";
import { verifyUser } from "../_verifyUser.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    const user = await verifyUser(req);
    const { db } = initFirebase();
    const snapshot = await db
      .collection("alexshare")
      .doc("notes")
      .collection("data")
      .where("meta.owner", "==", user.uid)
      .get();
    const notes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    return res.status(200).json({ success: true, notes });
  } catch (err) {
    console.error(err);
    return res.status(401).json({ success: false, error: err.message });
  }
}

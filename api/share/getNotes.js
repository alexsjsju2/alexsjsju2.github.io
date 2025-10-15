import { initFirebase } from "../_initFirebase.js";
import { verifyUser } from "../_verifyUser.js";
import { handleCors } from "../_cors.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const user = await verifyUser(req);
    const { db } = initFirebase();

    const snapshot = await db
      .collection("alexshare")
      .doc("notes")
      .collection("data")
      .where("meta.owner", "==", user.uid)
      .get();

    const notes = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({ success: true, notes });
  } catch (err) {
    console.error(err);
    res.status(401).json({ success: false, error: err.message });
  }
}

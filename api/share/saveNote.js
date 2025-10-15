import { initFirebase } from "../_initFirebase.js";
import { verifyUser } from "../_verifyUser.js";
import { handleCors } from "../_cors.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const user = await verifyUser(req);
    const { db } = initFirebase();

    const { title, content, visibility } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    const newNote = {
      content,
      meta: {
        createdAt: new Date(),
        owner: user.uid,
        title,
        visibility: visibility || "privata",
      },
    };

    const ref = await db
      .collection("alexshare")
      .doc("notes")
      .collection("data")
      .add(newNote);

    res.status(200).json({ success: true, id: ref.id });
  } catch (err) {
    console.error(err);
    res.status(401).json({ success: false, error: err.message });
  }
}

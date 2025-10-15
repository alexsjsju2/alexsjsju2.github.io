import { initFirebase, verifySecret } from "./_initFirebase.js";

export default async function handler(req, res) {
  try {
    verifySecret(req);

    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    const { owner, title, content, visibility } = await req.json();
    if (!owner || !title || !content) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    const db = initFirebase();

    const newNote = {
      content,
      meta: {
        owner,
        title,
        visibility: visibility || "privata",
        createdAt: new Date(),
      },
    };

    const ref = await db.collection("alexshare").doc("notes").collection("userNotes").add(newNote);

    res.status(200).json({ success: true, id: ref.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
}

import { initFirebase, verifySecret } from "./_initFirebase.js";

export default async function handler(req, res) {
  try {
    verifySecret(req);

    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    const { chatId, sender, content } = await req.json();

    if (!chatId || !sender || !content) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    const db = initFirebase();

    await db
      .collection("alexchat")
      .doc("privateChats")
      .collection(chatId)
      .add({
        sender,
        content,
        createdAt: new Date(),
      });

    res.status(200).json({ success: true, message: "Message sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
}

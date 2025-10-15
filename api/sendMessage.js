import { initFirebase } from "./_initFirebase.js";
import { authenticate } from "./middlewareAuthenticate.js";

export default async function handler(req, res) {
  try {
    const uid = await authenticate(req, res);

    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "Method not allowed" });
      return;
    }

    const { chatId, content } = await req.json();
    if (!chatId || !content) {
      res.status(400).json({ success: false, error: "Missing fields" });
      return;
    }

    const { db } = initFirebase();

    const messageData = {
      sender: uid,
      content,
      createdAt: new Date(),
    };

    await db
      .collection("alexchat")
      .doc("privateChats")
      .collection(chatId)
      .add(messageData);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("sendMessage error:", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

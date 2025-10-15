import { initFirebase } from "./_initFirebase.js";
import { authenticate } from "./middlewareAuthenticate.js";

export default async function handler(req, res) {
  try {
    const uid = await authenticate(req, res);

    const { chatId } = req.query;
    if (!chatId) {
      res.status(400).json({ success: false, error: "Missing chatId" });
      return;
    }

    const { db } = initFirebase();

    const msgsSnap = await db
      .collection("alexchat")
      .doc("privateChats")
      .collection(chatId)
      .orderBy("createdAt", "asc")
      .get();

    const messages = [];
    msgsSnap.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json({ success: true, messages });
  } catch (err) {
    console.error("getMessages error:", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

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
    const { chatId, content } = req.body;

    if (!chatId || !content) {
      return res.status(400).json({ success: false, error: "Missing chatId or content" });
    }

    const { db } = initFirebase();

    const message = {
      sender: user.uid,
      content,
      createdAt: new Date(),
    };

    await db
      .collection("alexchat")
      .doc("privateChats")
      .collection(chatId)
      .add(message);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(401).json({ success: false, error: err.message });
  }
}

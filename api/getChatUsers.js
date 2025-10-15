import { initFirebase } from "./_initFirebase.js";
import { authenticate } from "./middlewareAuthenticate.js";

export default async function handler(req, res) {
  try {
    const uid = await authenticate(req, res);
    const { db } = initFirebase();

    const usersSnap = await db
      .collection("alexchat")
      .doc("users")
      .collection("users")  
      .get();

    const users = [];
    usersSnap.forEach((doc) => {
      users.push({ id: doc.id, ...doc.data() });
    });

    const clean = users.map(u => {
      delete u.password;
      delete u.recoveryCode;
      return u;
    });

    res.status(200).json({ success: true, users: clean });
  } catch (err) {
    console.error("getChatUsers error:", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

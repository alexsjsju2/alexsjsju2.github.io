import { initFirebase } from "./_initFirebase.js";

export async function authenticate(req, res) {
  const authHeader = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "No token" });
    throw new Error("No token");
  }
  const idToken = authHeader.split("Bearer ")[1];
  const { auth } = initFirebase();
  try {
    const decoded = await auth.verifyIdToken(idToken);
    return decoded.uid;
  } catch (err) {
    console.error("Token verification failed:", err);
    res.status(401).json({ success: false, error: "Invalid token" });
    throw err;
  }
}

import { initFirebase } from "./_initFirebase.js";

export async function verifyUser(req) {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.split("Bearer ")[1];
  const { auth } = initFirebase();

  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded; // contiene uid, email, ecc.
  } catch (err) {
    throw new Error("Invalid or expired token");
  }
}

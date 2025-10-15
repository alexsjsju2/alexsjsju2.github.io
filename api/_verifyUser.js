import { initFirebase } from "./_initFirebase.js";

export async function verifyUser(req) {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.split("Bearer ")[1];
  const { auth } = initFirebase();
  const decoded = await auth.verifyIdToken(token); 
  return decoded; 
}

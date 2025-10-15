import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let db = null;

export function initFirebase() {
  if (db) return db;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env var");
  }
  const app = initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
  db = getFirestore(app);
  return db;
}

export function verifySecret(req) {
  const clientSecret = req.headers["authorization"];
  if (!clientSecret || clientSecret !== `Bearer ${process.env.API_SECRET}`) {
    throw new Error("Unauthorized");
  }
}

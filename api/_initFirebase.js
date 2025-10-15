import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

let adminApp = null;
let db = null;

export function initFirebase() {
  if (adminApp) return { db, auth: adminApp.auth() };
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env var");
  }
  const app = initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
  adminApp = app;
  db = getFirestore(app);
  const auth = getAuth(app);
  return { db, auth };
}

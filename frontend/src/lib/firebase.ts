import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
} from "firebase/auth";

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth | null {
  if (!firebaseConfigured) return null;
  if (!app) app = getApps().length ? getApps()[0] : initializeApp(cfg);
  if (!authInstance) authInstance = getAuth(app);
  return authInstance;
}

export async function signInProvider(provider: "google" | "github") {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  const prov = provider === "google" ? new GoogleAuthProvider() : new GithubAuthProvider();
  try {
    return await signInWithPopup(auth, prov);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || "";
    if (code === "auth/popup-blocked") {
      await signInWithRedirect(auth, prov);
      return null;
    }
    throw err;
  }
}

export async function signOutUser() {
  const auth = getFirebaseAuth();
  if (auth) await signOut(auth);
}

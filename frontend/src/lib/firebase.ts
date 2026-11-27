import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  getRedirectResult,
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

export function formatAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || "";
  const msg = (err as Error)?.message || "Authentication failed";
  if (code === "auth/unauthorized-domain" || msg.includes("unauthorized-domain")) {
    return `Domain "${typeof window !== "undefined" ? window.location.hostname : ""}" is not in Firebase Authorized Domains. Add it under Firebase Console -> Authentication -> Settings -> Authorized domains.`;
  }
  if (code === "auth/account-exists-with-different-credential") {
    return "An account already exists with this email using a different sign-in provider (Google vs GitHub). Sign in with the original provider or enable multiple accounts per email in Firebase Auth settings.";
  }
  if (code === "auth/operation-not-allowed") {
    return "This OAuth provider is not enabled in Firebase Console -> Authentication -> Sign-in method.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Sign-in window was closed before completing authentication.";
  }
  return msg;
}

export async function consumeRedirectError(): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth) return "";
  try {
    await getRedirectResult(auth);
    return "";
  } catch (err) {
    return formatAuthError(err);
  }
}

export async function signInProvider(provider: "google" | "github") {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  const prov = provider === "google" ? new GoogleAuthProvider() : new GithubAuthProvider();
  if (provider === "github") prov.addScope("read:user user:email");
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

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
  type UserCredential,
} from "firebase/auth";

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const GH_TOKEN_KEY = "sg_github_token";

export const firebaseConfigured = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth | null {
  if (!firebaseConfigured) return null;
  if (!app) app = getApps().length ? getApps()[0] : initializeApp(cfg);
  if (!authInstance) authInstance = getAuth(app);
  return authInstance;
}

export function getStoredGithubToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return sessionStorage.getItem(GH_TOKEN_KEY) || undefined;
}

function saveGithubCredential(res: UserCredential | null) {
  if (!res || typeof window === "undefined") return;
  const cred = GithubAuthProvider.credentialFromResult(res);
  if (cred?.accessToken) {
    sessionStorage.setItem(GH_TOKEN_KEY, cred.accessToken);
  }
}

export function formatAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || "";
  const msg = (err as Error)?.message || "Authentication failed";
  if (code === "auth/unauthorized-domain" || msg.includes("unauthorized-domain")) {
    return `Domain "${typeof window !== "undefined" ? window.location.hostname : ""}" is not in Firebase Authorized Domains yet.`;
  }
  if (code === "auth/account-exists-with-different-credential") {
    return "An account already exists with this email using your other login method (Google vs GitHub). Please sign in with that one.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Sign-in window was closed before finishing.";
  }
  return msg;
}

export async function consumeRedirectError(): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth) return "";
  try {
    const res = await getRedirectResult(auth);
    saveGithubCredential(res);
    return "";
  } catch (err) {
    return formatAuthError(err);
  }
}

export async function signInProvider(provider: "google" | "github") {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  const prov = provider === "google" ? new GoogleAuthProvider() : new GithubAuthProvider();
  if (provider === "github") prov.addScope("repo read:user user:email");
  try {
    const res = await signInWithPopup(auth, prov);
    saveGithubCredential(res);
    return res;
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
  if (typeof window !== "undefined") sessionStorage.removeItem(GH_TOKEN_KEY);
  const auth = getFirebaseAuth();
  if (auth) await signOut(auth);
}

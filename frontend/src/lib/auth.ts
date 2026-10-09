import { useSyncExternalStore } from "react";

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  mobile: string;
  role: string;
  property_id: number | null;
  name?: string;
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
};

const ACCESS_TOKEN_KEY = "stayhubAccessToken";
const REFRESH_TOKEN_KEY = "stayhubRefreshToken";
const USER_KEY = "stayhubUser";
const SESSION_EVENT = "stayhub-auth-change";

export function getAccessToken(): string | null {
  for (const storage of [localStorage, sessionStorage]) {
    const token = storage.getItem(ACCESS_TOKEN_KEY);
    if (token && token !== "undefined" && token !== "null") return token;
  }
  return null;
}

export function getRefreshToken(): string | null {
  for (const storage of [localStorage, sessionStorage]) {
    const token = storage.getItem(REFRESH_TOKEN_KEY);
    if (token && token !== "undefined" && token !== "null") return token;
  }
  return null;
}

export function updateSessionTokens(accessToken: string, refreshToken: string) {
  for (const storage of [localStorage, sessionStorage]) {
    if (!storage.getItem(USER_KEY)) continue;
    storage.setItem(ACCESS_TOKEN_KEY, accessToken);
    storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    window.dispatchEvent(new Event(SESSION_EVENT));
    return;
  }
  throw new Error("No active session was found");
}

export function updateSessionUser(user: AuthUser, accessToken: string) {
  for (const storage of [localStorage, sessionStorage]) {
    if (!storage.getItem(USER_KEY)) continue;
    storage.setItem(USER_KEY, JSON.stringify(user));
    storage.setItem(ACCESS_TOKEN_KEY, accessToken);
    window.dispatchEvent(new Event(SESSION_EVENT));
    return;
  }
  throw new Error("No active session was found");
}

export function saveSession(data: LoginResponse, remember: boolean) {
  if (!data.access_token || !data.refresh_token || !data.user?.username) {
    throw new Error("Invalid authentication response");
  }
  signOut();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  storage.setItem(USER_KEY, JSON.stringify(data.user));
  storage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function getSessionSnapshot(): string | null {
  for (const storage of [localStorage, sessionStorage]) {
    const token = storage.getItem(ACCESS_TOKEN_KEY);
    const value = storage.getItem(USER_KEY);
    if (!token || token === "undefined" || token === "null" || !value) continue;
    try {
      const user = JSON.parse(value) as AuthUser;
      if (typeof user.username === "string" && user.username &&
          typeof user.email === "string" && typeof user.role === "string") return value;
    } catch { /* An invalid stored session is unauthenticated. */ }
  }
  return null;
}

export function getSession(): AuthUser | null {
  const value = getSessionSnapshot();
  return value ? JSON.parse(value) as AuthUser : null;
}

function subscribe(onChange: () => void) {
  window.addEventListener(SESSION_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SESSION_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useSession(): AuthUser | null {
  const value = useSyncExternalStore(subscribe, getSessionSnapshot, () => null);
  return value ? JSON.parse(value) as AuthUser : null;
}

export function signOut() {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY,
      "stayhubLoggedIn", "stayhubRole", "stayhub-demo-session"]) {
      storage.removeItem(key);
    }
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
}

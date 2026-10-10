import { useEffect, useSyncExternalStore } from "react";
import { frontOfficeRequest } from "../front-office/reservationsApi";
import { type AuthUser, updateSessionUser, useSession } from "./auth";

export type HotelProfile = { id: number; property_code: string; name: string; logo_url: string | null; theme: string | null };

// One shared copy of the signed-in user's hotel, so a logo change shows everywhere at once.
let profile: HotelProfile | null = null;
let loadedFor: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function setProfile(next: HotelProfile | null) {
  profile = next;
  // Remembered so the sign-in page can show this hotel's name and logo before anyone logs in.
  if (next) { try { localStorage.setItem(LAST_HOTEL_KEY, JSON.stringify({ name: next.name, logo_url: next.logo_url })); } catch { /* storage unavailable */ } }
  emit();
}

const LAST_HOTEL_KEY = "stayhub.lastHotel";
export function lastHotel(): { name: string; logo_url: string | null } | null {
  try { return JSON.parse(localStorage.getItem(LAST_HOTEL_KEY) || "null"); } catch { return null; }
}

export function useHotelProfile(): HotelProfile | null {
  const user = useSession();
  const propertyId = user?.property_id ?? null;
  useEffect(() => {
    if (propertyId == null) { loadedFor = null; setProfile(null); return; }
    if (loadedFor === propertyId) return;
    loadedFor = propertyId;
    frontOfficeRequest<HotelProfile>("/properties/me").then(setProfile).catch(() => { loadedFor = null; });
  }, [propertyId]);
  return useSyncExternalStore(subscribe, () => profile);
}

export type OwnedHotel = HotelProfile & { active: boolean };
type HotelSession = { property: HotelProfile; access_token: string; user: AuthUser };

// Hotels the signed-in user can open (all of an owner's hotels; a staff member's own hotel).
export function listMyHotels() {
  return frontOfficeRequest<OwnedHotel[]>("/properties");
}

// Store the new token/user, then reload so every page fetches the new hotel's data.
function enterHotel(current: AuthUser, data: HotelSession) {
  updateSessionUser({ ...current, ...data.user }, data.access_token);
  loadedFor = null;
  window.location.assign("/dashboard");
}

export async function switchHotel(current: AuthUser, propertyId: number) {
  enterHotel(current, await frontOfficeRequest<HotelSession>(`/properties/${propertyId}/switch`, { method: "POST" }));
}

export async function createHotel(current: AuthUser, name: string, code: string) {
  enterHotel(current, await frontOfficeRequest<HotelSession>("/properties", {
    method: "POST",
    body: JSON.stringify({ name: name.trim(), property_code: code.trim() || null }),
  }));
}

export async function updateHotelTheme(theme: string) {
  setProfile(await frontOfficeRequest<HotelProfile>("/properties/me/theme", { method: "PUT", body: JSON.stringify({ theme }) }));
}

export async function updateHotelLogo(logo: string | null) {
  setProfile(await frontOfficeRequest<HotelProfile>("/properties/me/logo", { method: "PUT", body: JSON.stringify({ logo }) }));
}

const MAX_LOGO_BYTES = 500 * 1024;
export function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(file.type)) return reject(new Error("Choose a PNG, JPEG, WebP, SVG or GIF image."));
    if (file.size > MAX_LOGO_BYTES) return reject(new Error("Logo must be 500 KB or smaller."));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read the selected file."));
    reader.readAsDataURL(file);
  });
}

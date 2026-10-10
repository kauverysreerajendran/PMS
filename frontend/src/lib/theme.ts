import { useEffect } from "react";

export type PaletteColors = { navy: string; steel: string; gold: string; ivory: string; stone: string };
export type Palette = { key: string; name: string; mood: string; photo: string; colors: PaletteColors; labels: Record<keyof PaletteColors, string> };

/** Professional hotel palettes. Each one sets the five base colours; theme.css mixes every other shade from them. */
export const PALETTES: Palette[] = [
  { key: "navy-gold", photo: "/01_Deluxe_Sea_View.jpg", name: "Navy & Champagne", mood: "Classic luxury",
    colors: { navy: "#0B2342", steel: "#1D4775", gold: "#D6AC68", ivory: "#F7F5F1", stone: "#E9E5DF" },
    labels: { navy: "Deep Navy", steel: "Steel Blue", gold: "Champagne Gold", ivory: "Warm Ivory", stone: "Soft Stone" } },
  { key: "emerald", photo: "/03_Private_Pool_Villa.jpg", name: "Emerald Heritage", mood: "Resort & garden",
    colors: { navy: "#0F2E26", steel: "#1F5A47", gold: "#C9A45C", ivory: "#F6F4EE", stone: "#E5E1D6" },
    labels: { navy: "Deep Forest", steel: "Emerald", gold: "Antique Gold", ivory: "Linen", stone: "Sage Stone" } },
  { key: "burgundy", photo: "/06_Presidential_Suite.jpg", name: "Burgundy Royale", mood: "Heritage palace",
    colors: { navy: "#3B0F1D", steel: "#6E1F36", gold: "#D4AF6A", ivory: "#F8F4F1", stone: "#EBE2DC" },
    labels: { navy: "Oxblood", steel: "Burgundy", gold: "Royal Gold", ivory: "Pearl", stone: "Blush Stone" } },
  { key: "coastal", photo: "/7.png", name: "Coastal Teal", mood: "Beach & island",
    colors: { navy: "#0A2F36", steel: "#17616F", gold: "#D8B48C", ivory: "#F4F7F6", stone: "#E0E7E5" },
    labels: { navy: "Deep Lagoon", steel: "Teal", gold: "Sand", ivory: "Sea Salt", stone: "Mist" } },
  { key: "charcoal", photo: "/04_Premium_City_View.jpg", name: "Charcoal & Bronze", mood: "Modern boutique",
    colors: { navy: "#1E2125", steel: "#3B4249", gold: "#B98A5B", ivory: "#F6F5F3", stone: "#E6E2DC" },
    labels: { navy: "Charcoal", steel: "Graphite", gold: "Bronze", ivory: "Porcelain", stone: "Ash" } },
  { key: "plum", photo: "/02_Executive_Suite.jpg", name: "Plum & Rose Gold", mood: "Spa & wellness",
    colors: { navy: "#2A1633", steel: "#52305F", gold: "#D9A88F", ivory: "#F8F5F7", stone: "#E9E1E7" },
    labels: { navy: "Aubergine", steel: "Plum", gold: "Rose Gold", ivory: "Petal", stone: "Lilac Stone" } },
  { key: "terracotta", photo: "/8.png", name: "Desert Terracotta", mood: "Desert & heritage",
    colors: { navy: "#3A2217", steel: "#8A4A2E", gold: "#E0B07A", ivory: "#FAF6F0", stone: "#ECE2D6" },
    labels: { navy: "Espresso", steel: "Terracotta", gold: "Saffron", ivory: "Cream", stone: "Dune" } },
  { key: "slate-sage", photo: "/05_Standard_Twin_Room.jpg", name: "Slate & Sage", mood: "Calm & natural",
    colors: { navy: "#1F2B2A", steel: "#3F5E58", gold: "#B7A57A", ivory: "#F5F6F2", stone: "#E2E5DD" },
    labels: { navy: "Slate", steel: "Sage", gold: "Olive Gold", ivory: "Chalk", stone: "Moss Stone" } },
  { key: "stayhub-blue", photo: "/bed.jpg", name: "Classic Blue", mood: "Fresh & modern",
    colors: { navy: "#2F395A", steel: "#294FBF", gold: "#B7A087", ivory: "#E8ECF5", stone: "#D9E1F0" },
    labels: { navy: "Dark Text", steel: "Primary Blue", gold: "Dark Beige", ivory: "Background", stone: "Soft Grey" } },
];
export const DEFAULT_PALETTE = PALETTES[0].key;
const STORAGE_KEY = "stayhub.palette";

const paletteFor = (key: string | null | undefined) => PALETTES.find(palette => palette.key === key) || PALETTES[0];

/** Sets the palette's base colours on <html>. Remembered locally so the next visit (and the login page) starts in it. */
export function applyPalette(key: string | null | undefined) {
  const palette = paletteFor(key);
  const root = document.documentElement;
  (Object.keys(palette.colors) as (keyof PaletteColors)[]).forEach(name => root.style.setProperty(`--th-${name}`, palette.colors[name]));
  root.dataset.palette = palette.key;
  try { localStorage.setItem(STORAGE_KEY, palette.key); } catch { /* storage unavailable */ }
}

export function applyStoredPalette() {
  let key: string | null = null;
  try { key = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  applyPalette(key);
}

/** Follows the hotel's saved palette whenever the hotel profile loads or changes. */
export function useHotelPalette(theme: string | null | undefined) {
  useEffect(() => { if (theme !== undefined) applyPalette(theme); }, [theme]);
}

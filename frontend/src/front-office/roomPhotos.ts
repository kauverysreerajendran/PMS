import { apiAssetUrl } from "./reservationsApi";

/** Bundled photos used until a room has its own upload, picked by category so similar rooms look alike. */
const STOCK_PHOTOS: [RegExp, string][] = [
  [/villa/i, "/03_Private_Pool_Villa.jpg"], [/presidential|royal|luxury/i, "/06_Presidential_Suite.jpg"], [/suite|executive/i, "/02_Executive_Suite.jpg"],
  [/premium|city/i, "/04_Premium_City_View.jpg"], [/deluxe|sea/i, "/01_Deluxe_Sea_View.jpg"], [/standard|superior|twin|single|double/i, "/05_Standard_Twin_Room.jpg"],
];
const ALL_STOCK = STOCK_PHOTOS.map(([, path]) => path);

export function stockPhoto(label: string, seed = 0) {
  return STOCK_PHOTOS.find(([pattern]) => pattern.test(label))?.[1] || ALL_STOCK[Math.abs(seed) % ALL_STOCK.length];
}

/** The room's uploaded photo, or a stock one matching its category. */
export function photoFor(imageUrl: string | null | undefined, label: string, seed = 0) {
  return imageUrl ? apiAssetUrl(imageUrl) : stockPhoto(label, seed);
}

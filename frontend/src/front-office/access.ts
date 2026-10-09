const normalizeRole = (role: string) => role.trim().toLowerCase().replace(/[\s-]+/g, "_");
export function isFrontOfficeManager(role: string): boolean {
  return normalizeRole(role) === "front_office_manager";
}
export function isOwner(role: string): boolean {
  return normalizeRole(role) === "owner";
}
// Owners see everything in the hotel they are viewing, as front office managers do.
export function canUseFrontOffice(role: string): boolean {
  return isFrontOfficeManager(role) || isOwner(role);
}
export const frontOfficePages = [
  { slug: "", title: "Dashboard" },
  { slug: "calendar", title: "Calendar" },
  { slug: "reservations", title: "Reservations" },
  { slug: "check-in", title: "Check-In" },
  { slug: "check-out", title: "Check-Out" },
  { slug: "billing", title: "Billing" },
  { slug: "room-assignment", title: "Room Assignment" },
  { slug: "guests", title: "Guests" },
  { slug: "room-status", title: "Room Status" },
  { slug: "staff", title: "Front Office Staff" },
] as const;

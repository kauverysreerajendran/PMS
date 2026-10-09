export function isFrontOfficeManager(role: string): boolean {
  return role.trim().toLowerCase().replace(/[\s-]+/g, "_") === "front_office_manager";
}
export const frontOfficePages = [
  { slug: "", title: "Dashboard" },
  { slug: "reservations", title: "Reservations" },
  { slug: "check-in", title: "Check-In" },
  { slug: "check-out", title: "Check-Out" },
  { slug: "billing", title: "Billing" },
  { slug: "room-assignment", title: "Room Assignment" },
  { slug: "guests", title: "Guests" },
  { slug: "room-status", title: "Room Status" },
  { slug: "staff", title: "Front Office Staff" },
] as const;

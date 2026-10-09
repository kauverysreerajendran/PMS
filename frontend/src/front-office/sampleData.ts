// Sample data only. Replace these exports with property-scoped API data later.
export const summary = [
  { label: "Today's Arrivals", value: 12, note: "8 guests still expected" },
  { label: "Today's Departures", value: 9, note: "5 departures remaining" },
  { label: "Currently Occupied", value: 28, note: "58% of total inventory" },
  { label: "Available Rooms", value: 12, note: "Ready for assignment" },
  { label: "Pending Check-Ins", value: 8, note: "Arrivals awaiting check-in" },
  { label: "Pending Check-Outs", value: 5, note: "Guests awaiting checkout" },
];
export const arrivals = [
  { guest: "Arun Kumar", id: "RES-1042", room: "101 · Deluxe", time: "10:30 AM", status: "Confirmed" },
  { guest: "Priya Mehta", id: "RES-1043", room: "204 · Executive", time: "12:00 PM", status: "Confirmed" },
  { guest: "Nandini Iyer", id: "RES-1044", room: "Not assigned", time: "02:00 PM", status: "Pending" },
];
export const departures = [
  { guest: "Suresh Raman", room: "307", time: "11:00 AM", payment: "Paid", status: "Pending" },
  { guest: "James Wilson", room: "112", time: "11:30 AM", payment: "Due", status: "Pending" },
  { guest: "Anita Sharma", room: "208", time: "12:00 PM", payment: "Paid", status: "Completed" },
];
export const roomStatuses = [
  { label: "Available", count: 12, tone: "available" },
  { label: "Occupied", count: 28, tone: "occupied" },
  { label: "Reserved", count: 4, tone: "reserved" },
  { label: "Cleaning", count: 3, tone: "cleaning" },
  { label: "Maintenance", count: 1, tone: "maintenance" },
];
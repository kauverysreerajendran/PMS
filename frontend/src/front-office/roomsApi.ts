import { frontOfficeRequest } from "./reservationsApi";

export type Room = {
  id: number; property_id: number; room_number: string; room_category: string; room_type: string | null; floor: string | null;
  max_adults: number; max_children: number; capacity: number; status: string; notes: string | null; image_url: string | null;
  display_name: string | null; base_rate: number | null; bed_type: string | null; size_sqft: number | null; amenities: string[];
  is_active: boolean; created_at: string; updated_at: string;
};
export type RoomInput = Pick<Room, "room_number" | "room_category" | "room_type" | "floor" | "max_adults" | "max_children" | "status" | "display_name" | "base_rate" | "bed_type" | "size_sqft" | "amenities"> & { notes?: string | null };
export type RoomStay = { reservation_id: number; reservation_code: string; guest_name: string; status: string; check_in_date: string; check_out_date: string };
export type LiveStatus = "available" | "reserved" | "occupied" | "cleaning" | "maintenance" | "blocked";
export type RoomStatusItem = Room & { live_status: LiveStatus; current_stay: RoomStay | null; next_stay: RoomStay | null };

export function getRooms() { return frontOfficeRequest<Room[]>("/rooms"); }
export function getRoomStatus() { return frontOfficeRequest<RoomStatusItem[]>("/rooms/status"); }
export function createRoom(data: RoomInput) { return frontOfficeRequest<Room>("/rooms", { method: "POST", body: JSON.stringify(data) }); }
export function updateRoom(id: number, data: RoomInput) { return frontOfficeRequest<Room>(`/rooms/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
export function removeRoom(id: number) { return frontOfficeRequest<void>(`/rooms/${id}`, { method: "DELETE" }); }
export function uploadRoomImage(id: number, file: File) {
  const body = new FormData();
  body.append("image", file);
  return frontOfficeRequest<Room>(`/rooms/${id}/image`, { method: "POST", body });
}

export type CategoryAvailability = {
  category: string; total_rooms: number; available_rooms: number; ready_now: number; being_cleaned: number; out_of_order: number;
  fits_party: boolean; next_available: { check_in_date: string; check_out_date: string; rooms: string[] } | null; rate_from: number | null; rate_to: number | null; max_guests: number; image_url: string | null; amenities: string[];
  rooms: (Room & { is_free: boolean; fits_party: boolean })[];
};
export function getCategoryAvailability(checkIn: string, checkOut: string, adults: number, children: number) {
  const query = new URLSearchParams({ check_in_date: checkIn, check_out_date: checkOut, adults: String(adults), children: String(children) });
  return frontOfficeRequest<CategoryAvailability[]>(`/rooms/availability?${query}`);
}

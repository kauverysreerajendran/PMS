import { frontOfficeRequest } from "./reservationsApi";

export type FoodType = "veg" | "non_veg" | "egg" | "beverage";
export type MenuItem = { id: number; name: string; category: string; description: string | null; price: number; food_type: FoodType; prep_minutes: number | null; is_available: boolean; meal_periods: string[]; is_complimentary: boolean; components: string[] };
export type MenuItemInput = Omit<MenuItem, "id">;
export type OrderInput = { reservation_id: number; service: string; lines: { item_id: number; quantity: number }[]; notes?: string; complimentary?: boolean };

export function getMenuItems() { return frontOfficeRequest<MenuItem[]>("/menu/items"); }
export function createMenuItem(data: MenuItemInput) { return frontOfficeRequest<MenuItem>("/menu/items", { method: "POST", body: JSON.stringify(data) }); }
export function updateMenuItem(id: number, data: MenuItemInput) { return frontOfficeRequest<MenuItem>(`/menu/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
export function removeMenuItem(id: number) { return frontOfficeRequest<void>(`/menu/items/${id}`, { method: "DELETE" }); }
export function postMenuOrder(data: OrderInput) { return frontOfficeRequest<{ reference: string; total: number; room_number: string | null }>("/menu/orders", { method: "POST", body: JSON.stringify(data) }); }

export type PublicMenu = { hotel: { name: string; logo_url: string | null; property_code: string }; items: Omit<MenuItem, "is_available">[] };

export type GuestOrder = {
  id: number; reference: string; reservation_id: number; room_number: string; guest_name: string; notes: string | null; total: number;
  status: "new" | "accepted" | "declined"; created_at: string;
  lines: { item_id: number; name: string; quantity: number; price: number; complimentary: boolean }[];
};
export function bulkCreateMenuItems(items: MenuItemInput[]) { return frontOfficeRequest<{ added: number }>("/menu/items/bulk", { method: "POST", body: JSON.stringify({ items }) }); }
export function getGuestOrders() { return frontOfficeRequest<GuestOrder[]>("/menu/guest-orders"); }
export function acceptGuestOrder(id: number, service = "Room Service") { return frontOfficeRequest<GuestOrder>(`/menu/guest-orders/${id}/accept`, { method: "POST", body: JSON.stringify({ service }) }); }
export function declineGuestOrder(id: number) { return frontOfficeRequest<GuestOrder>(`/menu/guest-orders/${id}/decline`, { method: "POST" }); }

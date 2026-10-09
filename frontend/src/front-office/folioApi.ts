import { frontOfficeRequest } from "./reservationsApi";

export type FolioNight = { id: number; stay_date: string; room_number: string | null; room_category: string | null; rate_plan: string | null; adults: number; children: number; rate: number; complimentary: boolean };
export type FolioTransaction = { kind: "room" | "charge" | "discount" | "payment"; id: number; date: string; reference: string | null; particulars: string; description: string | null; user: string | null; amount: number; void: boolean };
export type FolioGuest = { id: number; first_name: string; last_name: string; email: string | null; mobile: string | null; address: string | null; nationality: string | null; identity_type: string | null; identity_number: string | null; has_identity_document: boolean };
export type FolioReservation = {
  id: number; reservation_code: string; status: string; check_in_date: string; check_out_date: string; arrival_time: string | null;
  nights: number; room_number: string | null; room_category: string | null; rooms_count: number; rate_plan: string | null; nightly_rate: number | null;
  adults: number; children: number; avg_daily_rate: number; source: string; booking_source: string | null; business_source: string | null; market_code: string | null;
  is_group_booking: boolean; group_name: string | null; special_requests: string | null; notes: string | null; required_advance_amount: number; deposit_due_at: string | null;
  booked_at: string; booked_by: string | null; folio_number: string | null; checked_in_at: string | null; guest: FolioGuest | null;
};
export type Folio = {
  reservation: FolioReservation;
  nights: FolioNight[];
  transactions: FolioTransaction[];
  totals: { room_charges: number; extra_charges: number; taxes: number; discounts: number; total: number; paid: number; balance: number };
  history: { id: number; action: string; details: string | null; user: string | null; at: string }[];
  editable: boolean;
};

const post = <T,>(path: string, body: unknown) => frontOfficeRequest<T>(path, { method: "POST", body: JSON.stringify(body) });

export const getFolio = (id: number) => frontOfficeRequest<Folio>(`/reservations/${id}/folio`);
export const getFolioOptions = () => frontOfficeRequest<{ charge_categories: string[]; payment_methods: string[] }>("/reservations/folio/charge-categories");
export const addFolioCharge = (id: number, body: { posted_on?: string; category: string; reference?: string; description?: string; quantity: number; unit_amount: number; discount: number; tax_inclusive: boolean }) => post(`/reservations/${id}/charges`, body);
export const voidFolioCharge = (id: number, chargeId: number, reason: string) => post(`/reservations/${id}/charges/${chargeId}/void`, { reason });
export const applyFolioDiscount = (id: number, amount: number, reason: string) => post(`/reservations/${id}/discount`, { amount, reason });
export const addFolioPayment = (id: number, body: { amount: number; payment_method: string; reference_number?: string; notes?: string }) => post(`/reservations/${id}/folio-payments`, body);
export const amendStay = (id: number, body: { check_in_date?: string; check_out_date: string; override_rate?: number | null }) => post(`/reservations/${id}/amend-stay`, body);
export const moveRoom = (id: number, body: { room_category: string; room_number: string; override_rate?: number | null; reason?: string }) => post(`/reservations/${id}/room-move`, body);
export const updateNights = (id: number, body: { dates?: string[] | null; rate?: number; adults?: number; children?: number; rate_plan?: string; complimentary?: boolean }) => post(`/reservations/${id}/nights/update`, body);
export const updateGuest = (guestId: number, body: Partial<FolioGuest>) => frontOfficeRequest(`/guests/${guestId}`, { method: "PATCH", body: JSON.stringify(body) });
export type RoomOption = { id: number; room_number: string; room_category: string; status: string; capacity: number };
export const listRooms = () => frontOfficeRequest<RoomOption[]>("/rooms");
export const shiftStay = (id: number, checkInDate: string) => post<{ message: string; check_in_date: string; check_out_date: string }>(`/reservations/${id}/shift`, { check_in_date: checkInDate });

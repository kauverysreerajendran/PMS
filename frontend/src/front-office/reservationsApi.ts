import {
  getAccessToken,
  getRefreshToken,
  signOut,
  updateSessionTokens,
} from "../lib/auth";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

export type Reservation = {
  id: number;
  reservation_code: string;
  room_number: string | null;
  room_category: string | null;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  status: string;
  rooms_count: number;
  rate_plan: string | null;
  nightly_rate: number | null;
  total_amount: number | null;
  guest: {
    first_name: string;
    last_name: string;
    email: string | null;
    mobile: string | null;
    address?: string | null;
    identity_type?: string | null;
    identity_number?: string | null;
  };
};

export type ReservationInput = {
  guest: {
    first_name: string;
    last_name: string;
    email?: string;
    mobile?: string;
    address?: string;
    identity_type?: string;
    identity_number?: string;
  };
  guest_id?: number;
  room_number?: string;
  room_category?: string;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  rooms_count: number;
  status: "confirmed" | "tentative" | "waiting";
  rate_plan?: string;
  nightly_rate?: number;
  rate_override_reason?: string;
  taxes_amount?: number;
  discount_amount?: number;
  additional_charges?: number;
  advance_payment_amount?: number;
  advance_payment_method?: string;
  advance_payment_reference?: string;
  special_requests?: string;
  send_confirmation_voucher?: boolean;
  source: string;
};

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const response = await fetch(`${API_BASE_URL}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token || !data.refresh_token) return false;

  updateSessionTokens(data.access_token, data.refresh_token);
  return true;
}

function returnToLogin() {
  signOut();
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

export async function frontOfficeRequest<T>(
  path: string,
  options: RequestInit = {},
  retried = false
): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    returnToLogin();
    throw new Error("Your session has expired. Please log in again.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !retried && await refreshAccessToken()) {
    return frontOfficeRequest<T>(path, options, true);
  }
  if (response.status === 401) {
    returnToLogin();
    throw new Error("Your session has expired. Please log in again.");
  }
  if (!response.ok) {
    const validationDetail = Array.isArray(data.detail)
      ? data.detail.map((item: { msg?: string; loc?: (string | number)[] }) => item.msg || item.loc?.join(".")).filter(Boolean).join("; ")
      : "";
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : validationDetail
        ? validationDetail
        : "Unable to complete the reservation request."
    );
  }
  return data as T;
}

export function getReservations(search = "", status = "", arrivalDate = "") {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (status) params.set("status", status);
  if (arrivalDate) params.set("arrival_date", arrivalDate);
  const query = params.toString();
  return frontOfficeRequest<{ items: Reservation[]; total: number }>(
    `/reservations${query ? `?${query}` : ""}`
  );
}

export function createReservation(data: ReservationInput) {
  return frontOfficeRequest<Reservation>("/reservations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export type GuestSearchResult = { id: number; first_name: string; last_name: string; email: string | null; mobile: string | null; address: string | null; identity_type: string | null; identity_number: string | null };
export type AvailableRoomType = { room_category: string; available_rooms: number; room_numbers: string[] };
export function searchGuests(query: string) { return frontOfficeRequest<GuestSearchResult[]>(`/reservations/guests/search?query=${encodeURIComponent(query)}`); }
export function getRoomAvailability(checkIn: string, checkOut: string, adults: number) { return frontOfficeRequest<AvailableRoomType[]>(`/reservations/availability?check_in_date=${encodeURIComponent(checkIn)}&check_out_date=${encodeURIComponent(checkOut)}&adults=${adults}`); }

export function cancelReservation(id: number) {
  return frontOfficeRequest<Reservation>("/reservations/" + id + "/cancel", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
export function markReservationNoShow(id: number) {
  return frontOfficeRequest<Reservation>(`/reservations/${id}/no-show`, { method: "POST", body: JSON.stringify({}) });
}
export function assignReservationRoom(
  id: number,
  roomNumber: string,
  roomCategory: string
) {
  return frontOfficeRequest<Reservation>("/reservations/" + id, {
    method: "PATCH",
    body: JSON.stringify({
      room_number: roomNumber,
      room_category: roomCategory || null,
    }),
  });
}

export function updateReservation(id: number, changes: Partial<ReservationInput>) {
  return frontOfficeRequest<Reservation>(`/reservations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}



import { frontOfficeRequest, Reservation } from "./reservationsApi";

export type Guest = {
  id: number;
  first_name: string;
  last_name: string;
  email?: string | null;
  mobile?: string | null;
  created_at?: string;
};

export type GuestProfile = {
  guest: Guest;
  stays: Reservation[];
};

export const getGuests = () => frontOfficeRequest<Guest[]>("/guests");

export const getGuestProfile = (guestId: number) =>
  frontOfficeRequest<GuestProfile>(`/guests/${guestId}`);

export const updateGuest = (guestId: number, guest: Omit<Guest, "id" | "created_at">) =>
  frontOfficeRequest<Guest>(`/guests/${guestId}`, {
    method: "PATCH",
    body: JSON.stringify(guest),
  });

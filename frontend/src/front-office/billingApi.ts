import { frontOfficeRequest } from "./reservationsApi";

export type BillingReservation = {
  id: number; reservation_code: string; guest: { first_name: string; last_name: string; email: string | null; mobile: string | null };
  room_number: string | null; check_in_date: string; check_out_date: string; status: string;
  total_amount: number; paid_amount: number; balance_amount: number; payment_status: "paid" | "partial" | "unpaid";
  payments: { id: number; amount: number; payment_method: string; reference_number: string | null; notes: string | null; received_at: string }[];
};
export const getBillingReservations = () => frontOfficeRequest<BillingReservation[]>("/billing");
export const setBillTotal = (reservationId: number, totalAmount: number) => frontOfficeRequest(`/billing/${reservationId}/total`, { method: "PATCH", body: JSON.stringify({ total_amount: totalAmount }) });
export const recordPayment = (reservationId: number, amount: number, paymentMethod: string, referenceNumber: string, notes: string) => frontOfficeRequest("/billing/payments", { method: "POST", body: JSON.stringify({ reservation_id: reservationId, amount, payment_method: paymentMethod, reference_number: referenceNumber || null, notes: notes || null }) });

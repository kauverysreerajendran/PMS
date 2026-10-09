import { frontOfficeRequest } from "./reservationsApi";

export type PendingCheckIn = {
  id: number;
  reservation_code: string;
  room_number: string | null;
  room_category: string | null;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  status: string;
  guest: {
    first_name: string;
    last_name: string;
    email: string | null;
    mobile: string | null;
    identity_type?: string | null;
    identity_number?: string | null;
    identity_document_path?: string | null;
    nationality?: string | null;
  };
};

export type CheckIn = {
  id: number;
  reservation_id: number;
  guest: PendingCheckIn["guest"];
  room_number: string;
  identity_document_type: string | null;
  identity_document_number: string | null;
  verification_status: string;
  notes: string | null;
  checked_in_at: string;
  folio_number: string | null;
};

export function getPendingCheckIns(arrivalDate: string) {
  return frontOfficeRequest<{ items: PendingCheckIn[]; total: number }>(
    "/check-ins/pending?arrival_date=" + encodeURIComponent(arrivalDate)
  );
}

export function createCheckIn(
  reservationId: number,
  identityDocumentType: string,
  identityDocumentNumber: string,
  verificationStatus: string,
  notes: string
) {
  return frontOfficeRequest<CheckIn>("/check-ins", {
    method: "POST",
    body: JSON.stringify({
      reservation_id: reservationId,
      identity_document_type: identityDocumentType || null,
      identity_document_number: identityDocumentNumber || null,
      verification_status: verificationStatus,
      notes: notes || null,
    }),
  });
}

export function getCheckIns() {
  return frontOfficeRequest<CheckIn[]>("/check-ins");
}

export function uploadIdentityDocument(reservationId: number, values: { documentType: string; documentNumber: string; nationality: string; file: File }) {
  const query = new URLSearchParams({ document_type: values.documentType, document_number: values.documentNumber });
  if (values.nationality.trim()) query.set("nationality", values.nationality.trim());
  const data = new FormData();
  data.append("document", values.file);
  return frontOfficeRequest<{ message: string }>(`/check-ins/${reservationId}/identity-document?${query}`, { method: "POST", body: data });
}

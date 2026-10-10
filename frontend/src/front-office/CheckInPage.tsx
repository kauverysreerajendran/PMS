import { FormEvent, useEffect, useState } from "react";
import { useHotelProfile } from "../lib/property";
import {
  CheckCircle2,
  ClipboardCheck,
  BedDouble,
  LoaderCircle,
  RefreshCw,
  Printer,
  Upload,
  X,
} from "lucide-react";
import {
  createCheckIn,
  getPendingCheckIns,
  PendingCheckIn,
  CheckIn,
  uploadIdentityDocument,
} from "./checkinsApi";
import { AvailableRoomType, assignReservationRoom, getRoomAvailability } from "./reservationsApi";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
}).format(new Date());
const fallbackRoomTypes: AvailableRoomType[] = ["Double Room", "Standard", "Deluxe", "Suite"].map(room_category => ({
  room_category,
  available_rooms: 0,
  room_numbers: [],
}));

export default function CheckInPage() {
  const hotel = useHotelProfile();
  const [pending, setPending] = useState<PendingCheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PendingCheckIn | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("pending");
  const [notes, setNotes] = useState("");
  const [assignmentTarget, setAssignmentTarget] = useState<PendingCheckIn | null>(null);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomCategory, setRoomCategory] = useState("");
  const [availableRoomTypes, setAvailableRoomTypes] = useState<AvailableRoomType[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [documentTarget, setDocumentTarget] = useState<PendingCheckIn | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [nationality, setNationality] = useState("");
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [grCard, setGrCard] = useState<{ checkin: CheckIn; reservation: PendingCheckIn } | null>(null);

  const loadPending = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getPendingCheckIns(today);
      setPending(data.items);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load pending check-ins."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadPending(); }, []);

  useEffect(() => {
    if (!assignmentTarget) {
      setAvailableRoomTypes([]);
      return;
    }
    void getRoomAvailability(
      assignmentTarget.check_in_date,
      assignmentTarget.check_out_date,
      Math.max(1, assignmentTarget.adults)
    ).then(types => setAvailableRoomTypes(types.filter(type => type.room_category !== "China Town")))
      .catch(() => setAvailableRoomTypes([]));
  }, [assignmentTarget]);

  const checkIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    if (verificationStatus !== "verified") { setError("Guest verification must be marked as Verified before check-in."); return; }
    setSaving(true);
    setError("");
    try {
      const checkin = await createCheckIn(
        selected.id,
        documentType,
        documentNumber,
        verificationStatus,
        notes
      );
      setSuccessMessage(`Guest checked in successfully. Guest folio number: ${checkin.folio_number || "generated"}.`);
      setGrCard({ checkin, reservation: selected });
      setSelected(null);
      setDocumentType("");
      setDocumentNumber("");
      setVerificationStatus("pending");
      setNotes("");
      await loadPending();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to check in this guest."
      );
    } finally {
      setSaving(false);
    }
  };

  const openCheckIn = (reservation: PendingCheckIn) => {
    setSelected(reservation);
    setDocumentType(reservation.guest.identity_type || "");
    setDocumentNumber(reservation.guest.identity_number || "");
    setVerificationStatus("verified");
  };

  const uploadDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!documentTarget || !documentFile || !documentType || !documentNumber) { setError("Select an ID file and enter its type and number."); return; }
    setUploading(true); setError("");
    try {
      await uploadIdentityDocument(documentTarget.id, { documentType, documentNumber, nationality, file: documentFile });
      setDocumentTarget(null); setDocumentFile(null); setNationality(""); await loadPending();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to upload identity document."); }
    finally { setUploading(false); }
  };

  const assignRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assignmentTarget) return;
    setAssigning(true);
    setError("");
    try {
      await assignReservationRoom(
        assignmentTarget.id,
        roomNumber.trim(),
        roomCategory.trim()
      );
      setAssignmentTarget(null);
      setRoomNumber("");
      setRoomCategory("");
      await loadPending();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to assign the room."
      );
    } finally {
      setAssigning(false);
    }
  };

  const openAssignment = (reservation: PendingCheckIn) => {
    setAssignmentTarget(reservation);
    setRoomNumber("");
    setRoomCategory("");
  };

  const assignmentRoomTypes = availableRoomTypes.length ? availableRoomTypes : fallbackRoomTypes;

  return <>
    <section className="fo-page-heading">
      <div>
        <p className="fo-eyebrow">FRONT OFFICE OPERATIONS</p>
        <h2>Check-In</h2>
        <p>Complete guest arrivals and record their check-in details.</p>
      </div>
      <button className="fo-outline-button" onClick={() => void loadPending()} disabled={loading}>
        <RefreshCw size={15}/>Refresh
      </button>
    </section>
    <section className="fo-card fo-reservations-card">
      {error && <p className="fo-api-error">{error}</p>}
      {successMessage && <p className="fo-success-message">{successMessage}</p>}
      <div className="fo-section-heading">
        <h2>Pending Check-Ins <span className="fo-count">{pending.length}</span></h2>
        <span>Arrivals for {today}</span>
      </div>
      <div className="fo-table-wrap">
        <table>
          <thead><tr>{["Guest", "Reservation ID", "Room", "Stay", "Status", "Action"].map(column => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="fo-loading"><LoaderCircle size={18}/>Loading pending check-ins…</td></tr>
              : pending.length === 0 ? <tr><td colSpan={6} className="fo-empty">No pending check-ins for today.</td></tr>
              : pending.map(reservation => <tr key={reservation.id}>
                <td><strong>{reservation.guest.first_name} {reservation.guest.last_name}</strong><small>{reservation.guest.mobile || reservation.guest.email || "No contact information"}</small></td>
                <td>{reservation.reservation_code}</td>
                <td>{reservation.room_number || "Unassigned"}<small>{reservation.room_category || ""}</small></td>
                <td>{reservation.check_in_date}<small>to {reservation.check_out_date}</small></td>
                <td><span className="fo-badge success">{reservation.status === "confirmed" ? "Confirmed" : reservation.status}</span></td>
            <td>{!reservation.room_number ? <button className="fo-small-button" onClick={() => openAssignment(reservation)}><BedDouble size={14}/>Assign Room</button> : !reservation.guest.identity_document_path ? <button className="fo-small-button" onClick={() => { setDocumentTarget(reservation); setDocumentType(reservation.guest.identity_type || ""); setDocumentNumber(reservation.guest.identity_number || ""); }}><Upload size={14}/>Upload ID</button> : <button className="fo-small-button" onClick={() => openCheckIn(reservation)}>Check-In</button>}</td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    {selected && <div className="fo-modal-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget && !saving) setSelected(null);
    }}>
      <form className="fo-modal fo-checkin-modal" onSubmit={checkIn}>
        <header>
          <div><p className="fo-eyebrow">GUEST ARRIVAL</p><h2>Check in {selected.guest.first_name} {selected.guest.last_name}</h2></div>
          <button type="button" className="fo-icon-button" disabled={saving} onClick={() => setSelected(null)} aria-label="Close"><X size={19}/></button>
        </header>
        <div className="fo-checkin-summary">
          <span><ClipboardCheck size={20}/></span>
          <div><strong>{selected.reservation_code}</strong><small>Room {selected.room_number}{selected.room_category ? " · " + selected.room_category : ""}</small></div>
        </div>
        <div className="fo-form-grid">
          <label>Document type
            <select value={documentType} onChange={event => setDocumentType(event.target.value)}>
              <option value="">Not recorded</option><option value="Passport">Passport</option><option value="Aadhaar">Aadhaar</option><option value="Driving Licence">Driving Licence</option><option value="National ID">National ID</option>
            </select>
          </label>
          <label>Document number<input value={documentNumber} onChange={event => setDocumentNumber(event.target.value)} placeholder="Optional"/></label>
          <label>Verification status<select value={verificationStatus} onChange={event => setVerificationStatus(event.target.value)}><option value="pending">Pending review</option><option value="verified">Verified</option><option value="not_required">Not required</option></select></label>
          <label className="fo-form-full">Arrival notes<textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional notes for this stay"/></label>
        </div>
        {error && <p className="fo-api-error">{error}</p>}
        <footer>
          <button type="button" className="fo-outline-button" disabled={saving} onClick={() => setSelected(null)}>Cancel</button>
          <button className="fo-button" disabled={saving || verificationStatus !== "verified"}>{saving ? <><LoaderCircle size={16}/>Checking in…</> : <><CheckCircle2 size={16}/>Complete Check-In</>}</button>
        </footer>
      </form>
    </div>}
    {documentTarget && <div className="fo-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !uploading) setDocumentTarget(null); }}>
      <form className="fo-modal" onSubmit={uploadDocument}>
        <header><div><p className="fo-eyebrow">GUEST DOCUMENT</p><h2>Upload identity proof</h2></div><button type="button" className="fo-icon-button" disabled={uploading} onClick={() => setDocumentTarget(null)} aria-label="Close"><X size={19}/></button></header>
        <div className="fo-checkin-summary"><span><Upload size={20}/></span><div><strong>{documentTarget.guest.first_name} {documentTarget.guest.last_name}</strong><small>{documentTarget.reservation_code} · Room {documentTarget.room_number}</small></div></div>
        <div className="fo-form-grid"><label>Identity type<select required value={documentType} onChange={event => setDocumentType(event.target.value)}><option value="">Select document</option><option value="Aadhaar">Aadhaar</option><option value="Passport">Passport</option><option value="Driving Licence">Driving Licence</option><option value="National ID">National ID</option></select></label><label>Identity number<input required value={documentNumber} onChange={event => setDocumentNumber(event.target.value)}/></label><label>Nationality<input value={nationality} onChange={event => setNationality(event.target.value)} placeholder="Optional"/></label><label>Identity proof file<input required type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={event => setDocumentFile(event.target.files?.[0] || null)}/></label></div>
        {error && <p className="fo-api-error">{error}</p>}<footer><button type="button" className="fo-outline-button" disabled={uploading} onClick={() => setDocumentTarget(null)}>Cancel</button><button className="fo-button" disabled={uploading}>{uploading ? <><LoaderCircle size={16}/>Uploading…</> : <><Upload size={16}/>Save document</>}</button></footer>
      </form>
    </div>}
    {grCard && <div className="fo-modal-backdrop"><section className="fo-modal fo-gr-card" role="dialog" aria-modal="true" aria-label="Guest Registration Card"><header className="fo-no-print"><div><p className="fo-eyebrow">{(hotel?.name || "Hotel").toUpperCase()} · FRONT OFFICE</p><h2>Guest Registration Card</h2></div><button type="button" className="fo-icon-button" onClick={() => setGrCard(null)} aria-label="Close"><X size={19}/></button></header><div className="fo-gr-card-body"><div className="fo-gr-card-title"><div><strong>{hotel?.name || "Hotel"}</strong><span>Guest Registration Card (GR Card)</span></div><div><span>Folio No.</span><strong>{grCard.checkin.folio_number || "—"}</strong></div></div><div className="fo-gr-card-grid"><div><span>Guest name</span><strong>{grCard.reservation.guest.first_name} {grCard.reservation.guest.last_name}</strong></div><div><span>Reservation number</span><strong>{grCard.reservation.reservation_code}</strong></div><div><span>Room</span><strong>{grCard.checkin.room_number}{grCard.reservation.room_category ? ` · ${grCard.reservation.room_category}` : ""}</strong></div><div><span>Stay</span><strong>{grCard.reservation.check_in_date} to {grCard.reservation.check_out_date}</strong></div><div><span>Identity document</span><strong>{grCard.checkin.identity_document_type || "—"}</strong></div><div><span>Identity number</span><strong>{grCard.checkin.identity_document_number || "—"}</strong></div><div><span>Email</span><strong>{grCard.reservation.guest.email || "—"}</strong></div><div><span>Mobile</span><strong>{grCard.reservation.guest.mobile || "—"}</strong></div></div><p className="fo-gr-declaration">I confirm that the above information is accurate and agree to the hotel’s registration terms.</p><div className="fo-gr-signatures"><div><span>Guest signature</span><i /></div><div><span>Front desk signature</span><i /></div></div></div><footer className="fo-no-print"><button className="fo-outline-button" onClick={() => setGrCard(null)}>Close</button><button className="fo-button" onClick={() => window.print()}><Printer size={16}/>Print GR Card</button></footer></section></div>}
    {assignmentTarget && <div className="fo-modal-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget && !assigning) setAssignmentTarget(null);
    }}>
      <form className="fo-modal fo-room-assignment-modal" onSubmit={assignRoom}>
        <header>
          <div><p className="fo-eyebrow">ROOM ASSIGNMENT</p><h2>Assign a room</h2></div>
          <button type="button" className="fo-icon-button" disabled={assigning} onClick={() => setAssignmentTarget(null)} aria-label="Close"><X size={19}/></button>
        </header>
        <div className="fo-checkin-summary">
          <span><BedDouble size={20}/></span>
          <div><strong>{assignmentTarget.guest.first_name} {assignmentTarget.guest.last_name}</strong><small>{assignmentTarget.reservation_code} · {assignmentTarget.check_in_date} to {assignmentTarget.check_out_date}</small></div>
        </div>
        <div className="fo-form-grid">
          <label>Room type<select required value={roomCategory} onChange={event => { const category = event.target.value; const type = assignmentRoomTypes.find(item => item.room_category === category); setRoomCategory(category); setRoomNumber(type?.room_numbers[0] || ""); }}><option value="">Select room type</option>{assignmentRoomTypes.map(type => <option key={type.room_category} value={type.room_category}>{type.room_category}{availableRoomTypes.length ? ` · ${type.available_rooms} available` : ""}</option>)}</select></label>
          <label>Room number{roomCategory && assignmentRoomTypes.find(type => type.room_category === roomCategory)?.room_numbers.length ? <select required value={roomNumber} onChange={event => setRoomNumber(event.target.value)}><option value="">Select room number</option>{assignmentRoomTypes.find(type => type.room_category === roomCategory)?.room_numbers.map(number => <option key={number} value={number}>{number}</option>)}</select> : <input required value={roomNumber} placeholder="Example: 101" onChange={event => setRoomNumber(event.target.value)}/>}</label>
        </div>
        {error && <p className="fo-api-error">{error}</p>}
        <footer>
          <button type="button" className="fo-outline-button" disabled={assigning} onClick={() => setAssignmentTarget(null)}>Cancel</button>
          <button className="fo-button" disabled={assigning}>{assigning ? <><LoaderCircle size={16}/>Assigning…</> : <><BedDouble size={16}/>Assign Room</>}</button>
        </footer>
      </form>
    </div>}
  </>;
}




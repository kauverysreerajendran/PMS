import { FormEvent, useEffect, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  BedDouble,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import {
  createCheckIn,
  getPendingCheckIns,
  PendingCheckIn,
} from "./checkinsApi";
import { assignReservationRoom } from "./reservationsApi";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
}).format(new Date());

export default function CheckInPage() {
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
  const [assigning, setAssigning] = useState(false);

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

  const checkIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    if (verificationStatus !== "verified") { setError("Guest verification must be marked as Verified before check-in."); return; }
    setSaving(true);
    setError("");
    try {
      await createCheckIn(
        selected.id,
        documentType,
        documentNumber,
        verificationStatus,
        notes
      );
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
            <td>{reservation.room_number ? <button className="fo-small-button" onClick={() => setSelected(reservation)}>Check-In</button> : <button className="fo-small-button" onClick={() => setAssignmentTarget(reservation)}><BedDouble size={14}/>Assign Room</button>}</td>
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
          <label>Room number<input required value={roomNumber} placeholder="Example: 101" onChange={event => setRoomNumber(event.target.value)}/></label>
          <label>Room category<input value={roomCategory} placeholder="Example: Deluxe" onChange={event => setRoomCategory(event.target.value)}/></label>
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




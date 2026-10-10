import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { BedDouble, CalendarCheck, CheckCircle2, LoaderCircle, User, Users, X } from "lucide-react";
import { createReservation, Reservation, ReservationInput } from "./reservationsApi";
import type { RoomStatusItem } from "./roomsApi";

const isoDay = (offset = 0) => { const day = new Date(); day.setDate(day.getDate() + offset); return day.toLocaleDateString("en-CA"); };
const nightsBetween = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000);
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;

/** Reserve one room for a guest or a group from the Room Status page; the booking holds the room for those dates. */
export default function ReserveRoomModal({ room, onClose, onReserved }: { room: RoomStatusItem; onClose: () => void; onReserved: () => void }) {
  const [mode, setMode] = useState<"guest" | "group">("guest");
  const [groupName, setGroupName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [checkIn, setCheckIn] = useState(isoDay());
  const [checkOut, setCheckOut] = useState(isoDay(1));
  const [adults, setAdults] = useState(Math.min(2, room.max_adults));
  const [children, setChildren] = useState(0);
  const [rate, setRate] = useState(room.base_rate ?? 0);
  const [status, setStatus] = useState<ReservationInput["status"]>("confirmed");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Reservation | null>(null);
  const nights = nightsBetween(checkIn, checkOut);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (nights < 1) { setError("Check-out must be after check-in."); return; }
    if (mode === "group" && !groupName.trim()) { setError("Enter the group name."); return; }
    setSaving(true);
    try {
      const reservation = await createReservation({
        guest: { first_name: firstName.trim(), last_name: lastName.trim(), mobile: mobile.trim() || undefined, email: email.trim() || undefined },
        room_number: room.room_number, room_category: room.room_category, check_in_date: checkIn, check_out_date: checkOut,
        adults, children, rooms_count: 1, status, rate_plan: "Room Only", nightly_rate: rate,
        source: "front_desk", booking_source: mode === "group" ? "Group" : "Direct",
        group_name: mode === "group" ? groupName.trim() : undefined,
        special_requests: notes.trim() || undefined, send_confirmation_voucher: false,
        taxes_amount: 0, discount_amount: 0, additional_charges: 0, advance_payment_amount: 0,
      });
      setDone(reservation);
      onReserved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to reserve the room."); }
    finally { setSaving(false); }
  };

  return <div className="fo-modal-backdrop" onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form className="rr-modal" onSubmit={submit}>
      <header>
        <span className="rr-icon"><BedDouble size={22}/></span>
        <div><p>RESERVE ROOM {room.room_number}</p><h2>{room.display_name || `${room.room_category} Room`}</h2><small>{room.room_category}{room.floor ? ` · Floor ${room.floor}` : ""} · up to {room.max_adults} adult{room.max_adults === 1 ? "" : "s"}{room.max_children ? ` + ${room.max_children} child${room.max_children === 1 ? "" : "ren"}` : ""}</small></div>
        <button type="button" className="rr-close" onClick={onClose} disabled={saving} aria-label="Close"><X size={18}/></button>
      </header>

      {done ? <div className="rr-done">
        <CheckCircle2 size={40}/>
        <h3>Room {room.room_number} reserved</h3>
        <p>{done.reservation_code} · {mode === "group" ? groupName : `${firstName} ${lastName}`} · {checkIn} → {checkOut}</p>
        <div><Link className="rr-primary" to={`/dashboard/reservations/${done.id}`}>Open booking</Link><button type="button" className="rr-secondary" onClick={onClose}>Done</button></div>
      </div> : <>
        <div className="rr-mode" role="radiogroup" aria-label="Reserve for">
          <button type="button" role="radio" aria-checked={mode === "guest"} className={mode === "guest" ? "on" : ""} onClick={() => setMode("guest")}><User size={15}/>Guest</button>
          <button type="button" role="radio" aria-checked={mode === "group"} className={mode === "group" ? "on" : ""} onClick={() => setMode("group")}><Users size={15}/>Group</button>
        </div>
        <div className="rr-grid">
          {mode === "group" && <label className="wide">Group name<input value={groupName} placeholder="e.g. Sharma Wedding Party, Infosys Offsite" onChange={event => setGroupName(event.target.value)} autoFocus/></label>}
          <label>{mode === "group" ? "Contact first name" : "First name"}<input required value={firstName} onChange={event => setFirstName(event.target.value)} autoFocus={mode === "guest"}/></label>
          <label>{mode === "group" ? "Contact last name" : "Last name"}<input required value={lastName} onChange={event => setLastName(event.target.value)}/></label>
          <label>Mobile<input value={mobile} inputMode="tel" onChange={event => setMobile(event.target.value)}/></label>
          <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)}/></label>
          <label>Check-in<input required type="date" min={isoDay()} value={checkIn} onChange={event => { setCheckIn(event.target.value); if (event.target.value >= checkOut) { const next = new Date(`${event.target.value}T00:00:00`); next.setDate(next.getDate() + 1); setCheckOut(next.toLocaleDateString("en-CA")); } }}/></label>
          <label>Check-out<input required type="date" min={checkIn} value={checkOut} onChange={event => setCheckOut(event.target.value)}/></label>
          <label>Adults<input type="number" min={1} max={room.max_adults} value={adults} onChange={event => setAdults(Math.max(1, Math.min(room.max_adults, Number(event.target.value) || 1)))}/></label>
          <label>Children<input type="number" min={0} max={room.max_children} value={children} onChange={event => setChildren(Math.max(0, Math.min(room.max_children, Number(event.target.value) || 0)))}/></label>
          <label>Rate per night (₹)<input type="number" min={0} value={rate} onChange={event => setRate(Number(event.target.value) || 0)}/></label>
          <label>Status<select value={status} onChange={event => setStatus(event.target.value as ReservationInput["status"])}><option value="confirmed">Confirmed (holds the room)</option><option value="tentative">Tentative</option></select></label>
          <label className="wide">Notes<input value={notes} placeholder="Arrival time, requests, billing instructions…" onChange={event => setNotes(event.target.value)}/></label>
        </div>
        <div className="rr-summary"><CalendarCheck size={18}/><span>{nights > 0 ? `${nights} night${nights === 1 ? "" : "s"} · ${money(rate * nights)}` : "Choose valid dates"}</span><small>The room is held for these dates as soon as you reserve.</small></div>
        {error && <p className="rr-error" role="alert">{error}</p>}
        <footer><button type="button" className="rr-secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="rr-primary" disabled={saving}>{saving && <LoaderCircle size={15} className="rr-spin"/>}Reserve room {room.room_number}</button></footer>
      </>}
    </form>
  </div>;
}

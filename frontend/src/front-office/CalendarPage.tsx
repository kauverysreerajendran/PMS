import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BedDouble, CalendarDays, ChevronLeft, ChevronRight, CreditCard, LoaderCircle, Mail, MoreHorizontal, Phone, PieChart, Plus, RefreshCw, UserRound, Users, X } from "lucide-react";
import { getReservationCalendar, type CalendarBooking } from "./reservationsApi";
import { listRooms, shiftStay } from "./folioApi";

type View = "month" | "week" | "day";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 2;
// Only bookings that have not started can be moved by drag & drop.
const MOVABLE = new Set(["confirmed", "tentative", "waiting"]);
const HIDDEN = new Set(["cancelled", "no_show"]);
// Each booking keeps one colour everywhere (grid chip, dot in the day list).
const TONES = ["blue", "green", "purple", "red", "amber", "teal"];
const tone = (b: CalendarBooking) => TONES[b.id % TONES.length];

const money = (value: number | null | undefined) => "₹ " + (value ?? 0).toLocaleString("en-IN");
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
// Local calendar dates as YYYY-MM-DD (no timezone shifts).
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (value: string) => { const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d); };
const pretty = (value: string) => parse(value).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
const short = (value: string) => parse(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const shortYear = (value: string) => parse(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const addDays = (value: string, days: number) => { const d = parse(value); d.setDate(d.getDate() + days); return iso(d); };
const daysBetween = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000);
const guestName = (b: CalendarBooking) => `${b.guest.first_name} ${b.guest.last_name}`.trim();
const nightsText = (n: number) => `${n} night${n === 1 ? "" : "s"}`;
const paymentState = (b: CalendarBooking) => !b.total_amount ? "none" : b.paid_amount >= b.total_amount ? "paid" : b.paid_amount > 0 ? "advance" : "unpaid";
const paymentLabel = { paid: "Fully paid", advance: "Advance paid", unpaid: "Not paid", none: "No bill yet" } as const;
const staysOn = (b: CalendarBooking, day: string) => b.check_in_date <= day && day < b.check_out_date;

// What a booking is doing on a given day, for the pill in the day list.
function dayRole(b: CalendarBooking, day: string): { text: string; kind: string } {
  if (b.status === "checked_out") return { text: "Checked out", kind: "out" };
  if (b.check_out_date === day) return { text: "Departure", kind: "departure" };
  if (b.status === "checked_in") return { text: "In-house", kind: "inhouse" };
  if (b.check_in_date === day) return { text: "Arrival", kind: "arrival" };
  return { text: label(b.status), kind: "reserved" };
}

// Sunday-first weeks covering the month (5 or 6 rows, like a wall calendar).
function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const end = new Date(last); end.setDate(last.getDate() + (6 - last.getDay()));
  const days: Date[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  return days;
}
function weekOf(day: string) { const d = parse(day); d.setDate(d.getDate() - d.getDay()); return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x; }); }

export default function CalendarPage() {
  const navigate = useNavigate();
  const today = iso(new Date());
  const [view, setView] = useState<View>("month");
  const [focus, setFocus] = useState(today); // the selected day (drives week/day view and the side panel)
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [totalRooms, setTotalRooms] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<CalendarBooking | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ booking: CalendarBooking; fromDay: string } | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const [pending, setPending] = useState<{ booking: CalendarBooking; checkIn: string; checkOut: string } | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [notice, setNotice] = useState("");

  const focusDate = parse(focus);
  const month = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
  const days = useMemo(() => view === "month" ? monthGrid(month) : view === "week" ? weekOf(focus) : [parse(focus)], [view, focus]);
  // Fetch the whole visible month (plus spill-over days) so switching views needs no reload.
  const fetchDays = useMemo(() => monthGrid(month), [month.getTime()]);
  const rangeStart = iso(fetchDays[0]) < iso(days[0]) ? iso(fetchDays[0]) : iso(days[0]);
  const lastShown = iso(days[days.length - 1]) > iso(fetchDays[fetchDays.length - 1]) ? iso(days[days.length - 1]) : iso(fetchDays[fetchDays.length - 1]);
  const rangeEnd = addDays(lastShown, 1);

  const load = () => {
    setLoading(true); setError("");
    getReservationCalendar(rangeStart, rangeEnd)
      .then(data => setBookings(data.items))
      .catch(err => setError(err instanceof Error ? err.message : "Unable to load the calendar."))
      .finally(() => setLoading(false));
  };
  useEffect(load, [rangeStart, rangeEnd]);
  useEffect(() => { listRooms().then(rooms => setTotalRooms(rooms.length)).catch(() => setTotalRooms(null)); }, []);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(t); }, [notice]);

  const active = useMemo(() => bookings.filter(b => !HIDDEN.has(b.status)), [bookings]);
  // Grid shows each booking on its arrival day; the side panel shows everyone touching the selected day.
  const arrivals = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const b of active) map.set(b.check_in_date, [...(map.get(b.check_in_date) || []), b]);
    return map;
  }, [active]);
  const onDay = (day: string) => active.filter(b => staysOn(b, day) || b.check_out_date === day)
    .sort((a, b) => (a.check_in_date === day ? 0 : 1) - (b.check_in_date === day ? 0 : 1) || a.check_in_date.localeCompare(b.check_in_date));
  const focusList = onDay(focus);
  const staying = active.filter(b => staysOn(b, focus));
  const inHouseGuests = staying.filter(b => b.status === "checked_in").reduce((sum, b) => sum + b.adults + b.children, 0);
  const occupiedRooms = new Set(staying.map(b => b.room_number).filter(Boolean)).size;
  const occupancy = totalRooms ? Math.round(occupiedRooms / totalRooms * 100) : 0;

  const title = view === "day" ? pretty(focus) : view === "week"
    ? `${short(iso(days[0]))} – ${shortYear(iso(days[6]))}`
    : month.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const shift = (delta: number) => {
    if (view === "month") { const d = new Date(month.getFullYear(), month.getMonth() + delta, 1); setFocus(iso(d)); }
    else setFocus(addDays(focus, delta * (view === "week" ? 7 : 1)));
  };

  // ---- drag & drop: drop a booking on a day to make that its new arrival date ----
  const startDrag = (event: DragEvent, booking: CalendarBooking, fromDay: string) => {
    if (!MOVABLE.has(booking.status)) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(booking.id));
    setDrag({ booking, fromDay });
  };
  const endDrag = () => { setDrag(null); setDropDay(null); };
  const dropTarget = (day: string) => drag ? addDays(drag.booking.check_in_date, daysBetween(drag.fromDay, day)) : null;
  const canDrop = (day: string) => { const start = dropTarget(day); return !!start && start >= today && start !== drag?.booking.check_in_date; };
  const drop = (day: string) => {
    if (!drag || !canDrop(day)) { endDrag(); return; }
    const checkIn = dropTarget(day)!;
    setPending({ booking: drag.booking, checkIn, checkOut: addDays(checkIn, drag.booking.nights) });
    setMoveError(""); endDrag();
  };
  const confirmMove = async () => {
    if (!pending) return;
    setMoving(true); setMoveError("");
    try {
      await shiftStay(pending.booking.id, pending.checkIn);
      setNotice(`${guestName(pending.booking)} moved to ${short(pending.checkIn)} – ${short(pending.checkOut)}`);
      setPending(null); load();
    } catch (err) { setMoveError(err instanceof Error ? err.message : "Unable to move this booking."); }
    finally { setMoving(false); }
  };
  const preview = new Set<string>();
  if (drag && dropDay && canDrop(dropDay)) { const start = dropTarget(dropDay)!; for (let i = 0; i < drag.booking.nights; i++) preview.add(addDays(start, i)); }

  const chip = (b: CalendarBooking, day: string, roomy = false) => {
    const movable = MOVABLE.has(b.status);
    const pay = paymentState(b);
    return <button type="button" key={b.id} className={`rc-chip tone-${tone(b)}` + (movable ? " is-draggable" : "") + (drag?.booking.id === b.id ? " is-dragging" : "") + (roomy ? " is-roomy" : "")}
      draggable={movable} onDragStart={event => startDrag(event, b, day)} onDragEnd={endDrag}
      onClick={event => { event.stopPropagation(); setSelected(b); }}
      title={`${guestName(b)} · Room ${b.room_number || "unassigned"} · ${short(b.check_in_date)}–${short(b.check_out_date)} · ${paymentLabel[pay]}${movable ? " · drag to move dates" : ""}`}>
      <span className="rc-chip-top"><i className="rc-dot"/><strong>{guestName(b)}</strong>{b.room_number && <small>{b.room_number}</small>}</span>
      <span className="rc-chip-sub">{nightsText(b.nights)}{(pay === "advance" || pay === "paid") && <b className={`rc-pay pay-${pay}`}>{pay === "paid" ? "Paid" : "Adv."}</b>}</span>
    </button>;
  };

  return <section className="rc">
    <header className="rc-head">
      <div className="rc-title">
        <h1>Reservation Calendar</h1>
        <p>Manage bookings, arrivals and departures with ease</p>
      </div>
      <div className="rc-nav">
        <button type="button" aria-label="Previous" onClick={() => shift(-1)}><ChevronLeft size={18}/></button>
        <strong>{title}</strong>
        <button type="button" aria-label="Next" onClick={() => shift(1)}><ChevronRight size={18}/></button>
      </div>
      <div className="rc-tools">
        <div className="rc-views" role="tablist" aria-label="Calendar view">{(["month", "week", "day"] as View[]).map(v => <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "is-active" : ""} onClick={() => setView(v)}>{label(v)}</button>)}</div>
        <button type="button" className="rc-new" onClick={() => navigate("/dashboard/reservations")}><Plus size={20}/>New Reservation</button>
      </div>
    </header>

    {error && <p className="fo-api-error" role="alert">{error}</p>}

    <div className="rc-body">
      <div className="rc-card">
        {view !== "day" ? <div className={`rc-grid rc-${view}`} role="grid" aria-label={title}>
          {WEEKDAYS.map(d => <div key={d} className="rc-weekday" role="columnheader">{d}</div>)}
          {days.map(date => {
            const key = iso(date);
            const outside = view === "month" && date.getMonth() !== month.getMonth();
            const list = view === "week" ? onDay(key).filter(b => staysOn(b, key)) : arrivals.get(key) || [];
            const limit = view === "week" ? 8 : MAX_CHIPS;
            return <div key={key} role="gridcell" tabIndex={0} aria-selected={key === focus}
              className={"rc-day" + (outside ? " is-outside" : "") + (key === today ? " is-today" : "") + (key === focus ? " is-focus" : "") + (preview.has(key) ? " is-drop-preview" : "") + (drag && dropDay === key && !canDrop(key) ? " is-drop-blocked" : "")}
              onClick={() => setFocus(key)} onKeyDown={event => { if (event.key === "Enter") setFocus(key); }}
              onDragOver={event => { if (!drag) return; event.preventDefault(); event.dataTransfer.dropEffect = canDrop(key) ? "move" : "none"; if (dropDay !== key) setDropDay(key); }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropDay(current => current === key ? null : current); }}
              onDrop={event => { event.preventDefault(); drop(key); }}>
              <span className="rc-num">{date.getDate()}</span>
              <div className="rc-chips">
                {list.slice(0, limit).map(b => chip(b, key))}
                {list.length > limit && <button type="button" className="rc-more" onClick={event => { event.stopPropagation(); setDayOpen(key); }}>+{list.length - limit} more</button>}
              </div>
            </div>;
          })}
        </div> : <div className="rc-dayview">
          <h2>{pretty(focus)}</h2>
          {focusList.length === 0 ? <p className="rc-empty">No guests on this day.</p> : <div className="rc-dayview-list">{focusList.map(b => chip(b, focus, true))}</div>}
        </div>}
        <p className="rc-hint">{loading ? <><LoaderCircle size={15}/>Loading bookings…</> : <>Click a day to see who is staying · drag a booking to another date to move the stay</>}
          <button type="button" className="rc-refresh" aria-label="Refresh" title="Refresh" onClick={load} disabled={loading}><RefreshCw size={15}/></button></p>
      </div>

      <aside className="rc-side">
        <section className="rc-daycard">
          <header style={{ backgroundImage: "linear-gradient(180deg,#0b1f5c26 0%,#0b1f5c8c 100%),url('/5.png')" }}>
            <div><h2>{parse(focus).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</h2><p>{focusList.length} Booking{focusList.length === 1 ? "" : "s"}</p></div>
            <button type="button" className="rc-iconbtn is-light" aria-label="Show all guests for this day" title="Show all" onClick={() => setDayOpen(focus)}><MoreHorizontal size={18}/></button>
          </header>
          {focusList.length === 0 ? <p className="rc-empty">No arrivals, stays or departures.</p> : <ul>{focusList.map(b => {
            const role = dayRole(b, focus);
            return <li key={b.id}>
              <button type="button" className="rc-guest" onClick={() => setSelected(b)}>
                <i className={`rc-dot tone-${tone(b)}`}/>
                <span className="rc-guest-main"><strong>{guestName(b)}</strong><small>{shortYear(b.check_in_date)} – {shortYear(b.check_out_date)}</small><small>{nightsText(b.nights)}</small></span>
                <span className="rc-guest-side">{b.room_number && <b>{b.room_number}</b>}<span className={`rc-pill is-${role.kind}`}>{role.text}</span></span>
              </button>
              <button type="button" className="rc-iconbtn" aria-label={`Open ${guestName(b)}'s folio`} title="Open guest folio" onClick={() => navigate(`/dashboard/reservations/${b.id}`)}><MoreHorizontal size={16}/></button>
            </li>;
          })}</ul>}
        </section>

        <section className="rc-stats">
          <header><h3>Quick Stats</h3><button type="button" onClick={() => navigate("/dashboard")}>View Details<ArrowRight size={15}/></button></header>
          <div className="rc-stat"><span className="rc-stat-icon"><BedDouble size={20}/></span><span>Total Rooms</span><strong>{totalRooms ?? "—"}</strong></div>
          <div className="rc-stat"><span className="rc-stat-icon"><PieChart size={20}/></span><span>Occupancy<i className="rc-bar"><i style={{ width: `${occupancy}%` }}/></i></span><strong>{occupancy}%<small>{occupiedRooms} / {totalRooms ?? 0} rooms</small></strong></div>
          <div className="rc-stat"><span className="rc-stat-icon"><UserRound size={20}/></span><span>In-house Guests</span><strong>{inHouseGuests}</strong></div>
        </section>
      </aside>
    </div>

    {dayOpen && <div className="fo-modal-backdrop" onClick={() => setDayOpen(null)}>
      <section className="fo-modal fo-cal-daylist" role="dialog" aria-label={`Guests on ${pretty(dayOpen)}`} onClick={event => event.stopPropagation()}>
        <header><h2>{pretty(dayOpen)}</h2><button type="button" className="fo-icon-button" aria-label="Close" onClick={() => setDayOpen(null)}><X size={19}/></button></header>
        <div className="rc-dayview-list">{onDay(dayOpen).map(b => <div key={b.id} onClick={() => setDayOpen(null)}>{chip(b, dayOpen, true)}</div>)}</div>
      </section>
    </div>}

    {pending && <div className="fo-modal-backdrop" onClick={() => !moving && setPending(null)}>
      <section className="fo-modal fo-cal-confirm" role="dialog" aria-label="Move booking" onClick={event => event.stopPropagation()}>
        <header><h2>Move booking?</h2><button type="button" className="fo-icon-button" aria-label="Close" disabled={moving} onClick={() => setPending(null)}><X size={19}/></button></header>
        <p><strong>{guestName(pending.booking)}</strong>{pending.booking.room_number ? ` · Room ${pending.booking.room_number}` : ""} · {nightsText(pending.booking.nights)}</p>
        <div className="fo-cal-move">
          <div><span>From</span><strong>{short(pending.booking.check_in_date)} – {short(pending.booking.check_out_date)}</strong></div>
          <ChevronRight size={20}/>
          <div><span>To</span><strong>{short(pending.checkIn)} – {short(pending.checkOut)}</strong></div>
        </div>
        <p className="fo-cal-move-note">Same room and the same rate for each night. The room is checked for clashes before moving.</p>
        {moveError && <p className="fo-api-error" role="alert">{moveError}</p>}
        <footer><button type="button" className="fo-outline-button" disabled={moving} onClick={() => setPending(null)}>Cancel</button><button type="button" className="fo-button" disabled={moving} onClick={() => void confirmMove()}>{moving ? <><LoaderCircle size={16}/>Moving…</> : "Move Booking"}</button></footer>
      </section>
    </div>}
    {notice && <p className="fo-folio-toast" role="status">{notice}</p>}

    {selected && <ReservationSummary booking={selected} onClose={() => setSelected(null)} onOpenReservations={() => navigate(`/dashboard/reservations/${selected.id}`)}/>}
  </section>;
}

function ReservationSummary({ booking: b, onClose, onOpenReservations }: { booking: CalendarBooking; onClose: () => void; onOpenReservations: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const pay = paymentState(b);
  const roomCharges = (b.nightly_rate || 0) * b.nights * (b.rooms_count || 1);
  return <div className="fo-modal-backdrop" onClick={onClose}>
    <section className="fo-modal fo-cal-summary" role="dialog" aria-labelledby="fo-cal-summary-title" onClick={event => event.stopPropagation()}>
      <header>
        <div><p className="fo-eyebrow">RESERVATION SUMMARY</p><h2 id="fo-cal-summary-title">{guestName(b)}</h2><small className="fo-cal-code">{b.reservation_code}</small></div>
        <button type="button" className="fo-icon-button" aria-label="Close" onClick={onClose}><X size={19}/></button>
      </header>
      <div className="fo-cal-badges">
        <span className={`fo-cal-status st-${b.status}`}>{label(b.status)}</span>
        <span className={`fo-cal-paybadge pay-${pay}`}>{paymentLabel[pay]}</span>
        {b.is_group_booking && <span className="fo-cal-paybadge pay-none">Group{b.group_name ? ` · ${b.group_name}` : ""}</span>}
      </div>

      <div className="fo-cal-facts">
        <div><CalendarDays size={16}/><span>Check-in</span><strong>{pretty(b.check_in_date)}{b.arrival_time ? ` · ${b.arrival_time.slice(0, 5)}` : ""}</strong></div>
        <div><CalendarDays size={16}/><span>Check-out</span><strong>{pretty(b.check_out_date)}</strong></div>
        <div><BedDouble size={16}/><span>Room</span><strong>{b.room_number ? `${b.room_number} · ${b.room_category || ""}` : b.room_category || "Not assigned"}</strong></div>
        <div><Users size={16}/><span>Guests</span><strong>{b.adults} adult{b.adults === 1 ? "" : "s"}{b.children ? `, ${b.children} child${b.children === 1 ? "" : "ren"}` : ""} · {b.nights} night{b.nights === 1 ? "" : "s"}</strong></div>
        {b.guest.mobile && <div><Phone size={16}/><span>Mobile</span><strong>{b.guest.mobile}</strong></div>}
        {b.guest.email && <div><Mail size={16}/><span>Email</span><strong>{b.guest.email}</strong></div>}
      </div>

      <div className="fo-cal-bill">
        <h3><CreditCard size={16}/>Billing</h3>
        <div><span>Room charges{b.nightly_rate ? ` (${money(b.nightly_rate)} × ${b.nights})` : ""}</span><strong>{money(roomCharges)}</strong></div>
        {(b.taxes_amount > 0 || b.additional_charges > 0) && <div><span>Taxes & extras</span><strong>{money(b.taxes_amount + b.additional_charges)}</strong></div>}
        {b.discount_amount > 0 && <div><span>Discount</span><strong>− {money(b.discount_amount)}</strong></div>}
        <div className="is-total"><span>Total</span><strong>{money(b.total_amount)}</strong></div>
        <div className="is-paid"><span>Paid</span><strong>{money(b.paid_amount)}</strong></div>
        <div className="is-balance"><span>Balance due</span><strong>{money(b.balance)}</strong></div>
      </div>

      <dl className="fo-cal-meta">
        <div><dt>Rate plan</dt><dd>{b.rate_plan || "—"}</dd></div>
        <div><dt>Source</dt><dd>{b.booking_source || label(b.source)}</dd></div>
        {b.special_requests && <div className="is-wide"><dt>Special requests</dt><dd>{b.special_requests}</dd></div>}
      </dl>

      <footer>
        <button type="button" className="fo-outline-button" onClick={onClose}>Close</button>
        <button type="button" className="fo-button" onClick={onOpenReservations}>Open Guest Folio</button>
      </footer>
    </section>
  </div>;
}

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BedDouble, CalendarDays, Check, ChevronLeft, ChevronRight, LoaderCircle, Minus, Plus, SprayCan, Users, Wrench, X } from "lucide-react";
import { CategoryAvailability, getCategoryAvailability } from "./roomsApi";
import { photoFor } from "./roomPhotos";
import "./roomCheck.css";

const isoDay = (offset = 0) => { const day = new Date(); day.setDate(day.getDate() + offset); return day.toLocaleDateString("en-CA"); };
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const dayLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const nightsBetween = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000);
const PRESETS = [{ label: "Solo", adults: 1, children: 0 }, { label: "Couple", adults: 2, children: 0 }, { label: "Family", adults: 2, children: 2 }, { label: "Group of 4", adults: 4, children: 0 }];

/** "Do you have a Deluxe for a couple tonight?" — category availability for any dates and party size, as an animated card deck. */
export default function RoomCheckModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [checkIn, setCheckIn] = useState(isoDay());
  const [checkOut, setCheckOut] = useState(isoDay(1));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [categories, setCategories] = useState<CategoryAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [detail, setDetail] = useState(false);
  const [spread, setSpread] = useState(false);
  const nights = nightsBetween(checkIn, checkOut);

  useEffect(() => {
    if (nights < 1) { setError("Check-out must be after check-in."); return; }
    setError(""); setLoading(true);
    const timer = window.setTimeout(() => {
      getCategoryAvailability(checkIn, checkOut, adults, children)
        .then(list => { setCategories(list); setActive(current => Math.min(current, Math.max(0, list.length - 1))); })
        .catch(reason => setError(reason instanceof Error ? reason.message : "Unable to check rooms."))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [checkIn, checkOut, adults, children, nights]);

  // Cards start stacked in the middle, then fan out once the first results are in.
  // Open on the middle card so the deck spreads to both sides.
  useEffect(() => {
    if (loading || !categories.length || spread) return;
    setActive(Math.floor((categories.length - 1) / 2));
    const timer = window.setTimeout(() => setSpread(true), 60);
    return () => window.clearTimeout(timer);
  }, [loading, categories.length, spread]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (detail) setDetail(false); else onClose(); }
      if (!detail && event.key === "ArrowRight") setActive(index => Math.min(categories.length - 1, index + 1));
      if (!detail && event.key === "ArrowLeft") setActive(index => Math.max(0, index - 1));
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [categories.length, detail, onClose]);

  const totalFree = useMemo(() => categories.reduce((sum, category) => sum + category.available_rooms, 0), [categories]);
  const current = categories[active];
  const party = `${adults} adult${adults === 1 ? "" : "s"}${children ? `, ${children} child${children === 1 ? "" : "ren"}` : ""}`;
  const book = (category: CategoryAvailability) => {
    const free = category.rooms.filter(room => room.is_free && room.fits_party);
    const room = free.find(item => item.status === "available") || free[0];
    const query = new URLSearchParams({ new: "1", category: category.category, room: room?.room_number || "", check_in: checkIn, check_out: checkOut, adults: String(adults), children: String(children) });
    navigate(`/dashboard/reservations?${query}`);
  };

  return <div className="rc2-overlay" role="dialog" aria-modal="true" aria-label="Room check" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="rc2-shell">
      <header className="rc2-top">
        <div className="rc2-title"><p>ROOM CHECK</p><h2>Find the right room</h2></div>
        <div className="rc2-query">
          <label><span>Check-in</span><span className="rc2-field"><CalendarDays size={15}/><input type="date" value={checkIn} min={isoDay()} onChange={event => { setCheckIn(event.target.value); if (event.target.value >= checkOut) { const next = new Date(`${event.target.value}T00:00:00`); next.setDate(next.getDate() + 1); setCheckOut(next.toLocaleDateString("en-CA")); } }}/></span></label>
          <label><span>Check-out</span><span className="rc2-field"><CalendarDays size={15}/><input type="date" value={checkOut} min={checkIn} onChange={event => setCheckOut(event.target.value)}/></span></label>
          <Counter label="Adults" value={adults} min={1} max={10} onChange={setAdults}/>
          <Counter label="Children" value={children} min={0} max={8} onChange={setChildren}/>
        </div>
        <button type="button" className="rc2-close" onClick={onClose} aria-label="Close"><X size={20}/></button>
      </header>
      <div className="rc2-presets">
        {PRESETS.map(preset => <button type="button" key={preset.label} className={preset.adults === adults && preset.children === children ? "on" : ""} onClick={() => { setAdults(preset.adults); setChildren(preset.children); }}><Users size={14}/>{preset.label}</button>)}
        <span className="rc2-summary">{loading ? <><LoaderCircle size={14} className="rc2-spin"/>Checking…</> : error ? error : `${totalFree} room${totalFree === 1 ? "" : "s"} free for ${party} · ${nights} night${nights === 1 ? "" : "s"}`}</span>
      </div>

      <div className={`rc2-body${detail ? " show-detail" : ""}`}>
        <section className={`rc2-stage${spread ? " is-spread" : ""}`} aria-label="Room categories">
          {categories.map((category, index) => {
            const offset = index - active;
            const distance = Math.abs(offset);
            const state = category.available_rooms > 0 ? "open" : category.fits_party ? "full" : "small";
            return <button type="button" key={category.category} className={`rc2-card state-${state}${offset === 0 ? " is-active" : ""}`}
              style={{ "--o": spread ? offset : 0, "--d": spread ? distance : 0, zIndex: 50 - distance, transitionDelay: spread ? `${distance * 45}ms` : "0ms" } as CSSProperties}
              aria-hidden={distance > 3} tabIndex={distance > 3 ? -1 : 0}
              onClick={() => (offset === 0 ? setDetail(true) : setActive(index))}>
              <span className="rc2-photo"><img src={photoFor(category.image_url, category.category, index)} alt="" loading="lazy"/>
                <span className={`rc2-pill state-${state}`}>{state === "open" ? `${category.available_rooms} of ${category.total_rooms} free` : state === "full" ? "Fully booked" : `Max ${category.max_guests} guests`}</span>
              </span>
              <span className="rc2-card-body">
                <span className="rc2-name-row"><strong>{category.category}</strong><span className={`rc2-status state-${state}`}><i/>{state === "open" ? "Available" : "Unavailable"}</span></span>
                {state !== "open" && <span className="rc2-near">{category.next_available ? <>Nearest free: <b>{dayLabel(category.next_available.check_in_date)} → {dayLabel(category.next_available.check_out_date)}</b></> : state === "small" ? `Fits up to ${category.max_guests} guests` : "No free dates in the next 3 weeks"}</span>}
                <span className="rc2-rate">{category.rate_from != null ? <>from <b>{money(category.rate_from)}</b> / night</> : "Rate on request"}</span>
                <span className="rc2-meta"><Users size={14}/>Up to {category.max_guests}<span>·</span><BedDouble size={14}/>{category.total_rooms} room{category.total_rooms === 1 ? "" : "s"}</span>
                {offset === 0 && <span className="rc2-open-hint">Tap to see rooms <ChevronRight size={14}/></span>}
              </span>
            </button>;
          })}
          {!loading && categories.length === 0 && !error && <p className="rc2-empty">No rooms set up yet. Add rooms in Room Master.</p>}
          {categories.length > 1 && <>
            <button type="button" className="rc2-nav prev" onClick={() => setActive(index => Math.max(0, index - 1))} disabled={active === 0} aria-label="Previous category"><ChevronLeft size={22}/></button>
            <button type="button" className="rc2-nav next" onClick={() => setActive(index => Math.min(categories.length - 1, index + 1))} disabled={active >= categories.length - 1} aria-label="Next category"><ChevronRight size={22}/></button>
            <div className="rc2-dots">{categories.map((category, index) => <button type="button" key={category.category} className={index === active ? "on" : ""} onClick={() => setActive(index)} aria-label={category.category}/>)}</div>
          </>}
        </section>

        <aside className="rc2-detail" aria-hidden={!detail}>
          {current && <>
            <div className="rc2-detail-photo"><img src={photoFor(current.image_url, current.category, active)} alt=""/>
              <button type="button" className="rc2-back" onClick={() => setDetail(false)}><ArrowLeft size={16}/>All room types</button>
            </div>
            <div className="rc2-detail-body">
              <p className="rc2-kicker">{party.toUpperCase()} · {nights} NIGHT{nights === 1 ? "" : "S"}</p>
              <h3>{current.category}</h3>
              <div className="rc2-counts">
                <span className="ok"><Check size={15}/><b>{current.ready_now}</b> ready now</span>
                <span className="clean"><SprayCan size={15}/><b>{current.being_cleaned}</b> being cleaned</span>
                <span className="booked"><CalendarDays size={15}/><b>{current.total_rooms - current.available_rooms - current.out_of_order}</b> booked / too small</span>
                {current.out_of_order > 0 && <span className="ooo"><Wrench size={15}/><b>{current.out_of_order}</b> under repair</span>}
              </div>
              <p className={`rc2-verdict state-${current.available_rooms ? "open" : current.fits_party ? "full" : "small"}`}>
                <strong>{current.available_rooms ? "Available" : "Unavailable"}</strong>
                <span>{current.available_rooms ? `${current.available_rooms} room${current.available_rooms === 1 ? "" : "s"} free for ${party}, ${dayLabel(checkIn)} → ${dayLabel(checkOut)}.`
                  : current.fits_party ? `${current.total_rooms === 1 ? "The only room is" : `All ${current.total_rooms} rooms are`} taken for ${dayLabel(checkIn)} → ${dayLabel(checkOut)}.`
                  : `These rooms take up to ${current.max_guests} guests; try another room type or two rooms.`}</span>
              </p>
              {!current.available_rooms && current.next_available && <div className="rc2-nearby">
                <div><small>NEAREST AVAILABILITY</small><b>{dayLabel(current.next_available.check_in_date)} → {dayLabel(current.next_available.check_out_date)}</b><span>Room{current.next_available.rooms.length === 1 ? "" : "s"} {current.next_available.rooms.join(", ")} free · same {nights} night{nights === 1 ? "" : "s"}</span></div>
                <button type="button" onClick={() => { setCheckIn(current.next_available!.check_in_date); setCheckOut(current.next_available!.check_out_date); }}>Use these dates</button>
              </div>}
              {current.rate_from != null && <p className="rc2-price"><b>{money(current.rate_from)}</b>{current.rate_to !== current.rate_from && <> – {money(current.rate_to || 0)}</>} / night<span>About {money(current.rate_from * nights)} for {nights} night{nights === 1 ? "" : "s"}</span></p>}
              {current.amenities.length > 0 && <ul className="rc2-amenities">{current.amenities.map(item => <li key={item}>{item}</li>)}</ul>}
              <p className="rc2-label">Rooms</p>
              <ul className="rc2-rooms">{current.rooms.map(room => {
                const tone = !room.fits_party ? "small" : !room.is_free ? (room.status === "maintenance" || room.status === "blocked" ? "ooo" : "booked") : room.status === "dirty" || room.status === "cleaning" ? "clean" : "ok";
                const label = { ok: "Ready", clean: "Cleaning", booked: "Booked", ooo: "Repair", small: "Too small" }[tone];
                return <li key={room.id} className={`tone-${tone}`}><strong>{room.room_number}</strong><span>{room.display_name || room.room_type || "Room"}{room.floor ? ` · Fl ${room.floor}` : ""}</span><em>{label}</em></li>;
              })}</ul>
              <div className="rc2-detail-actions">
                <button type="button" className="rc2-secondary" onClick={() => setDetail(false)}>Compare others</button>
                <button type="button" className="rc2-primary" disabled={current.available_rooms === 0} onClick={() => book(current)}>{current.available_rooms ? `Book ${current.category}` : "Not available"}</button>
              </div>
            </div>
          </>}
        </aside>
      </div>
    </div>
  </div>;
}

function Counter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <div className="rc2-counter"><span>{label}</span><span className="rc2-field">
    <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}><Minus size={14}/></button>
    <b>{value}</b>
    <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}><Plus size={14}/></button>
  </span></div>;
}

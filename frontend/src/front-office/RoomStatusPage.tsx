import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownUp, BedDouble, BedSingle, CalendarDays, CalendarPlus, Camera, ChevronLeft, ChevronRight, Crown, Gem, Heart, LayoutGrid, Leaf,
  List, ListChecks, LoaderCircle, Maximize2, Pencil, Plus, RefreshCw, Search, Sparkles, Square, Star, Trash2, Upload, Users, X,
} from "lucide-react";
import { photoFor } from "./roomPhotos";
import { createRoom, getRoomStatus, LiveStatus, removeRoom, RoomInput, RoomStatusItem, updateRoom, uploadRoomImage } from "./roomsApi";
import ReserveRoomModal from "./ReserveRoomModal";
import "./roomStatus.css";

type Layout = "grid" | "list";
type StatusFilter = "all" | LiveStatus | "attention";
type Sort = "room" | "price-asc" | "price-desc" | "floor";

const ROOM_TYPES = ["Single", "Double", "Twin", "Triple", "Quad", "Family", "Studio", "Suite", "Villa"];
const DEFAULT_CATEGORIES = ["Standard", "Deluxe", "Superior", "Premium", "Suite", "Villa", "Others"];
const HOUSEKEEPING = [
  { value: "available", label: "Clean & ready" }, { value: "dirty", label: "Dirty" }, { value: "cleaning", label: "Cleaning" },
  { value: "maintenance", label: "Maintenance" }, { value: "blocked", label: "Blocked" },
];
const STATUS_LABEL: Record<LiveStatus, string> = {
  available: "Available", reserved: "Reserved", occupied: "Occupied", cleaning: "Cleaning", maintenance: "Maintenance", blocked: "Blocked",
};
const needsAttention = (status: LiveStatus) => status === "cleaning" || status === "maintenance" || status === "blocked";
const emptyRoom: RoomInput = {
  room_number: "", room_category: "", room_type: "Double", floor: "", max_adults: 2, max_children: 0, status: "available", notes: "",
  display_name: "", base_rate: null, bed_type: "", size_sqft: null, amenities: [],
};

const roomImage = (room: RoomStatusItem) => photoFor(room.image_url, `${room.room_category} ${room.display_name || ""} ${room.room_type || ""}`, room.id);
const CATEGORY_ICONS: [RegExp, ReactNode][] = [
  [/deluxe/i, <Crown size={22} key="c"/>], [/suite|presidential/i, <Gem size={22} key="g"/>], [/premium/i, <Star size={22} key="s"/>],
  [/villa/i, <Leaf size={22} key="l"/>], [/standard|superior/i, <Square size={22} key="q"/>],
];
const categoryIcon = (category: string) => CATEGORY_ICONS.find(([pattern]) => pattern.test(category))?.[1] || <BedDouble size={22}/>;

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const floorLabel = (floor: string | null) => (floor ? `Floor ${floor}` : "No floor");
const roomTitle = (room: RoomStatusItem) => room.display_name || `${room.room_category}${room.room_type ? ` ${room.room_type}` : ""} Room`;
const guestsAllowed = (room: RoomStatusItem) => `${room.max_adults} adult${room.max_adults === 1 ? "" : "s"}${room.max_children ? ` + ${room.max_children} child${room.max_children === 1 ? "" : "ren"}` : ""}`;

/** Favourites are a per-browser convenience, so they live in localStorage. */
const FAVOURITES_KEY = "stayhub.favouriteRooms";
const readFavourites = (): number[] => { try { return JSON.parse(localStorage.getItem(FAVOURITES_KEY) || "[]"); } catch { return []; } };
const saveFavourites = (ids: number[]) => { try { localStorage.setItem(FAVOURITES_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ } };

export default function RoomStatusPage() {
  const [rooms, setRooms] = useState<RoomStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"rooms" | "master">("rooms");
  const [layout, setLayout] = useState<Layout>("grid");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [roomType, setRoomType] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [floor, setFloor] = useState("all");
  const [sort, setSort] = useState<Sort>("room");
  const [favourites, setFavourites] = useState<number[]>(readFavourites);
  const [editing, setEditing] = useState<RoomStatusItem | "new" | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [busyRoom, setBusyRoom] = useState<number | null>(null);
  const [reserving, setReserving] = useState<RoomStatusItem | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try { setRooms(await getRoomStatus()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load rooms."); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const sortText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    rooms.forEach(room => counts.set(room.room_category, (counts.get(room.room_category) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || sortText(a[0], b[0]));
  }, [rooms]);
  const roomTypes = useMemo(() => [...new Set(rooms.map(room => room.room_type).filter(Boolean) as string[])].sort(sortText), [rooms]);
  const floors = useMemo(() => [...new Set(rooms.map(room => room.floor || ""))].sort(sortText), [rooms]);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    const list = rooms.filter(room =>
      (category === "all" || room.room_category === category)
      && (roomType === "all" || room.room_type === roomType)
      && (floor === "all" || (room.floor || "") === floor)
      && (status === "all" || (status === "attention" ? needsAttention(room.live_status) : room.live_status === status))
      && (!text || [room.room_number, room.room_category, room.room_type, room.display_name, room.bed_type, ...room.amenities].some(value => value?.toLowerCase().includes(text))));
    const price = (room: RoomStatusItem) => room.base_rate ?? -1;
    return [...list].sort((a, b) =>
      sort === "price-asc" ? price(a) - price(b) : sort === "price-desc" ? price(b) - price(a)
        : sort === "floor" ? sortText(a.floor || "", b.floor || "") || sortText(a.room_number, b.room_number) : sortText(a.room_number, b.room_number));
  }, [rooms, query, category, roomType, floor, status, sort]);

  const run = async (roomId: number, action: () => Promise<unknown>) => {
    setBusyRoom(roomId); setError("");
    try { await action(); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update the room."); } finally { setBusyRoom(null); }
  };
  const markClean = (room: RoomStatusItem) => run(room.id, () => updateRoom(room.id, { ...toInput(room), status: "available" }));
  const changePhoto = (room: RoomStatusItem, file: File) => run(room.id, () => uploadRoomImage(room.id, file));
  const remove = (room: RoomStatusItem) => { if (window.confirm(`Remove Room ${room.room_number} from the room master?`)) void run(room.id, () => removeRoom(room.id)); };
  const toggleFavourite = (room: RoomStatusItem) => setFavourites(current => { const next = current.includes(room.id) ? current.filter(id => id !== room.id) : [...current, room.id]; saveFavourites(next); return next; });

  return <div className="rs-page">
    <section className="rs-hero">
      <div className="rs-hero-text">
        <p className="rs-eyebrow">ROOM MANAGEMENT</p>
        <h1>View Rooms</h1>
        <p>Manage, explore and update your hotel rooms</p>
      </div>
      <div className="rs-hero-side">
      <p className="rs-hero-quote" aria-hidden="true">Great stays<br/>create greater<br/>stories</p>
      <div className="rs-hero-actions">
        <button type="button" className={`rs-hero-tab${tab === "rooms" ? " active" : ""}`} onClick={() => setTab("rooms")}><LayoutGrid size={16}/>Rooms</button>
        <button type="button" className={`rs-hero-tab${tab === "master" ? " active" : ""}`} onClick={() => setTab("master")}><ListChecks size={16}/>Room Master</button>
      </div>
      </div>
    </section>

    <section className="rs-toolbar">
      <label className="rs-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by room name, type or number..."/></label>
      <select className="rs-select" value={roomType} onChange={event => setRoomType(event.target.value)} aria-label="Room type">
        <option value="all">All Room Types</option>{roomTypes.map(type => <option key={type}>{type}</option>)}
      </select>
      <select className="rs-select" value={status} onChange={event => setStatus(event.target.value as StatusFilter)} aria-label="Status">
        <option value="all">All Status</option>
        {(Object.keys(STATUS_LABEL) as LiveStatus[]).map(value => <option key={value} value={value}>{STATUS_LABEL[value]}</option>)}
        <option value="attention">Needs attention</option>
      </select>
      <select className="rs-select" value={floor} onChange={event => setFloor(event.target.value)} aria-label="Floor">
        <option value="all">All Floors</option>{floors.map(value => <option key={value} value={value}>{floorLabel(value || null)}</option>)}
      </select>
      <label className="rs-sort"><ArrowDownUp size={15}/>
        <select value={sort} onChange={event => setSort(event.target.value as Sort)} aria-label="Sort by">
          <option value="room">Sort by room no.</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="floor">Floor</option>
        </select>
      </label>
      <div className="rs-layout" role="group" aria-label="Layout">
        <button type="button" className={layout === "grid" ? "active" : ""} aria-pressed={layout === "grid"} onClick={() => { setLayout("grid"); setTab("rooms"); }} title="Grid view"><LayoutGrid size={17}/></button>
        <button type="button" className={layout === "list" ? "active" : ""} aria-pressed={layout === "list"} onClick={() => { setLayout("list"); setTab("rooms"); }} title="List view"><List size={17}/></button>
      </div>
      <button type="button" className="rs-icon-btn" onClick={() => void load()} disabled={loading} title="Refresh" aria-label="Refresh"><RefreshCw size={17} className={loading ? "rs-spin" : ""}/></button>
    </section>

    <section className="rs-categories">
      <button type="button" className={`rs-category all${category === "all" ? " active" : ""}`} onClick={() => setCategory("all")}>
        <BedDouble size={24}/><span><small>All Rooms</small><strong>{rooms.length}</strong></span>
      </button>
      {categories.map(([name, count]) => <button type="button" key={name} className={`rs-category${category === name ? " active" : ""}`} onClick={() => setCategory(category === name ? "all" : name)}>
        {categoryIcon(name)}<span><small>{name}</small><strong>{count}</strong></span>
      </button>)}
    </section>

    {error && <p className="rs-error">{error}</p>}

    {loading && rooms.length === 0 ? <div className="rs-empty"><LoaderCircle size={18} className="rs-spin"/>Loading rooms…</div>
      : tab === "master" ? <Master rooms={visible} busyRoom={busyRoom} onAdd={() => setEditing("new")} onEdit={room => setEditing(room)} onRemove={remove} onPhoto={changePhoto}/>
      : visible.length === 0 ? <div className="rs-empty">No rooms match these filters.</div>
      : layout === "grid" ? <section className="rs-room-grid">
          {visible.map((room, index) => <RoomTile key={room.id} room={room} busy={busyRoom === room.id} favourite={favourites.includes(room.id)} onFavourite={() => toggleFavourite(room)} onOpen={() => setViewer(index)} onPhoto={file => changePhoto(room, file)} onReserve={() => setReserving(room)}/>)}
        </section>
      : <ListView rooms={visible} busyRoom={busyRoom} onMarkClean={markClean} onReserve={setReserving} onOpen={room => setViewer(visible.indexOf(room))}/>}

    {viewer !== null && visible[viewer] && <Lightbox rooms={visible} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} busy={busyRoom === visible[viewer].id} onPhoto={changePhoto}/>}
    {reserving && <ReserveRoomModal room={reserving} onClose={() => setReserving(null)} onReserved={() => void load()}/>}
    {editing && <RoomForm room={editing === "new" ? null : editing} categories={[...new Set([...DEFAULT_CATEGORIES, ...rooms.map(room => room.room_category)])]} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }}/>}
  </div>;
}

const toInput = (room: RoomStatusItem): RoomInput => ({
  room_number: room.room_number, room_category: room.room_category, room_type: room.room_type, floor: room.floor,
  max_adults: room.max_adults, max_children: room.max_children, status: room.status, notes: room.notes,
  display_name: room.display_name, base_rate: room.base_rate, bed_type: room.bed_type, size_sqft: room.size_sqft, amenities: room.amenities,
});

function StatusPill({ status }: { status: LiveStatus }) {
  return <span className={`rs-pill st-${status}`}><i/>{STATUS_LABEL[status]}</span>;
}

function RoomTile({ room, busy, favourite, onFavourite, onOpen, onPhoto, onReserve }: { room: RoomStatusItem; busy: boolean; favourite: boolean; onFavourite: () => void; onOpen: () => void; onPhoto: (file: File) => void; onReserve: () => void }) {
  const stay = room.current_stay || room.next_stay;
  return <article className="rs-room">
    <div className="rs-room-photo">
      <button type="button" className="rs-room-photo-btn" onClick={onOpen} aria-label={`View room ${room.room_number}`}><img src={roomImage(room)} alt="" loading="lazy"/></button>
      {!["maintenance", "blocked", "occupied"].includes(room.live_status) && <button type="button" className="rs-reserve" onClick={onReserve}><CalendarPlus size={15}/>Reserve</button>}
      <label className={`rs-photo-edit${busy ? " busy" : ""}`} title={room.image_url ? "Change room photo" : "Upload room photo"}>
        {busy ? <LoaderCircle size={16} className="rs-spin"/> : <Camera size={16}/>}<span>{room.image_url ? "Change photo" : "Upload photo"}</span>
        <input type="file" accept=".jpg,.jpeg,.png,.webp" hidden disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) onPhoto(file); event.target.value = ""; }}/>
      </label>
      <button type="button" className={`rs-heart${favourite ? " on" : ""}`} onClick={onFavourite} aria-pressed={favourite} aria-label={favourite ? "Remove from favourites" : "Add to favourites"}><Heart size={18}/></button>
      <StatusPill status={room.live_status}/>
      <span className="rs-room-no">Room {room.room_number}</span>
    </div>
    <div className="rs-room-body">
      <div className="rs-room-head">
        <h3>{roomTitle(room)}</h3>
        {room.base_rate != null && <p className="rs-price"><strong>{money(room.base_rate)}</strong><small>/ night</small></p>}
      </div>
      <ul className="rs-specs">
        <li><Users size={15}/>{room.capacity} Guest{room.capacity === 1 ? "" : "s"}</li>
        <li><BedSingle size={15}/>{room.bed_type || room.room_type || "Bed not set"}</li>
        <li><Maximize2 size={14}/>{room.size_sqft ? `${room.size_sqft} sq ft` : floorLabel(room.floor)}</li>
      </ul>
      {room.amenities.length > 0 && <ul className="rs-amenities">{room.amenities.slice(0, 4).map(item => <li key={item}>{item}</li>)}{room.amenities.length > 4 && <li>+{room.amenities.length - 4}</li>}</ul>}
      {stay && <Link className="rs-stay" to={`/dashboard/reservations/${stay.reservation_id}`}>
        <CalendarDays size={14}/><span>{room.current_stay ? "Now" : "Next"}: <b>{stay.guest_name}</b> · {shortDate(stay.check_in_date)} → {shortDate(stay.check_out_date)}</span><ChevronRight size={15}/>
      </Link>}
    </div>
  </article>;
}

function ListView({ rooms, busyRoom, onMarkClean, onReserve, onOpen }: { rooms: RoomStatusItem[]; busyRoom: number | null; onMarkClean: (room: RoomStatusItem) => void; onReserve: (room: RoomStatusItem) => void; onOpen: (room: RoomStatusItem) => void }) {
  return <section className="rs-list">
    {rooms.map(room => {
      const stay = room.current_stay || room.next_stay;
      return <article className="rs-list-row" key={room.id}>
        <button type="button" className="rs-list-photo" onClick={() => onOpen(room)} aria-label={`View room ${room.room_number}`}><img src={roomImage(room)} alt="" loading="lazy"/></button>
        <div className="rs-list-main">
          <div className="rs-list-title"><strong>Room {room.room_number}</strong><span>{roomTitle(room)}</span><StatusPill status={room.live_status}/></div>
          <p>{room.room_category}{room.room_type ? ` · ${room.room_type}` : ""} · {floorLabel(room.floor)} · {guestsAllowed(room)}</p>
        </div>
        <div className="rs-list-stay">
          {stay ? <Link to={`/dashboard/reservations/${stay.reservation_id}`}><small>{room.current_stay ? "Current guest" : "Next arrival"}</small><b>{stay.guest_name}</b><span>{shortDate(stay.check_in_date)} → {shortDate(stay.check_out_date)}</span></Link>
            : <span className="muted">No upcoming bookings</span>}
        </div>
        <div className="rs-list-price">{room.base_rate != null ? <><strong>{money(room.base_rate)}</strong><small>/ night</small></> : <small>Rate not set</small>}</div>
        <div className="rs-list-actions">{!["maintenance", "blocked", "occupied"].includes(room.live_status) && <button type="button" className="rs-reserve" onClick={() => onReserve(room)}><CalendarPlus size={15}/>Reserve</button>}{room.live_status === "cleaning" && <button type="button" className="rs-mini" disabled={busyRoom === room.id} onClick={() => onMarkClean(room)}><Sparkles size={14}/>Mark clean</button>}</div>
      </article>;
    })}
  </section>;
}

function Lightbox({ rooms, index, onIndex, onClose, busy, onPhoto }: { rooms: RoomStatusItem[]; index: number; onIndex: (index: number) => void; onClose: () => void; busy: boolean; onPhoto: (room: RoomStatusItem, file: File) => void }) {
  const room = rooms[index];
  const fileInput = useRef<HTMLInputElement>(null);
  const step = (delta: number) => onIndex((index + delta + rooms.length) % rooms.length);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); if (event.key === "ArrowRight") step(1); if (event.key === "ArrowLeft") step(-1); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });
  const stay = room.current_stay || room.next_stay;
  return <div className="rs-lightbox" role="dialog" aria-modal="true" aria-label={`Room ${room.room_number}`} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="rs-lightbox-card">
      <button type="button" className="rs-lightbox-close" onClick={onClose} aria-label="Close"><X size={18}/></button>
      <div className="rs-lightbox-photo">
        <img src={roomImage(room)} alt={`Room ${room.room_number}`}/>
        {rooms.length > 1 && <>
          <button type="button" className="rs-nav prev" onClick={() => step(-1)} aria-label="Previous room"><ChevronLeft size={22}/></button>
          <button type="button" className="rs-nav next" onClick={() => step(1)} aria-label="Next room"><ChevronRight size={22}/></button>
        </>}
        <span className="rs-counter">{index + 1} / {rooms.length}</span>
      </div>
      <div className="rs-lightbox-info">
        <p className="rs-eyebrow">ROOM {room.room_number}</p>
        <h2>{roomTitle(room)}</h2>
        <StatusPill status={room.live_status}/>
        <dl>
          <div><dt>Category</dt><dd>{room.room_category}</dd></div>
          <div><dt>Room type</dt><dd>{room.room_type || "—"}</dd></div>
          <div><dt>Floor</dt><dd>{room.floor || "—"}</dd></div>
          <div><dt>Guests allowed</dt><dd>{guestsAllowed(room)}</dd></div>
          <div><dt>Bed</dt><dd>{room.bed_type || "—"}</dd></div>
          <div><dt>Size</dt><dd>{room.size_sqft ? `${room.size_sqft} sq ft` : "—"}</dd></div>
          <div><dt>Rate</dt><dd>{room.base_rate != null ? `${money(room.base_rate)} / night` : "—"}</dd></div>
          <div><dt>{room.current_stay ? "Current guest" : "Next arrival"}</dt><dd>{stay ? <Link to={`/dashboard/reservations/${stay.reservation_id}`}>{stay.guest_name} · {shortDate(stay.check_in_date)}</Link> : "None"}</dd></div>
        </dl>
        {room.amenities.length > 0 && <ul className="rs-amenities">{room.amenities.map(item => <li key={item}>{item}</li>)}</ul>}
        <input ref={fileInput} type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) onPhoto(room, file); event.target.value = ""; }}/>
        <button type="button" className="rs-primary" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? <LoaderCircle size={16} className="rs-spin"/> : <Upload size={16}/>}{room.image_url ? "Change photo" : "Upload photo"}</button>
      </div>
    </div>
  </div>;
}

function Master({ rooms, busyRoom, onAdd, onEdit, onRemove, onPhoto }: { rooms: RoomStatusItem[]; busyRoom: number | null; onAdd: () => void; onEdit: (room: RoomStatusItem) => void; onRemove: (room: RoomStatusItem) => void; onPhoto: (room: RoomStatusItem, file: File) => void }) {
  return <section className="rs-panel">
    <header className="rs-panel-head">
      <h2>Room Master <span>{rooms.length}</span></h2>
      <button type="button" className="rs-primary" onClick={onAdd}><Plus size={16}/>Add Room</button>
    </header>
    <div className="rs-table-wrap">
      <table className="rs-table">
        <thead><tr><th>Photo</th><th>Floor</th><th>Room No.</th><th>Name</th><th>Room Type</th><th>Category</th><th>Adults</th><th>Children</th><th>Rate / night</th><th>Housekeeping</th><th>Live Status</th><th aria-label="Actions"/></tr></thead>
        <tbody>
          {rooms.length === 0 ? <tr><td colSpan={12} className="rs-empty-cell">No rooms yet. Add your first room to get started.</td></tr>
            : rooms.map(room => <tr key={room.id}>
              <td><label className="rs-thumb" title="Upload photo"><img src={roomImage(room)} alt=""/><input type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={event => { const file = event.target.files?.[0]; if (file) onPhoto(room, file); event.target.value = ""; }}/><span><Upload size={13}/></span></label></td>
              <td>{room.floor || "—"}</td>
              <td><strong>{room.room_number}</strong></td>
              <td>{room.display_name || "—"}</td>
              <td>{room.room_type || "—"}</td>
              <td>{room.room_category}</td>
              <td>{room.max_adults}</td>
              <td>{room.max_children}</td>
              <td>{room.base_rate != null ? money(room.base_rate) : "—"}</td>
              <td>{HOUSEKEEPING.find(item => item.value === room.status)?.label || room.status}</td>
              <td><StatusPill status={room.live_status}/></td>
              <td><div className="rs-row-actions">
                <button type="button" onClick={() => onEdit(room)} aria-label={`Edit room ${room.room_number}`} title="Edit"><Pencil size={15}/></button>
                <button type="button" className="danger" disabled={busyRoom === room.id} onClick={() => onRemove(room)} aria-label={`Remove room ${room.room_number}`} title="Remove"><Trash2 size={15}/></button>
              </div></td>
            </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

function RoomForm({ room, categories, onClose, onSaved }: { room: RoomStatusItem | null; categories: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<RoomInput>(room ? toInput(room) : emptyRoom);
  const [amenityText, setAmenityText] = useState((room?.amenities || []).join(", "));
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (changes: Partial<RoomInput>) => setForm(current => ({ ...current, ...changes }));
  const optionalNumber = (value: string) => (value === "" ? null : Number(value));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const payload: RoomInput = {
        ...form, room_number: form.room_number.trim(), room_category: form.room_category.trim(), floor: form.floor?.trim() || null,
        notes: form.notes?.trim() || null, display_name: form.display_name?.trim() || null, bed_type: form.bed_type?.trim() || null,
        amenities: amenityText.split(",").map(item => item.trim()).filter(Boolean),
      };
      const saved = room ? await updateRoom(room.id, payload) : await createRoom(payload);
      if (photo) await uploadRoomImage(saved.id, photo);
      await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save the room."); } finally { setSaving(false); }
  };
  return <div className="fo-modal-backdrop">
    <form className="rs-form" onSubmit={submit}>
      <header><div><p className="rs-eyebrow">ROOM MASTER</p><h2>{room ? `Edit Room ${room.room_number}` : "Add Room"}</h2></div><button type="button" className="rs-lightbox-close" onClick={onClose} disabled={saving} aria-label="Close"><X size={18}/></button></header>
      <div className="rs-form-grid">
        <label>Floor no.<input value={form.floor || ""} placeholder="e.g. 1" onChange={event => set({ floor: event.target.value })}/></label>
        <label>Room no.<input required value={form.room_number} placeholder="e.g. 101" onChange={event => set({ room_number: event.target.value })}/></label>
        <label className="wide">Display name<input value={form.display_name || ""} placeholder="e.g. Deluxe Sea View" onChange={event => set({ display_name: event.target.value })}/></label>
        <label>Room type<select value={form.room_type || ""} onChange={event => set({ room_type: event.target.value || null })}><option value="">Select type</option>{[...new Set([...ROOM_TYPES, ...(form.room_type ? [form.room_type] : [])])].map(type => <option key={type}>{type}</option>)}</select></label>
        <label>Category<input required list="rs-categories" value={form.room_category} placeholder="Deluxe, Premium, Others…" onChange={event => set({ room_category: event.target.value })}/><datalist id="rs-categories">{categories.map(item => <option key={item} value={item}/>)}</datalist></label>
        <label>Adults allowed<input required type="number" min={1} max={20} value={form.max_adults} onChange={event => set({ max_adults: Number(event.target.value) })}/></label>
        <label>Children allowed<input required type="number" min={0} max={20} value={form.max_children} onChange={event => set({ max_children: Number(event.target.value) })}/></label>
        <label>Rate per night (₹)<input type="number" min={0} value={form.base_rate ?? ""} placeholder="e.g. 8500" onChange={event => set({ base_rate: optionalNumber(event.target.value) })}/></label>
        <label>Size (sq ft)<input type="number" min={0} value={form.size_sqft ?? ""} placeholder="e.g. 420" onChange={event => set({ size_sqft: optionalNumber(event.target.value) })}/></label>
        <label>Bed<input value={form.bed_type || ""} placeholder="e.g. 1 King Bed" onChange={event => set({ bed_type: event.target.value })}/></label>
        <label>Housekeeping<select value={form.status} onChange={event => set({ status: event.target.value })}>{HOUSEKEEPING.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="wide">Amenities<input value={amenityText} placeholder="Sea View, Balcony, Breakfast, Free Wi-Fi" onChange={event => setAmenityText(event.target.value)}/><small>Separate with commas.</small></label>
        <label className="wide">Photo<input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={event => setPhoto(event.target.files?.[0] || null)}/></label>
        <label className="wide">Notes<textarea value={form.notes || ""} placeholder="View, accessibility, connecting rooms…" onChange={event => set({ notes: event.target.value })}/></label>
      </div>
      {error && <p className="rs-error">{error}</p>}
      <footer><button type="button" className="rs-secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="rs-primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="rs-spin"/> : <Plus size={16}/>}{room ? "Save Room" : "Add Room"}</button></footer>
    </form>
  </div>;
}

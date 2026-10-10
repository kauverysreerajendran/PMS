import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { Check, CheckCircle2, ChevronDown, Clock, Layers, Download, ExternalLink, Gift, LoaderCircle, Minus, Pencil, Plus, Printer, QrCode, ReceiptText, Search, ShoppingBag, Trash2, UtensilsCrossed, X } from "lucide-react";
import { useHotelProfile } from "../lib/property";
import { DISH_CATALOGUE, STARTER_MENU } from "./dishCatalogue";
import GuestOrdersPanel from "./GuestOrdersPanel";
import MenuPreviewModal from "./MenuPreviewModal";
import { bulkCreateMenuItems, createMenuItem, FoodType, getMenuItems, MenuItem, MenuItemInput, postMenuOrder, removeMenuItem, updateMenuItem } from "./menuApi";
import { getReservations, Reservation } from "./reservationsApi";
import "./menu.css";

export const MEAL_PERIODS = ["Breakfast", "Brunch", "Lunch", "Snacks", "Dinner", "Desserts", "Beverages"];
const SUGGESTED_CATEGORIES = ["South Indian", "Continental", "Starters", "Main Course", "Breads & Rice", "Desserts", "Hot Beverages", "Cold Beverages", "Room Service Specials"];
const FOOD_TYPES: { value: FoodType; label: string }[] = [{ value: "veg", label: "Veg" }, { value: "non_veg", label: "Non-veg" }, { value: "egg", label: "Egg" }, { value: "beverage", label: "Beverage" }];
const SERVICES = ["Room Service", "Restaurant", "Minibar", "Banquet"];
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const emptyItem: MenuItemInput = { name: "", category: "", description: "", price: 0, food_type: "veg", prep_minutes: 15, is_available: true, meal_periods: [], is_complimentary: false, components: [] };
/** Address guests open from the QR code. */
export const publicMenuUrl = (code: string) => `${window.location.origin}/m/${encodeURIComponent(code)}`;

export default function MenuPage() {
  const hotel = useHotelProfile();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [guests, setGuests] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("All");
  const [meal, setMeal] = useState("All");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [guestId, setGuestId] = useState(0);
  const [service, setService] = useState("Room Service");
  const [notes, setNotes] = useState("");
  const [onHouse, setOnHouse] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState<{ reference: string; total: number; room: string | null; reservationId: number } | null>(null);
  const [busyItem, setBusyItem] = useState<number | null>(null);
  const [loadingStarter, setLoadingStarter] = useState(false);
  const loadStarter = async () => {
    setLoadingStarter(true); setError("");
    try { await bulkCreateMenuItems(STARTER_MENU); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load the starter menu."); }
    finally { setLoadingStarter(false); }
  };

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [menu, inHouse] = await Promise.all([getMenuItems(), getReservations("", "checked_in")]);
      setItems(menu); setGuests(inHouse.items);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load the menu."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const categories = useMemo(() => ["All", ...new Set(items.map(item => item.category))], [items]);
  const meals = useMemo(() => ["All", ...MEAL_PERIODS.filter(period => items.some(item => item.meal_periods.includes(period))), ...new Set(items.flatMap(item => item.meal_periods).filter(period => !MEAL_PERIODS.includes(period)))], [items]);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items.filter(item => (category === "All" || item.category === category) && (meal === "All" || item.meal_periods.includes(meal))
      && (!text || `${item.name} ${item.description || ""} ${item.category}`.toLowerCase().includes(text)));
  }, [items, category, meal, query]);
  const cartLines = items.filter(item => cart[item.id]).map(item => ({ item, quantity: cart[item.id], free: onHouse || item.is_complimentary }));
  const cartTotal = cartLines.reduce((sum, line) => sum + (line.free ? 0 : line.item.price * line.quantity), 0);
  const setQty = (id: number, quantity: number) => setCart(current => { const next = { ...current }; if (quantity <= 0) delete next[id]; else next[id] = quantity; return next; });

  const toggleAvailable = async (item: MenuItem) => {
    setBusyItem(item.id); setError("");
    try { const { id, ...rest } = item; await updateMenuItem(id, { ...rest, is_available: !item.is_available }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update the item."); }
    finally { setBusyItem(null); }
  };
  const remove = async (item: MenuItem) => {
    if (!window.confirm(`Remove ${item.name} from the menu?`)) return;
    setBusyItem(item.id);
    try { await removeMenuItem(item.id); setQty(item.id, 0); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to remove the item."); }
    finally { setBusyItem(null); }
  };
  const placeOrder = async () => {
    if (!guestId) { setError("Choose the guest to charge."); return; }
    setPosting(true); setError("");
    try {
      const result = await postMenuOrder({ reservation_id: guestId, service, complimentary: onHouse, notes: notes.trim() || undefined, lines: cartLines.map(line => ({ item_id: line.item.id, quantity: line.quantity })) });
      setPosted({ reference: result.reference, total: result.total, room: result.room_number, reservationId: guestId });
      setCart({}); setNotes(""); setOnHouse(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to post the order."); }
    finally { setPosting(false); }
  };

  return <div className="mn-page">
    <header className="mn-head">
      <div><p className="mn-eyebrow">FOOD &amp; BEVERAGE</p><h1>Dining &amp; Menu</h1><p>Keep the hotel menu up to date, share it by QR code and charge orders straight to a guest's room bill.</p></div>
      <div className="mn-head-actions">
        <button type="button" className="mn-secondary" onClick={() => setQrOpen(true)} disabled={!hotel}><QrCode size={16}/>Menu QR code</button>
        <button type="button" className="mn-primary" onClick={() => setEditing("new")}><Plus size={16}/>Add menu item</button>
      </div>
    </header>
    {error && <p className="mn-error" role="alert">{error}</p>}

    <div className="mn-layout">
      <section className="mn-menu">
        <div className="mn-toolbar">
          <label className="mn-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search dishes or drinks"/></label>
          {meals.length > 1 && <div className="mn-meals" aria-label="Meal time">{meals.map(name => <button type="button" key={name} className={meal === name ? "on" : ""} onClick={() => setMeal(name)}>{name}</button>)}</div>}
          <div className="mn-tabs">{categories.map(name => <button type="button" key={name} className={category === name ? "on" : ""} onClick={() => setCategory(name)}>{name}<span>{name === "All" ? items.length : items.filter(item => item.category === name).length}</span></button>)}</div>
        </div>
        {loading && !items.length ? <p className="mn-empty"><LoaderCircle size={16} className="mn-spin"/>Loading menu…</p>
          : !items.length ? <div className="mn-empty"><UtensilsCrossed size={28}/><strong>No menu items yet</strong><span>Start with our standard restaurant menu ({STARTER_MENU.length} dishes and set menus across breakfast, lunch, snacks, dinner, desserts and beverages) and adjust prices, or add your own dishes.</span>
            <div className="mn-empty-actions"><button type="button" className="mn-primary" onClick={() => void loadStarter()} disabled={loadingStarter}>{loadingStarter ? <LoaderCircle size={16} className="mn-spin"/> : <UtensilsCrossed size={16}/>}Load standard menu</button><button type="button" className="mn-secondary" onClick={() => setEditing("new")}><Plus size={16}/>Add my own dish</button></div></div>
          : <div className="mn-grid">{visible.map(item => <article key={item.id} className={`mn-item${item.is_available ? "" : " is-off"}`}>
            <div className="mn-item-top"><span className={`mn-type t-${item.food_type}`} title={FOOD_TYPES.find(type => type.value === item.food_type)?.label}><i/></span><strong>{item.name}</strong>{item.is_complimentary ? <span className="mn-free"><Gift size={13}/>Complimentary</span> : <b>{money(item.price)}</b>}</div>
            {item.description && <p>{item.description}</p>}
            {item.components.length > 0 && <p className="mn-includes"><Layers size={13}/>Includes {item.components.join(" · ")}</p>}
            {item.meal_periods.length > 0 && <ul className="mn-periods">{item.meal_periods.map(period => <li key={period}>{period}</li>)}</ul>}
            <div className="mn-item-meta"><span>{item.category}</span>{item.prep_minutes ? <span><Clock size={13}/>{item.prep_minutes} min</span> : null}
              <label className="mn-switch" title={item.is_available ? "Available — click to mark sold out" : "Sold out — click to make available"}><input type="checkbox" checked={item.is_available} disabled={busyItem === item.id} onChange={() => void toggleAvailable(item)}/><span/>{item.is_available ? "Available" : "Sold out"}</label>
            </div>
            <div className="mn-item-actions">
              <button type="button" className="mn-icon" onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`} title="Edit"><Pencil size={14}/></button>
              <button type="button" className="mn-icon danger" onClick={() => void remove(item)} disabled={busyItem === item.id} aria-label={`Remove ${item.name}`} title="Remove"><Trash2 size={14}/></button>
              {cart[item.id] ? <span className="mn-qty"><button type="button" onClick={() => setQty(item.id, cart[item.id] - 1)} aria-label="Fewer"><Minus size={13}/></button><b>{cart[item.id]}</b><button type="button" onClick={() => setQty(item.id, cart[item.id] + 1)} aria-label="More"><Plus size={13}/></button></span>
                : <button type="button" className="mn-add" disabled={!item.is_available} onClick={() => setQty(item.id, 1)}><Plus size={14}/>Add to order</button>}
            </div>
          </article>)}{!visible.length && <p className="mn-empty">No items match.</p>}</div>}
      </section>

      <aside className="mn-side">
        {hotel && <MenuQrCard code={hotel.property_code} hotelName={hotel.name} onExpand={() => setQrOpen(true)}/>}
        <GuestOrdersPanel/>
        <div className="mn-order">
          <h2><ShoppingBag size={18}/>New order</h2>
          <label>Charge to guest<select value={guestId} onChange={event => setGuestId(Number(event.target.value))}>
            <option value={0}>{guests.length ? "Select in-house guest" : "No guests checked in"}</option>
            {guests.map(guest => <option key={guest.id} value={guest.id}>Room {guest.room_number} · {guest.guest.first_name} {guest.guest.last_name}</option>)}
          </select></label>
          <label>Service<select value={service} onChange={event => setService(event.target.value)}>{SERVICES.map(name => <option key={name}>{name}</option>)}</select></label>
          {cartLines.length ? <ul className="mn-lines">{cartLines.map(line => <li key={line.item.id}><span>{line.quantity} × {line.item.name}</span><b>{line.free ? "Free" : money(line.item.price * line.quantity)}</b></li>)}</ul>
            : <p className="mn-hint">Add dishes from the menu.</p>}
          <label>Notes for the kitchen<input value={notes} onChange={event => setNotes(event.target.value)} placeholder="e.g. less spicy, no onion"/></label>
          <label className="mn-onhouse"><input type="checkbox" checked={onHouse} onChange={event => setOnHouse(event.target.checked)}/><Gift size={15}/>Complimentary — not added to the bill</label>
          <div className="mn-total"><span>Total</span><strong>{money(cartTotal)}</strong></div>
          <button type="button" className="mn-primary mn-post" disabled={!cartLines.length || !guestId || posting} onClick={() => void placeOrder()}>{posting ? <LoaderCircle size={16} className="mn-spin"/> : <ReceiptText size={16}/>}{cartTotal ? "Post to room bill" : "Record (no charge)"}</button>
          {posted && <div className="mn-posted"><CheckCircle2 size={18}/><div><strong>{posted.total ? `${money(posted.total)} charged` : "Recorded at no charge"}{posted.room ? ` · Room ${posted.room}` : ""}</strong><span>Order {posted.reference} · <Link to={`/dashboard/reservations/${posted.reservationId}`}>Open folio</Link></span></div><button type="button" onClick={() => setPosted(null)} aria-label="Dismiss"><X size={14}/></button></div>}
        </div>
      </aside>
    </div>

    {qrOpen && hotel && <QrModal code={hotel.property_code} hotelName={hotel.name} onClose={() => setQrOpen(false)}/>}
    {editing && <ItemForm item={editing === "new" ? null : editing} menuItems={items} categories={[...new Set([...SUGGESTED_CATEGORIES, ...items.map(item => item.category)])]} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }}/>}
  </div>;
}

function useQr(url: string, size: number) {
  const [image, setImage] = useState("");
  useEffect(() => {
    const dark = getComputedStyle(document.documentElement).getPropertyValue("--th-navy").trim() || "#0B2342";
    QRCode.toDataURL(url, { width: size, margin: 1, errorCorrectionLevel: "M", color: { dark, light: "#ffffff" } }).then(setImage).catch(() => setImage(""));
  }, [url, size]);
  return image;
}

export function MenuQrCard({ code, hotelName, onExpand }: { code: string; hotelName: string; onExpand: () => void }) {
  const url = publicMenuUrl(code);
  const image = useQr(url, 240);
  const [preview, setPreview] = useState(false);
  return <div className="mn-qr-card">
    <button type="button" className="mn-qr-thumb" onClick={onExpand} aria-label="Show menu QR code">{image ? <img src={image} alt={`QR code for the ${hotelName} menu`}/> : <LoaderCircle size={18} className="mn-spin"/>}</button>
    <div><strong>Guest menu</strong><span>Guests scan to see today's menu on their phone.</span>
      <span className="mn-qr-links"><button type="button" className="mn-qr-open" onClick={() => setPreview(true)}><UtensilsCrossed size={13}/>Open menu</button><a href={url} target="_blank" rel="noreferrer" aria-label="Open the menu in a new tab" title="Open in new tab"><ExternalLink size={13}/></a></span></div>
    {preview && <MenuPreviewModal code={code} hotelName={hotelName} url={url} onClose={() => setPreview(false)}/>}
  </div>;
}

export function QrModal({ code, hotelName, onClose }: { code: string; hotelName: string; onClose: () => void }) {
  const url = publicMenuUrl(code);
  const image = useQr(url, 720);
  const print = () => {
    const page = window.open("", "_blank", "width=520,height=720");
    if (!page) return;
    const escape = (text: string) => text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
    page.document.write(`<!doctype html><title>${escape(hotelName)} menu</title><body style="font-family:Georgia,serif;text-align:center;padding:40px;color:#0B2342"><h1 style="margin:0 0 6px">${escape(hotelName)}</h1><p style="margin:0 0 24px;letter-spacing:3px">SCAN FOR OUR MENU</p><img src="${image}" style="width:320px;height:320px"/><p style="font-family:sans-serif;font-size:13px;color:#555">${escape(url)}</p><script>window.onload=()=>{window.print();}<\/script></body>`);
    page.document.close();
  };
  return <div className="fo-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="mn-qr-modal" role="dialog" aria-modal="true" aria-label="Menu QR code">
      <button type="button" className="mn-close" onClick={onClose} aria-label="Close"><X size={18}/></button>
      <p className="mn-eyebrow">SCAN FOR OUR MENU</p>
      <h2>{hotelName}</h2>
      <div className="mn-qr-big">{image ? <img src={image} alt={`QR code for the ${hotelName} menu`}/> : <LoaderCircle size={22} className="mn-spin"/>}</div>
      <code>{url}</code>
      <p className="mn-qr-note">Print it for tables and rooms. Only dishes marked available are shown, grouped by meal time.</p>
      <footer>
        <a className="mn-secondary" href={image} download={`${code}-menu-qr.png`}><Download size={15}/>Download PNG</a>
        <button type="button" className="mn-primary" onClick={print} disabled={!image}><Printer size={15}/>Print</button>
      </footer>
    </section>
  </div>;
}

type DishInfo = { category: string; food_type: FoodType; meal_periods: string[]; price: number };
type Pick = { name: string; qty: number; info?: DishInfo };
const parseComponent = (text: string): Pick => { const match = text.match(/^(\d+)\s+(.+)$/); return match ? { name: match[2], qty: Number(match[1]) } : { name: text, qty: 1 }; };
const componentText = (pick: Pick) => (pick.qty > 1 ? `${pick.qty} ${pick.name}` : pick.name);

/** Fills the item from the dishes picked: one dish copies its details, several make a combo. */
function fromPicks(picks: Pick[]): Partial<MenuItemInput> {
  if (!picks.length) return { components: [] };
  const known = picks.filter(pick => pick.info);
  const price = picks.reduce((sum, pick) => sum + (pick.info?.price || 0) * pick.qty, 0);
  const periods = [...new Set(known.flatMap(pick => pick.info!.meal_periods))];
  if (picks.length === 1) {
    const [pick] = picks;
    return { name: pick.qty > 1 ? `${pick.name} (${pick.qty})` : pick.name, price, components: pick.qty > 1 ? [componentText(pick)] : [],
      ...(pick.info ? { category: pick.info.category, food_type: pick.info.food_type, meal_periods: pick.info.meal_periods } : {}) };
  }
  const types = new Set(known.map(pick => pick.info!.food_type));
  const food_type: FoodType = types.has("non_veg") ? "non_veg" : types.has("egg") ? "egg" : types.size === 1 && types.has("beverage") ? "beverage" : "veg";
  const names = picks.map(pick => pick.name);
  return { name: names.length > 3 ? `${names.slice(0, 3).join(" + ")} & more` : names.join(" + "), category: "Combos & Set Menus", food_type,
    meal_periods: periods, price, components: picks.map(componentText) };
}

/** Searchable multi-select of dishes: the hotel's own single dishes plus a catalogue of common ones. */
function DishPicker({ picks, onChange, menuItems }: { picks: Pick[]; onChange: (picks: Pick[]) => void; menuItems: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const text = query.trim().toLowerCase();
  const own = menuItems.filter(item => !item.components.length).map(item => ({ name: item.name, info: { category: item.category, food_type: item.food_type, meal_periods: item.meal_periods, price: item.price } }));
  const ownNames = new Set(own.map(entry => entry.name.toLowerCase()));
  const catalogue = DISH_CATALOGUE.filter(entry => !ownNames.has(entry.name.toLowerCase())).map(entry => ({ name: entry.name, info: entry as DishInfo }));
  const match = (entry: { name: string; info: DishInfo }) => !text || `${entry.name} ${entry.info.category}`.toLowerCase().includes(text);
  const groups = [{ title: "Your menu", list: own.filter(match) }, { title: "Common dishes", list: catalogue.filter(match) }].filter(group => group.list.length);
  const picked = (name: string) => picks.some(pick => pick.name.toLowerCase() === name.toLowerCase());
  const toggle = (entry: { name: string; info?: DishInfo }) => onChange(picked(entry.name) ? picks.filter(pick => pick.name.toLowerCase() !== entry.name.toLowerCase()) : [...picks, { name: entry.name, qty: 1, info: entry.info }]);
  const exact = [...own, ...catalogue].some(entry => entry.name.toLowerCase() === text);
  const addTyped = () => { if (text) { toggle({ name: query.trim() }); setQuery(""); } };
  return <div className="mn-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <div className={`mn-picker-box${open ? " open" : ""}`} onClick={() => setOpen(true)}>
      {picks.map(pick => <span key={pick.name} className="mn-chip">
        {pick.qty > 1 && <b>{pick.qty}×</b>}{pick.name}
        <span className="mn-chip-qty">
          <button type="button" aria-label={`Fewer ${pick.name}`} onClick={event => { event.stopPropagation(); onChange(pick.qty > 1 ? picks.map(p => p === pick ? { ...p, qty: p.qty - 1 } : p) : picks.filter(p => p !== pick)); }}><Minus size={11}/></button>
          <button type="button" aria-label={`More ${pick.name}`} onClick={event => { event.stopPropagation(); onChange(picks.map(p => p === pick ? { ...p, qty: Math.min(20, p.qty + 1) } : p)); }}><Plus size={11}/></button>
        </span>
      </span>)}
      <input value={query} placeholder={picks.length ? "Add more dishes…" : "Search or pick dishes (choose several to make a combo)"} onFocus={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === "Enter") { event.preventDefault(); const first = groups[0]?.list[0]; if (text && !exact) addTyped(); else if (first) { toggle(first); setQuery(""); } }
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Backspace" && !query && picks.length) onChange(picks.slice(0, -1));
        }}/>
      <ChevronDown size={16} className="mn-picker-caret"/>
    </div>
    {open && <div className="mn-picker-list" role="listbox" aria-multiselectable="true">
      {text && !exact && <button type="button" className="mn-picker-new" onClick={addTyped}><Plus size={14}/>Add “{query.trim()}” as a new dish</button>}
      {groups.map(group => <div key={group.title}><small>{group.title}</small>
        {group.list.slice(0, 40).map(entry => <button type="button" role="option" aria-selected={picked(entry.name)} key={entry.name} className={picked(entry.name) ? "on" : ""} onClick={() => toggle(entry)}>
          <span className="mn-picker-check">{picked(entry.name) && <Check size={12}/>}</span>
          <span className={`mn-type t-${entry.info.food_type}`}><i/></span>
          <span className="mn-picker-name">{entry.name}<em>{entry.info.category}</em></span>
          <b>{entry.info.price ? money(entry.info.price) : "Free"}</b>
        </button>)}
      </div>)}
      {!groups.length && !text && <p>No dishes yet.</p>}
    </div>}
  </div>;
}

function ItemForm({ item, menuItems, categories, onClose, onSaved }: { item: MenuItem | null; menuItems: MenuItem[]; categories: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<MenuItemInput>(item ? { ...item } : emptyItem);
  const [picks, setPicks] = useState<Pick[]>(() => (item?.components || []).map(parseComponent));
  const [autoName, setAutoName] = useState(!item);
  const [autoPrice, setAutoPrice] = useState(!item);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (changes: Partial<MenuItemInput>) => setForm(current => ({ ...current, ...changes }));
  const togglePeriod = (period: string) => set({ meal_periods: form.meal_periods.includes(period) ? form.meal_periods.filter(value => value !== period) : [...form.meal_periods, period] });
  // Picking dishes fills the name, price and details until the owner types their own.
  const changePicks = (next: Pick[]) => {
    setPicks(next);
    const derived = fromPicks(next);
    setForm(current => ({
      ...current, components: derived.components || [],
      ...(autoName && derived.name ? { name: derived.name } : {}),
      ...(autoPrice && derived.price !== undefined ? { price: derived.price } : {}),
      ...(autoName ? { ...(derived.category ? { category: derived.category } : {}), ...(derived.food_type ? { food_type: derived.food_type } : {}), ...(derived.meal_periods?.length ? { meal_periods: derived.meal_periods } : {}) } : {}),
    }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (!form.name.trim()) throw new Error("Pick a dish or type a name for this menu item.");
      if (!form.meal_periods.length) throw new Error("Choose at least one meal time (Breakfast, Lunch, …).");
      const payload = { ...form, description: form.description?.trim() || null, prep_minutes: form.prep_minutes || null };
      if (item) await updateMenuItem(item.id, payload); else await createMenuItem(payload);
      await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save the item."); } finally { setSaving(false); }
  };
  return <div className="fo-modal-backdrop">
    <form className="mn-form" onSubmit={submit}>
      <header><div><p className="mn-eyebrow">MENU</p><h2>{item ? `Edit ${item.name}` : "Add menu item"}</h2></div><button type="button" className="mn-close" onClick={onClose} disabled={saving} aria-label="Close"><X size={18}/></button></header>
      <div className="mn-form-grid">
        <div className="wide mn-pick-field"><span>Dishes</span><DishPicker picks={picks} onChange={changePicks} menuItems={menuItems.filter(entry => entry.id !== item?.id)}/>
          <small>{picks.length > 1 ? `Combo of ${picks.length} dishes. Price and details are filled in for you; change anything below.` : "Pick one dish to fill in its details, or several to build a combo / set menu."}</small></div>
        <label className="wide">Menu name<input value={form.name} placeholder="e.g. South Indian Breakfast Platter" onChange={event => { setAutoName(false); set({ name: event.target.value }); }}/></label>
        <fieldset className="mn-period-pick wide"><legend>Served at</legend>{MEAL_PERIODS.map(period => <button type="button" key={period} className={form.meal_periods.includes(period) ? "on" : ""} aria-pressed={form.meal_periods.includes(period)} onClick={() => togglePeriod(period)}>{period}</button>)}</fieldset>
        <label>Category<input required list="mn-categories" value={form.category} placeholder="South Indian, Starters…" onChange={event => set({ category: event.target.value })}/><datalist id="mn-categories">{categories.map(name => <option key={name} value={name}/>)}</datalist></label>
        <label>Price (₹)<input type="number" min={0} required={!form.is_complimentary} value={form.price || ""} placeholder={form.is_complimentary ? "Optional" : ""} onChange={event => { setAutoPrice(false); set({ price: Number(event.target.value) }); }}/></label>
        <label>Type<select value={form.food_type} onChange={event => set({ food_type: event.target.value as FoodType })}>{FOOD_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <label>Prep time (min)<input type="number" min={0} value={form.prep_minutes ?? ""} onChange={event => set({ prep_minutes: event.target.value === "" ? null : Number(event.target.value) })}/></label>
        <label className="wide">Description<textarea value={form.description || ""} placeholder="Ingredients, portion size, allergens" onChange={event => set({ description: event.target.value })}/></label>
        <label className="mn-check wide"><input type="checkbox" checked={form.is_complimentary} onChange={event => set({ is_complimentary: event.target.checked })}/><Gift size={15}/>Complimentary — shown as free and never added to the bill</label>
        <label className="mn-check wide"><input type="checkbox" checked={form.is_available} onChange={event => set({ is_available: event.target.checked })}/>Available to order now</label>
      </div>
      {error && <p className="mn-error">{error}</p>}
      <footer><button type="button" className="mn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="mn-primary" disabled={saving}>{saving && <LoaderCircle size={15} className="mn-spin"/>}{item ? "Save" : "Add item"}</button></footer>
    </form>
  </div>;
}

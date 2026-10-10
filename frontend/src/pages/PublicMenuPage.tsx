import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Clock, Gift, LoaderCircle, Minus, Plus, Search, ShoppingBag, UtensilsCrossed, X } from "lucide-react";
import { apiAssetUrl } from "../front-office/reservationsApi";
import type { PublicMenu } from "../front-office/menuApi";
import "../front-office/publicMenu.css";

const MEAL_ORDER = ["Breakfast", "Brunch", "Lunch", "Snacks", "Dinner", "Desserts", "Beverages"];
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
/** The meal being served right now, so the menu opens on it. */
function currentMeal(available: string[]) {
  const hour = new Date().getHours();
  const guess = hour < 10 ? "Breakfast" : hour < 12 ? "Brunch" : hour < 16 ? "Lunch" : hour < 19 ? "Snacks" : "Dinner";
  return available.includes(guess) ? guess : available[0] || "All";
}

/** Menu guests open by scanning the QR code. No sign-in; in-house guests can order to their room (staff confirm before it is billed).
 *  `embedded` renders it inside a staff popup instead of as a full page. */
export function PublicMenuView({ code, embedded = false }: { code: string; embedded?: boolean }) {
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [error, setError] = useState("");
  const [meal, setMeal] = useState("");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [checkout, setCheckout] = useState(false);
  const [room, setRoom] = useState("");
  const [surname, setSurname] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [placed, setPlaced] = useState<{ reference: string; total: number; room: string } | null>(null);

  useEffect(() => {
    fetch(apiAssetUrl(`/public/menu/${encodeURIComponent(code)}`))
      .then(async response => { if (!response.ok) throw new Error(response.status === 404 ? "This menu could not be found." : "The menu is not available right now."); return response.json(); })
      .then((data: PublicMenu) => { setMenu(data); if (!embedded) document.title = `${data.hotel.name} · Menu`; })
      .catch(reason => setError(reason instanceof Error ? reason.message : "The menu is not available right now."));
  }, [code, embedded]);

  const meals = useMemo(() => {
    const present = new Set(menu?.items.flatMap(item => item.meal_periods) || []);
    return [...MEAL_ORDER.filter(name => present.has(name)), ...[...present].filter(name => !MEAL_ORDER.includes(name))];
  }, [menu]);
  useEffect(() => { if (meals.length && !meal) setMeal(currentMeal(meals)); }, [meals, meal]);

  const sections = useMemo(() => {
    const text = query.trim().toLowerCase();
    const list = (menu?.items || []).filter(item => (!meal || meal === "All" || item.meal_periods.includes(meal)) && (!text || `${item.name} ${item.description || ""}`.toLowerCase().includes(text)));
    const groups = new Map<string, typeof list>();
    list.forEach(item => groups.set(item.category, [...(groups.get(item.category) || []), item]));
    return [...groups.entries()];
  }, [menu, meal, query]);

  const lines = (menu?.items || []).filter(item => cart[item.id]).map(item => ({ item, quantity: cart[item.id] }));
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + (line.item.is_complimentary ? 0 : line.item.price * line.quantity), 0);
  const setQty = (id: number, quantity: number) => setCart(current => { const next = { ...current }; if (quantity <= 0) delete next[id]; else next[id] = Math.min(20, quantity); return next; });

  const placeOrder = async (event: FormEvent) => {
    event.preventDefault(); setSending(true); setOrderError("");
    try {
      const response = await fetch(apiAssetUrl(`/public/menu/${encodeURIComponent(code)}/orders`), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_number: room.trim(), last_name: surname.trim(), notes: notes.trim() || null, lines: lines.map(line => ({ item_id: line.item.id, quantity: line.quantity })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "We could not place your order. Please call the front desk.");
      setPlaced({ reference: data.reference, total: data.total, room: data.room_number }); setCart({}); setNotes("");
    } catch (reason) { setOrderError(reason instanceof Error ? reason.message : "We could not place your order."); }
    finally { setSending(false); }
  };

  if (error) return <main className={`pm-page pm-center${embedded ? " is-embedded" : ""}`}><UtensilsCrossed size={32}/><p>{error}</p></main>;
  if (!menu) return <main className={`pm-page pm-center${embedded ? " is-embedded" : ""}`}><LoaderCircle size={26} className="pm-spin"/><p>Loading menu…</p></main>;

  return <main className={`pm-page${count ? " has-cart" : ""}${embedded ? " is-embedded" : ""}`}>
    <header className="pm-hero">
      {menu.hotel.logo_url && <img className="pm-logo" src={menu.hotel.logo_url} alt=""/>}
      <p>WELCOME TO</p>
      <h1>{menu.hotel.name}</h1>
      <span>Our menu</span>
    </header>
    <nav className="pm-meals" aria-label="Meal time">
      {meals.length > 1 && <button type="button" className={meal === "All" ? "on" : ""} onClick={() => setMeal("All")}>All</button>}
      {meals.map(name => <button type="button" key={name} className={meal === name ? "on" : ""} onClick={() => setMeal(name)}>{name}</button>)}
    </nav>
    <label className="pm-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search the menu"/></label>
    {!menu.items.length && <p className="pm-empty">The menu will be available soon.</p>}
    {menu.items.length > 0 && !sections.length && <p className="pm-empty">Nothing matches right now.</p>}
    {sections.map(([category, list]) => <section key={category} className="pm-section">
      <h2>{category}</h2>
      <ul>{list.map(item => <li key={item.id}>
        <span className={`pm-type t-${item.food_type}`}><i/></span>
        <div>
          <strong>{item.name}</strong>
          {item.description && <p>{item.description}</p>}
          {item.components.length > 0 && <p className="pm-includes">Includes {item.components.join(" · ")}</p>}
          {item.prep_minutes ? <small><Clock size={12}/>{item.prep_minutes} min</small> : null}
        </div>
        <div className="pm-buy">
          {item.is_complimentary ? <em><Gift size={13}/>Complimentary</em> : <b>{money(item.price)}</b>}
          {cart[item.id] ? <span className="pm-qty"><button type="button" onClick={() => setQty(item.id, cart[item.id] - 1)} aria-label={`Fewer ${item.name}`}><Minus size={14}/></button><b>{cart[item.id]}</b><button type="button" onClick={() => setQty(item.id, cart[item.id] + 1)} aria-label={`More ${item.name}`}><Plus size={14}/></button></span>
            : <button type="button" className="pm-add" onClick={() => setQty(item.id, 1)}><Plus size={14}/>Add</button>}
        </div>
      </li>)}</ul>
    </section>)}
    <footer className="pm-foot">Prices include taxes. Please tell our staff about any allergies.</footer>

    {count > 0 && !checkout && <button type="button" className="pm-cartbar" onClick={() => { setCheckout(true); setPlaced(null); }}>
      <ShoppingBag size={18}/><span>{count} item{count === 1 ? "" : "s"} · {total ? money(total) : "Free"}</span><b>Order to my room</b>
    </button>}

    {(checkout || placed) && <div className="pm-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget && !sending) { setCheckout(false); setPlaced(null); } }}>
      <section className="pm-sheet" role="dialog" aria-modal="true" aria-label="Your order">
        <button type="button" className="pm-sheet-close" onClick={() => { setCheckout(false); setPlaced(null); }} aria-label="Close"><X size={18}/></button>
        {placed ? <div className="pm-done">
          <CheckCircle2 size={44}/>
          <h3>Order sent</h3>
          <p>Our team has your order for Room {placed.room} ({placed.reference}). It is added to your room bill once the kitchen confirms it.</p>
          <button type="button" className="pm-primary" onClick={() => { setCheckout(false); setPlaced(null); }}>Back to menu</button>
        </div> : <form onSubmit={placeOrder}>
          <h3>Your order</h3>
          <ul className="pm-lines">{lines.map(line => <li key={line.item.id}><span>{line.quantity} × {line.item.name}</span><b>{line.item.is_complimentary ? "Free" : money(line.item.price * line.quantity)}</b></li>)}</ul>
          <div className="pm-total"><span>Total</span><strong>{money(total)}</strong></div>
          <p className="pm-hint">For guests staying with us. Enter your room number and the surname on the booking; we confirm every order before it is added to your room bill.</p>
          <div className="pm-fields">
            <label>Room number<input required value={room} inputMode="text" autoComplete="off" onChange={event => setRoom(event.target.value)}/></label>
            <label>Surname<input required value={surname} autoComplete="family-name" onChange={event => setSurname(event.target.value)}/></label>
          </div>
          <label className="pm-note">Notes for the kitchen<input value={notes} placeholder="e.g. less spicy, no onion" onChange={event => setNotes(event.target.value)}/></label>
          {orderError && <p className="pm-error" role="alert">{orderError}</p>}
          <button className="pm-primary" disabled={sending || !lines.length}>{sending ? <LoaderCircle size={16} className="pm-spin"/> : <ShoppingBag size={16}/>}Place order</button>
        </form>}
      </section>
    </div>}
  </main>;
}

export default function PublicMenuPage() {
  const { code = "" } = useParams();
  return <PublicMenuView code={code}/>;
}

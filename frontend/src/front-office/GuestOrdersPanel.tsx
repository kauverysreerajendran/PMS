import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, Check, Gift, LoaderCircle, X } from "lucide-react";
import { acceptGuestOrder, declineGuestOrder, getGuestOrders, GuestOrder } from "./menuApi";

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const ago = (iso: string) => { const minutes = Math.max(0, Math.round((Date.now() - new Date(`${iso}Z`).getTime()) / 60000)); return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`; };

/** Orders guests placed from the QR menu. Accepting posts them to the room bill exactly like a staff order. */
export default function GuestOrdersPanel({ compact = false }: { compact?: boolean }) {
  const [orders, setOrders] = useState<GuestOrder[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = () => getGuestOrders().then(setOrders).catch(() => setOrders([]));
  useEffect(() => { void load(); const timer = window.setInterval(load, 30_000); return () => window.clearInterval(timer); }, []);
  const act = async (order: GuestOrder, accept: boolean) => {
    setBusy(order.id); setError("");
    try { await (accept ? acceptGuestOrder(order.id) : declineGuestOrder(order.id)); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update the order."); }
    finally { setBusy(null); }
  };
  const waiting = (orders || []).filter(order => order.status === "new");
  const handled = (orders || []).filter(order => order.status !== "new").slice(0, compact ? 2 : 5);
  return <div className={`go-panel${compact ? " is-compact" : ""}`}>
    <header><BellRing size={16}/><strong>Guest orders</strong>{waiting.length > 0 && <span className="go-badge">{waiting.length} new</span>}</header>
    {error && <p className="go-error">{error}</p>}
    {orders === null ? <p className="go-empty"><LoaderCircle size={14} className="go-spin"/>Loading…</p>
      : !waiting.length && !handled.length ? <p className="go-empty">No orders from the QR menu yet. Guests order by scanning the code and entering their room number and surname.</p>
      : <ul>
        {waiting.map(order => <li key={order.id} className="is-new">
          <div className="go-top"><strong>Room {order.room_number}</strong><span>{order.guest_name} · {ago(order.created_at)}</span><b>{order.total ? money(order.total) : "Free"}</b></div>
          <p>{order.lines.map(line => `${line.quantity}× ${line.name}${line.complimentary ? " (free)" : ""}`).join(", ")}</p>
          {order.notes && <p className="go-note">“{order.notes}”</p>}
          <div className="go-actions">
            <button type="button" className="go-accept" disabled={busy === order.id} onClick={() => void act(order, true)}>{busy === order.id ? <LoaderCircle size={14} className="go-spin"/> : <Check size={14}/>}Accept &amp; add to bill</button>
            <button type="button" className="go-decline" disabled={busy === order.id} onClick={() => void act(order, false)}><X size={14}/>Decline</button>
          </div>
        </li>)}
        {handled.map(order => <li key={order.id} className={`is-${order.status}`}>
          <div className="go-top"><strong>Room {order.room_number}</strong><span>{order.status === "accepted" ? "Added to bill" : "Declined"} · {ago(order.created_at)}</span><b>{order.total ? money(order.total) : <Gift size={14}/>}</b></div>
          {order.status === "accepted" && <Link to={`/dashboard/reservations/${order.reservation_id}`}>Open folio</Link>}
        </li>)}
      </ul>}
  </div>;
}

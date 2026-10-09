import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, BedDouble, Ban, CalendarClock, ChevronDown, CreditCard, LoaderCircle, LogIn, LogOut, MoveRight,
  Pencil, Percent, Phone, Plus, Printer, User as UserIcon, Users, X,
} from "lucide-react";
import { getRoomAvailability, type AvailableRoomType } from "./reservationsApi";
import {
  addFolioCharge, addFolioPayment, amendStay, applyFolioDiscount, getFolio, getFolioOptions, moveRoom,
  updateGuest, updateNights, voidFolioCharge, type Folio, type FolioTransaction,
} from "./folioApi";
import InvoiceReceipt from "./InvoiceReceipt";

type Tab = "folio" | "booking" | "guest" | "charges" | "audit";
type Panel = null | "charge" | "posting" | "payment" | "discount" | "amend" | "move" | "nights" | { void: FolioTransaction };

const TABS: { id: Tab; label: string }[] = [
  { id: "folio", label: "Folio Operations" },
  { id: "booking", label: "Booking Details" },
  { id: "guest", label: "Guest Details" },
  { id: "charges", label: "Room Charges" },
  { id: "audit", label: "Audit Trail" },
];
const money = (value: number | null | undefined) => "₹ " + (value ?? 0).toLocaleString("en-IN");
const signed = (value: number) => (value < 0 ? "− " : "") + money(Math.abs(value));
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
const parse = (value: string) => { const [y, m, d] = value.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const day = (value: string) => parse(value).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
const stamp = (value: string) => new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const addDays = (iso: string, days: number) => { const d = parse(iso); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const weekday = (value: string) => parse(value).toLocaleDateString("en-GB", { weekday: "long" });
const long = (value: string) => parse(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const nightsBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
const errorText = (err: unknown, fallback: string) => err instanceof Error ? err.message : fallback;

export default function ReservationFolioPage() {
  const { id } = useParams();
  const reservationId = Number(id);
  const navigate = useNavigate();
  const [folio, setFolio] = useState<Folio | null>(null);
  const [options, setOptions] = useState<{ charge_categories: string[]; payment_methods: string[] }>({ charge_categories: [], payment_methods: [] });
  const [tab, setTab] = useState<Tab>("folio");
  const [panel, setPanel] = useState<Panel>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const load = () => {
    setLoading(true); setError("");
    getFolio(reservationId).then(setFolio).catch(err => setError(errorText(err, "Unable to load the reservation."))).finally(() => setLoading(false));
  };
  useEffect(load, [reservationId]);
  useEffect(() => { getFolioOptions().then(setOptions).catch(() => undefined); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); }, [toast]);

  // Every action: run it, close the panel, reload the folio, and confirm.
  const done = (message: string) => { setPanel(null); setToast(message); load(); };

  if (!Number.isFinite(reservationId)) return <p className="fo-api-error">Invalid reservation.</p>;
  if (loading && !folio) return <p className="fo-folio-loading"><LoaderCircle size={18}/>Loading reservation…</p>;
  if (!folio) return <div className="fo-folio-missing"><p className="fo-api-error">{error || "Reservation not found."}</p><Link className="fo-outline-button" to="/dashboard/reservations"><ArrowLeft size={16}/>Back to reservations</Link></div>;

  const r = folio.reservation;
  const g = r.guest;
  const guestName = g ? `${g.first_name} ${g.last_name}`.trim() : "Guest";
  const editable = folio.editable;
  const primary = r.status === "checked_in"
    ? <button type="button" className="fo-button" onClick={() => navigate("/dashboard/check-out")}><LogOut size={16}/>Check Out</button>
    : ["confirmed", "tentative", "waiting"].includes(r.status)
      ? <button type="button" className="fo-button" onClick={() => navigate("/dashboard/check-in")}><LogIn size={16}/>Check In</button>
      : null;

  return <section className="fo-folio">
    {/* Header strip: guest + stay at a glance */}
    <header className="fo-folio-hero">
      <div className="fo-folio-hero-title">
        <div className="fo-folio-hero-guest">
          <button type="button" className="fo-folio-back" aria-label="Back" onClick={() => navigate(-1)}><ArrowLeft size={18}/></button>
          <span className="fo-folio-hero-avatar">{guestName.slice(0, 1).toUpperCase()}</span>
          <div className="fo-folio-hero-info">
            <div className="fo-folio-hero-name"><h1>{guestName}</h1><span className={`fo-folio-hero-status st-${r.status}`}>{label(r.status)}</span></div>
            <p className="fo-folio-hero-code">{r.reservation_code}{r.folio_number ? ` · Folio ${r.folio_number}` : ""}</p>
            <p className="fo-folio-hero-meta"><span><UserIcon size={15}/>{r.adults} Adult{r.adults === 1 ? "" : "s"}</span><span><Users size={15}/>{r.children} Child{r.children === 1 ? "" : "ren"}</span></p>
            {g?.mobile && <p className="fo-folio-hero-meta"><span><Phone size={15}/>{g.mobile}</span></p>}
          </div>
        </div>
        <div className="fo-folio-actions">
          {primary}
        <div className="fo-popover-wrap" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false); }}>
          <button type="button" className="fo-outline-button" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>More Options<ChevronDown size={16}/></button>
          {menuOpen && <div className="fo-popover fo-folio-menu" role="menu">
            <MenuItem icon={<CreditCard size={16}/>} text="Add Payment" disabled={!editable} onClick={() => { setMenuOpen(false); setPanel("payment"); }}/>
            <MenuItem icon={<CalendarClock size={16}/>} text="Amend Stay" disabled={!editable} onClick={() => { setMenuOpen(false); setPanel("amend"); }}/>
            <MenuItem icon={<MoveRight size={16}/>} text="Room Move" disabled={!editable} onClick={() => { setMenuOpen(false); setPanel("move"); }}/>
            <MenuItem icon={<Pencil size={16}/>} text="Edit Reservation" onClick={() => { setMenuOpen(false); navigate("/dashboard/reservations"); }}/>
            <MenuItem icon={<Printer size={16}/>} text="Print Folio" onClick={() => { setMenuOpen(false); setInvoiceOpen(true); }}/>
          </div>}
        </div>
        </div>
      </div>
      <div className="fo-folio-hero-cards">
        <HeroCard icon={<LogIn size={22}/>} label="Arrival" value={long(r.check_in_date)} sub={weekday(r.check_in_date)}/>
        <HeroCard icon={<LogOut size={22}/>} label="Departure" value={long(r.check_out_date)} sub={weekday(r.check_out_date)}/>
        <HeroCard icon={<BedDouble size={22}/>} label="Room" value={r.room_number || "—"} sub={`${r.room_category || "No type"} · ${r.nights} night${r.nights === 1 ? "" : "s"}`}/>
        <PaidCard paid={folio.totals.paid} total={folio.totals.total}/>
      </div>
    </header>

    {error && <p className="fo-api-error" role="alert">{error}</p>}
    {!editable && <p className="fo-folio-note">This reservation is {label(r.status).toLowerCase()} — the folio is read-only.</p>}

    <nav className="fo-folio-tabs" role="tablist">{TABS.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>

    {tab === "folio" && <div className="fo-folio-panel">
      <div className="fo-folio-toolbar">
        <button type="button" className="fo-outline-button" disabled={!editable} onClick={() => setPanel("payment")}><CreditCard size={16}/>Add Payment</button>
        <button type="button" className="fo-outline-button" disabled={!editable} onClick={() => setPanel("charge")}><Plus size={16}/>Add Charges</button>
        <button type="button" className="fo-outline-button" disabled={!editable} onClick={() => setPanel("discount")}><Percent size={16}/>Apply Discount</button>
        <button type="button" className="fo-outline-button" disabled={!editable} onClick={() => setPanel("posting")}><BedDouble size={16}/>Room Charge Posting</button>
        <button type="button" className="fo-outline-button" onClick={() => setInvoiceOpen(true)}><Printer size={16}/>Print Invoice</button>
      </div>
      <div className="fo-table-wrap"><table className="fo-folio-table">
        <thead><tr><th>Day</th><th>Ref No.</th><th>Particulars</th><th>Description</th><th>User</th><th className="num">Amount</th><th aria-label="Actions"/></tr></thead>
        <tbody>{folio.transactions.length === 0 ? <tr><td colSpan={7} className="fo-empty">No transactions yet.</td></tr> : folio.transactions.map(t => <tr key={`${t.kind}-${t.id}`} className={`is-${t.kind}${t.void ? " is-void" : ""}`}>
          <td>{day(t.date)}</td>
          <td>{t.reference || "—"}</td>
          <td><strong>{t.particulars}</strong></td>
          <td className="fo-folio-desc">{t.description || ""}</td>
          <td>{t.user || "—"}</td>
          <td className={"num" + (t.amount < 0 ? " is-credit" : "")}>{signed(t.amount)}</td>
          <td className="fo-folio-rowact">{editable && (t.kind === "charge" || t.kind === "discount") && !t.void && <button type="button" className="fo-folio-void" title="Void transaction" onClick={() => setPanel({ void: t })}><Ban size={15}/>Void</button>}</td>
        </tr>)}</tbody>
      </table></div>
      <Totals folio={folio}/>
    </div>}

    {tab === "booking" && <div className="fo-folio-panel">
      <dl className="fo-folio-grid">
        <Field k="Reservation Number" v={r.reservation_code}/>
        <Field k="Status" v={label(r.status)}/>
        <Field k="Arrival Date" v={`${day(r.check_in_date)}${r.arrival_time ? " · " + r.arrival_time.slice(0, 5) : ""}`}/>
        <Field k="Departure Date" v={day(r.check_out_date)}/>
        <Field k="Booking Date" v={stamp(r.booked_at)}/>
        <Field k="Booked By" v={r.booked_by || "—"}/>
        <Field k="Room Type" v={r.room_category || "—"}/>
        <Field k="Room Number" v={r.room_number || "Not assigned"}/>
        <Field k="Rate Plan" v={r.rate_plan || "—"}/>
        <Field k="Pax" v={`${r.adults} adult${r.adults === 1 ? "" : "s"}, ${r.children} child${r.children === 1 ? "" : "ren"}`}/>
        <Field k="Rooms" v={String(r.rooms_count)}/>
        <Field k="Avg. Daily Rate" v={money(r.avg_daily_rate)}/>
        <Field k="Booking Source" v={r.booking_source || label(r.source)}/>
        <Field k="Business Source" v={r.business_source || "—"}/>
        <Field k="Market Code" v={r.market_code || "—"}/>
        <Field k="Group" v={r.is_group_booking ? r.group_name || "Group booking" : "—"}/>
        <Field k="Required Advance" v={money(r.required_advance_amount)}/>
        <Field k="Deposit Due" v={r.deposit_due_at ? stamp(r.deposit_due_at) : "—"}/>
        {r.checked_in_at && <Field k="Checked In At" v={stamp(r.checked_in_at)}/>}
        <Field k="Special Requests" v={r.special_requests || "—"} wide/>
        {r.notes && <Field k="Notes" v={r.notes} wide/>}
      </dl>
    </div>}

    {tab === "guest" && g && <GuestForm folio={folio} onSaved={() => done("Guest details saved")}/>}

    {tab === "charges" && <RoomCharges folio={folio} onUpdate={() => setPanel("nights")} editable={editable} selectedRef={selectedNights}/>}

    {tab === "audit" && <div className="fo-folio-panel">
      {folio.history.length === 0 ? <p className="fo-empty">No changes recorded yet.</p> : <ol className="fo-folio-audit">{folio.history.map(h => <li key={h.id}>
        <time>{stamp(h.at)}</time>
        <div><strong>{label(h.action)}</strong>{h.details && <p>{h.details}</p>}</div>
        <span>{h.user || "—"}</span>
      </li>)}</ol>}
    </div>}

    {panel === "charge" && <ChargeDrawer title="Add Charge" folio={folio} categories={options.charge_categories} onClose={() => setPanel(null)} onDone={() => done("Charge added to folio")}/>}
    {panel === "posting" && <ChargeDrawer title="Room Charge Posting" folio={folio} categories={["Room Charges", "Late Checkout Charges", "Day Use Charges", "No Show Revenue", "Cancellation Revenue"]} preset="Room Charges" onClose={() => setPanel(null)} onDone={() => done("Room charge posted")}/>}
    {panel === "payment" && <PaymentDrawer folio={folio} methods={options.payment_methods} onClose={() => setPanel(null)} onDone={() => done("Payment added")}/>}
    {panel === "discount" && <DiscountDrawer folio={folio} onClose={() => setPanel(null)} onDone={() => done("Discount applied")}/>}
    {panel === "amend" && <AmendDrawer folio={folio} onClose={() => setPanel(null)} onDone={() => done("Stay amended successfully")}/>}
    {panel === "move" && <MoveDrawer folio={folio} onClose={() => setPanel(null)} onDone={() => done("Room moved successfully")}/>}
    {panel === "nights" && <NightsDrawer folio={folio} selected={selectedNights.current} onClose={() => setPanel(null)} onDone={() => done("Changes updated successfully")}/>}
    {panel && typeof panel === "object" && <VoidDialog folio={folio} txn={panel.void} onClose={() => setPanel(null)} onDone={() => done("Transaction voided")}/>}

    {invoiceOpen && <InvoiceReceipt folio={folio} onClose={() => setInvoiceOpen(false)}/>}
    {toast && <p className="fo-folio-toast" role="status">{toast}</p>}
  </section>;
}

// Room-charge night selection is shared between the table and the Update Details drawer.
const selectedNights = { current: [] as string[] };

function HeroCard({ icon, label: title, value, sub }: { icon: ReactNode; label: string; value: string; sub: string }) {
  return <div className="fo-hero-card"><span className="fo-hero-icon">{icon}</span><div><small>{title}</small><strong>{value}</strong><em>{sub}</em></div></div>;
}

// Share of the bill already paid, drawn as a ring (like the occupancy ring in the design).
function PaidCard({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round(paid / total * 100)) : 0;
  const r = 15, c = 2 * Math.PI * r;
  return <div className="fo-hero-card is-ring">
    <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r={r} fill="none" stroke="#e3ebf8" strokeWidth="5"/><circle cx="20" cy="20" r={r} fill="none" stroke="#2a6df4" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * pct / 100} ${c}`} transform="rotate(-90 20 20)"/></svg>
    <div><small>Paid</small><strong>{pct}%</strong><em>Balance {money(Math.max(total - paid, 0))}</em></div>
  </div>;
}

function MenuItem({ icon, text, onClick, disabled }: { icon: ReactNode; text: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" role="menuitem" className="fo-folio-menuitem" disabled={disabled} onClick={onClick}>{icon}{text}</button>;
}

function Field({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return <div className={wide ? "is-wide" : undefined}><dt>{k}</dt><dd>{v}</dd></div>;
}

function Totals({ folio }: { folio: Folio }) {
  const t = folio.totals;
  return <dl className="fo-folio-totals">
    <div><dt>Room Charges</dt><dd>{money(t.room_charges)}</dd></div>
    <div><dt>Extra Charges</dt><dd>{money(t.extra_charges)}</dd></div>
    {t.taxes > 0 && <div><dt>Taxes</dt><dd>{money(t.taxes)}</dd></div>}
    <div><dt>Discounts</dt><dd>− {money(t.discounts)}</dd></div>
    <div className="is-total"><dt>Total</dt><dd>{money(t.total)}</dd></div>
    <div className="is-paid"><dt>Paid</dt><dd>{money(t.paid)}</dd></div>
    <div className="is-balance"><dt>Balance</dt><dd>{signed(t.balance)}</dd></div>
  </dl>;
}

function RoomCharges({ folio, onUpdate, editable, selectedRef }: { folio: Folio; onUpdate: () => void; editable: boolean; selectedRef: { current: string[] } }) {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { selectedRef.current = selected; }, [selected, selectedRef]);
  const all = folio.nights.map(n => n.stay_date);
  const toggle = (date: string) => setSelected(current => current.includes(date) ? current.filter(d => d !== date) : [...current, date]);
  return <div className="fo-folio-panel">
    <div className="fo-folio-toolbar">
      <button type="button" className="fo-button" disabled={!editable} onClick={onUpdate}><Pencil size={16}/>Update Details{selected.length ? ` (${selected.length})` : ""}</button>
      <span className="fo-folio-hint">{selected.length ? `${selected.length} night${selected.length === 1 ? "" : "s"} selected` : "Select nights to change only those, or update the whole stay."}</span>
    </div>
    <div className="fo-table-wrap"><table className="fo-folio-table">
      <thead><tr><th><input type="checkbox" aria-label="Select all nights" checked={selected.length === all.length && all.length > 0} onChange={event => setSelected(event.target.checked ? all : [])}/></th><th>Stay</th><th>Room</th><th>Rate Type</th><th>Pax (A/C)</th><th className="num">Charge</th></tr></thead>
      <tbody>{folio.nights.map(n => <tr key={n.id} className={selected.includes(n.stay_date) ? "is-selected" : undefined}>
        <td><input type="checkbox" aria-label={`Select ${n.stay_date}`} checked={selected.includes(n.stay_date)} onChange={() => toggle(n.stay_date)}/></td>
        <td>{day(n.stay_date)}</td>
        <td>{n.room_number || "—"} <small>{n.room_category || ""}</small></td>
        <td>{n.rate_plan || "—"}</td>
        <td>{n.adults}/{n.children}</td>
        <td className="num">{n.complimentary ? <span className="fo-folio-comp">Complimentary</span> : money(n.rate)}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}

/* ---------------- Side drawers (eZee-style right panel) ---------------- */
function Drawer({ title, subtitle, onClose, onSubmit, busy, error, submitLabel, children }: { title: string; subtitle?: string; onClose: () => void; onSubmit: (event: FormEvent) => void; busy: boolean; error: string; submitLabel: string; children: ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input:not([disabled]),select:not([disabled]),textarea")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return <div className="fo-drawer-backdrop" onClick={() => !busy && onClose()}>
    <form ref={ref} className="fo-drawer" role="dialog" aria-label={title} onClick={event => event.stopPropagation()} onSubmit={onSubmit}>
      <header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="fo-icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X size={19}/></button></header>
      <div className="fo-drawer-body">{children}</div>
      {error && <p className="fo-api-error" role="alert">{error}</p>}
      <footer><button type="button" className="fo-outline-button" disabled={busy} onClick={onClose}>Cancel</button><button className="fo-button" disabled={busy}>{busy ? <><LoaderCircle size={16}/>Saving…</> : submitLabel}</button></footer>
    </form>
  </div>;
}

function useAction(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = (task: () => Promise<unknown>) => async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await task(); onDone(); } catch (err) { setError(errorText(err, "Something went wrong.")); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

function BalanceLine({ folio }: { folio: Folio }) {
  return <div className="fo-drawer-balance"><span>Total {money(folio.totals.total)}</span><span>Paid {money(folio.totals.paid)}</span><strong>Balance {signed(folio.totals.balance)}</strong></div>;
}

function ChargeDrawer({ title, folio, categories, preset, onClose, onDone }: { title: string; folio: Folio; categories: string[]; preset?: string; onClose: () => void; onDone: () => void }) {
  const r = folio.reservation;
  const [form, setForm] = useState({ posted_on: todayIso(), category: preset || "", reference: "", quantity: 1, unit_amount: preset ? folio.reservation.avg_daily_rate || 0 : 0, discount: 0, tax_inclusive: true, description: "" });
  const { busy, error, run } = useAction(onDone);
  const net = form.quantity * form.unit_amount - form.discount;
  return <Drawer title={title} subtitle={`Folio: ${r.folio_number || r.reservation_code} · ${r.guest?.first_name || ""} ${r.guest?.last_name || ""}`} onClose={onClose} busy={busy} error={error} submitLabel="Add"
    onSubmit={run(() => addFolioCharge(r.id, { ...form, reference: form.reference || undefined, description: form.description || undefined }))}>
    <label>Date<input type="date" required value={form.posted_on} onChange={e => setForm({ ...form, posted_on: e.target.value })}/></label>
    <label>{preset ? "Sub Type" : "Charge"}<select required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}><option value="">-Select-</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
    <label>Receipt / Voucher No.<input value={form.reference} maxLength={60} placeholder="e.g. laundry docket no., minibar slip no." onChange={e => setForm({ ...form, reference: e.target.value })}/></label>
    <p className="fo-drawer-hint">Optional. The number on the paper bill or voucher for this charge, so it can be matched later.</p>
    <div className="fo-drawer-row">
      <label>Qty<input type="number" min={1} required value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })}/></label>
      <label>Amount (₹)<input type="number" min={1} required value={form.unit_amount || ""} onChange={e => setForm({ ...form, unit_amount: Number(e.target.value) })}/></label>
    </div>
    <label>Discount (₹)<input type="number" min={0} value={form.discount} onChange={e => setForm({ ...form, discount: Number(e.target.value) })}/></label>
    <label className="fo-checkbox"><input type="checkbox" checked={form.tax_inclusive} onChange={e => setForm({ ...form, tax_inclusive: e.target.checked })}/>Tax inclusive</label>
    <label>Comment<textarea value={form.description} maxLength={1000} placeholder={preset ? "e.g. Charge for 2nd night (early check-out, full stay as per policy)" : ""} onChange={e => setForm({ ...form, description: e.target.value })}/></label>
    <p className="fo-drawer-net">Net amount <strong>{money(Math.max(net, 0))}</strong></p>
  </Drawer>;
}

function PaymentDrawer({ folio, methods, onClose, onDone }: { folio: Folio; methods: string[]; onClose: () => void; onDone: () => void }) {
  const r = folio.reservation;
  const [form, setForm] = useState({ amount: Math.max(folio.totals.balance, 0), payment_method: "", reference_number: "", notes: "" });
  const { busy, error, run } = useAction(onDone);
  return <Drawer title="Add Payment" subtitle={`Folio: ${r.folio_number || r.reservation_code}`} onClose={onClose} busy={busy} error={error} submitLabel="Add Payment"
    onSubmit={run(() => addFolioPayment(r.id, { amount: form.amount, payment_method: form.payment_method, reference_number: form.reference_number || undefined, notes: form.notes || undefined }))}>
    <BalanceLine folio={folio}/>
    <label>Type<select required value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}><option value="">-Select-</option>{(methods.length ? methods : ["cash", "card", "upi", "bank_transfer", "city_ledger", "other"]).map(m => <option key={m} value={m}>{m === "upi" ? "UPI" : label(m)}</option>)}</select></label>
    <label>Amount (₹)<input type="number" min={1} max={Math.max(folio.totals.balance, 1)} required value={form.amount || ""} onChange={e => setForm({ ...form, amount: Number(e.target.value) })}/></label>
    <p className="fo-drawer-hint">Enter part of the balance to settle a partial payment before check-out.</p>
    <label>Receipt / Reference No.<input value={form.reference_number} maxLength={100} placeholder="e.g. UPI transaction ID, card slip no., receipt no." onChange={e => setForm({ ...form, reference_number: e.target.value })}/></label>
    <label>Comment<textarea value={form.notes} maxLength={1000} placeholder="e.g. Payment for first 2 nights" onChange={e => setForm({ ...form, notes: e.target.value })}/></label>
  </Drawer>;
}

function DiscountDrawer({ folio, onClose, onDone }: { folio: Folio; onClose: () => void; onDone: () => void }) {
  const r = folio.reservation;
  const [mode, setMode] = useState<"amount" | "percent">("amount");
  const [value, setValue] = useState(0);
  const [reason, setReason] = useState("");
  const amount = mode === "amount" ? value : Math.round(folio.totals.total * value / 100);
  const { busy, error, run } = useAction(onDone);
  return <Drawer title="Apply Discount" onClose={onClose} busy={busy} error={error} submitLabel="Apply" onSubmit={run(() => applyFolioDiscount(r.id, amount, reason))}>
    <BalanceLine folio={folio}/>
    <div className="fo-drawer-row">
      <label>Discount in<select value={mode} onChange={e => setMode(e.target.value as "amount" | "percent")}><option value="amount">Amount (₹)</option><option value="percent">Percent (%)</option></select></label>
      <label>{mode === "amount" ? "Amount (₹)" : "Percent (%)"}<input type="number" min={1} max={mode === "percent" ? 100 : undefined} required value={value || ""} onChange={e => setValue(Number(e.target.value))}/></label>
    </div>
    <label>Reason<input required minLength={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Corporate rate, service recovery"/></label>
    <p className="fo-drawer-net">Discount <strong>{money(amount)}</strong></p>
  </Drawer>;
}

function AmendDrawer({ folio, onClose, onDone }: { folio: Folio; onClose: () => void; onDone: () => void }) {
  const r = folio.reservation;
  const inHouse = r.status === "checked_in";
  const [arrival, setArrival] = useState(r.check_in_date);
  const [departure, setDeparture] = useState(r.check_out_date);
  const [override, setOverride] = useState(false);
  const [rate, setRate] = useState(r.avg_daily_rate);
  const nights = nightsBetween(arrival, departure);
  const { busy, error, run } = useAction(onDone);
  return <Drawer title="Amend Stay" subtitle="Extend or shorten the stay" onClose={onClose} busy={busy} error={error} submitLabel="Save"
    onSubmit={run(() => amendStay(r.id, { check_in_date: inHouse ? undefined : arrival, check_out_date: departure, override_rate: override ? rate : null }))}>
    <label>Arrival<input type="date" required disabled={inHouse} value={arrival} onChange={e => { setArrival(e.target.value); if (departure <= e.target.value) setDeparture(addDays(e.target.value, 1)); }}/></label>
    {inHouse && <p className="fo-drawer-hint">Guest is in house, so the arrival date is fixed.</p>}
    <div className="fo-drawer-row">
      <label>Departure<input type="date" required min={addDays(arrival, 1)} value={departure} onChange={e => setDeparture(e.target.value)}/></label>
      <label>Nights<input type="number" min={1} required value={nights > 0 ? nights : ""} onChange={e => { const n = Number(e.target.value); if (n > 0) setDeparture(addDays(arrival, n)); }}/></label>
    </div>
    <p className="fo-drawer-hint">Was {r.nights} night{r.nights === 1 ? "" : "s"} ({day(r.check_in_date)} → {day(r.check_out_date)}). New nights use the last night's rate.</p>
    <label className="fo-checkbox"><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)}/>Override room rate</label>
    {override && <label>Rate per night (₹)<input type="number" min={0} required value={rate} onChange={e => setRate(Number(e.target.value))}/></label>}
  </Drawer>;
}

function MoveDrawer({ folio, onClose, onDone }: { folio: Folio; onClose: () => void; onDone: () => void }) {
  const r = folio.reservation;
  const start = r.status === "checked_in" && todayIso() > r.check_in_date ? todayIso() : r.check_in_date;
  const [types, setTypes] = useState<AvailableRoomType[] | null>(null);
  const [category, setCategory] = useState("");
  const [room, setRoom] = useState("");
  const [override, setOverride] = useState(false);
  const [rate, setRate] = useState(r.avg_daily_rate);
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction(onDone);
  useEffect(() => { getRoomAvailability(start, r.check_out_date, r.adults).then(setTypes).catch(() => setTypes([])); }, [start, r.check_out_date, r.adults]);
  const rooms = useMemo(() => (types?.find(t => t.room_category === category)?.room_numbers || []).filter(n => n !== r.room_number), [types, category, r.room_number]);
  return <Drawer title="Room Move" subtitle={`Current: Room ${r.room_number || "unassigned"} · ${r.room_category || ""}`} onClose={onClose} busy={busy} error={error} submitLabel="Move Room"
    onSubmit={run(() => moveRoom(r.id, { room_category: category, room_number: room, override_rate: override ? rate : null, reason: reason || undefined }))}>
    <p className="fo-drawer-hint">Moves the guest from {day(start)} until departure. Earlier nights stay in the current room.</p>
    <label>Room Type<select required value={category} onChange={e => { setCategory(e.target.value); setRoom(""); }}>
      <option value="">{types == null ? "Loading…" : "-Select-"}</option>
      {types?.map(t => <option key={t.room_category} value={t.room_category}>{t.room_category} · {t.available_rooms} free</option>)}
    </select></label>
    <label>Room<select required value={room} disabled={!category} onChange={e => setRoom(e.target.value)}><option value="">-Select Room-</option>{rooms.map(n => <option key={n}>{n}</option>)}</select></label>
    {types && types.length === 0 && <p className="fo-drawer-hint">No rooms are free for the rest of this stay.</p>}
    <label className="fo-checkbox"><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)}/>Override room rate (e.g. upgrade charge)</label>
    {override && <label>Apply rate per night (₹)<input type="number" min={0} required value={rate} onChange={e => setRate(Number(e.target.value))}/></label>}
    <label>Reason<input value={reason} maxLength={500} placeholder="e.g. AC not working, upgrade on request" onChange={e => setReason(e.target.value)}/></label>
  </Drawer>;
}

function NightsDrawer({ folio, selected, onClose, onDone }: { folio: Folio; selected: string[]; onClose: () => void; onDone: () => void }) {
  const r = folio.reservation;
  const first = folio.nights.find(n => selected.includes(n.stay_date)) || folio.nights[0];
  const [scope, setScope] = useState<"selected" | "whole">(selected.length ? "selected" : "whole");
  const [ratePlan, setRatePlan] = useState(first?.rate_plan || r.rate_plan || "");
  const [adults, setAdults] = useState(first?.adults ?? r.adults);
  const [children, setChildren] = useState(first?.children ?? r.children);
  const [rate, setRate] = useState(first?.rate ?? r.avg_daily_rate);
  const [complimentary, setComplimentary] = useState(first?.complimentary ?? false);
  const { busy, error, run } = useAction(onDone);
  return <Drawer title="Update Details" subtitle="Change rate, rate type or adults/children" onClose={onClose} busy={busy} error={error} submitLabel="Apply"
    onSubmit={run(() => updateNights(r.id, { dates: scope === "selected" ? selected : null, rate, adults, children, rate_plan: ratePlan || undefined, complimentary }))}>
    <label>Rate Type<input list="fo-rate-plans" value={ratePlan} maxLength={100} onChange={e => setRatePlan(e.target.value)}/></label>
    <datalist id="fo-rate-plans"><option>Room Only</option><option>Continental Plan (CP)</option><option>Modified American Plan (MAP)</option><option>American Plan (AP)</option><option>European Plan (EP)</option></datalist>
    <div className="fo-drawer-row">
      <label>Adults<input type="number" min={1} max={20} required value={adults} onChange={e => setAdults(Number(e.target.value))}/></label>
      <label>Children<input type="number" min={0} max={20} required value={children} onChange={e => setChildren(Number(e.target.value))}/></label>
    </div>
    <label className="fo-checkbox"><input type="checkbox" checked={complimentary} onChange={e => setComplimentary(e.target.checked)}/>Complimentary room</label>
    <label>Rate per night (₹)<input type="number" min={0} required disabled={complimentary} value={rate} onChange={e => setRate(Number(e.target.value))}/></label>
    <fieldset className="fo-drawer-scope"><legend>Apply on</legend>
      <label className="fo-checkbox"><input type="radio" name="scope" disabled={!selected.length} checked={scope === "selected"} onChange={() => setScope("selected")}/>Selected dates{selected.length ? ` (${selected.length})` : ""}</label>
      <label className="fo-checkbox"><input type="radio" name="scope" checked={scope === "whole"} onChange={() => setScope("whole")}/>Whole stay ({folio.nights.length} night{folio.nights.length === 1 ? "" : "s"})</label>
    </fieldset>
  </Drawer>;
}

function VoidDialog({ folio, txn, onClose, onDone }: { folio: Folio; txn: FolioTransaction; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction(onDone);
  return <Drawer title="Void Transaction" subtitle={`${txn.particulars} · ${signed(txn.amount)}`} onClose={onClose} busy={busy} error={error} submitLabel="Void"
    onSubmit={run(() => voidFolioCharge(folio.reservation.id, txn.id, reason))}>
    <label>Reason<input required minLength={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Posted to wrong folio"/></label>
    <p className="fo-drawer-hint">The transaction stays on the folio, struck through, and is removed from the bill.</p>
  </Drawer>;
}

function GuestForm({ folio, onSaved }: { folio: Folio; onSaved: () => void }) {
  const g = folio.reservation.guest!;
  const [form, setForm] = useState({ first_name: g.first_name, last_name: g.last_name, mobile: g.mobile || "", email: g.email || "", address: g.address || "", nationality: g.nationality || "", identity_type: g.identity_type || "", identity_number: g.identity_number || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await updateGuest(g.id, Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v])));
      onSaved();
    } catch (err) { setError(errorText(err, "Unable to save guest details.")); } finally { setBusy(false); }
  };
  return <form className="fo-folio-panel fo-folio-guest" onSubmit={save}>
    <h3>Guest Information</h3>
    <div className="fo-folio-form">
      <label>First name<input required value={form.first_name} onChange={set("first_name")}/></label>
      <label>Last name<input required value={form.last_name} onChange={set("last_name")}/></label>
      <label>Mobile<input value={form.mobile} maxLength={20} onChange={set("mobile")}/></label>
      <label>Email<input type="email" value={form.email} onChange={set("email")}/></label>
      <label className="is-wide">Address<input value={form.address} onChange={set("address")}/></label>
      <label>Nationality<input value={form.nationality} onChange={set("nationality")}/></label>
    </div>
    <h3>Identity Information</h3>
    <div className="fo-folio-form">
      <label>ID Type<select value={form.identity_type} onChange={set("identity_type")}><option value="">-Select-</option>{["Aadhaar", "Passport", "Driving License", "Election Card", "PAN Card"].map(t => <option key={t}>{t}</option>)}</select></label>
      <label>ID Number<input value={form.identity_number} onChange={set("identity_number")}/></label>
      <p className="fo-drawer-hint is-wide">{g.has_identity_document ? "An ID document has been uploaded for this guest." : "No ID document uploaded yet — upload it during check-in."}</p>
    </div>
    {error && <p className="fo-api-error" role="alert">{error}</p>}
    <footer><button className="fo-button" disabled={busy}>{busy ? <><LoaderCircle size={16}/>Saving…</> : "Save Guest Details"}</button></footer>
  </form>;
}


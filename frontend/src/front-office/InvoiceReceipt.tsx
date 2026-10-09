import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, LoaderCircle, Printer, RotateCcw, X } from "lucide-react";
import { useHotelProfile } from "../lib/property";
import type { Folio } from "./folioApi";

const money = (value: number) => (value < 0 ? "-" : "") + "₹" + Math.abs(value).toLocaleString("en-IN");
const parse = (value: string) => { const [y, m, d] = value.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const dmy = (value: string) => parse(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const PRINT_MS = 3200; // how long the paper takes to feed out

type Line = { label: string; detail?: string; amount: number };

/** Receipt-style invoice that "prints" out of a printer slot, then can be sent to a real printer. */
export default function InvoiceReceipt({ folio, onClose }: { folio: Folio; onClose: () => void }) {
  const hotel = useHotelProfile();
  const r = folio.reservation;
  const t = folio.totals;
  const [run, setRun] = useState(0);          // bump to replay the animation
  const [printing, setPrinting] = useState(true);
  const [copied, setCopied] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    setPrinting(!reduceMotion);
    if (reduceMotion) return;
    const timer = window.setTimeout(() => setPrinting(false), PRINT_MS);
    return () => window.clearTimeout(timer);
  }, [run, reduceMotion]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Invoice lines: room nights grouped by rate, then posted charges and discounts (void ones left out).
  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    const nights = folio.nights.filter(n => !n.complimentary);
    const byRate = new Map<number, number>();
    for (const n of nights) byRate.set(n.rate, (byRate.get(n.rate) || 0) + 1);
    for (const [rate, count] of byRate) out.push({ label: `${count}X Room ${r.room_number || ""} ${r.room_category || ""}`.replace(/\s+/g, " ").trim(), detail: `${money(rate)} / night`, amount: rate * count });
    const comp = folio.nights.length - nights.length;
    if (comp) out.push({ label: `${comp}X Complimentary night`, amount: 0 });
    for (const tx of folio.transactions) {
      if (tx.void || (tx.kind !== "charge" && tx.kind !== "discount")) continue;
      out.push({ label: tx.kind === "discount" ? `Discount${tx.description ? ` (${tx.description})` : ""}` : `1X ${tx.particulars}`, amount: tx.amount });
    }
    return out;
  }, [folio, r.room_number, r.room_category]);
  const payments = folio.transactions.filter(tx => tx.kind === "payment");
  const invoiceNo = r.folio_number || r.reservation_code;
  const issued = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const guest = r.guest ? `${r.guest.first_name} ${r.guest.last_name}`.trim() : "Guest";
  const status = t.balance <= 0 ? "PAID" : t.paid > 0 ? "PART PAID" : "DUE";

  // Deterministic barcode bars from the invoice number.
  const bars = useMemo(() => Array.from(invoiceNo + invoiceNo).map((ch, i) => ({ w: (ch.charCodeAt(0) + i) % 3 + 1, gap: (ch.charCodeAt(0) * 7 + i) % 2 + 1 })), [invoiceNo]);

  const asText = () => [
    hotel?.name || "Hotel", `Invoice ${invoiceNo} · ${issued}`, `Guest: ${guest}`, `Stay: ${dmy(r.check_in_date)} – ${dmy(r.check_out_date)} (${r.nights} nights)`, "",
    ...lines.map(l => `${l.label.padEnd(34)} ${money(l.amount)}`), "",
    `Total ${money(t.total)}`, `Paid ${money(t.paid)}`, `Balance ${money(t.balance)}`,
  ].join("\n");
  const copy = async () => {
    try { await navigator.clipboard.writeText(asText()); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  const print = () => {
    document.body.classList.add("print-receipt");
    const cleanup = () => { document.body.classList.remove("print-receipt"); window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup);
    window.print();
    window.setTimeout(cleanup, 1500);
  };

  return <div className="rcpt-backdrop" onClick={onClose}>
    <section className="rcpt-window" role="dialog" aria-label={`Invoice ${invoiceNo}`} onClick={event => event.stopPropagation()}>
      <button type="button" className="rcpt-close" aria-label="Close" onClick={onClose}><X size={18}/></button>
      <h2>Invoice Print</h2>
      <p className="rcpt-sub">{printing ? "Printing your invoice…" : "Ready — print or copy the invoice."}</p>

      <div className="rcpt-printer">
        <div className="rcpt-slot"><i/></div>
        <div className="rcpt-feed">
          <div key={run} ref={paperRef} className={"rcpt-paper" + (reduceMotion ? "" : " is-animating")} style={{ animationDuration: `${PRINT_MS}ms` }}>
            <header className="rcpt-top"><span>{hotel?.name || "HOTEL"}</span><span>{status}</span></header>
            <p className="rcpt-guest">{guest.toUpperCase()}</p>
            <strong className="rcpt-total">{money(t.total)}</strong>
            <p className="rcpt-meta">{issued.toUpperCase()} | INVOICE {invoiceNo}</p>
            <p className="rcpt-meta">STAY {dmy(r.check_in_date).toUpperCase()} – {dmy(r.check_out_date).toUpperCase()} · {r.nights} NIGHT{r.nights === 1 ? "" : "S"}</p>
            <hr/>
            <ul className="rcpt-lines">{lines.map((l, i) => <li key={i}><span>{l.label}{l.detail && <small>{l.detail}</small>}</span><b>{money(l.amount)}</b></li>)}</ul>
            <hr/>
            <ul className="rcpt-lines is-sum">
              <li><span>Room charges</span><b>{money(t.room_charges)}</b></li>
              {t.extra_charges > 0 && <li><span>Extra charges</span><b>{money(t.extra_charges)}</b></li>}
              {t.taxes > 0 && <li><span>Tax</span><b>{money(t.taxes)}</b></li>}
              {t.discounts > 0 && <li><span>Discount</span><b>{money(-t.discounts)}</b></li>}
              {payments.map(p => <li key={p.id}><span>{p.particulars.replace("Payment · ", "Paid · ")}{p.reference ? ` (${p.reference})` : ""}</span><b>{money(p.amount)}</b></li>)}
            </ul>
            <hr/>
            <div className="rcpt-grand"><span>GRAND TOTAL</span><b>{money(t.total)}</b></div>
            <div className="rcpt-grand is-due"><span>BALANCE DUE</span><b>{money(Math.max(t.balance, 0))}</b></div>
            <p className="rcpt-thanks">THANK YOU FOR STAYING WITH {(hotel?.name || "US").toUpperCase()}!</p>
            <div className="rcpt-barcode" aria-hidden="true">{bars.map((b, i) => <i key={i} style={{ width: b.w, marginRight: b.gap }}/>)}</div>
            <p className="rcpt-code">{invoiceNo}</p>
          </div>
        </div>
      </div>

      <h3>{printing ? "Printing…" : "Receipt Printed"}</h3>
      <p className="rcpt-sub">{printing ? "Feeding paper" : "Ready to print a fresh copy anytime."}</p>
      <div className="rcpt-actions">
        <button type="button" className="rcpt-btn is-primary" disabled={printing} onClick={print}>{printing ? <><LoaderCircle size={16} className="rcpt-spin"/>Printing…</> : <><Printer size={16}/>Print</>}</button>
        <button type="button" className="rcpt-btn" onClick={() => void copy()}>{copied ? <><Check size={16}/>Copied</> : <><Copy size={16}/>Copy</>}</button>
        <button type="button" className="rcpt-btn" disabled={printing} onClick={() => setRun(n => n + 1)}><RotateCcw size={16}/>Reprint</button>
      </div>
    </section>
  </div>;
}

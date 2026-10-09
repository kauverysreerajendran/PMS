import { ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, BedDouble, BriefcaseBusiness, Building2, CalendarCheck, CalendarDays, ChartColumnBig, ChevronRight, ClipboardList, CreditCard, DoorOpen, FileText, LoaderCircle, LogIn, PencilLine, Plus, RefreshCw, TrendingDown, TrendingUp, Users, XCircle } from "lucide-react";
import { useSession } from "../lib/auth";
import { canUseFrontOffice } from "./access";
import { frontOfficeRequest } from "./reservationsApi";
import "./dashboard.css";

type Kpi = { value: number; change_pct?: number | null; change?: number; trend: number[] };
type Overview = {
  kpis: { total_rooms: Kpi; in_house: Kpi; check_ins_today: Kpi; check_outs_today: Kpi };
  arrivals_pending: number;
  occupancy: { total: number; occupied: number; available: number; cleaning: number; maintenance: number; percent: number; change_vs_last_week: number };
  revenue: { period: "week" | "month"; total: number; change_pct: number | null; days: { date: string; amount: number }[] };
  room_types: { name: string; rooms: number; occupied: number; bookings: number; revenue: number }[];
  booking_sources: { name: string; count: number }[];
  recent_bookings: { id: number; reservation_code: string; guest: string; room_number: string | null; room_category: string | null; check_in_date: string; check_out_date: string; status: string; total_amount: number | null }[];
  activity: { kind: string; at: string; reservation_code: string | null; guest: string; room_number: string | null; amount: number | null; details: string | null }[];
};
type Period = "week" | "month";

const money = (value: number) => "₹ " + value.toLocaleString("en-IN");
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
const longDate = (value: string) => new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
// Room photo crops from the hero image, as in the design.
const thumbCrops = ["-232px -52px", "-280px -48px", "-196px -60px", "-318px -58px"];
const shortDate = (value: string) => new Date(value + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const periodLabel: Record<Period, string> = { week: "This Week", month: "This Month" };
const occupancyColors = { occupied: "#2a6df4", available: "#9dc0f8", cleaning: "#f7c948", maintenance: "#b5c2d9" };
const sourceColors = ["#2a6df4", "#22b07d", "#7c5cf0", "#f5a524", "#9dc0f8"];
const statusTone: Record<string, string> = { checked_in: "in", checked_out: "done", confirmed: "booked", tentative: "pending", waiting: "pending", cancelled: "off", no_show: "off" };

// What each activity kind looks like in the timeline.
const activityStyles: Record<string, { tone: string; icon: ReactNode; title: (item: Overview["activity"][number]) => string }> = {
  booking: { tone: "blue", icon: <CalendarDays/>, title: () => "New booking received" },
  check_in: { tone: "green", icon: <LogIn/>, title: item => item.room_number ? `Room ${item.room_number} checked in` : "Guest checked in" },
  check_out: { tone: "amber", icon: <DoorOpen/>, title: item => item.room_number ? `Room ${item.room_number} checked out` : "Guest checked out" },
  payment: { tone: "indigo", icon: <CreditCard/>, title: item => item.amount ? `Payment received · ${money(item.amount)}` : "Payment received" },
  modified: { tone: "blue", icon: <PencilLine/>, title: () => "Booking updated" },
  cancelled: { tone: "red", icon: <XCircle/>, title: () => "Booking cancelled" },
  no_show: { tone: "red", icon: <XCircle/>, title: () => "Marked as no-show" },
};

export default function HotelDashboard() {
  const user = useSession();
  const navigate = useNavigate();
  const bookingsRef = useRef<HTMLElement>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const firstName = user?.name ? user.name.split(" ")[0] : (user?.username || "").replaceAll("_", " ");
  // Owners and front office managers can open the operational pages; everyone else stays on the dashboard.
  const canOperate = !!user && canUseFrontOffice(user.role);

  const load = () => {
    setLoading(true);
    setError("");
    frontOfficeRequest<Overview>(`/properties/me/overview?period=${period}`)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : "Unable to load dashboard data."))
      .finally(() => setLoading(false));
  };
  useEffect(load, [period]);

  const k = data?.kpis;
  const metrics = [
    { label: "Total Rooms", kpi: k?.total_rooms, tint: "blue", icon: <BedDouble strokeWidth={1.7}/> },
    { label: "In House Guests", kpi: k?.in_house, tint: "green", icon: <Users strokeWidth={1.7}/> },
    { label: "Check Ins Today", kpi: k?.check_ins_today, tint: "purple", icon: <CalendarCheck strokeWidth={1.7}/> },
    { label: "Check Outs Today", kpi: k?.check_outs_today, tint: "amber", icon: <DoorOpen strokeWidth={1.7}/> },
  ];
  const occ = data?.occupancy;
  const occupancyItems = occ ? (Object.keys(occupancyColors) as (keyof typeof occupancyColors)[]).map(key => ({ key, value: occ[key] })) : [];
  const maxSource = Math.max(1, ...(data?.booking_sources || []).map(item => item.count));
  const sourceTotal = (data?.booking_sources || []).reduce((sum, item) => sum + item.count, 0);
  const periodSelect = <select className="sd-select" value={period} onChange={event => setPeriod(event.target.value as Period)} aria-label="Period">
    <option value="week">This Week</option><option value="month">This Month</option>
  </select>;

  return <div className="sd">
    <section className="sd-hero">
      <div className="sd-hero-copy">
        <p className="sd-eyebrow">WELCOME BACK{firstName && `, ${firstName.toUpperCase()}`}</p>
        <h1>Elevate Every Stay<br/>with <span>StayHub</span></h1>
        <p className="sd-tagline">Effortless operations. Happier guests. A more profitable hotel.</p>
        <div className="sd-hero-actions">
          {canOperate
            ? <button className="sd-btn-primary" onClick={() => navigate("/dashboard/reservations")}><Plus size={20}/>New Booking</button>
            : <button className="sd-btn-primary" onClick={load} disabled={loading}><RefreshCw size={18}/>Refresh</button>}
          {canOperate
            ? <button className="sd-btn-light" onClick={() => navigate("/dashboard/calendar")}><CalendarDays size={18}/>View Calendar</button>
            : <button className="sd-btn-light" onClick={() => bookingsRef.current?.scrollIntoView({ behavior: "smooth" })}><FileText size={18}/>View Bookings</button>}
        </div>
      </div>
      <aside className="sd-focus" aria-label="Today's focus">
        <small>Today's Focus</small>
        <p>Create<br/>Memorable<br/>Experiences</p>
        <hr/>
        <span>LUXURY <i/> COMFORT <i/> CARE</span>
      </aside>
      <div className="sd-dots" aria-hidden="true"><i className="on"/><i/><i/><i/></div>
    </section>

    {error && <p className="sd-error" role="alert">{error}</p>}

    <section className="sd-metrics">{metrics.map(metric => <article key={metric.label} className="sd-card sd-metric">
      <span className={`sd-metric-icon ${metric.tint}`}>{metric.icon}</span>
      <div className="sd-metric-text">
        <small>{metric.label}</small>
        <strong>{metric.kpi?.value ?? "—"}</strong>
      </div>
      <Sparkline values={metric.kpi?.trend || []} tint={metric.tint}/>
    </article>)}</section>

    <section className="sd-row sd-row-mid">
      <article className="sd-card sd-occupancy">
        <CardHead icon={<Building2/>} title="Room Occupancy"/>
        {!occ?.total ? <Empty loading={loading} text="Add rooms to see occupancy."/> : <>
          <div className="sd-occupancy-body">
            <Donut items={occupancyItems.map(item => ({ value: item.value, color: occupancyColors[item.key] }))} total={occ.total} center={`${occ.percent}%`} caption="Occupied"/>
            <ul>{occupancyItems.map(item => <li key={item.key}><i style={{ background: occupancyColors[item.key] }}/>{label(item.key)}<b>{item.value}</b></li>)}</ul>
          </div>
          <a className="sd-occupancy-note" href={canOperate ? "/dashboard/room-status" : "/dashboard"}>
            {occ.change_vs_last_week >= 0 ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}
            <span>{occ.change_vs_last_week === 0 ? "Occupancy is the same as last week" : <>Occupancy is <b>{Math.abs(occ.change_vs_last_week)}% {occ.change_vs_last_week > 0 ? "higher" : "lower"}</b> than last week</>}</span>
            <ChevronRight size={18}/>
          </a>
        </>}
      </article>

      <article className="sd-card sd-revenue">
        <CardHead icon={<ChartColumnBig/>} title="Revenue Overview" action={periodSelect}/>
        <div className="sd-revenue-total">
          <strong>{data ? money(data.revenue.total) : "—"}</strong>
          {data?.revenue.change_pct != null && <em className={data.revenue.change_pct < 0 ? "down" : "up"}>{data.revenue.change_pct < 0 ? <ArrowDown size={15}/> : <ArrowUp size={15}/>}{Math.abs(data.revenue.change_pct)}%</em>}
          <small>Total Revenue</small>
        </div>
        {data && data.revenue.total > 0 ? <RevenueChart days={data.revenue.days}/> : <Empty loading={loading} text="No payments recorded in this period."/>}
      </article>

      <article className="sd-card sd-activity">
        <CardHead icon={<ClipboardList/>} title={data?.activity.length && data.activity.every(item => new Date(item.at).toDateString() === new Date().toDateString()) ? "Today's Activity" : "Recent Activity"} action={canOperate ? <a href="/dashboard/reservations">View All</a> : undefined}/>
        {!data?.activity.length ? <Empty loading={loading} text="No activity recorded yet."/> : <ol>{data.activity.map((item, index) => {
          const style = activityStyles[item.kind] || { tone: "blue", icon: <FileText/>, title: () => label(item.kind) };
          return <li key={index}>
            <i className={`sd-dot ${style.tone}`}/>
            <span className={`sd-activity-icon ${style.tone}`}>{style.icon}</span>
            <time>{formatTime(item.at)}</time>
            <div><strong>{style.title(item)}</strong><small>{[item.guest && `Guest: ${item.guest}`, item.reservation_code].filter(Boolean).join(" · ")}</small></div>
          </li>;
        })}</ol>}
      </article>
    </section>

    <section className="sd-row sd-row-bottom">
      <article className="sd-card sd-bookings" ref={bookingsRef}>
        <CardHead icon={<FileText/>} title="Recent Bookings" action={canOperate ? <a href="/dashboard/reservations">View All</a> : undefined} small/>
        {!data?.recent_bookings.length ? <Empty loading={loading} text="No bookings yet."/> : <div className="sd-table-wrap"><table>
          <thead><tr><th>#</th><th>Guest Name</th><th>Room</th><th>Check In</th><th>Check Out</th><th>Status</th></tr></thead>
          <tbody>{data.recent_bookings.map((item, index) => <tr key={item.id} title={item.reservation_code}>
            <td>{index + 1}</td>
            <td>{item.guest || "—"}</td>
            <td>{item.room_number || "—"}</td>
            <td>{longDate(item.check_in_date)}</td>
            <td>{longDate(item.check_out_date)}</td>
            <td><span className={`sd-pill ${statusTone[item.status] || "booked"}`}>{label(item.status)}</span></td>
          </tr>)}</tbody>
        </table></div>}
      </article>

      <article className="sd-card sd-room-types">
        <CardHead icon={<BedDouble/>} title="Room Type Performance" action={canOperate ? <a href="/dashboard/room-status">View All</a> : undefined} small/>
        {!data?.room_types.length ? <Empty loading={loading} text="No room types yet."/> : <ul>{data.room_types.map((item, index) => {
          const pct = item.rooms ? Math.round(item.occupied / item.rooms * 100) : 0;
          return <li key={item.name} title={`${item.occupied}/${item.rooms} occupied · ${item.bookings} booking${item.bookings === 1 ? "" : "s"} · ${money(item.revenue)}`}>
            <span className="sd-thumb" style={{ backgroundPosition: thumbCrops[index % thumbCrops.length] }}/>
            <span className="sd-room-name">{item.name}</span>
            <span className="sd-bar"><i style={{ width: `${pct}%` }}/></span>
            <b>{pct}%</b>
          </li>;
        })}</ul>}
      </article>

      <article className="sd-card sd-sources">
        <CardHead icon={<BriefcaseBusiness/>} title="Booking Sources" action={<span className="sd-head-note">{periodLabel[period]}</span>} small/>
        {!data?.booking_sources.length ? <Empty loading={loading} text="No bookings in this period."/> : <ul>{data.booking_sources.map((item, index) => <li key={item.name}>
          <i style={{ background: sourceColors[index % sourceColors.length] }}/>
          <span className="sd-room-name">{label(item.name)}</span>
          <span className="sd-bar"><i style={{ width: `${(item.count / maxSource) * 100}%`, background: sourceColors[index % sourceColors.length] }}/></span>
          <b>{Math.round(item.count / sourceTotal * 100)}%</b>
        </li>)}</ul>}
      </article>
    </section>
  </div>;
}

function formatTime(iso: string) {
  const moment = new Date(iso);
  const time = moment.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
  return moment.toDateString() === new Date().toDateString() ? time : `${moment.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}, ${time}`;
}

const sparkColors: Record<string, string> = { blue: "#2a6df4", green: "#22b07d", purple: "#7c5cf0", amber: "#f5a524" };
function Sparkline({ values, tint }: { values: number[]; tint: string }) {
  const width = 120, height = 46;
  const points = values.length > 1 ? values : [0, 0];
  const max = Math.max(...points), min = Math.min(...points);
  if (max === min) return null; // no movement: a flat line just looks like a stray rule
  const range = max - min || 1;
  const coords = points.map((value, index) => [index / (points.length - 1) * width, height - 4 - ((value - min) / range) * (height - 12)]);
  const line = coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${(max === min ? height - 6 : y).toFixed(1)}`).join(" ");
  const color = sparkColors[tint];
  return <svg className="sd-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={`sd-spark-${tint}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#sd-spark-${tint})`}/>
    <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

function CardHead({ icon, title, action, small }: { icon: ReactNode; title: string; action?: ReactNode; small?: boolean }) {
  return <header className={"sd-card-head" + (small ? " small" : "")}>
    <span className="sd-head-icon">{icon}</span>
    <h2>{title}</h2>
    {action && <div className="sd-head-action">{action}</div>}
  </header>;
}

function Empty({ loading, text }: { loading: boolean; text: string }) {
  return <p className="sd-empty">{loading ? <><LoaderCircle size={16}/>Loading…</> : text}</p>;
}

function Donut({ items, total, center, caption }: { items: { value: number; color: string }[]; total: number; center: string; caption: string }) {
  const radius = 72, circumference = 2 * Math.PI * radius;
  let offset = 0;
  return <div className="sd-donut">
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r={radius} fill="none" stroke="#e9eef6" strokeWidth="26"/>
      <g transform="rotate(-90 100 100)">{items.map((item, index) => {
        const length = total ? (item.value / total) * circumference : 0;
        const segment = <circle key={index} cx="100" cy="100" r={radius} fill="none" stroke={item.color} strokeWidth="26" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset}/>;
        offset += length;
        return segment;
      })}</g>
    </svg>
    <div><strong>{center}</strong><span>{caption}</span></div>
  </div>;
}

function RevenueChart({ days }: { days: { date: string; amount: number }[] }) {
  const peak = days.reduce((best, day, index) => day.amount > days[best].amount ? index : best, 0);
  const [active, setActive] = useState(peak);
  useEffect(() => setActive(peak), [peak, days]);
  const left = 44, top = 34, width = 462, height = 104;
  const max = Math.max(...days.map(day => day.amount)) || 1;
  const step = width / days.length;
  const barWidth = step * 0.56;
  const y = (value: number) => top + height - (value / max) * height;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(days.length / 6);
  const current = days[Math.min(active, days.length - 1)];
  const activeX = left + active * step + step / 2;
  const tipX = Math.min(Math.max(activeX, left + 48), left + width - 48);
  const compact = (value: number) => value >= 1000 ? `${Math.round(value / 1000)}K` : String(Math.round(value));
  return <svg className="sd-revenue-chart" viewBox="0 0 514 164" onMouseLeave={() => setActive(peak)} role="img" aria-label="Daily payments received">
    <defs><linearGradient id="sd-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a6df4"/><stop offset="1" stopColor="#a9c8ff"/></linearGradient></defs>
    {ticks.map(tick => <g key={tick}>
      <line x1={left} x2={left + width} y1={y(tick)} y2={y(tick)} className="sd-grid"/>
      <text x={left - 8} y={y(tick) + 3} textAnchor="end" className="sd-axis">{compact(tick)}</text>
    </g>)}
    {days.map((day, index) => <g key={day.date} onMouseEnter={() => setActive(index)}>
      <rect x={left + index * step} y={top} width={step} height={height} fill="transparent"/>
      <rect x={left + index * step + (step - barWidth) / 2} y={y(day.amount)} width={barWidth} height={top + height - y(day.amount)} rx="2" fill="url(#sd-bar)" opacity={index === active ? 1 : .88}/>
    </g>)}
    {days.map((day, index) => index % labelEvery === 0 && <text key={day.date} x={left + index * step + step / 2} y={top + height + 18} textAnchor="middle" className="sd-axis">{shortDate(day.date)}</text>)}
    <circle cx={activeX} cy={y(current.amount)} r="4" fill="#2a6df4" stroke="#fff" strokeWidth="2"/>
    <g className="sd-tip" transform={`translate(${tipX - 48} ${Math.max(y(current.amount) - 40, -6)})`}>
      <rect width="96" height="32" rx="6"/>
      <text x="48" y="13" textAnchor="middle" className="strong">{money(current.amount)}</text>
      <text x="48" y="25" textAnchor="middle">{shortDate(current.date)}</text>
    </g>
  </svg>;
}

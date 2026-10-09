import { ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, BedDouble, Building2, CalendarCheck, CalendarDays, ChartColumnBig, ChevronRight, ClipboardList, CreditCard, DoorOpen, FileText, Plus, Sparkles, Star, TrendingUp, Users } from "lucide-react";
import { useSession } from "../lib/auth";
import { isFrontOfficeManager } from "./access";
import "./dashboard.css";

// Sample figures mirroring the reference design. Swap these for API data as endpoints become available.
const metrics = [
  { label: "Total Rooms", value: 48, delta: "12%", up: true, note: "vs last week", tint: "blue", icon: <BedDouble strokeWidth={1.7}/>, spark: [18, 20, 19, 26, 34, 33, 30, 34, 42, 48] },
  { label: "In House Guests", value: 28, delta: "8%", up: true, note: "vs last week", tint: "green", icon: <Users strokeWidth={1.7}/>, spark: [12, 13, 14, 16, 22, 30, 36, 40, 39, 36] },
  { label: "Check Ins Today", value: 6, delta: "2", up: true, note: "vs yesterday", tint: "purple", icon: <CalendarCheck strokeWidth={1.7}/>, spark: [10, 11, 13, 15, 20, 28, 34, 40, 42, 40] },
  { label: "Check Outs Today", value: 4, delta: "1", up: false, note: "vs yesterday", tint: "amber", icon: <DoorOpen strokeWidth={1.7}/>, spark: [10, 11, 12, 15, 21, 27, 33, 38, 41, 40] },
];
const occupancy = [
  { label: "Occupied", value: 28, color: "#2a6df4" },
  { label: "Available", value: 16, color: "#9dc0f8" },
  { label: "Cleaning", value: 2, color: "#f7cf62" },
  { label: "Maintenance", value: 2, color: "#b5c2d9" },
];
const revenue = [64, 90, 78, 118, 96, 152, 108, 133, 92, 138, 120, 149, 104, 158, 112, 152, 141, 182, 112, 140, 101, 154, 118, 126, 98, 114, 103, 112, 97, 102, 145];
const activity = [
  { time: "09:15 AM", title: "New booking received", detail: "Guest: Arjun Mehta", icon: <CalendarDays/>, tint: "blue" },
  { time: "10:00 AM", title: "Room 101 checked in", detail: "Guest: Priya Sharma", icon: <CalendarCheck/>, tint: "blue", dot: "green" },
  { time: "11:00 AM", title: "Room 307 checked out", detail: "Guest: Rohan Iyer", icon: <DoorOpen/>, tint: "amber" },
  { time: "02:30 PM", title: "Housekeeping completed", detail: "Room 205", icon: <Sparkles/>, tint: "green" },
  { time: "04:45 PM", title: "Payment received", detail: "Booking ID: BK1024", icon: <CreditCard/>, tint: "indigo", dot: "amber" },
];
const bookings = [
  { guest: "Arjun Mehta", room: 101, checkIn: "05 Oct 2026", checkOut: "07 Oct 2026", status: "Checked In" },
  { guest: "Priya Sharma", room: 203, checkIn: "05 Oct 2026", checkOut: "06 Oct 2026", status: "Checked In" },
  { guest: "Rohan Iyer", room: 307, checkIn: "04 Oct 2026", checkOut: "05 Oct 2026", status: "Checked Out" },
];
const roomTypes = [
  { name: "Deluxe", value: 85, crop: "-232px -52px" },
  { name: "Superior", value: 72, crop: "-280px -48px" },
  { name: "Suite", value: 60, crop: "-196px -60px" },
  { name: "Standard", value: 45, crop: "-318px -58px" },
];
const ratings = [
  { stars: 5, value: 68, color: "#2a6df4" },
  { stars: 4, value: 22, color: "#2a6df4" },
  { stars: 3, value: 7, color: "#f7c948" },
  { stars: 2, value: 2, color: "#f59e2c" },
  { stars: 1, value: 1, color: "#ef3a45" },
];

export default function ReferenceDashboard() {
  const user = useSession();
  const navigate = useNavigate();
  const firstName = (user?.name || user?.username || "").split(" ")[0];
  // Front-office pages are only routable for that role; other roles stay on the dashboard.
  const link = (path: string) => user && isFrontOfficeManager(user.role) ? path : "/dashboard";
  return <div className="sd">
    <section className="sd-hero">
      <div className="sd-hero-copy">
        <p className="sd-eyebrow">WELCOME BACK{firstName && `, ${firstName.toUpperCase()}`}</p>
        <h1>Elevate Every Stay<br/>with <span>StayHub</span></h1>
        <p className="sd-tagline">Effortless operations. Happier guests. A more profitable hotel.</p>
        <div className="sd-hero-actions">
          <button className="sd-btn-primary" onClick={() => navigate(link("/dashboard/reservations"))}><Plus size={20}/>New Booking</button>
          <button className="sd-btn-light" onClick={() => navigate(link("/dashboard/reservations"))}><CalendarDays size={19}/>View Calendar</button>
        </div>
      </div>
      <aside className="sd-focus">
        <small>Today's Focus</small>
        <p>Create<br/>Memorable<br/>Experiences</p>
        <hr/>
        <span>LUXURY <i/> COMFORT <i/> CARE</span>
      </aside>
      <div className="sd-dots" aria-hidden="true"><i className="on"/><i/><i/><i/></div>
    </section>

    <section className="sd-metrics">{metrics.map(metric => <article key={metric.label} className="sd-card sd-metric">
      <span className={`sd-metric-icon ${metric.tint}`}>{metric.icon}</span>
      <div className="sd-metric-text">
        <small>{metric.label}</small>
        <strong>{metric.value}</strong>
        <em className={metric.up ? "up" : "down"}>{metric.up ? <ArrowUp size={14} strokeWidth={2.6}/> : <ArrowDown size={14} strokeWidth={2.6}/>}{metric.delta}</em>
        <span>{metric.note}</span>
      </div>
      <Sparkline points={metric.spark} tint={metric.tint}/>
    </article>)}</section>

    <section className="sd-row sd-row-mid">
      <article className="sd-card sd-occupancy">
        <CardHead icon={<Building2/>} title="Room Occupancy" action={<PeriodSelect value="This Week"/>}/>
        <div className="sd-occupancy-body">
          <Donut/>
          <ul>{occupancy.map(item => <li key={item.label}><i style={{ background: item.color }}/>{item.label}<b>{item.value}</b></li>)}</ul>
        </div>
        <a className="sd-occupancy-note" href={link("/dashboard/room-status")}><TrendingUp size={20}/><span>Occupancy is <b>12% higher</b> than last week</span><ChevronRight size={18}/></a>
      </article>

      <article className="sd-card sd-revenue">
        <CardHead icon={<ChartColumnBig/>} title="Revenue Overview" action={<PeriodSelect value="This Month"/>}/>
        <div className="sd-revenue-total"><strong>₹ 4,82,000</strong><em><ArrowUp size={16} strokeWidth={2.6}/>18%</em><small>Total Revenue</small></div>
        <RevenueChart/>
      </article>

      <article className="sd-card sd-activity">
        <CardHead icon={<ClipboardList/>} title="Today's Activity" action={<a href={link("/dashboard/reservations")}>View All</a>}/>
        <ol>{activity.map(item => <li key={item.time}>
          <i className={`sd-dot ${item.dot || item.tint}`}/>
          <span className={`sd-activity-icon ${item.tint}`}>{item.icon}</span>
          <time>{item.time}</time>
          <div><strong>{item.title}</strong><small>{item.detail}</small></div>
        </li>)}</ol>
      </article>
    </section>

    <section className="sd-row sd-row-bottom">
      <article className="sd-card sd-bookings">
        <CardHead icon={<FileText/>} title="Recent Bookings" action={<a href={link("/dashboard/reservations")}>View All</a>} small/>
        <div className="sd-table-wrap"><table>
          <thead><tr><th>#</th><th>Guest Name</th><th>Room</th><th>Check In</th><th>Check Out</th><th>Status</th></tr></thead>
          <tbody>{bookings.map((item, index) => <tr key={item.guest}><td>{index + 1}</td><td>{item.guest}</td><td>{item.room}</td><td>{item.checkIn}</td><td>{item.checkOut}</td><td><span className={`sd-pill ${item.status === "Checked In" ? "in" : "out"}`}>{item.status}</span></td></tr>)}</tbody>
        </table></div>
      </article>

      <article className="sd-card sd-room-types">
        <CardHead icon={<BedDouble/>} title="Room Type Performance" action={<a href={link("/dashboard/room-status")}>View All</a>} small/>
        <ul>{roomTypes.map(item => <li key={item.name}>
          <span className="sd-thumb" style={{ backgroundPosition: item.crop }}/>
          <span className="sd-room-name">{item.name}</span>
          <span className="sd-bar"><i style={{ width: `${item.value}%` }}/></span>
          <b>{item.value}%</b>
        </li>)}</ul>
      </article>

      <article className="sd-card sd-satisfaction">
        <CardHead icon={<Star/>} title="Guest Satisfaction" action={<PeriodSelect value="This Month" compact/>} small/>
        <div className="sd-satisfaction-body">
          <div className="sd-score">
            <strong>4.7<small>/5</small></strong>
            <Stars rating={4.7}/>
            <span>Based on 128 reviews</span>
          </div>
          <ul>{ratings.map(item => <li key={item.stars}>
            <span>{item.stars}</span><Star size={11} fill="#f5b70a" stroke="#f5b70a"/>
            <span className="sd-bar"><i style={{ width: `${item.value}%`, background: item.color }}/></span>
            <b>{item.value}%</b>
          </li>)}</ul>
        </div>
      </article>
    </section>
  </div>;
}

function CardHead({ icon, title, action, small }: { icon: ReactNode; title: string; action?: ReactNode; small?: boolean }) {
  return <header className={"sd-card-head" + (small ? " small" : "")}>
    <span className="sd-head-icon">{icon}</span>
    <h2>{title}</h2>
    {action && <div className="sd-head-action">{action}</div>}
  </header>;
}

function PeriodSelect({ value, compact }: { value: string; compact?: boolean }) {
  return <select className={"sd-select" + (compact ? " compact" : "")} defaultValue={value} aria-label="Period">
    <option>This Week</option><option>This Month</option><option>This Year</option>
  </select>;
}

const sparkColors: Record<string, string> = { blue: "#2a6df4", green: "#22b07d", purple: "#6a4fe0", amber: "#f5a524" };
function Sparkline({ points, tint }: { points: number[]; tint: string }) {
  const width = 130, height = 56, max = Math.max(...points);
  const xy = points.map((value, index) => [index * (width / (points.length - 1)), height - 4 - (value / max) * (height - 10)]);
  const line = xy.reduce((path, [x, y], index) => {
    if (index === 0) return `M${x},${y}`;
    const [px, py] = xy[index - 1];
    const cx = (px + x) / 2;
    return `${path} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, "");
  const color = sparkColors[tint];
  return <svg className="sd-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={`spark-${tint}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#spark-${tint})`}/>
    <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
  </svg>;
}

function Donut() {
  const total = occupancy.reduce((sum, item) => sum + item.value, 0);
  const radius = 72, circumference = 2 * Math.PI * radius;
  // Draw clockwise from 12 o'clock: occupied, maintenance, available, cleaning.
  const order = [occupancy[0], occupancy[3], occupancy[1], occupancy[2]];
  let offset = 0;
  return <div className="sd-donut">
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <g transform="rotate(-90 100 100)">{order.map(item => {
        const length = (item.value / total) * circumference;
        const segment = <circle key={item.label} cx="100" cy="100" r={radius} fill="none" stroke={item.color} strokeWidth="26" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset}/>;
        offset += length;
        return segment;
      })}</g>
    </svg>
    <div><strong>78%</strong><span>Occupied</span></div>
  </div>;
}

function RevenueChart() {
  const [active, setActive] = useState(17);
  const left = 36, top = 34, width = 470, height = 104, max = 200;
  const step = width / revenue.length;
  const barWidth = step * 0.56;
  const y = (value: number) => top + height - (value / max) * height;
  const ticks = [0, 50, 100, 150, 200];
  const labels = [0, 4, 9, 14, 19, 24, 30];
  const activeX = left + active * step + step / 2;
  const tipX = Math.min(Math.max(activeX, left + 44), left + width - 44);
  return <svg className="sd-revenue-chart" viewBox="0 0 514 164" onMouseLeave={() => setActive(17)} role="img" aria-label="Daily revenue for October">
    <defs><linearGradient id="sd-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a6df4"/><stop offset="1" stopColor="#a9c8ff"/></linearGradient></defs>
    {ticks.map(tick => <g key={tick}>
      <line x1={left} x2={left + width} y1={y(tick)} y2={y(tick)} className="sd-grid"/>
      <text x={left - 8} y={y(tick) + 3} textAnchor="end" className="sd-axis">{tick ? `${tick}K` : "0"}</text>
    </g>)}
    {revenue.map((value, index) => <g key={index} onMouseEnter={() => setActive(index)}>
      <rect x={left + index * step} y={top} width={step} height={height} fill="transparent"/>
      <rect x={left + index * step + (step - barWidth) / 2} y={y(value)} width={barWidth} height={top + height - y(value)} rx="2" fill="url(#sd-bar)" opacity={index === active ? 1 : .88}/>
    </g>)}
    {labels.map(index => <text key={index} x={left + index * step + step / 2} y={top + height + 18} textAnchor="middle" className="sd-axis">{index + 1} Oct</text>)}
    <circle cx={activeX} cy={y(revenue[active])} r="4" fill="#2a6df4" stroke="#fff" strokeWidth="2"/>
    <g className="sd-tip" transform={`translate(${tipX - 44} ${Math.max(y(revenue[active]) - 40, -6)})`}>
      <rect width="88" height="32" rx="6"/>
      <text x="44" y="13" textAnchor="middle" className="strong">₹ {(revenue[active] * 1000).toLocaleString("en-IN")}</text>
      <text x="44" y="25" textAnchor="middle">{active + 1} Oct</text>
    </g>
  </svg>;
}

function Stars({ rating }: { rating: number }) {
  return <span className="sd-stars" aria-label={`${rating} out of 5`}>{[0, 1, 2, 3, 4].map(index => {
    const fill = Math.min(Math.max(rating - index, 0), 1);
    return <span key={index}><Star size={20} stroke="#f5b70a" fill="#e8ecf3" strokeWidth={0}/><span style={{ width: `${fill * 100}%` }}><Star size={20} fill="#f5b70a" stroke="#f5b70a"/></span></span>;
  })}</span>;
}

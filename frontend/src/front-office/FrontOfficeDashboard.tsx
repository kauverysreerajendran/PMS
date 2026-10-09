import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, LogIn, LogOut, BedDouble, Search, CalendarDays, Users, ArrowRight } from "lucide-react";
import { useSession } from "../lib/auth";
import { getReservations, Reservation } from "./reservationsApi";

const metricIcons = [LogIn, LogOut, Users, BedDouble, CalendarDays, CalendarDays];
const quickActions = [
  { label: "New Reservation", slug: "reservations", icon: CalendarPlus },
  { label: "Check-In Guest", slug: "check-in", icon: LogIn },
  { label: "Check-Out Guest", slug: "check-out", icon: LogOut },
  { label: "Assign Room", slug: "room-assignment", icon: BedDouble },
  { label: "Search Guest", slug: "guests", icon: Search },
];
function Badge({ text }: { text: string }) {
  return <span className={"fo-badge " + (["Paid", "Confirmed", "Completed"].includes(text) ? "success" : "warning")}>{text}</span>;
}
export default function FrontOfficeDashboard() {
  const user = useSession()!;
  const date = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
  const [arrivals, setArrivals] = useState<Reservation[]>([]);
  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [arrivalsError, setArrivalsError] = useState("");
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(date));
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const departures = allReservations.filter(r => r.check_out_date === today && r.status === "checked_in").map(r => ({ room: r.room_number || "Unassigned", guest: `${r.guest.first_name} ${r.guest.last_name}`, time: r.check_out_date, payment: "Pending", status: "Pending" }));
  const roomStatuses = [
    { label: "Occupied", count: allReservations.filter(r => r.status === "checked_in").length, tone: "occupied" },
    { label: "Reserved", count: allReservations.filter(r => r.status === "confirmed").length, tone: "reserved" },
    { label: "Available", count: allReservations.filter(r => ["checked_out", "cancelled"].includes(r.status)).length, tone: "available" },
  ];
  useEffect(() => {
    getReservations("", "", today)
      .then(data => setArrivals(data.items))
      .catch(() => setArrivalsError("Unable to load live arrivals."));
    getReservations().then(data => setAllReservations(data.items)).catch(() => setArrivalsError("Unable to load live dashboard data."));
  }, [today]);
  return <>
    <section className="fo-welcome"><div className="fo-welcome-copy"><p className="fo-eyebrow">YOUR FRONT DESK, AT A GLANCE</p><h2>{greeting}, {user.name || user.username}</h2><p>Keep every arrival, departure and guest experience running smoothly.</p></div><div className="fo-date"><CalendarDays size={17}/>{date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}<span className="fo-sample">Sample dashboard</span></div></section>
    <section className="fo-metrics" aria-label="Daily summary">{[["Today's Arrivals", allReservations.filter(r => r.check_in_date === today && ["confirmed","tentative","waiting"].includes(r.status)).length, "Expected arrivals"],["Today's Departures", allReservations.filter(r => r.check_out_date === today && r.status === "checked_in").length, "Guests still in-house"],["Currently Occupied", allReservations.filter(r => r.status === "checked_in").length, "Checked-in reservations"],["Assigned Rooms", allReservations.filter(r => r.room_number && !["cancelled","checked_out"].includes(r.status)).length, "Active room allocations"],["Pending Check-Ins", allReservations.filter(r => r.check_in_date === today && ["confirmed","tentative","waiting"].includes(r.status)).length, "Arrivals awaiting check-in"],["Pending Check-Outs", allReservations.filter(r => r.check_out_date === today && r.status === "checked_in").length, "Guests awaiting checkout"]].slice(0,4).map(([label,value,note], i) => { const Icon = metricIcons[i]; return <article className="fo-metric" key={String(label)}><div className="fo-metric-top"><span>{label}</span><Icon size={19}/></div><strong>{String(value)}</strong><small>{note}</small></article>; })}</section>
    <section className="fo-command-grid">    <section className="fo-card fo-quick"><div className="fo-section-heading"><h2>Quick Actions</h2><span>Daily operations</span></div><div className="fo-quick-grid">{quickActions.map(({ label, slug, icon: Icon }) => <Link key={slug} to={"/dashboard/" + slug}><Icon size={19}/>{label}<ArrowRight size={15}/></Link>)}</div></section>
        <section className="fo-visual-grid"><article className="fo-card fo-occupancy-card"><div className="fo-section-heading"><h2>Occupancy Overview</h2><span>Live stays</span></div><div className="fo-occupancy-visual"><div className="fo-occupancy-ring"><strong>{allReservations.filter(r => r.status === "checked_in").length}</strong><small>occupied</small></div><div className="fo-occupancy-trend"><div className="fo-trend-heading"><strong>Room occupancy trend</strong><span>This week</span></div><svg viewBox="0 0 320 120" role="img" aria-label="Room occupancy trend"><path className="fo-chart-grid" d="M8 20H312M8 55H312M8 90H312"/><path className="fo-chart-area" d="M8 83 C48 72 55 66 94 70 S140 45 176 56 S222 77 250 48 S286 34 312 25 L312 100 L8 100Z"/><path className="fo-chart-line" d="M8 83 C48 72 55 66 94 70 S140 45 176 56 S222 77 250 48 S286 34 312 25"/><circle cx="176" cy="56" r="5" className="fo-chart-point"/><text x="164" y="42">Live</text></svg><div className="fo-chart-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div><div className="fo-visual-legend"><span><i className="occupied"/>Occupied<strong>{allReservations.filter(r => r.status === "checked_in").length}</strong></span><span><i className="reserved"/>Reserved<strong>{allReservations.filter(r => r.status === "confirmed").length}</strong></span><span><i className="available"/>Available<strong>{allReservations.filter(r => ["checked_out","cancelled"].includes(r.status)).length}</strong></span></div></div></article><article className="fo-card fo-activity-card"><div className="fo-section-heading"><h2>Operations Flow</h2><span>Today</span></div><div className="fo-flow"><div><strong>{arrivals.length}</strong><small>Arrivals</small></div><span className="fo-flow-line"/><div><strong>{allReservations.filter(r => r.status === "checked_in").length}</strong><small>In-house</small></div><span className="fo-flow-line"/><div><strong>{departures.length}</strong><small>Departures</small></div></div><div className="fo-flow-progress"><span style={{width: "50%"}}/></div><p className="fo-data-note">Track the guest journey from arrival through departure.</p></article></section>    </section>
    <section className="fo-card"><div className="fo-section-heading"><h2>Today's Arrivals <span className="fo-count">{arrivals.length}</span></h2><Link to="/dashboard/reservations">All reservations <ArrowRight size={14}/></Link></div>{arrivalsError && <p className="fo-api-error">{arrivalsError}</p>}<div className="fo-table-wrap"><table><thead><tr>{["Guest Name","Reservation ID","Room","Stay Dates","Booking Status","Action"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{arrivals.length === 0 ? <tr><td colSpan={6} className="fo-empty">No live arrivals scheduled for today.</td></tr> : arrivals.map(row => <tr key={row.id}><td><strong>{row.guest.first_name} {row.guest.last_name}</strong></td><td>{row.reservation_code}</td><td>{row.room_number || "Unassigned"}{row.room_category ? <small>{row.room_category}</small> : null}</td><td>{row.check_in_date}<small>to {row.check_out_date}</small></td><td><Badge text={formatStatus(row.status)}/></td><td className="fo-row-actions"><Link to={"/dashboard/reservations?reservation=" + row.id}>View</Link><Link className="fo-small-button" to={"/dashboard/check-in?reservation=" + row.id}>Check-In</Link></td></tr>)}</tbody></table></div></section>
    <div className="fo-lower-grid"><section className="fo-card"><div className="fo-section-heading"><h2>Today's Departures <span className="fo-count">9</span></h2><Link to="/dashboard/check-out">View all <ArrowRight size={14}/></Link></div><div className="fo-table-wrap"><table><thead><tr>{["Guest Name","Room","Departure Time","Payment Status","Checkout Status","Action"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{departures.map(row => <tr key={row.room}><td><strong>{row.guest}</strong></td><td>{row.room}</td><td>{row.time}</td><td><Badge text={row.payment}/></td><td><Badge text={row.status}/></td><td>{row.status === "Completed" ? <Link to="/dashboard/check-out">View</Link> : <Link className="fo-small-button" to={"/dashboard/check-out?room=" + row.room}>Check-Out</Link>}</td></tr>)}</tbody></table></div></section></div>
    <p className="fo-data-note">Sample values and guest records for layout preview. Live property data will be connected in the next phase.</p>
  </>;
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
}









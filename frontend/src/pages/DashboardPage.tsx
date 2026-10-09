import { useEffect, useRef, useState } from "react";
import { BarChart3, BedDouble, Bell, CalendarDays, ChevronDown, ClipboardCheck, DoorOpen, EllipsisVertical, Hotel, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Search, Settings, Sparkles, Users, UtensilsCrossed } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { useSession, signOut } from "../lib/auth";

const navItems = [[LayoutDashboard,"Dashboard"],[CalendarDays,"Bookings"],[BedDouble,"Rooms"],[Users,"Guests"],[Sparkles,"Housekeeping"],[UtensilsCrossed,"Food & Beverage"],[BarChart3,"Reports"],[Settings,"Settings"]] as const;
const metrics = [[BedDouble,"Total Rooms","48","↑ +12%","blue"],[Users,"In House Guests","28","↑ +8%","blue"],[CalendarDays,"Check Ins Today","6","↑ +2","green"],[DoorOpen,"Check Outs Today","4","↓ -1","orange"]] as const;
const bookings = [["101","Deluxe Room","Arun Kumar","arun@gmail.com","05 Oct 2026","06 Oct 2026","2","Checked In","checked"],["204","Executive Room","Priya Mehta","priya@gmail.com","05 Oct 2026","07 Oct 2026","1","In House","house"],["307","Standard Room","Suresh R","suresh@gmail.com","04 Oct 2026","05 Oct 2026","2","Checked Out","out"],["410","Suite","Nandini Iyer","nandini@gmail.com","05 Oct 2026","08 Oct 2026","1","In House","house"]] as const;

export default function DashboardPage() {
  const user = useSession(); const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!profileOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        profileButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileOpen]);
  const logout = () => { signOut(); navigate("/login", { replace: true }); };
  if (!user) return <Navigate to="/login" replace />;
  return <main className={"pms-dashboard" + (sidebarCollapsed ? " collapsed" : "")}>
    <aside className="pms-sidebar"><div className="pms-logo"><Hotel /><span>★ ★ ★</span></div><button type="button" className="pms-sidebar-toggle" aria-label={sidebarCollapsed ? "Expand menu" : "Collapse menu"} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(collapsed => !collapsed)}>{sidebarCollapsed ? <PanelLeftOpen/> : <PanelLeftClose/>}</button><nav>{navItems.map(([Icon,label],index)=><a href={`#${label}`} className={index===0?"active":""} key={label} title={sidebarCollapsed ? label : undefined}><Icon/><span>{label}</span></a>)}</nav><div className="pms-sidebar-art"><img src="/sidebar-plant.jpg" alt="" /></div><button className="pms-signout" title={sidebarCollapsed ? "Sign out" : undefined} onClick={()=>{signOut();navigate("/login",{replace:true})}}><LogOut/><span>Sign out</span></button></aside>
    <section className="pms-content"><header className="pms-topbar"><label className="pms-search"><Search/><input placeholder="Search by booking ID, guest name, room number..."/></label><div className="top-actions"><button className="date"><CalendarDays/>05 Oct 2026<ChevronDown/></button><button className="bell"><Bell/><i/></button><div className="profile-dropdown" ref={profileRef} onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProfileOpen(false);
        }}>
          <button type="button" className="profile" ref={profileButtonRef} aria-label="Account details" aria-expanded={profileOpen} aria-controls="profile-panel" onClick={() => setProfileOpen(open => !open)}>
            <span>{(user.name || user.username).split(" ").map(x=>x[0]).join("")}</span><ChevronDown/>
          </button>
          {profileOpen && <section className="profile-panel" id="profile-panel" aria-label="Profile information">
            <div className="profile-summary">
              <span className="profile-avatar" aria-hidden="true">{(user.name || user.username).split(" ").map(x=>x[0]).join("")}</span>
              <div><strong>{user.name || user.username}</strong><span className="profile-role">{user.role}</span></div>
            </div>
            <p className="profile-email">{user.email}</p>
            <button type="button" className="profile-logout" onClick={logout}><LogOut/>Logout</button>
          </section>}
        </div></div></header>
      <section className="welcome-hero"><div><p>WELCOME BACK</p><h1>Manage Your Hotel</h1><span>Everything you need to run your hotel, in one place.</span></div></section>
      <section className="metric-grid">{metrics.map(([Icon,label,value,change,tone])=><article className="metric" key={label}><div className={`metric-icon ${tone}`}><Icon/></div><div><p>{label}</p><strong>{value}</strong><small className={change.includes("↓")?"negative":""}>{change}</small></div><div className="metric-spark"/></article>)}</section>
      <section className="pms-middle"><article className="pms-card occupancy"><header><h2>Room Occupancy</h2><button>This Week <ChevronDown/></button></header><div className="chart"><div className="chart-labels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div className="chart-area"><svg viewBox="0 0 630 160" preserveAspectRatio="none"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#3f83ff" stopOpacity=".30"/><stop offset="1" stopColor="#3f83ff" stopOpacity=".01"/></linearGradient></defs><path className="grid-lines" d="M0 0H630M0 40H630M0 80H630M0 120H630M0 160H630M0 0V160M126 0V160M252 0V160M378 0V160M504 0V160M630 0V160"/><path fill="url(#chart-fill)" d="M0 104C42 104 72 84 126 80C174 78 195 64 252 62C300 60 318 20 378 37C426 52 450 86 504 92C552 98 582 62 630 84L630 160L0 160Z"/><path className="line" d="M0 104C42 104 72 84 126 80C174 78 195 64 252 62C300 60 318 20 378 37C426 52 450 86 504 92C552 98 582 62 630 84"/>{[[0,104],[126,80],[252,62],[378,37],[504,92],[630,84]].map(([x,y])=><circle cx={x} cy={y} r="5" key={x}/>)}</svg><div className="tooltip">78%</div><div className="days"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></div></div></article>
        <article className="pms-card room-status"><h2>Room Status</h2><div className="status-body"><div className="donut"><div><strong>48</strong><span>Rooms</span></div></div><ul><li><i className="blue"/>Occupied <b>28</b></li><li><i className="lightblue"/>Available <b>16</b></li><li><i className="yellow"/>Cleaning <b>2</b></li><li><i className="gray"/>Maintenance <b>2</b></li></ul></div></article>
        <article className="pms-card activity"><header><h2>Today&apos;s Activity</h2><a href="#all">View All</a></header>{([[CalendarDays,"09:15 AM","New booking received","blue"],[ClipboardCheck,"10:00 AM","Room 101 checked in","green"],[DoorOpen,"11:00 AM","Room 307 checked out","yellow"],[Sparkles,"12:20 PM","Housekeeping completed","blue"],[CalendarDays,"02:45 PM","Room 204 checked in","blue"]] as const).map(([Icon,time,text,color])=><div className="activity-row" key={time as string}><i className={`dot ${color}`}/><Icon/><time>{time}</time><span>{text}</span></div>)}</article></section>
      <section className="pms-card bookings"><header><h2>Recent Bookings</h2><a href="#all-bookings">View All</a></header><div className="booking-table"><div className="booking-head"><span>Room</span><span>Guest</span><span>Check In</span><span>Check Out</span><span>Guests</span><span>Status</span><span>Actions</span></div>{bookings.map(([room,type,guest,email,checkIn,checkOut,people,status,statusClass])=><div className="booking-row" key={room}><span className="room"><i/><b>{room}</b><small>{type}</small></span><span className="guest"><b>{guest}</b><small>{email}</small></span><span>{checkIn}</span><span>{checkOut}</span><span>{people}</span><span><b className={`booking-status ${statusClass}`}>{status}</b></span><button><EllipsisVertical/></button></div>)}</div></section>
    </section>
  </main>;
}

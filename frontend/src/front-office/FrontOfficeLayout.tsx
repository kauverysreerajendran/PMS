import { useEffect, useState, type CSSProperties } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { House, CalendarDays, LogIn, LogOut, BedDouble, Users, Sparkles, UserCog, Bell, Search, ChevronDown, ChevronRight, CreditCard, Headphones, PanelLeftClose, PanelLeftOpen, BriefcaseBusiness, ChartNoAxesColumn, MessageSquareText, Settings, type LucideIcon } from "lucide-react";
import { signOut, useSession } from "../lib/auth";
import { frontOfficePages, isFrontOfficeManager } from "./access";
import "./frontOffice.css";
import "./shell.css";

const icons = [House, CalendarDays, LogIn, LogOut, CreditCard, BedDouble, Users, Sparkles, UserCog];
type NavItem = { title: string; icon: LucideIcon; to?: string; dot?: boolean };
const frontOfficeNav: NavItem[] = frontOfficePages.map((page, index) => ({ title: page.title, icon: icons[index], to: "/dashboard" + (page.slug ? "/" + page.slug : "") }));
// Modules for other roles are not built yet, so only Dashboard routes anywhere.
const hotelNav: NavItem[] = [
  { title: "Dashboard", icon: House, to: "/dashboard" },
  { title: "Calendar", icon: CalendarDays },
  { title: "Bookings", icon: BriefcaseBusiness },
  { title: "Guests", icon: Users },
  { title: "Rooms", icon: BedDouble },
  { title: "Housekeeping", icon: Sparkles },
  { title: "Billing", icon: CreditCard },
  { title: "Reports", icon: ChartNoAxesColumn },
  { title: "Messages", icon: MessageSquareText, dot: true },
  { title: "Settings", icon: Settings },
];
const roleLabels: Record<string, string> = { owner: "Hotel Admin", front_office_manager: "Front Office Manager" };
const roleLabel = (role: string) => roleLabels[role] || role.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

// The design is drawn at 1672x940. On smaller desktop screens, scale the UI down so the
// whole dashboard keeps those proportions instead of looking zoomed in.
const DESIGN_WIDTH = 1672, DESIGN_HEIGHT = 940, MIN_SCALE = 0.78;
function useUiScale() {
  const compute = () => window.innerWidth <= 1250 ? 1 : Math.max(MIN_SCALE, Math.min(1, window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT));
  const [scale, setScale] = useState(compute);
  useEffect(() => {
    const update = () => setScale(compute());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}

export function StayHubMark({ size = 46 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <g stroke="#e3bd78" strokeWidth="1.6" strokeLinejoin="round">
      {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => <path key={angle} transform={`rotate(${angle} 24 24)`} d={angle % 90 === 0 ? "M24 22C20.5 17 20.5 10 24 4c3.5 6 3.5 13 0 18Z" : "M24 21.5c-2.4-3.6-2.4-8.4 0-12 2.4 3.6 2.4 8.4 0 12Z"}/>)}
    </g>
    <circle cx="24" cy="24" r="2.6" fill="#e3bd78"/>
  </svg>;
}

export default function FrontOfficeLayout() {
  const user = useSession()!;
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const uiScale = useUiScale();
  const name = user.name || user.username;
  const nav = isFrontOfficeManager(user.role) ? frontOfficeNav : hotelNav;
  const role = roleLabel(user.role);
  const activeDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());
  const logout = () => { signOut(); navigate("/login", { replace: true }); };
  return <div className={"fo-shell" + (sidebarCollapsed ? " fo-collapsed" : "")} style={{ "--ui-scale": uiScale } as CSSProperties}>
    <aside className="sh-sidebar">
      <div className="sh-brand-row">
        <a className="sh-brand" href="/dashboard"><StayHubMark/><span><strong>StayHub</strong><small>Hotel Management</small></span></a>
        <button type="button" className="sh-collapse" aria-label={sidebarCollapsed ? "Expand menu" : "Collapse menu"} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(collapsed => !collapsed)}>{sidebarCollapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button>
      </div>
      <nav aria-label="Main navigation">{nav.map(({ title, icon: Icon, to, dot }) => {
        const content = <><Icon size={22} strokeWidth={1.6}/><span>{title}</span>{dot && <i className="sh-nav-dot" aria-label="New"/>}</>;
        return to
          ? <NavLink key={title} to={to} end title={sidebarCollapsed ? title : undefined}>{content}</NavLink>
          : <a key={title} href={"#" + title.toLowerCase()} title={sidebarCollapsed ? title : undefined}>{content}</a>;
      })}</nav>
      <div className="sh-side-promo"><p>Deliver Exceptional Stays</p></div>
      <a className="sh-help" href="mailto:support@stayhub.app"><Headphones size={24} strokeWidth={1.7}/><span><strong>Need Help?</strong><small>Contact Support</small></span><ChevronRight size={17}/></a>
    </aside>
    <div className="fo-main">
      <header className="sh-header">
        <form className="sh-search" onSubmit={event => { event.preventDefault(); if (isFrontOfficeManager(user.role)) navigate("/dashboard/guests"); }}>
          <Search size={20}/><input aria-label="Search" placeholder="Search by booking ID, guest name, room number..."/><kbd>⌘K</kbd>
        </form>
        <div className="sh-header-actions">
          <span className="sh-date"><CalendarDays size={19}/>{activeDate}<ChevronDown size={16}/></span>
          <div className="fo-popover-wrap"><button className="sh-bell" aria-label="Notifications" aria-expanded={noticeOpen} onClick={() => setNoticeOpen(!noticeOpen)}><Bell size={22} strokeWidth={1.7}/><i/></button>{noticeOpen && <div className="fo-popover">No live notifications yet. This dashboard uses sample data.</div>}</div>
          <span className="sh-divider"/>
          <div className="fo-popover-wrap" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setProfileOpen(false); }} onKeyDown={event => { if (event.key === "Escape") setProfileOpen(false); }}>
            <button className="sh-profile" aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>
              <span className="sh-avatar">{name.slice(0, 1).toUpperCase()}</span>
              <span className="sh-profile-text"><strong>{name}</strong><small>{role}</small></span>
              <ChevronDown size={17}/>
            </button>
            {profileOpen && <div className="fo-popover"><strong>{name}</strong><p>{user.email}</p><small>{role}</small><button className="fo-button" onClick={logout}><LogOut size={16}/>Logout</button></div>}
          </div>
        </div>
      </header>
      <main className="fo-body"><Outlet/></main>
    </div>
  </div>;
}

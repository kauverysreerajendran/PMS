import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { House, CalendarDays, LogIn, LogOut, BedDouble, Users, Sparkles, UserCog, Bell, IdCard, Pencil, SprayCan, UtensilsCrossed, Search, ChevronDown, ChevronRight, CreditCard, Headphones, PanelLeftClose, PanelLeftOpen, BriefcaseBusiness, ChartNoAxesColumn, MessageSquareText, Settings, Building2, Check, Plus, ImagePlus, ClipboardList, type LucideIcon } from "lucide-react";
import { signOut, useSession } from "../lib/auth";
import { listMyHotels, readLogoFile, switchHotel, updateHotelLogo, useHotelProfile, type OwnedHotel } from "../lib/property";
import { canUseFrontOffice, frontOfficePages, isOwner } from "./access";
import { useHotelPalette } from "../lib/theme";
import "./frontOffice.css";
import "./shell.css";

const icons: Record<string, LucideIcon> = { "": House, calendar: CalendarDays, reservations: ClipboardList, "check-in": LogIn, "check-out": LogOut, billing: CreditCard, "room-assignment": BedDouble, guests: Users, "room-status": Sparkles, staff: UserCog, settings: Settings, housekeeping: SprayCan, menu: UtensilsCrossed, employees: IdCard };
type NavItem = { title: string; icon: LucideIcon; to?: string; dot?: boolean };
const frontOfficeNav: NavItem[] = frontOfficePages.map(page => ({ title: page.title, icon: icons[page.slug] || House, to: "/dashboard" + (page.slug ? "/" + page.slug : "") }));
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
// Compact desktop fit: scale by width only (height made it far too small on short laptop screens).
const COMPACT_WIDTH = 1720, MIN_SCALE = 0.84;
// Today's date for the header; re-checked every minute so it rolls over at midnight.
const formatToday = () => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());
function useToday() {
  const [today, setToday] = useState(formatToday);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(formatToday()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return today;
}

function useUiScale() {
  const compute = () => window.innerWidth <= 1100 ? 1 : Math.max(MIN_SCALE, Math.min(1, window.innerWidth / COMPACT_WIDTH));
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

// Shows the hotel being viewed. Owner: swap hotels / add a hotel. Owner and front office manager: change the logo.
function HotelSwitcher({ canManage }: { canManage: boolean }) {
  const user = useSession();
  const navigate = useNavigate();
  const current = useHotelProfile();
  const [open, setOpen] = useState(false);
  const [hotels, setHotels] = useState<OwnedHotel[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const logoInput = useRef<HTMLInputElement>(null);
  const uploadLogo = async (file?: File) => {
    if (!file) return;
    setError("");
    try { await updateHotelLogo(await readLogoFile(file)); setHotels(await listMyHotels()); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to upload the logo."); }
    finally { if (logoInput.current) logoInput.current.value = ""; }
  };
  useEffect(() => { listMyHotels().then(setHotels).catch(() => setHotels([])); }, [user?.property_id]);
  const choose = async (hotel: OwnedHotel) => {
    if (hotel.active || !user) { setOpen(false); return; }
    setBusyId(hotel.id); setError("");
    try { await switchHotel(user, hotel.id); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to switch hotel."); setBusyId(null); }
  };
  const count = hotels?.length ?? 0;
  return <div className="fo-popover-wrap" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
    <button type="button" className="sh-hotel-switch" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title="Switch hotel">
      <Building2 size={18}/>
      <span><strong>{current?.name || "Select hotel"}</strong><small>{count > 1 ? `${count} hotels` : current?.property_code || ""}</small></span>
      <ChevronDown size={16}/>
    </button>
    {open && <div className="fo-popover fo-hotel-menu" role="menu">
      <p className="fo-hotel-menu-label">{canManage ? "Your hotels" : "Your hotel"}</p>
      {hotels == null && <p className="fo-hotel-menu-note">Loading…</p>}
      {hotels?.map(hotel => <button type="button" role="menuitemradio" aria-checked={hotel.active} key={hotel.id} className={"fo-hotel-option" + (hotel.active ? " is-active" : "")} disabled={busyId != null} onClick={() => void choose(hotel)}>
        {hotel.logo_url ? <img src={hotel.logo_url} alt=""/> : <span className="fo-hotel-initial">{hotel.name.slice(0, 1).toUpperCase()}</span>}
        <span className="fo-hotel-text"><strong>{hotel.name}</strong><small>{hotel.property_code}</small></span>
        {hotel.active ? <Check size={16}/> : busyId === hotel.id ? <small>Opening…</small> : null}
      </button>)}
      {error && <p className="fo-hotel-menu-error" role="alert">{error}</p>}
      <hr className="fo-profile-sep"/>
      <button type="button" role="menuitem" className="fo-hotel-add" onClick={() => logoInput.current?.click()}><ImagePlus size={16}/>{current?.logo_url ? "Change hotel logo" : "Upload hotel logo"}</button>
      {canManage && <button type="button" role="menuitem" className="fo-hotel-add" onClick={() => navigate("/hotels/new")}><Plus size={16}/>Add another hotel</button>}
      <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden onChange={event => void uploadLogo(event.target.files?.[0])}/>
    </div>}
  </div>;
}

// Sidebar logo: the hotel's own logo once uploaded, with a small edit button for the owner or front office manager.
function SidebarLogo({ canEdit }: { canEdit: boolean }) {
  const hotel = useHotelProfile();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError("");
    try { await updateHotelLogo(await readLogoFile(file)); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to upload the logo."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  return <div className="sh-logo">
    <Link to="/dashboard" className="sh-logo-home" aria-label="Go to dashboard">{hotel?.logo_url ? <img className="sh-logo-img" src={hotel.logo_url} alt={`${hotel.name} logo`}/> : <StayHubMark/>}</Link>
    {canEdit && <>
      <button type="button" className="sh-logo-edit" disabled={busy} title={error || (hotel?.logo_url ? "Change logo" : "Upload logo")} aria-label={hotel?.logo_url ? "Change hotel logo" : "Upload hotel logo"} onClick={event => { event.preventDefault(); input.current?.click(); }}>
        <Pencil size={8} strokeWidth={2.4}/>Edit
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden onChange={event => void upload(event.target.files?.[0])}/>
    </>}
    {error && <div className="sh-logo-error" role="alert">{error}</div>}
  </div>;
}

export default function FrontOfficeLayout() {
  const user = useSession();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const uiScale = useUiScale();
  const activeDate = useToday();
  const hotel = useHotelProfile();
  // Follow the palette saved for this hotel in Settings (null = default); skip until the profile has loaded.
  useHotelPalette(hotel ? hotel.theme : undefined);
  useEffect(() => { document.title = hotel ? `${hotel.name} · Hotel Management` : "Hotel Management"; }, [hotel]);
  // The session can be cleared while this screen is open (expired login, sign-out in another tab).
  if (!user) return <Navigate to="/login" replace/>;
  const name = user.name || user.username;
  const nav = canUseFrontOffice(user.role) ? frontOfficeNav : hotelNav;
  const role = roleLabel(user.role);
  const logout = () => { signOut(); navigate("/login", { replace: true }); };
  return <div className={"fo-shell" + (sidebarCollapsed ? " fo-collapsed" : "")} style={{ "--ui-scale": uiScale } as CSSProperties}>
    <aside className="sh-sidebar">
      <div className="sh-brand-row">
        <div className="sh-brand"><SidebarLogo canEdit={user.role === "owner" || user.role === "front_office_manager"}/><a href="/dashboard" className="sh-brand-text"><span><strong>{hotel?.name || "Your hotel"}</strong><small>{hotel?.property_code || "Hotel Management"}</small></span></a></div>
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
        <form className="sh-search" onSubmit={event => { event.preventDefault(); if (canUseFrontOffice(user.role)) navigate("/dashboard/guests"); }}>
          <Search size={20}/><input aria-label="Search" placeholder="Search by booking ID, guest name, room number..."/><kbd>⌘K</kbd>
        </form>
        <div className="sh-header-actions">
          {canUseFrontOffice(user.role) && <HotelSwitcher canManage={isOwner(user.role)}/>}
          <span className="sh-date" title="Today"><CalendarDays size={19}/>{activeDate}</span>
          <div className="fo-popover-wrap"><button className="sh-bell" aria-label="Notifications" aria-expanded={noticeOpen} onClick={() => setNoticeOpen(!noticeOpen)}><Bell size={22} strokeWidth={1.7}/><i/></button>{noticeOpen && <div className="fo-popover">No new notifications.</div>}</div>
          <span className="sh-divider"/>
          <div className="fo-popover-wrap" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setProfileOpen(false); }} onKeyDown={event => { if (event.key === "Escape") setProfileOpen(false); }}>
            <button className="sh-profile" aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>
              <span className="sh-avatar">{name.slice(0, 1).toUpperCase()}</span>
              <span className="sh-profile-text"><strong>{name}</strong><small>{role}</small></span>
              <ChevronDown size={17}/>
            </button>
            {profileOpen && <div className="fo-popover fo-profile-menu" role="menu">
              <div className="fo-profile-head">
                <span className="sh-avatar">{name.slice(0, 1).toUpperCase()}</span>
                <div className="fo-profile-id"><strong>{name}</strong><p>{user.email}</p></div>
              </div>
              <span className="fo-role-badge">{role}</span>
              <hr className="fo-profile-sep"/>
              <button className="fo-profile-logout" role="menuitem" onClick={logout}><LogOut size={16}/>Logout</button>
            </div>}
          </div>
        </div>
      </header>
      <main className="fo-body"><Outlet/></main>
    </div>
  </div>;
}

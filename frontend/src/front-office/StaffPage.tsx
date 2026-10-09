import { FormEvent, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, UserPlus, UserRound } from "lucide-react";
import { useSession } from "../lib/auth";
import { isOwner } from "./access";
import { FrontOfficeStaff, assignStaffToHotel, getFrontOfficeStaff } from "./staffApi";

export default function StaffPage() {
  const user = useSession();
  const [staff, setStaff] = useState<FrontOfficeStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [notice, setNotice] = useState("");
  const load = async () => {
    setLoading(true); setError("");
    try { setStaff(await getFrontOfficeStaff()); }
    catch (r) { setError(r instanceof Error ? r.message : "Unable to load front-office staff."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const assign = async (event: FormEvent) => {
    event.preventDefault(); setAssigning(true); setError(""); setNotice("");
    try { const result = await assignStaffToHotel(identifier.trim()); setNotice(result.message); setIdentifier(""); await load(); }
    catch (r) { setError(r instanceof Error ? r.message : "Unable to add this staff member."); }
    finally { setAssigning(false); }
  };
  return <>
    <section className="fo-page-heading">
      <div><p className="fo-eyebrow">FRONT OFFICE OPERATIONS</p><h2>Front Office Staff</h2><p>Review the staff assigned to this property.</p></div>
      <button className="fo-outline-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>Refresh</button>
    </section>
    {user && isOwner(user.role) && <form className="fo-card fo-staff-assign" onSubmit={assign}>
      <div><h3><UserPlus size={18}/>Add staff to this hotel</h3><p>Enter the username or email of an existing front office manager or front desk agent. They will see this hotel's dashboard, bookings and folios from their next login.</p></div>
      <div className="fo-staff-assign-row">
        <input required value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="Username or email" aria-label="Staff username or email"/>
        <button className="fo-button" disabled={assigning}>{assigning ? <><LoaderCircle size={16}/>Adding…</> : "Add to hotel"}</button>
      </div>
      {notice && <p className="fo-staff-notice" role="status">{notice}</p>}
    </form>}
    <section className="fo-card fo-reservations-card">
      {error && <p className="fo-api-error">{error}</p>}
      <div className="fo-section-heading"><h2>Staff Directory <span className="fo-count">{staff.length}</span></h2><span>Live property data</span></div>
      <div className="fo-staff-grid">{loading ? <div className="fo-loading"><LoaderCircle size={18}/>Loading staff…</div> : staff.length === 0 ? <div className="fo-empty">No front-office staff found.</div> : staff.map(member => <article className="fo-staff-card" key={member.id}>
        <span className="fo-staff-avatar"><UserRound size={20}/></span>
        <div><h3>{member.username}</h3><p>{member.role.replaceAll("_", " ")}</p><small>{member.email}</small><small>{member.mobile || "No mobile number"}</small></div>
        <span className={`fo-badge ${member.is_active && !member.is_locked ? "success" : "warning"}`}>{member.is_locked ? "Locked" : member.is_active ? "Active" : "Inactive"}</span>
      </article>)}</div>
    </section>
  </>;
}

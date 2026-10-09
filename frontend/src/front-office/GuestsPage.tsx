import { FormEvent, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Pencil, RefreshCw, Search, X } from "lucide-react";
import { Guest, GuestProfile, getGuestProfile, getGuests, updateGuest } from "./guestsApi";

const emptyGuest = { first_name: "", last_name: "", email: "", mobile: "" };

export default function GuestsPage() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [form, setForm] = useState(emptyGuest);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setGuests(await getGuests());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load guests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filteredGuests = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return guests;
    return guests.filter((guest) =>
      `${guest.first_name} ${guest.last_name} ${guest.email ?? ""} ${guest.mobile ?? ""}`.toLowerCase().includes(query),
    );
  }, [guests, search]);

  const openProfile = async (guestId: number) => {
    setError("");
    try {
      const result = await getGuestProfile(guestId);
      setProfile(result);
      setForm({
        first_name: result.guest.first_name,
        last_name: result.guest.last_name,
        email: result.guest.email ?? "",
        mobile: result.guest.mobile ?? "",
      });
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load guest profile.");
    }
  };

  const saveGuest = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError("");
    try {
      const guest = await updateGuest(profile.guest.id, form);
      setProfile({ ...profile, guest });
      setGuests((current) => current.map((item) => item.id === guest.id ? guest : item));
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update guest details.");
    } finally {
      setSaving(false);
    }
  };

  return <>
    <section className="fo-page-heading">
      <div><p className="fo-eyebrow">FRONT OFFICE OPERATIONS</p><h2>Guests</h2><p>View guest profiles, contacts and stay history.</p></div>
      <button className="fo-outline-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} />Refresh</button>
    </section>
    <section className="fo-card fo-reservations-card">
      {error && <p className="fo-api-error">{error}</p>}
      <div className="fo-reservation-toolbar">
        <label className="fo-reservation-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search guest, email or mobile" /></label>
      </div>
      <div className="fo-section-heading"><h2>Guest Directory <span className="fo-count">{filteredGuests.length}</span></h2><span>Live property data</span></div>
      <div className="fo-table-wrap"><table><thead><tr><th>Guest</th><th>Contact</th><th>Added</th><th>Action</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={4} className="fo-loading"><LoaderCircle size={18} />Loading guests…</td></tr> :
          filteredGuests.length === 0 ? <tr><td colSpan={4} className="fo-empty">No guests match the current search.</td></tr> :
            filteredGuests.map((guest) => <tr key={guest.id}><td><strong>{guest.first_name} {guest.last_name}</strong></td><td>{guest.mobile || "—"}<small>{guest.email || "No email"}</small></td><td>{guest.created_at ? new Date(guest.created_at).toLocaleDateString() : "—"}</td><td><button className="fo-small-button" onClick={() => void openProfile(guest.id)}>View profile</button></td></tr>)}
      </tbody></table></div>
    </section>
    {profile && <div className="fo-modal-backdrop" role="presentation"><section className="fo-modal fo-guest-modal" role="dialog" aria-modal="true" aria-label="Guest profile">
      <button className="fo-modal-close" onClick={() => setProfile(null)} aria-label="Close"><X size={22} /></button>
      <p className="fo-eyebrow">GUEST PROFILE</p><h2>{profile.guest.first_name} {profile.guest.last_name}</h2>
      {editing ? <form onSubmit={saveGuest}><div className="fo-form-grid"><label>First name<input required value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} /></label><label>Last name<input required value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} /></label><label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Mobile<input value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} /></label></div><div className="fo-modal-actions"><button type="button" className="fo-outline-button" onClick={() => setEditing(false)}>Cancel</button><button className="fo-primary-button" disabled={saving}>{saving ? "Saving…" : "Save contact details"}</button></div></form> : <><div className="fo-checkin-summary"><div><span>Mobile</span><strong>{profile.guest.mobile || "Not provided"}</strong></div><div><span>Email</span><strong>{profile.guest.email || "Not provided"}</strong></div><button className="fo-small-button" onClick={() => setEditing(true)}><Pencil size={14} />Edit contact</button></div><h3 className="fo-modal-subheading">Stay history</h3><div className="fo-table-wrap"><table><thead><tr><th>Reservation</th><th>Stay dates</th><th>Room</th><th>Status</th></tr></thead><tbody>{profile.stays.length === 0 ? <tr><td colSpan={4} className="fo-empty">No stays found for this guest.</td></tr> : profile.stays.map((stay) => <tr key={stay.id}><td>{stay.reservation_code}</td><td>{stay.check_in_date}<small>to {stay.check_out_date}</small></td><td>{stay.room_number || "Unassigned"}<small>{stay.room_category || ""}</small></td><td><span className={`fo-badge ${stay.status === "cancelled" ? "warning" : "success"}`}>{stay.status.replace("_", " ")}</span></td></tr>)}</tbody></table></div></>}
    </section></div>}
  </>;
}

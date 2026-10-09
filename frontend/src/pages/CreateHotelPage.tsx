import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Hotel, LogOut, Plus } from "lucide-react";
import { AuthUser, signOut, updateSessionUser, useSession } from "../lib/auth";
import { frontOfficeRequest } from "../front-office/reservationsApi";

type CreatePropertyResponse = { access_token: string; user: AuthUser };

export default function CreateHotelPage() {
  const user = useSession()!;
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const logout = () => { signOut(); navigate("/login", { replace: true }); };

  const createHotel = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const data = await frontOfficeRequest<CreatePropertyResponse>("/properties", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), property_code: code.trim() || null }),
      });
      updateSessionUser({ ...user, ...data.user }, data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the hotel.");
    } finally {
      setSaving(false);
    }
  };

  return <main className="ch-page">
    <header className="ch-topbar">
      <div className="ch-brand"><Hotel/><span>Stay<span>Hub</span></span></div>
      <div className="ch-user"><span>{user.username}</span><button type="button" onClick={logout}><LogOut/>Sign out</button></div>
    </header>
    <section className="ch-empty">
      <div className="ch-icon"><Building2/></div>
      <h1>No hotel yet</h1>
      <p>Create your first hotel to start managing rooms, guests and bookings.</p>
      {!formOpen && <button type="button" className="ch-primary" onClick={() => setFormOpen(true)}><Plus/>Create Hotel</button>}
      {formOpen && <form className="ch-form" onSubmit={createHotel}>
        <label htmlFor="ch-name">Hotel name</label>
        <input id="ch-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. StayHub Residency" minLength={2} maxLength={150} required autoFocus/>
        <label htmlFor="ch-code">Property code <small>(optional)</small></label>
        <input id="ch-code" value={code} onChange={e => setCode(e.target.value)} placeholder="Generated if left blank" maxLength={50}/>
        {error && <p className="ch-error" role="alert">{error}</p>}
        <div className="ch-actions">
          <button type="button" className="ch-secondary" onClick={() => { setFormOpen(false); setError(""); }} disabled={saving}>Cancel</button>
          <button type="submit" className="ch-primary" disabled={saving}>{saving ? "Creating…" : "Create Hotel"}</button>
        </div>
      </form>}
    </section>
  </main>;
}

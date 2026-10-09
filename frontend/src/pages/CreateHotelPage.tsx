import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Hotel, LogOut, Plus } from "lucide-react";
import { signOut, useSession } from "../lib/auth";
import { createHotel as registerHotel } from "../lib/property";

// `additional`: the owner already has a hotel and is registering another one.
export default function CreateHotelPage({ additional = false }: { additional?: boolean }) {
  const user = useSession();
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(additional);
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
      if (!user) return;
      await registerHotel(user, name, code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the hotel.");
      setSaving(false);
    }
  };

  if (!user) return <Navigate to="/login" replace/>;
  return <main className="ch-page">
    <header className="ch-topbar">
      <div className="ch-brand"><Hotel/><span>Hotel Management</span></div>
      <div className="ch-user">
        {additional && <button type="button" onClick={() => navigate("/dashboard")}><ArrowLeft/>Back to dashboard</button>}
        <span>{user.username}</span><button type="button" onClick={logout}><LogOut/>Sign out</button>
      </div>
    </header>
    <section className="ch-empty">
      <div className="ch-icon"><Building2/></div>
      <h1>{additional ? "Add another hotel" : "No hotel yet"}</h1>
      <p>{additional
        ? "Register another hotel under your account. You can switch between your hotels from the top bar."
        : "Create your first hotel to start managing rooms, guests and bookings."}</p>
      {!formOpen && <button type="button" className="ch-primary" onClick={() => setFormOpen(true)}><Plus/>Create Hotel</button>}
      {formOpen && <form className="ch-form" onSubmit={createHotel}>
        <label htmlFor="ch-name">Hotel name</label>
        <input id="ch-name" value={name} onChange={e => setName(e.target.value)} placeholder="Enter your hotel name" minLength={2} maxLength={150} required autoFocus/>
        <label htmlFor="ch-code">Property code <small>(optional)</small></label>
        <input id="ch-code" value={code} onChange={e => setCode(e.target.value)} placeholder="Generated if left blank" maxLength={50}/>
        {error && <p className="ch-error" role="alert">{error}</p>}
        <div className="ch-actions">
          <button type="button" className="ch-secondary" onClick={() => { if (additional) navigate("/dashboard"); else { setFormOpen(false); setError(""); } }} disabled={saving}>Cancel</button>
          <button type="submit" className="ch-primary" disabled={saving}>{saving ? "Creating…" : "Create Hotel"}</button>
        </div>
      </form>}
    </section>
  </main>;
}

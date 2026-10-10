import { FormEvent, useEffect, useMemo, useState } from "react";
import { BadgeCheck, LoaderCircle, Mail, Pencil, Phone, Plus, Search, Trash2, UserPlus, Users, X } from "lucide-react";
import { createEmployee, Employee, EmployeeInput, getEmployees, removeEmployee, updateEmployee } from "./employeesApi";
import "./employees.css";

export const DEPARTMENTS = ["Front Office", "Housekeeping", "Maintenance", "Kitchen", "Restaurant", "Security", "Management", "Accounts"];
const SHIFTS = ["Morning", "Evening", "Night", "General"];
const emptyEmployee: EmployeeInput = { name: "", department: "Housekeeping", designation: "", phone: "", email: "", shift: "Morning", joined_on: null, notes: "", is_on_duty: true };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [department, setDepartment] = useState("All");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try { setEmployees(await getEmployees()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load employees."); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const departments = useMemo(() => ["All", ...new Set([...DEPARTMENTS.filter(name => employees.some(employee => employee.department === name)), ...employees.map(employee => employee.department)])], [employees]);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return employees.filter(employee => (department === "All" || employee.department === department)
      && (!text || [employee.name, employee.designation, employee.phone, employee.email].some(value => value?.toLowerCase().includes(text))));
  }, [employees, department, query]);
  const onDuty = employees.filter(employee => employee.is_on_duty).length;

  const toggleDuty = async (employee: Employee) => {
    setBusy(employee.id);
    try { const { id, ...rest } = employee; await updateEmployee(id, { ...rest, is_on_duty: !employee.is_on_duty }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update."); } finally { setBusy(null); }
  };
  const remove = async (employee: Employee) => {
    if (!window.confirm(`Remove ${employee.name} from the staff list?`)) return;
    setBusy(employee.id);
    try { await removeEmployee(employee.id); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to remove."); } finally { setBusy(null); }
  };

  return <div className="em-page">
    <header className="em-head">
      <div><p className="em-eyebrow">PEOPLE</p><h1>Employees</h1><p>Everyone who works at the hotel. Housekeeping and maintenance staff here can be assigned to room jobs.</p></div>
      <button type="button" className="em-primary" onClick={() => setEditing("new")}><UserPlus size={16}/>Add employee</button>
    </header>
    {error && <p className="em-error" role="alert">{error}</p>}

    <section className="em-summary">
      <div><Users size={20}/><span><strong>{employees.length}</strong><small>Employees</small></span></div>
      <div><BadgeCheck size={20}/><span><strong>{onDuty}</strong><small>On duty now</small></span></div>
      {DEPARTMENTS.filter(name => employees.some(employee => employee.department === name)).slice(0, 4).map(name => <div key={name}><span><strong>{employees.filter(employee => employee.department === name).length}</strong><small>{name}</small></span></div>)}
    </section>

    <section className="em-toolbar">
      <label className="em-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, role, phone"/></label>
      <div className="em-tabs">{departments.map(name => <button type="button" key={name} className={department === name ? "on" : ""} onClick={() => setDepartment(name)}>{name}<span>{name === "All" ? employees.length : employees.filter(employee => employee.department === name).length}</span></button>)}</div>
    </section>

    {loading && !employees.length ? <p className="em-empty"><LoaderCircle size={16} className="em-spin"/>Loading…</p>
      : !employees.length ? <div className="em-empty"><Users size={28}/><strong>No employees yet</strong><span>Add your housekeeping, kitchen and maintenance team.</span><button type="button" className="em-primary" onClick={() => setEditing("new")}><Plus size={16}/>Add employee</button></div>
      : <section className="em-grid">{visible.map(employee => <article key={employee.id} className={`em-card${employee.is_on_duty ? "" : " is-off"}`}>
        <div className="em-card-top">
          <span className="em-avatar">{employee.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</span>
          <div><strong>{employee.name}</strong><small>{employee.designation || "—"}</small></div>
          <span className="em-dept">{employee.department}</span>
        </div>
        <ul className="em-contact">
          {employee.phone && <li><Phone size={14}/><a href={`tel:${employee.phone}`}>{employee.phone}</a></li>}
          {employee.email && <li><Mail size={14}/><a href={`mailto:${employee.email}`}>{employee.email}</a></li>}
          {employee.shift && <li><span className="em-shift">{employee.shift} shift</span></li>}
        </ul>
        <div className="em-card-foot">
          <label className="em-switch"><input type="checkbox" checked={employee.is_on_duty} disabled={busy === employee.id} onChange={() => void toggleDuty(employee)}/><span/>{employee.is_on_duty ? "On duty" : "Off duty"}</label>
          <button type="button" className="em-icon" onClick={() => setEditing(employee)} aria-label={`Edit ${employee.name}`} title="Edit"><Pencil size={14}/></button>
          <button type="button" className="em-icon danger" onClick={() => void remove(employee)} disabled={busy === employee.id} aria-label={`Remove ${employee.name}`} title="Remove"><Trash2 size={14}/></button>
        </div>
      </article>)}{!visible.length && <p className="em-empty">No one matches.</p>}</section>}

    {editing && <EmployeeForm employee={editing === "new" ? null : editing} departments={[...new Set([...DEPARTMENTS, ...employees.map(employee => employee.department)])]} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }}/>}
  </div>;
}

function EmployeeForm({ employee, departments, onClose, onSaved }: { employee: Employee | null; departments: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<EmployeeInput>(employee ? { ...employee } : emptyEmployee);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (changes: Partial<EmployeeInput>) => setForm(current => ({ ...current, ...changes }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const payload = { ...form, joined_on: form.joined_on || null, shift: form.shift || null };
      if (employee) await updateEmployee(employee.id, payload); else await createEmployee(payload);
      await onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save."); } finally { setSaving(false); }
  };
  return <div className="fo-modal-backdrop">
    <form className="em-form" onSubmit={submit}>
      <header><div><p className="em-eyebrow">EMPLOYEE</p><h2>{employee ? `Edit ${employee.name}` : "Add employee"}</h2></div><button type="button" className="em-close" onClick={onClose} disabled={saving} aria-label="Close"><X size={18}/></button></header>
      <div className="em-form-grid">
        <label className="wide">Full name<input required value={form.name} onChange={event => set({ name: event.target.value })}/></label>
        <label>Department<input required list="em-departments" value={form.department} onChange={event => set({ department: event.target.value })}/><datalist id="em-departments">{departments.map(name => <option key={name} value={name}/>)}</datalist></label>
        <label>Designation<input value={form.designation || ""} placeholder="e.g. Room Attendant" onChange={event => set({ designation: event.target.value })}/></label>
        <label>Phone<input value={form.phone || ""} inputMode="tel" onChange={event => set({ phone: event.target.value })}/></label>
        <label>Email<input type="email" value={form.email || ""} onChange={event => set({ email: event.target.value })}/></label>
        <label>Shift<select value={form.shift || ""} onChange={event => set({ shift: event.target.value || null })}><option value="">Not set</option>{SHIFTS.map(shift => <option key={shift}>{shift}</option>)}</select></label>
        <label>Joined on<input type="date" value={form.joined_on || ""} onChange={event => set({ joined_on: event.target.value || null })}/></label>
        <label className="wide">Notes<textarea value={form.notes || ""} placeholder="Languages, skills, emergency contact…" onChange={event => set({ notes: event.target.value })}/></label>
        <label className="em-check wide"><input type="checkbox" checked={form.is_on_duty} onChange={event => set({ is_on_duty: event.target.checked })}/>On duty now</label>
      </div>
      {error && <p className="em-error">{error}</p>}
      <footer><button type="button" className="em-secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="em-primary" disabled={saving}>{saving && <LoaderCircle size={15} className="em-spin"/>}{employee ? "Save" : "Add employee"}</button></footer>
    </form>
  </div>;
}

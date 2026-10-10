import { FormEvent, ReactNode, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  BellRing, CalendarDays, CheckCircle2, ClipboardCheck, Clock, Layers, LoaderCircle, Minus, MoreHorizontal, Package, Play, Plus, RefreshCw,
  Search, SearchCheck, Sparkles, SprayCan, UserPlus, UserRound, Wrench, X,
} from "lucide-react";
import { getEmployees, Employee } from "./employeesApi";
import { createHousekeepingTask, getHousekeepingTasks, HousekeepingTask, Supply, TaskStatus, updateHousekeepingTask } from "./housekeepingApi";
import { photoFor, stockPhoto } from "./roomPhotos";
import { getRooms, Room } from "./roomsApi";
import "./housekeeping.css";

type Sort = "urgent" | "oldest" | "newest";
const COLUMNS: { status: TaskStatus; title: string; hint: string; icon: ReactNode; empty: { icon: ReactNode; text: string } }[] = [
  { status: "pending", title: "To clean", hint: "Waiting for a cleaner", icon: <SprayCan size={16}/>, empty: { icon: <Sparkles size={34}/>, text: "Rooms appear here when a guest checks out." } },
  { status: "assigned", title: "Assigned", hint: "Cleaner on the way", icon: <UserRound size={16}/>, empty: { icon: <BellRing size={34}/>, text: "Rooms will appear here once assigned to a cleaner." } },
  { status: "in_progress", title: "In progress", hint: "Work under way", icon: <Clock size={16}/>, empty: { icon: <Clock size={34}/>, text: "Rooms move here when the cleaner starts." } },
  { status: "inspection", title: "Inspection", hint: "Check before release", icon: <ClipboardCheck size={16}/>, empty: { icon: <SearchCheck size={34}/>, text: "Rooms will appear here once they are ready for inspection." } },
  { status: "done", title: "Released", hint: "Ready again (last 24 h)", icon: <CheckCircle2 size={16}/>, empty: { icon: <CheckCircle2 size={34}/>, text: "Released rooms are listed here for the day." } },
];
const CLEANING_KIT = ["Bed linen set", "Bath towels", "Hand towels", "Toiletries kit", "Drinking water", "Minibar refill", "Trash bags", "Cleaning chemicals", "Vacuum cleaner", "Mop & bucket"];
const MAINTENANCE_KIT = ["Tool box", "Spare bulbs", "Gas refill kit", "Plumbing kit", "Ladder", "Batteries"];

const utc = (value: string) => new Date(`${value}Z`);
const localDay = (value: string) => utc(value).toLocaleDateString("en-CA");
const minutesSince = (value: string | null) => (value ? Math.max(0, Math.round((Date.now() - utc(value).getTime()) / 60000)) : null);
const duration = (minutes: number | null) => minutes == null ? "" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
const taskPhoto = (task: HousekeepingTask) => photoFor(task.image_url, `${task.room_category || ""} ${task.room_name || ""} ${task.room_type || ""}`, task.room_id);

export default function HousekeepingPage() {
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [editing, setEditing] = useState<HousekeepingTask | "new" | null>(null);
  const [day, setDay] = useState(new Date().toLocaleDateString("en-CA"));
  const [floor, setFloor] = useState("all");
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [query, setQuery] = useState("");
  const [sorts, setSorts] = useState<Partial<Record<TaskStatus, Sort>>>({});
  const [menuFor, setMenuFor] = useState<TaskStatus | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  // Dropped on a stage that needs a person: assign first, then finish the move.
  const [moveAfterAssign, setMoveAfterAssign] = useState<TaskStatus | null>(null);
  const [, setTick] = useState(0);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [taskList, roomList, people] = await Promise.all([getHousekeepingTasks(), getRooms(), getEmployees().catch(() => [] as Employee[])]);
      setTasks(taskList); setRooms(roomList); setStaff(people);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load housekeeping."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); const timer = window.setInterval(() => setTick(tick => tick + 1), 60_000); return () => window.clearInterval(timer); }, []);

  const move = async (task: HousekeepingTask, status: TaskStatus) => {
    setBusy(task.id); setError("");
    try { await updateHousekeepingTask(task.id, { status }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update the task."); }
    finally { setBusy(null); }
  };

  const dropOn = (status: TaskStatus) => {
    const task = tasks.find(item => item.id === dragId);
    setDragId(null); setOverColumn(null);
    if (!task || task.status === status || task.status === "done") return;
    if (status !== "pending" && !task.assignee) { setMoveAfterAssign(status === "assigned" ? null : status); setEditing(task); return; }
    if (status === "done" && task.task_type === "cleaning" && task.status !== "inspection" && !window.confirm(`Release Room ${task.room_number} without inspection?`)) return;
    void move(task, status);
  };

  const floors = useMemo(() => [...new Set(rooms.map(room => room.floor || ""))].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [rooms]);
  const categories = useMemo(() => [...new Set(rooms.map(room => room.room_category))].sort(), [rooms]);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return tasks.filter(task =>
      localDay(task.created_at) <= day
      && (task.status !== "done" || (task.completed_at && localDay(task.completed_at) === day))
      && (floor === "all" || task.floor === floor)
      && (category === "all" || task.room_category === category)
      && (priority === "all" || task.priority === priority)
      && (!text || [task.room_number, task.notes, task.assignee].some(value => value?.toLowerCase().includes(text))));
  }, [tasks, day, floor, category, priority, query]);
  const byStatus = useMemo(() => {
    const groups = Object.fromEntries(COLUMNS.map(column => [column.status, filtered.filter(task => task.status === column.status)])) as Record<TaskStatus, HousekeepingTask[]>;
    for (const column of COLUMNS) {
      const sort = sorts[column.status] || "urgent";
      groups[column.status].sort((a, b) => sort === "newest" ? b.created_at.localeCompare(a.created_at)
        : sort === "oldest" ? a.created_at.localeCompare(b.created_at)
        : (a.priority === b.priority ? a.created_at.localeCompare(b.created_at) : a.priority === "high" ? -1 : 1));
    }
    return groups;
  }, [filtered, sorts]);
  const open = filtered.filter(task => task.status !== "done");
  const stats = [
    { label: "Rooms to clean", value: open.filter(task => task.task_type === "cleaning").length, icon: <SprayCan size={20}/>, tone: "amber", photo: stockPhoto("standard") },
    { label: "Being worked on", value: byStatus.in_progress.length, icon: <Clock size={20}/>, tone: "steel", photo: stockPhoto("deluxe") },
    { label: "Awaiting inspection", value: byStatus.inspection.length, icon: <ClipboardCheck size={20}/>, tone: "violet", photo: stockPhoto("suite") },
    { label: "Under maintenance", value: open.filter(task => task.task_type === "maintenance").length, icon: <Wrench size={20}/>, tone: "red", photo: stockPhoto("premium") },
    { label: "Released today", value: byStatus.done.length, icon: <CheckCircle2 size={20}/>, tone: "green", photo: stockPhoto("presidential") },
  ];

  return <div className="hk-page" onClick={() => setMenuFor(null)}>
    <header className="hk-head">
      <div><p className="hk-eyebrow">HOUSEKEEPING</p><h1>Room Readiness</h1><p>Every check-out sends its room here. Assign a cleaner, track what they carry, inspect and release the room.</p></div>
      <div className="hk-head-actions">
        <button type="button" className="hk-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? "hk-spin" : ""}/>Refresh</button>
        <button type="button" className="hk-primary" onClick={() => setEditing("new")}><Plus size={16}/>New task</button>
      </div>
    </header>

    <section className="hk-filters">
      <label className="hk-filter"><CalendarDays size={15}/><input type="date" value={day} onChange={event => setDay(event.target.value || new Date().toLocaleDateString("en-CA"))} aria-label="Date"/></label>
      <label className="hk-filter"><Layers size={15}/><select value={floor} onChange={event => setFloor(event.target.value)} aria-label="Floor"><option value="all">All Floors</option>{floors.map(value => <option key={value} value={value}>Floor {value}</option>)}</select></label>
      <label className="hk-filter"><select value={category} onChange={event => setCategory(event.target.value)} aria-label="Room type"><option value="all">All Room Types</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="hk-filter"><select value={priority} onChange={event => setPriority(event.target.value)} aria-label="Priority"><option value="all">All Priorities</option><option value="high">Urgent</option><option value="normal">Normal</option></select></label>
      <label className="hk-filter hk-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search room number, booking ID…"/></label>
    </section>

    <section className="hk-stats">{stats.map(stat => <div key={stat.label} className={`hk-stat tone-${stat.tone}`} style={{ "--hk-photo": `url('${stat.photo}')` } as CSSProperties}>
      <span className="hk-stat-icon">{stat.icon}</span><div><strong>{stat.value}</strong><small>{stat.label}</small></div>
    </div>)}</section>
    {error && <p className="hk-error" role="alert">{error}</p>}

    <section className="hk-board">
      {COLUMNS.map(column => <div key={column.status} className={`hk-column col-${column.status}${overColumn === column.status ? " is-over" : ""}${dragId !== null ? " is-dropzone" : ""}`}
        onDragOver={event => { if (dragId === null) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (overColumn !== column.status) setOverColumn(column.status); }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOverColumn(current => current === column.status ? null : current); }}
        onDrop={event => { event.preventDefault(); dropOn(column.status); }}>
        <header>
          <span className="hk-col-icon">{column.icon}</span>
          <div><strong>{column.title}</strong><small>{column.hint}</small></div>
          <span className="hk-count">{byStatus[column.status].length}</span>
          <span className="hk-menu-wrap" onClick={event => event.stopPropagation()}>
            <button type="button" className="hk-more" aria-label={`${column.title} options`} aria-expanded={menuFor === column.status} onClick={() => setMenuFor(menuFor === column.status ? null : column.status)}><MoreHorizontal size={16}/></button>
            {menuFor === column.status && <div className="hk-menu" role="menu">
              <small>Sort cards</small>
              {([["urgent", "Urgent first"], ["oldest", "Oldest first"], ["newest", "Newest first"]] as const).map(([value, label]) =>
                <button type="button" role="menuitemradio" aria-checked={(sorts[column.status] || "urgent") === value} key={value} onClick={() => { setSorts(current => ({ ...current, [column.status]: value })); setMenuFor(null); }}>{label}</button>)}
            </div>}
          </span>
        </header>
        <div className="hk-cards">
          {byStatus[column.status].length === 0 && <div className="hk-empty">{loading ? <LoaderCircle size={22} className="hk-spin"/> : <><span>{column.empty.icon}</span><strong>No rooms in this stage</strong><small>{column.empty.text}</small></>}</div>}
          {byStatus[column.status].map(task => <TaskCard key={task.id} task={task} busy={busy === task.id} dragging={dragId === task.id}
            onDragStart={() => setDragId(task.id)} onDragEnd={() => { setDragId(null); setOverColumn(null); }}
            onMove={status => void move(task, status)} onEdit={() => setEditing(task)}/>)}
          {dragId !== null && overColumn === column.status && <div className="hk-drop-hint">Drop to move here</div>}
        </div>
      </div>)}
    </section>

    {editing && <TaskForm task={editing === "new" ? null : editing} rooms={rooms} staff={staff}
      onClose={() => { setEditing(null); setMoveAfterAssign(null); }}
      onSaved={async saved => { const target = moveAfterAssign; setEditing(null); setMoveAfterAssign(null); if (target && saved) await updateHousekeepingTask(saved.id, { status: target }).catch(reason => setError(reason instanceof Error ? reason.message : "Unable to move the task.")); await load(); }}/>}
  </div>;
}

function TaskCard({ task, busy, dragging, onDragStart, onDragEnd, onMove, onEdit }: { task: HousekeepingTask; busy: boolean; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onMove: (status: TaskStatus) => void; onEdit: () => void }) {
  const maintenance = task.task_type === "maintenance";
  const since = task.status === "in_progress" ? minutesSince(task.started_at) : task.status === "done" ? null : minutesSince(task.created_at);
  const next: { status: TaskStatus; label: string; icon: ReactNode } | null =
    task.status === "assigned" ? { status: "in_progress", label: "Start", icon: <Play size={14}/> }
      : task.status === "in_progress" ? (maintenance ? { status: "done", label: "Mark fixed", icon: <CheckCircle2 size={14}/> } : { status: "inspection", label: "Send to inspection", icon: <ClipboardCheck size={14}/> })
      : task.status === "inspection" ? { status: "done", label: "Approve & release", icon: <CheckCircle2 size={14}/> } : null;
  const canDrag = task.status !== "done" && !busy;
  return <article className={`hk-card${task.priority === "high" ? " is-urgent" : ""}${maintenance ? " is-maintenance" : ""}${dragging ? " is-dragging" : ""}${canDrag ? " can-drag" : ""}`}
    draggable={canDrag} aria-roledescription={canDrag ? "draggable card" : undefined}
    onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(task.id)); onDragStart(); }} onDragEnd={onDragEnd}>
    <div className="hk-thumb"><img src={taskPhoto(task)} alt="" loading="lazy"/><span className={`hk-type ${task.task_type}`}>{maintenance ? <Wrench size={12}/> : <SprayCan size={12}/>}{maintenance ? "Maintenance" : "Cleaning"}</span></div>
    <div className="hk-card-body">
      <div className="hk-card-top"><strong>Room {task.room_number}</strong>{task.priority === "high" && <span className="hk-urgent">Urgent</span>}</div>
      <p className="hk-card-sub">{task.room_category || "Room"}{task.floor ? ` · Floor ${task.floor}` : ""}</p>
      {task.notes && <p className="hk-note">{task.notes}</p>}
      <p className="hk-who">{task.assignee ? <><span className="hk-avatar">{task.assignee.slice(0, 1)}</span>{task.assignee}</> : <span className="muted"><UserRound size={14}/>No one assigned</span>}</p>
      {task.supplies.length > 0 && <ul className="hk-supplies" aria-label="Carrying">{task.supplies.map(item => <li key={item.item}><Package size={12}/>{item.item}{item.qty > 1 ? ` ×${item.qty}` : ""}</li>)}</ul>}
      <div className="hk-card-foot">
        <span className="hk-time"><Clock size={13}/>{task.status === "done" ? `Released ${utc(task.completed_at!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : `${duration(since)} ${task.status === "in_progress" ? "working" : "waiting"}`}</span>
        {task.reservation_id && <Link to={`/dashboard/reservations/${task.reservation_id}`} className="hk-link">Stay</Link>}
      </div>
      {task.status !== "done" && <div className="hk-actions">
        <button type="button" className="hk-ghost" onClick={onEdit} disabled={busy}><UserPlus size={14}/>{task.assignee ? "Edit" : "Assign"}</button>
        {next && <button type="button" className="hk-go" onClick={() => onMove(next.status)} disabled={busy}>{busy ? <LoaderCircle size={14} className="hk-spin"/> : next.icon}{next.label}</button>}
      </div>}
    </div>
  </article>;
}

function TaskForm({ task, rooms, staff, onClose, onSaved }: { task: HousekeepingTask | null; rooms: Room[]; staff: Employee[]; onClose: () => void; onSaved: (saved: HousekeepingTask | null) => Promise<void> }) {
  const [roomId, setRoomId] = useState(task?.room_id || 0);
  const [taskType, setTaskType] = useState<"cleaning" | "maintenance">(task?.task_type || "cleaning");
  const [priority, setPriority] = useState<"normal" | "high">(task?.priority || "normal");
  const [assignee, setAssignee] = useState(task?.assignee || "");
  const [notes, setNotes] = useState(task?.notes || "");
  const [supplies, setSupplies] = useState<Supply[]>(task?.supplies || []);
  const [extra, setExtra] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const kit = taskType === "maintenance" ? MAINTENANCE_KIT : CLEANING_KIT;
  // Suggest the right team first: housekeeping for cleaning, maintenance for repairs; everyone else after.
  const team = taskType === "maintenance" ? "Maintenance" : "Housekeeping";
  const people = [...staff.filter(person => person.department === team), ...staff.filter(person => person.department !== team)];
  const qty = (item: string) => supplies.find(supply => supply.item === item)?.qty || 0;
  const setQty = (item: string, value: number) => setSupplies(current => value <= 0 ? current.filter(supply => supply.item !== item)
    : current.some(supply => supply.item === item) ? current.map(supply => supply.item === item ? { ...supply, qty: value } : supply) : [...current, { item, qty: value }]);
  const items = [...kit, ...supplies.map(supply => supply.item).filter(item => !kit.includes(item))];

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      let saved: HousekeepingTask;
      if (task) saved = await updateHousekeepingTask(task.id, { assignee: assignee.trim() || null, supplies, notes: notes.trim() || null, priority });
      else {
        if (!roomId) throw new Error("Choose a room.");
        saved = await createHousekeepingTask({ room_id: roomId, task_type: taskType, priority, assignee: assignee.trim() || null, supplies, notes: notes.trim() || null });
      }
      if (!saved.assignee && task) throw new Error("Choose who will do this job.");
      await onSaved(saved);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save the task."); } finally { setSaving(false); }
  };

  return <div className="fo-modal-backdrop">
    <form className="hk-form" onSubmit={submit}>
      <header>
        <div><p className="hk-eyebrow">{task ? `ROOM ${task.room_number}` : "NEW TASK"}</p><h2>{task ? (task.assignee ? "Update assignment" : "Assign a cleaner") : "Create housekeeping task"}</h2></div>
        <button type="button" className="hk-close" onClick={onClose} disabled={saving} aria-label="Close"><X size={18}/></button>
      </header>
      {!task && <div className="hk-form-row">
        <label>Room<select required value={roomId} onChange={event => setRoomId(Number(event.target.value))}><option value={0}>Select room</option>{rooms.map(room => <option key={room.id} value={room.id}>Room {room.room_number} · {room.room_category}</option>)}</select></label>
        <label>Task<select value={taskType} onChange={event => { setTaskType(event.target.value as "cleaning" | "maintenance"); setSupplies([]); }}><option value="cleaning">Cleaning</option><option value="maintenance">Maintenance</option></select></label>
      </div>}
      <div className="hk-form-row">
        <label>{taskType === "maintenance" ? "Technician" : "Cleaner"}
          <input list="hk-staff" value={assignee} placeholder={people.length ? "Choose or type a name" : "Add staff in Employees, or type a name"} onChange={event => setAssignee(event.target.value)}/>
          <datalist id="hk-staff">{people.map(person => <option key={person.id} value={person.name}>{`${person.designation || person.department}${person.is_on_duty ? "" : " · off duty"}`}</option>)}</datalist>
        </label>
        <label>Priority<select value={priority} onChange={event => setPriority(event.target.value as "normal" | "high")}><option value="normal">Normal</option><option value="high">Urgent (guest arriving)</option></select></label>
      </div>
      <fieldset className="hk-kit">
        <legend>Carrying</legend>
        <div className="hk-kit-grid">{items.map(item => <div key={item} className={`hk-kit-item${qty(item) ? " on" : ""}`}>
          <button type="button" className="hk-kit-name" onClick={() => setQty(item, qty(item) ? 0 : 1)} aria-pressed={qty(item) > 0}>{item}</button>
          {qty(item) > 0 && <span className="hk-qty"><button type="button" onClick={() => setQty(item, qty(item) - 1)} aria-label={`Fewer ${item}`}><Minus size={12}/></button><b>{qty(item)}</b><button type="button" onClick={() => setQty(item, qty(item) + 1)} aria-label={`More ${item}`}><Plus size={12}/></button></span>}
        </div>)}</div>
        <div className="hk-extra"><input value={extra} placeholder="Add another item" onChange={event => setExtra(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (extra.trim()) { setQty(extra.trim(), 1); setExtra(""); } } }}/><button type="button" onClick={() => { if (extra.trim()) { setQty(extra.trim(), 1); setExtra(""); } }}><Plus size={14}/>Add</button></div>
      </fieldset>
      <label className="hk-wide">Notes<textarea value={notes} placeholder={taskType === "maintenance" ? "What needs fixing?" : "Anything the cleaner should know"} onChange={event => setNotes(event.target.value)}/></label>
      {error && <p className="hk-error">{error}</p>}
      <footer><button type="button" className="hk-secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="hk-primary" disabled={saving}>{saving && <LoaderCircle size={15} className="hk-spin"/>}{task ? "Save" : "Create task"}</button></footer>
    </form>
  </div>;
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, SprayCan } from "lucide-react";
import { getHousekeepingTasks, HousekeepingTask } from "./housekeepingApi";

const minutesSince = (value: string | null) => (value ? Math.max(0, Math.round((Date.now() - new Date(`${value}Z`).getTime()) / 60000)) : 0);
const ago = (minutes: number) => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

/** One line per open housekeeping job, in plain words. */
function message(task: HousekeepingTask): { text: string; tone: string } {
  const room = `Room ${task.room_number}`;
  if (task.task_type === "maintenance") return { text: `${room} under maintenance${task.assignee ? ` · ${task.assignee} on it` : " · no technician yet"}`, tone: "repair" };
  switch (task.status) {
    case "pending": return { text: `${room} checked out ${ago(minutesSince(task.created_at))} ago · waiting for a cleaner${task.priority === "high" ? " · URGENT" : ""}`, tone: task.priority === "high" ? "urgent" : "waiting" };
    case "assigned": return { text: `${room} · ${task.assignee} is about to start cleaning`, tone: "starting" };
    case "in_progress": return { text: `${room} · ${task.assignee} cleaning for ${ago(minutesSince(task.started_at))}`, tone: "working" };
    case "inspection": return { text: `${room} cleaned · ready for inspection`, tone: "inspect" };
    default: return { text: `${room} released and ready`, tone: "done" };
  }
}

/** Rooms on their way back from check-out to ready, refreshed every minute.
 *  "strip" is a sideways running banner; "card" is a dashboard card whose list scrolls upward. */
export default function HousekeepingTicker({ variant = "strip" }: { variant?: "strip" | "card" }) {
  const [tasks, setTasks] = useState<HousekeepingTask[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => getHousekeepingTasks().then(list => { if (alive) setTasks(list.filter(task => task.status !== "done")); }).catch(() => { if (alive) setTasks([]); });
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  if (tasks === null) return null;
  const urgentFirst = [...tasks].sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1));
  const items = urgentFirst.length ? urgentFirst.map(message) : [{ text: "All rooms are clean and ready · no housekeeping jobs waiting", tone: "done" }];
  const strip = items.map((item, index) => <span key={index} className={`hk-tick tone-${item.tone}`}><i/>{item.text}</span>);
  if (variant === "card") {
    const scrolls = items.length > 3;
    return <section className="hk-feed" aria-label="Housekeeping updates">
      <header><span className="hk-feed-icon"><SprayCan size={16}/></span><strong>Housekeeping</strong><b>{tasks.length}</b><Link to="/dashboard/housekeeping">Open board<ChevronRight size={14}/></Link></header>
      <div className={`hk-feed-window${scrolls ? " is-scrolling" : ""}`}>
        <div className="hk-feed-move" style={scrolls ? { animationDuration: `${items.length * 3.2}s` } : undefined}>
          <div className="hk-feed-set">{strip}</div>
          {scrolls && <div className="hk-feed-set" aria-hidden="true">{strip}</div>}
        </div>
      </div>
    </section>;
  }
  return <section className="hk-ticker" aria-label="Housekeeping updates">
    <span className="hk-ticker-label"><SprayCan size={15}/>Housekeeping<b>{tasks.length}</b></span>
    <div className="hk-ticker-track" role="marquee" aria-live="off">
      {/* Content is doubled so the loop is seamless; the copy is hidden from screen readers. */}
      <div className="hk-ticker-move" style={{ animationDuration: `${Math.max(18, items.length * 9)}s` }}>
        <div className="hk-ticker-set">{strip}</div>
        <div className="hk-ticker-set" aria-hidden="true">{strip}</div>
      </div>
    </div>
    <Link to="/dashboard/housekeeping" className="hk-ticker-link">Open board<ChevronRight size={15}/></Link>
  </section>;
}

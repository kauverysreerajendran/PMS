import { Link, useLocation } from "react-router-dom";
import { ClipboardCheck, ArrowLeft } from "lucide-react";
const descriptions: Record<string, string> = {
  "Reservations": "Create and review reservations, arrival dates and guest booking details.",
  "Check-In": "Review arriving guests, verify reservation details and complete check-in.",
  "Check-Out": "Review departing guests, payment status and checkout details.",
  "Room Assignment": "Match guests with available rooms and review room allocations.",
  "Guests": "Search guest profiles and review stay information.",
  "Room Status": "Review available, occupied, reserved, cleaning and maintenance rooms.",
  "Front Office Staff": "Review front-office staff and daily desk coverage.",
};
export default function FrontOfficeModule({ title }: { title: string }) {
  const params = new URLSearchParams(useLocation().search);
  const selected = params.get("reservation") || params.get("room");
  return <section className="fo-card fo-placeholder"><span className="fo-placeholder-icon"><ClipboardCheck size={30}/></span><span className="fo-sample">Sample module</span><h2>{title}</h2><p>{descriptions[title]}</p>{selected && <p>Selected reference: <strong>{selected}</strong></p>}<p className="fo-muted">This screen establishes navigation and access. Live data and operational actions will be added in the next phase.</p><Link className="fo-button" to="/dashboard"><ArrowLeft size={16}/>Back to dashboard</Link></section>;
}
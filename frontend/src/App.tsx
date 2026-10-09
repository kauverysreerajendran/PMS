import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import CreateHotelPage from "./pages/CreateHotelPage";
import { useSession } from "./lib/auth";
import { isFrontOfficeManager, frontOfficePages } from "./front-office/access";
import FrontOfficeLayout from "./front-office/FrontOfficeLayout";
import ReferenceDashboard from "./front-office/ReferenceDashboard";
import FrontOfficeModule from "./front-office/FrontOfficeModule";
import ReservationsPage from "./front-office/ReservationsPage";
import CheckInPage from "./front-office/CheckInPage";
import CheckInOperationsPage from "./front-office/CheckInOperationsPage";
import CheckOutPage from "./front-office/CheckOutPage";
import CheckOutBillingPage from "./front-office/CheckOutBillingPage";
import CheckOutOperationsPage from "./front-office/CheckOutOperationsPage";
import RoomAssignmentPage from "./front-office/RoomAssignmentPage";
import GuestsPage from "./front-office/GuestsPage";
import RoomStatusPage from "./front-office/RoomStatusPage";
import StaffPage from "./front-office/StaffPage";
import BillingPaymentsPage from "./front-office/BillingPaymentsPage";

function DashboardRoute() {
  const user = useSession();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace/>;
  if (user.role === "owner" && user.property_id == null) return <CreateHotelPage/>;
  if (isFrontOfficeManager(user.role) || location.pathname === "/dashboard") return <FrontOfficeLayout/>;
  return <AccessDenied/>;
}
function AccessDenied() {
  return <main style={{ padding: 32 }}><h1>Access denied</h1><p>Your role does not have access to this Front Office Manager page.</p><a href="/dashboard">Return to dashboard</a></main>;
}
function DashboardIndex() {
  return <ReferenceDashboard/>;
}
export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage/>}/>
    <Route path="/dashboard" element={<DashboardRoute/>}>
      <Route index element={<DashboardIndex/>}/>
      {frontOfficePages.filter(page => page.slug).map(page => <Route key={page.slug} path={page.slug} element={page.slug === "reservations" ? <ReservationsPage/> : page.slug === "check-in" ? <CheckInOperationsPage/> : page.slug === "check-out" ? <CheckOutOperationsPage/> : page.slug === "billing" ? <BillingPaymentsPage/> : page.slug === "room-assignment" ? <RoomAssignmentPage/> : page.slug === "guests" ? <GuestsPage/> : page.slug === "room-status" ? <RoomStatusPage/> : page.slug === "staff" ? <StaffPage/> : <FrontOfficeModule title={page.title}/>}/>)}
    </Route>
    <Route path="*" element={<UnknownRoute/>}/>
  </Routes>;
}
function UnknownRoute() {
  const user = useSession();
  return user ? <AccessDenied/> : <Navigate to="/login" replace/>;
}

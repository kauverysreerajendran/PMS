import type { ReactElement } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import CreateHotelPage from "./pages/CreateHotelPage";
import { useSession } from "./lib/auth";
import { canUseFrontOffice, isOwner, frontOfficePages } from "./front-office/access";
import FrontOfficeLayout from "./front-office/FrontOfficeLayout";
import HotelDashboard from "./front-office/HotelDashboard";
import ReservationsPage from "./front-office/ReservationsPage";
import CheckInOperationsPage from "./front-office/CheckInOperationsPage";
import CheckOutOperationsPage from "./front-office/CheckOutOperationsPage";
import RoomAssignmentPage from "./front-office/RoomAssignmentPage";
import GuestsPage from "./front-office/GuestsPage";
import RoomStatusPage from "./front-office/RoomStatusPage";
import StaffPage from "./front-office/StaffPage";
import CalendarPage from "./front-office/CalendarPage";
import ReservationFolioPage from "./front-office/ReservationFolioPage";
import BillingPaymentsPage from "./front-office/BillingPaymentsPage";

const pageElements: Record<string, ReactElement> = {
  "calendar": <CalendarPage/>,
  "reservations": <ReservationsPage/>,
  "check-in": <CheckInOperationsPage/>,
  "check-out": <CheckOutOperationsPage/>,
  "billing": <BillingPaymentsPage/>,
  "room-assignment": <RoomAssignmentPage/>,
  "guests": <GuestsPage/>,
  "room-status": <RoomStatusPage/>,
  "staff": <StaffPage/>,
};

function DashboardRoute() {
  const user = useSession();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace/>;
  if (isOwner(user.role) && user.property_id == null) return <CreateHotelPage/>;
  if (canUseFrontOffice(user.role) || location.pathname === "/dashboard") return <FrontOfficeLayout/>;
  return <AccessDenied/>;
}
// An owner registering an additional hotel.
function AddHotelRoute() {
  const user = useSession();
  if (!user) return <Navigate to="/login" replace/>;
  if (!isOwner(user.role)) return <AccessDenied/>;
  return <CreateHotelPage additional={user.property_id != null}/>;
}
function AccessDenied() {
  return <main style={{ padding: 32 }}><h1>Access denied</h1><p>Your role does not have access to this Front Office Manager page.</p><a href="/dashboard">Return to dashboard</a></main>;
}
function DashboardIndex() {
  return <HotelDashboard/>;
}
export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage/>}/>
    <Route path="/hotels/new" element={<AddHotelRoute/>}/>
    <Route path="/dashboard" element={<DashboardRoute/>}>
      <Route index element={<DashboardIndex/>}/>
      {frontOfficePages.filter(page => page.slug).map(page => <Route key={page.slug} path={page.slug} element={pageElements[page.slug]}/>)}
      <Route path="reservations/:id" element={<ReservationFolioPage/>}/>
    </Route>
    <Route path="*" element={<UnknownRoute/>}/>
  </Routes>;
}
function UnknownRoute() {
  const user = useSession();
  return user ? <AccessDenied/> : <Navigate to="/login" replace/>;
}

import { frontOfficeRequest } from "./reservationsApi";
export type PendingCheckOut = { id:number; reservation_code:string; guest:{first_name:string;last_name:string;email:string|null;mobile:string|null}; room_number:string|null; room_category:string|null; check_in_date:string; check_out_date:string; status:string };
export type CheckOut = { id:number; reservation_id:number; guest:PendingCheckOut["guest"]; room_number:string; payment_status:string; payment_method:string; notes:string|null; checked_out_at:string };
export function getPendingCheckOuts(departureDate:string){return frontOfficeRequest<{items:PendingCheckOut[];total:number}>(`/check-outs/pending?departure_date=${encodeURIComponent(departureDate)}`)}
export function createCheckOut(reservationId:number,paymentStatus:string,paymentMethod:string,notes:string){return frontOfficeRequest<CheckOut>("/check-outs",{method:"POST",body:JSON.stringify({reservation_id:reservationId,payment_status:paymentStatus,payment_method:paymentMethod,notes:notes||null})})}
export function getCheckOuts(){return frontOfficeRequest<CheckOut[]>("/check-outs")}


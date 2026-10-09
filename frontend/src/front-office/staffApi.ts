import { frontOfficeRequest } from "./reservationsApi";
export type FrontOfficeStaff = { id:number; username:string; email:string; mobile:string|null; role:string; property_id:number; is_active:boolean; is_locked:boolean };
export function getFrontOfficeStaff(){return frontOfficeRequest<FrontOfficeStaff[]>("/front-office-staff")}

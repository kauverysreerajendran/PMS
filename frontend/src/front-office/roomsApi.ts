import { frontOfficeRequest } from "./reservationsApi";
export type Room = { id:number; room_number:string; room_category:string; floor:string|null; capacity:number; status:string; notes:string|null; property_id:number; is_active:boolean; created_at:string; updated_at:string };
export type RoomInput = Omit<Pick<Room,"room_number"|"room_category"|"floor"|"capacity"|"status"|"notes">,"notes"> & {notes?:string|null};
export function getRooms(){return frontOfficeRequest<Room[]>("/rooms")}; export function createRoom(data:RoomInput){return frontOfficeRequest<Room>("/rooms",{method:"POST",body:JSON.stringify(data)})}; export function updateRoom(id:number,data:RoomInput){return frontOfficeRequest<Room>(`/rooms/${id}`,{method:"PATCH",body:JSON.stringify(data)})}

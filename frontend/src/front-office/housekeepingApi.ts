import { frontOfficeRequest } from "./reservationsApi";

export type TaskStatus = "pending" | "assigned" | "in_progress" | "inspection" | "done";
export type Supply = { item: string; qty: number };
export type HousekeepingTask = {
  id: number; room_id: number; room_number: string; room_category: string | null; floor: string | null; room_status: string | null;
  room_type: string | null; room_name: string | null; image_url: string | null;
  reservation_id: number | null; task_type: "cleaning" | "maintenance"; status: TaskStatus; priority: "normal" | "high";
  assignee: string | null; supplies: Supply[]; notes: string | null;
  created_at: string; assigned_at: string | null; started_at: string | null; completed_at: string | null;
};
export type TaskInput = { room_id: number; task_type: "cleaning" | "maintenance"; priority: "normal" | "high"; assignee?: string | null; supplies: Supply[]; notes?: string | null };
export type TaskChanges = Partial<Pick<HousekeepingTask, "status" | "priority" | "assignee" | "supplies" | "notes">>;

export function getHousekeepingTasks() { return frontOfficeRequest<HousekeepingTask[]>("/housekeeping/tasks"); }
export function createHousekeepingTask(data: TaskInput) { return frontOfficeRequest<HousekeepingTask>("/housekeeping/tasks", { method: "POST", body: JSON.stringify(data) }); }
export function updateHousekeepingTask(id: number, changes: TaskChanges) { return frontOfficeRequest<HousekeepingTask>(`/housekeeping/tasks/${id}`, { method: "PATCH", body: JSON.stringify(changes) }); }

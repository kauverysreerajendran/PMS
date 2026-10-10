import { frontOfficeRequest } from "./reservationsApi";

export type Employee = {
  id: number; name: string; department: string; designation: string | null; phone: string | null; email: string | null;
  shift: string | null; joined_on: string | null; notes: string | null; is_on_duty: boolean;
};
export type EmployeeInput = Omit<Employee, "id">;

export function getEmployees(department?: string) { return frontOfficeRequest<Employee[]>(`/employees${department ? `?department=${encodeURIComponent(department)}` : ""}`); }
export function createEmployee(data: EmployeeInput) { return frontOfficeRequest<Employee>("/employees", { method: "POST", body: JSON.stringify(data) }); }
export function updateEmployee(id: number, data: EmployeeInput) { return frontOfficeRequest<Employee>(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(data) }); }
export function removeEmployee(id: number) { return frontOfficeRequest<void>(`/employees/${id}`, { method: "DELETE" }); }

import { api } from './apiClient'
export type StaffApi={id:number;full_name:string;username:string;phone?:string;role:string;is_active:boolean}
export const staffService={list:()=>api<StaffApi[]>('/staff'),create:(data:Record<string,unknown>)=>api<StaffApi>('/staff',{method:'POST',body:JSON.stringify(data)}),update:(id:number,data:Record<string,unknown>)=>api<StaffApi>(`/staff/${id}`,{method:'PATCH',body:JSON.stringify(data)})}

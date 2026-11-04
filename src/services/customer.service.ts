import { api } from './apiClient'
import type { Customer } from '../types/customer'
type ApiCustomer={id:number;name:string;gender?:string;birth_date?:string;phone?:string;address?:string;username?:string}
const map=(c:ApiCustomer)=>({id:String(c.id),name:c.name,gender:c.gender||'',birthDate:c.birth_date||'',phone:c.phone||'',address:c.address||'',username:c.username||''} as Customer)
export const customerService={list:async()=>{const items=await api<ApiCustomer[]>('/customers');return items.map(map)},create:async(data:Record<string,unknown>)=>map(await api<ApiCustomer>('/customers',{method:'POST',body:JSON.stringify(data)})),update:async(id:string,data:Record<string,unknown>)=>map(await api<ApiCustomer>(`/customers/${id}`,{method:'PATCH',body:JSON.stringify(data)}))}

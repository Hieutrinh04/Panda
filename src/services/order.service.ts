import { api } from './apiClient'
import type { Order } from '../types/order'
type ApiOrder={id:number;product_name_snapshot:string;color?:string;size?:string;phone_snapshot?:string;address_snapshot?:string;status:string}
const map=(o:ApiOrder)=>({id:String(o.id),product:o.product_name_snapshot,color:o.color||'',size:o.size||'',phone:o.phone_snapshot||'',address:o.address_snapshot||'',status:o.status==='preparing'?'Đang chuẩn bị':o.status==='shipping'?'Đang giao':o.status==='received'?'Đã nhận':o.status==='returned'?'Đã trả':o.status} as Order)
export const orderService={list:async(type:'sale'|'rental')=>{const items=await api<ApiOrder[]>(`/orders?type=${type}`);return items.map(map)},updateStatus:(id:string,status:string)=>api<ApiOrder>(`/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}).then(map)}

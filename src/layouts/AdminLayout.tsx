import type { ReactNode } from 'react'
import type { View } from '../routes'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
const titles:Record<string,string>={dashboard:'Tổng quan',store:'Cửa hàng',products:'Sản phẩm bán',rentals:'Sản phẩm thuê',customers:'Khách hàng',staff:'Nhân viên',orders:'Đơn hàng',rentalOrders:'Đơn thuê',reports:'Thống kê',settings:'Cài đặt'}
export function AdminLayout({view,onNavigate,children,role}:{view:View;onNavigate:(v:View)=>void;children:ReactNode;role?:string}){return <main className="admin-page"><Sidebar view={view} onNavigate={onNavigate} role={role}/><section className="content"><Header title={titles[view]} onProfile={()=>onNavigate('settings')}/>{children}</section></main>}

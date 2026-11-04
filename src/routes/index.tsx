import type { ReactNode } from 'react'
export type View='login'|'register'|'dashboard'|'store'|'products'|'rentals'|'customers'|'staff'|'orders'|'rentalOrders'|'reports'|'settings'
export function RoutePlaceholder({title,children}:{title:string;children?:ReactNode}){return <section className="panel placeholder-page"><h2>{title}</h2><p>Đang chờ hoàn thiện dữ liệu và API.</p>{children}</section>}

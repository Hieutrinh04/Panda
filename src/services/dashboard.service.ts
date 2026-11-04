import { api } from './apiClient'
export type DashboardSummary={today_revenue:number;sold_product_count:number;rented_product_count:number}
export const dashboardService={summary:()=>api<DashboardSummary>('/dashboard/summary')}

import { api } from './apiClient'
export type ReportSummary={total:number;transaction_count:number}
export type ReportTransaction={id:number;order_id:number;type:string;amount:number;note?:string;created_at:string}
export const reportService={summary:()=>api<ReportSummary>('/reports/summary'),transactions:()=>api<ReportTransaction[]>('/reports/transactions')}

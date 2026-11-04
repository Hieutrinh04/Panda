import { useEffect, useState } from 'react'
import './App.css'
import { AdminLayout } from './layouts/AdminLayout'
import { AuthPage } from './pages/auth/AuthPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { ProductListPage } from './pages/products/ProductListPage'
import { CustomerListPage } from './pages/customers/CustomerListPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { MockListPage } from './pages/shared/MockListPage'
import { ReportPage } from './pages/reports/ReportPage'
import { products as fallbackProducts, rentalProducts as fallbackRentals } from './mocks/products'
import { customers as fallbackCustomers } from './mocks/customers'
import { orders as fallbackOrders, rentals as fallbackRentalOrders } from './mocks/orders'
import { staff } from './mocks/staff'
import type { View } from './routes'
import { useAppRoute } from './hooks/useAppRoute'
import { authService } from './services/auth.service'
import { productService } from './services/product.service'
import { customerService } from './services/customer.service'
import { orderService } from './services/order.service'
import { dashboardService, type DashboardSummary } from './services/dashboard.service'
import { staffService, type StaffApi } from './services/staff.service'
import { reportService, type ReportSummary, type ReportTransaction } from './services/report.service'
import { settingsService } from './services/settings.service'
import type { Product } from './types/product'
import type { Customer } from './types/customer'
import type { Order } from './types/order'
import { StorePage } from './pages/store/StorePage'

export default function App(){
  const {view,navigate}=useAppRoute(); const [logged,setLogged]=useState(Boolean(localStorage.getItem('panda_token'))); const [error,setError]=useState(''); const [summary,setSummary]=useState<DashboardSummary>(); const [products,setProducts]=useState<Product[]>(fallbackProducts); const [rentals,setRentals]=useState<Product[]>(fallbackRentals); const [customers,setCustomers]=useState<Customer[]>(fallbackCustomers); const [orders,setOrders]=useState<Order[]>(fallbackOrders); const [rentalOrders,setRentalOrders]=useState<Order[]>(fallbackRentalOrders); const [staffRows,setStaffRows]=useState<StaffApi[]>(staff.map(s=>({id:Number(s.id),full_name:s.name,username:s.username,phone:s.phone,role:s.role,is_active:true}))); const [reportSummary,setReportSummary]=useState<ReportSummary>({total:0,transaction_count:0}); const [reportTransactions,setReportTransactions]=useState<ReportTransaction[]>([]); const [profile,setProfile]=useState<import('./services/types').User>()
  const standaloneShop=window.location.pathname.startsWith('/shop')
  const go=(v:View)=>navigate(v)
  useEffect(()=>{if(!logged)return;dashboardService.summary().then(setSummary).catch(()=>undefined);productService.list('sale').then(setProducts).catch(()=>undefined);productService.list('rental').then(setRentals).catch(()=>undefined);customerService.list().then(setCustomers).catch(()=>undefined);orderService.list('sale').then(setOrders).catch(()=>undefined);orderService.list('rental').then(setRentalOrders).catch(()=>undefined);staffService.list().then(setStaffRows).catch(()=>undefined);reportService.summary().then(setReportSummary).catch(()=>undefined);reportService.transactions().then(setReportTransactions).catch(()=>undefined);settingsService.profile().then(setProfile).catch(()=>undefined)},[logged])
  const login=async(username:string,password:string)=>{setError('');try{const result=view==='register'?await authService.register({full_name:username,username,password}):await authService.login({username,password});localStorage.setItem('panda_token',result.access_token);setLogged(true);go('dashboard')}catch(e){setError(e instanceof Error?e.message:'Đăng nhập thất bại')}}
  if(standaloneShop)return <div className="standalone-store"><StorePage items={products} rentalItems={rentals}/></div>
  if(!logged&&view==='store')return <StorePage items={products} rentalItems={rentals}/>
  if(!logged&&(view==='login'||view==='register'))return <AuthPage mode={view} onSubmit={login} onChange={go} error={error}/>
  return <AdminLayout view={view} onNavigate={go} role={profile?.role}>{view==='store'?<StorePage items={products} rentalItems={rentals}/>:view==='dashboard'?<DashboardPage summary={summary}/>:view==='products'?<ProductListPage items={products} onChanged={setProducts}/>:view==='rentals'?<ProductListPage items={rentals} rental onChanged={setRentals}/>:view==='customers'?<CustomerListPage items={customers} onChanged={setCustomers}/>:view==='orders'?<MockListPage headers={['Sản phẩm','Màu','Size','SĐT','Địa chỉ','Trạng thái']} rows={orders.map(o=>[o.product,o.color,o.size,o.phone,o.address,o.status])} buttonLabel="đơn hàng"/>:view==='rentalOrders'?<MockListPage headers={['Sản phẩm','Màu','Size','SĐT','Địa chỉ','Trạng thái']} rows={rentalOrders.map(o=>[o.product,o.color,o.size,o.phone,o.address,o.status])} buttonLabel="đơn thuê"/>:view==='staff'?<MockListPage headers={['Tên','Tài khoản','SĐT','Vai trò','Trạng thái']} rows={staffRows.map(s=>[s.full_name,s.username,s.phone||'',s.role,s.is_active?'Đang hoạt động':'Đã khóa'])} buttonLabel="nhân viên"/>:view==='reports'?<ReportPage total={reportSummary.total} count={reportSummary.transaction_count} rows={reportTransactions.map(t=>[String(t.id),t.type,`${t.amount.toLocaleString('vi-VN')}đ`,new Date(t.created_at).toLocaleDateString('vi-VN')])}/>:view==='settings'?<SettingsPage user={profile} onLogout={()=>{localStorage.removeItem('panda_token');setLogged(false);go('login')}}/>:<div/>}</AdminLayout>
}

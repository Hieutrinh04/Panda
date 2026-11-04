import { api } from './apiClient'
import type { User } from './types'
export const settingsService={profile:()=>api<User>('/settings/profile'),update:(data:Partial<Pick<User,'full_name'|'phone'>>)=>api<User>('/settings/profile',{method:'PATCH',body:JSON.stringify(data)})}

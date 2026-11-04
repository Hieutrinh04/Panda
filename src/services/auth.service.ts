import { api } from './apiClient'
import type { User } from './types'
export type LoginPayload={username:string;password:string};export type AuthResponse={access_token:string;token_type:string;user:User}
export const authService={login:(payload:LoginPayload)=>api<AuthResponse>('/auth/login',{method:'POST',body:JSON.stringify(payload)}),register:(payload:{full_name:string;username:string;password:string})=>api<AuthResponse>('/auth/register',{method:'POST',body:JSON.stringify(payload)}),me:()=>api<User>('/auth/me')}

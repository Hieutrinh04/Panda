import { useState } from 'react'
import type { View } from '../routes'
export function useAppRoute(){const [view,setView]=useState<View>('login');return {view,navigate:setView}}

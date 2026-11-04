import type { Status } from '../../../types/common'
export function StatusBadge({status}:{status:Status}){return <span className={'status status-'+status.replaceAll(' ','-')}>{status}</span>}

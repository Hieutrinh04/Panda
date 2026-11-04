import type { ReactNode } from 'react'
export function DataTable({headers,children}:{headers:string[];children:ReactNode}){return <div className={`table table-cols-${headers.length}`}><div className="table-head"><span>Ảnh</span>{headers.map(h=><span key={h}>{h}</span>)}<span>Thao tác</span></div>{children}</div>}

import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useDb } from '../../data/store'
import { useAdminUser } from '../../services/auth'
import { deleteTaxonomy, saveTaxonomy } from '../../services/catalog'
import { Empty, Field, Modal, Tabs } from '../../components/ui'
import { useAction, useFeedback } from '../../components/feedback'

type Key = 'categories' | 'suppliers' | 'collections'
type Item = { id?: string; name: string; description?: string; phone?: string; email?: string; address?: string }

const LABEL: Record<Key, string> = { categories: 'Danh mục', suppliers: 'Nhà cung cấp', collections: 'Bộ sưu tập' }
const FIELD: Record<Key, 'categoryId' | 'supplierId' | 'collectionId'> = { categories: 'categoryId', suppliers: 'supplierId', collections: 'collectionId' }

export function Taxonomy() {
  const db = useDb()
  const user = useAdminUser()!
  const run = useAction()
  const { confirm } = useFeedback()
  const [tab, setTab] = useState<Key>('categories')
  const [editing, setEditing] = useState<Item>()
  const items = db[tab] as Item[]

  const remove = async (item: Item) => {
    if (await confirm({ title: `Xóa ${LABEL[tab].toLowerCase()}?`, message: `Xóa "${item.name}"?`, danger: true, confirmLabel: 'Xóa' }))
      await run(() => deleteTaxonomy(user.id, tab, item.id!), 'Đã xóa')
  }
  const save = async () => {
    if (editing && (await run(() => saveTaxonomy(user.id, tab, editing), 'Đã lưu'))) setEditing(undefined)
  }

  return (
    <>
      <div className="page-head">
        <div><h2>Danh mục, nhà cung cấp & bộ sưu tập</h2><p>Phân loại sản phẩm để khách dễ tìm và để quản lý nguồn hàng.</p></div>
        <button className="btn btn-primary" onClick={() => setEditing({ name: '' })}><Plus /> Thêm {LABEL[tab].toLowerCase()}</button>
      </div>
      <section className="card">
        <Tabs value={tab} onChange={setTab} items={(Object.keys(LABEL) as Key[]).map((k) => ({ value: k, label: LABEL[k], count: (db[k] as Item[]).length }))} />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Tên</th><th>{tab === 'suppliers' ? 'Liên hệ' : 'Mô tả'}</th><th className="num">Số sản phẩm</th><th /></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td className="muted">{tab === 'suppliers' ? [item.phone, item.email, item.address].filter(Boolean).join(' · ') : item.description}</td>
                  <td className="num">{db.products.filter((p) => p[FIELD[tab]] === item.id).length}</td>
                  <td className="right nowrap">
                    <button className="icon-btn" onClick={() => setEditing(item)} aria-label="Sửa"><Pencil /></button>
                    <button className="icon-btn" onClick={() => void remove(item)} aria-label="Xóa"><Trash2 /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <Empty />}
        </div>
      </section>
      {editing && (
        <Modal title={`${editing.id ? 'Sửa' : 'Thêm'} ${LABEL[tab].toLowerCase()}`} onClose={() => setEditing(undefined)} footer={<><button className="btn" onClick={() => setEditing(undefined)}>Hủy</button><button className="btn btn-primary" onClick={() => void save()}>Lưu</button></>}>
          <div className="stack">
            <Field label="Tên"><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus /></Field>
            {tab === 'suppliers' ? (
              <>
                <div className="grid-2">
                  <Field label="Điện thoại"><input className="input" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
                  <Field label="Email"><input className="input" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
                </div>
                <Field label="Địa chỉ"><input className="input" value={editing.address ?? ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
              </>
            ) : (
              <Field label="Mô tả"><textarea className="textarea" value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

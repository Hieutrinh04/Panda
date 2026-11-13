import type { Address, Id, Role, StoreSettings, Task, User } from '../types'
import { isRemote, mutate, reloadRemote, resetDb } from '../data/store'
import { createDetachedClient, friendlyError } from '../lib/supabase'
import { hashPassword, nowISO, uid } from '../lib/format'
import { fail, log, notify } from './core'

export interface PersonInput {
  fullName: string
  email: string
  phone: string
  username?: string
  gender?: User['gender']
  birthDate?: string
  note?: string
  position?: string
  role?: Role
  password?: string
  address?: string
}

function validatePerson(input: PersonInput) {
  if (input.fullName.trim().length < 2) fail('Họ tên quá ngắn.')
  if (input.email && !/^\S+@\S+\.\S+$/.test(input.email.trim())) fail('Email không hợp lệ.')
  if (!/^0\d{9,10}$/.test(input.phone.replace(/\s/g, ''))) fail('Số điện thoại phải gồm 10–11 chữ số, bắt đầu bằng 0.')
  if (input.password && input.password.length < 6) fail('Mật khẩu tối thiểu 6 ký tự.')
}

/** Tạo hoặc cập nhật tài khoản (khách hàng hoặc nhân viên) từ trang quản trị. */
export function savePerson(actorId: Id, input: PersonInput, userId?: Id): User {
  validatePerson(input)
  return mutate((db) => {
    const email = input.email.trim().toLowerCase()
    const phone = input.phone.replace(/\s/g, '')
    const username = (input.username || email.split('@')[0] || phone).trim()
    const others = db.users.filter((u) => u.id !== userId)
    if (email && others.some((u) => u.email.toLowerCase() === email)) fail('Email đã được sử dụng.')
    if (others.some((u) => u.phone === phone)) fail('Số điện thoại đã được sử dụng.')
    if (others.some((u) => u.username.toLowerCase() === username.toLowerCase())) fail('Tên đăng nhập đã tồn tại.')

    const existing = db.users.find((u) => u.id === userId)
    const fields = {
      fullName: input.fullName.trim(), email, phone, username, gender: input.gender, birthDate: input.birthDate || undefined,
      note: input.note?.trim() || undefined, position: input.position?.trim() || undefined,
    }
    if (existing) {
      if (existing.id === actorId && input.role && input.role !== existing.role) fail('Không thể tự thay đổi vai trò của chính mình.')
      Object.assign(existing, fields)
      if (input.role) existing.role = input.role
      // Mật khẩu do Supabase Auth giữ: nhân viên tự đổi trong Hồ sơ hoặc dùng "Quên mật khẩu".
      if (input.password && isRemote) fail('Không thể đặt lại mật khẩu cho người khác. Nhân viên tự đổi trong Hồ sơ hoặc dùng chức năng quên mật khẩu.')
      if (input.password) existing.passwordHash = hashPassword(input.password)
      log(db, actorId, existing.role === 'customer' ? 'Cập nhật khách hàng' : 'Cập nhật nhân viên', existing.fullName)
      return existing
    }
    const role = input.role ?? 'customer'
    if (role !== 'customer' && !input.password) fail('Vui lòng đặt mật khẩu cho tài khoản nhân viên.')
    if (role !== 'customer' && isRemote) fail('Tài khoản nhân viên cần được tạo qua createStaffAccount().')
    const user: User = {
      ...fields, id: crypto.randomUUID(), role, passwordHash: hashPassword(input.password || Math.random().toString(36).slice(2)),
      isActive: true, createdAt: nowISO(), points: 0,
      addresses: input.address?.trim() ? [{ id: uid('addr-'), label: 'Mặc định', receiver: fields.fullName, phone, line: input.address.trim(), isDefault: true }] : [],
    }
    db.users.push(user)
    log(db, actorId, role === 'customer' ? 'Thêm khách hàng' : 'Thêm nhân viên', user.fullName)
    return user
  })
}

/**
 * Tạo tài khoản nhân viên/quản lý có thể đăng nhập. Ở chế độ Supabase, tài khoản
 * được đăng ký qua Supabase Auth bằng một client riêng (không ảnh hưởng phiên của
 * quản lý), sau đó quản lý gán vai trò cho hồ sơ vừa tạo.
 */
export async function createStaffAccount(actorId: Id, input: PersonInput): Promise<{ needsConfirmation: boolean }> {
  validatePerson(input)
  if (!input.password) fail('Vui lòng đặt mật khẩu cho tài khoản nhân viên.')
  if (!isRemote) {
    savePerson(actorId, { ...input, role: input.role ?? 'staff' })
    return { needsConfirmation: false }
  }
  const email = input.email.trim().toLowerCase()
  if (!email) fail('Tài khoản nhân viên cần có email để đăng nhập.')
  const phone = input.phone.replace(/\s/g, '')
  const { data, error } = await createDetachedClient().auth.signUp({ email, password: input.password!, options: { data: { full_name: input.fullName.trim(), phone } } })
  if (error) fail(friendlyError(error.message))
  if (!data.user || data.user.identities?.length === 0) fail('Email đã được sử dụng.')
  await reloadRemote()
  const userId = data.user!.id
  mutate((db) => {
    const user = db.users.find((u) => u.id === userId)
    if (!user) return fail('Không tìm thấy hồ sơ vừa tạo, hãy tải lại trang.')
    Object.assign(user, {
      role: input.role && input.role !== 'customer' ? input.role : 'staff', username: (input.username || email.split('@')[0]).trim(),
      gender: input.gender, birthDate: input.birthDate || undefined, position: input.position?.trim() || undefined,
    })
    log(db, actorId, 'Thêm nhân viên', user.fullName)
  })
  return { needsConfirmation: !data.session }
}

export function toggleUserActive(actorId: Id, userId: Id) {
  if (actorId === userId) fail('Không thể tự khóa tài khoản của mình.')
  mutate((db) => {
    const user = db.users.find((u) => u.id === userId)!
    user.isActive = !user.isActive
    if (!user.isActive && db.session.adminId === userId) delete db.session.adminId
    log(db, actorId, user.isActive ? 'Mở khóa tài khoản' : 'Khóa tài khoản', user.fullName)
  })
}

export function updateCustomerNote(actorId: Id, customerId: Id, note: string) {
  mutate((db) => {
    const user = db.users.find((u) => u.id === customerId)!
    user.note = note.trim() || undefined
    log(db, actorId, 'Cập nhật ghi chú khách hàng', user.fullName)
  })
}

export function adjustPoints(actorId: Id, customerId: Id, delta: number, reason: string) {
  if (!Number.isInteger(delta) || !delta) fail('Số điểm phải là số nguyên khác 0.')
  mutate((db) => {
    const user = db.users.find((u) => u.id === customerId)!
    if (user.points + delta < 0) fail('Điểm thưởng không thể âm.')
    user.points += delta
    notify(db, user.id, `${delta > 0 ? 'Cộng' : 'Trừ'} ${Math.abs(delta)} điểm thưởng`, reason || 'Điều chỉnh bởi cửa hàng', '/tai-khoan/uu-dai')
    log(db, actorId, 'Điều chỉnh điểm thưởng', `${user.fullName} (${delta > 0 ? '+' : ''}${delta})`)
  })
}

// ---------- Địa chỉ của khách ----------

export function saveAddress(userId: Id, address: Omit<Address, 'id'> & { id?: Id }) {
  if (!address.receiver.trim() || address.line.trim().length < 5) fail('Vui lòng nhập người nhận và địa chỉ đầy đủ.')
  if (!/^0\d{9,10}$/.test(address.phone.replace(/\s/g, ''))) fail('Số điện thoại không hợp lệ.')
  mutate((db) => {
    const user = db.users.find((u) => u.id === userId)!
    const makeDefault = address.isDefault || user.addresses.length === 0
    if (makeDefault) user.addresses.forEach((a) => (a.isDefault = false))
    const existing = user.addresses.find((a) => a.id === address.id)
    if (existing) Object.assign(existing, address, { isDefault: makeDefault || existing.isDefault })
    else user.addresses.push({ ...address, id: uid('addr-'), isDefault: makeDefault })
  })
}

export function deleteAddress(userId: Id, addressId: Id) {
  mutate((db) => {
    const user = db.users.find((u) => u.id === userId)!
    user.addresses = user.addresses.filter((a) => a.id !== addressId)
    if (user.addresses.length && !user.addresses.some((a) => a.isDefault)) user.addresses[0].isDefault = true
  })
}

// ---------- Phân công công việc ----------

export function saveTask(actorId: Id, input: Omit<Task, 'id' | 'createdAt' | 'createdBy'> & { id?: Id }) {
  if (input.title.trim().length < 3) fail('Tiêu đề công việc quá ngắn.')
  if (!input.assigneeId) fail('Vui lòng chọn nhân viên phụ trách.')
  mutate((db) => {
    const existing = db.tasks.find((t) => t.id === input.id)
    if (existing) Object.assign(existing, input)
    else {
      db.tasks.unshift({ ...input, id: uid('task-'), createdBy: actorId, createdAt: nowISO() })
      notify(db, input.assigneeId, 'Bạn được giao công việc mới', input.title, '/admin/cong-viec')
    }
    log(db, actorId, existing ? 'Cập nhật công việc' : 'Giao công việc', input.title)
  })
}

export function setTaskStatus(actorId: Id, taskId: Id, status: Task['status']) {
  mutate((db) => {
    const task = db.tasks.find((t) => t.id === taskId)!
    task.status = status
    if (status === 'done') notify(db, task.createdBy, 'Công việc đã hoàn thành', task.title, '/admin/cong-viec')
    log(db, actorId, 'Cập nhật công việc', task.title)
  })
}

export function deleteTask(actorId: Id, taskId: Id) {
  mutate((db) => {
    const task = db.tasks.find((t) => t.id === taskId)!
    db.tasks = db.tasks.filter((t) => t.id !== taskId)
    log(db, actorId, 'Xóa công việc', task.title)
  })
}

// ---------- Cài đặt cửa hàng ----------

export function saveSettings(actorId: Id, settings: StoreSettings) {
  if (!settings.storeName.trim()) fail('Tên cửa hàng không được trống.')
  if (settings.pointsPerAmount <= 0 || settings.pointValue < 0) fail('Cấu hình điểm thưởng không hợp lệ.')
  mutate((db) => {
    db.settings = { ...settings, tiers: [...settings.tiers].sort((a, b) => a.minSpent - b.minSpent) }
    log(db, actorId, 'Cập nhật cài đặt cửa hàng')
  })
}

export const resetDemoData = () => resetDb()

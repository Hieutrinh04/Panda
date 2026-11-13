// Đăng nhập, đăng ký, mật khẩu và hồ sơ cá nhân.
// Chế độ Supabase dùng Supabase Auth; chế độ cục bộ dùng dữ liệu trong trình duyệt.
import type { Database, Id, User } from '../types'
import { getDb, isRemote, mutate, reloadRemote, useDb } from '../data/store'
import { friendlyError, supabase } from '../lib/supabase'
import { hashPassword, normalize, nowISO } from '../lib/format'
import { fail, log, notify } from './core'

export type Scope = 'admin' | 'shop'

const MAX_ATTEMPTS = 5

const findByIdentifier = (db: Database, identifier: string) => {
  const key = normalize(identifier)
  return db.users.find((u) => [u.email, u.username, u.phone].some((v) => v && normalize(v) === key))
}

function checkLock(key: string) {
  const attempt = getDb().loginAttempts[key]
  if (attempt && attempt.lockUntil > Date.now())
    fail(`Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ${Math.ceil((attempt.lockUntil - Date.now()) / 1000)} giây.`)
}

/** Ghi nhận một lần nhập sai; sai 5 lần liên tiếp sẽ bị khóa tạm, thời gian khóa tăng gấp đôi mỗi lần. */
function recordFailure(db: Database, key: string) {
  const current = db.loginAttempts[key] ?? { count: 0, lockUntil: 0, level: 0 }
  current.count += 1
  if (current.count >= MAX_ATTEMPTS) {
    const seconds = 30 * 2 ** current.level
    db.loginAttempts[key] = { count: 0, lockUntil: Date.now() + seconds * 1000, level: current.level + 1 }
    return `Sai quá ${MAX_ATTEMPTS} lần. Tài khoản bị khóa ${seconds} giây.`
  }
  db.loginAttempts[key] = current
  return `Tài khoản hoặc mật khẩu không đúng. Còn ${MAX_ATTEMPTS - current.count} lần thử.`
}

const scopeError = (scope: Scope) =>
  scope === 'admin' ? 'Tài khoản này không phải tài khoản quản trị.' : 'Tài khoản quản trị không dùng để mua hàng. Hãy đăng nhập ở trang quản trị.'

export async function login(identifier: string, password: string, scope: Scope): Promise<User> {
  if (!identifier.trim() || !password) fail('Vui lòng nhập đầy đủ tài khoản và mật khẩu.')
  const key = normalize(identifier)
  checkLock(key)

  if (isRemote && supabase) {
    // Trang quản trị cho phép đăng nhập bằng tên đăng nhập/SĐT: đổi sang email trước.
    let email = identifier.trim()
    if (!email.includes('@')) {
      const { data } = await supabase.rpc('email_for_login', { identifier: email })
      email = (data as string | null) ?? ''
    }
    const { data, error } = email ? await supabase.auth.signInWithPassword({ email, password }) : { data: null, error: { message: 'Invalid login credentials' } }
    const authId = data?.user?.id
    if (error || !authId) {
      if (/Invalid login credentials/i.test(error?.message ?? '')) fail(mutate((db) => recordFailure(db, key)))
      fail(friendlyError(error?.message ?? ''))
    }
    await reloadRemote()
    const user = getDb().users.find((u) => u.id === authId)
    const problem = !user ? 'Không tìm thấy hồ sơ của tài khoản.' : !user.isActive ? 'Tài khoản đã bị khóa. Vui lòng liên hệ quản lý cửa hàng.' : (scope === 'admin') === (user.role === 'customer') ? scopeError(scope) : ''
    if (problem) {
      await supabase.auth.signOut()
      await reloadRemote()
      fail(problem)
    }
    mutate((db) => {
      delete db.loginAttempts[key]
      if (scope === 'admin') log(db, user!.id, 'Đăng nhập trang quản trị')
    })
    return user!
  }

  // Số lần sai phải được lưu lại, nên lỗi được trả về từ mutate() rồi mới ném ra.
  const result = mutate((db): User | string => {
    const user = findByIdentifier(db, identifier)
    const roleOk = user && (scope === 'admin' ? user.role !== 'customer' : user.role === 'customer')
    if (!user || !roleOk || user.passwordHash !== hashPassword(password)) return recordFailure(db, key)
    if (!user.isActive) return 'Tài khoản đã bị khóa. Vui lòng liên hệ quản lý cửa hàng.'
    delete db.loginAttempts[key]
    if (scope === 'admin') {
      db.session.adminId = user.id
      log(db, user.id, 'Đăng nhập trang quản trị')
    } else db.session.customerId = user.id
    return user
  })
  return typeof result === 'string' ? fail(result) : result
}

export async function logout(scope: Scope) {
  if (isRemote && supabase) {
    await supabase.auth.signOut()
    await reloadRemote()
    return
  }
  mutate((db) => {
    if (scope === 'admin') delete db.session.adminId
    else delete db.session.customerId
  })
}

export interface RegisterInput { fullName: string; email: string; phone: string; password: string }

/**
 * Đăng ký chỉ tạo tài khoản khách hàng; tài khoản nhân viên do quản lý cấp.
 * Trả về needsConfirmation = true nếu Supabase yêu cầu xác nhận email trước khi đăng nhập.
 */
export async function registerCustomer(input: RegisterInput): Promise<{ needsConfirmation: boolean }> {
  const email = input.email.trim().toLowerCase()
  const phone = input.phone.replace(/\s/g, '')
  if (input.fullName.trim().length < 2) fail('Họ tên quá ngắn.')
  if (!/^\S+@\S+\.\S+$/.test(email)) fail('Email không hợp lệ.')
  if (!/^0\d{9,10}$/.test(phone)) fail('Số điện thoại phải gồm 10–11 chữ số, bắt đầu bằng 0.')
  if (input.password.length < 6) fail('Mật khẩu tối thiểu 6 ký tự.')

  const welcome = (db: Database, userId: Id) =>
    notify(db, userId, 'Chào mừng bạn đến với Panda Fashion', 'Nhập mã PANDA10 để được giảm 10% cho đơn hàng đầu tiên.', '/tai-khoan/uu-dai')

  if (isRemote && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email, password: input.password,
      options: { data: { full_name: input.fullName.trim(), phone }, emailRedirectTo: `${window.location.origin}/dang-nhap` },
    })
    if (error) fail(friendlyError(error.message))
    // Supabase trả về tài khoản không có danh tính khi email đã đăng ký (để tránh lộ thông tin).
    if (data.user && data.user.identities?.length === 0) fail('Email đã được sử dụng.')
    if (!data.session) return { needsConfirmation: true }
    await reloadRemote()
    mutate((db) => welcome(db, data.user!.id))
    return { needsConfirmation: false }
  }

  mutate((db) => {
    if (db.users.some((u) => u.email.toLowerCase() === email)) fail('Email đã được sử dụng.')
    if (db.users.some((u) => u.phone === phone)) fail('Số điện thoại đã được sử dụng.')
    const user: User = {
      id: crypto.randomUUID(), role: 'customer', fullName: input.fullName.trim(), email, phone, username: email.split('@')[0],
      passwordHash: hashPassword(input.password), isActive: true, createdAt: nowISO(), addresses: [], points: 0,
    }
    db.users.push(user)
    db.session.customerId = user.id
    welcome(db, user.id)
  })
  return { needsConfirmation: false }
}

/**
 * Khôi phục mật khẩu. Supabase gửi email chứa liên kết đặt lại mật khẩu (trả về undefined);
 * bản cục bộ trả về mã xác nhận để hiển thị trên màn hình.
 */
export async function requestPasswordReset(email: string): Promise<string | undefined> {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) fail('Email không hợp lệ.')
  if (isRemote && supabase) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/dat-lai-mat-khau` })
    if (error) fail(friendlyError(error.message))
    return undefined
  }
  return mutate((db) => {
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    if (!user) return fail('Không tìm thấy tài khoản với email này.')
    const code = String(Math.floor(100000 + Math.random() * 900000))
    db.resets = db.resets.filter((r) => r.email !== user.email)
    db.resets.push({ email: user.email, code, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() })
    return code
  })
}

/** Đặt lại mật khẩu bằng mã xác nhận (chỉ dùng ở chế độ cục bộ). */
export async function resetPassword(email: string, code: string, newPassword: string) {
  if (newPassword.length < 6) fail('Mật khẩu tối thiểu 6 ký tự.')
  mutate((db) => {
    const reset = db.resets.find((r) => r.email === email.trim().toLowerCase() && r.code === code.trim())
    if (!reset || new Date(reset.expiresAt).getTime() < Date.now()) return fail('Mã xác nhận không đúng hoặc đã hết hạn.')
    const user = db.users.find((u) => u.email === reset.email)!
    user.passwordHash = hashPassword(newPassword)
    db.resets = db.resets.filter((r) => r !== reset)
    delete db.loginAttempts[normalize(user.email)]
  })
}

/** Đặt mật khẩu mới sau khi mở liên kết khôi phục trong email (chế độ Supabase). */
export async function setNewPassword(password: string) {
  if (password.length < 6) fail('Mật khẩu tối thiểu 6 ký tự.')
  const { error } = await supabase!.auth.updateUser({ password })
  if (error) fail(friendlyError(error.message))
  await supabase!.auth.signOut()
  await reloadRemote()
}

export async function changePassword(userId: Id, current: string, next: string) {
  if (next.length < 6) fail('Mật khẩu mới tối thiểu 6 ký tự.')
  if (isRemote && supabase) {
    const email = getDb().users.find((u) => u.id === userId)?.email ?? ''
    const { error } = await supabase.auth.signInWithPassword({ email, password: current })
    if (error) fail('Mật khẩu hiện tại không đúng.')
    const { error: updateError } = await supabase.auth.updateUser({ password: next })
    if (updateError) fail(friendlyError(updateError.message))
    mutate((db) => log(db, userId, 'Đổi mật khẩu'))
    return
  }
  mutate((db) => {
    const user = db.users.find((u) => u.id === userId)!
    if (user.passwordHash !== hashPassword(current)) fail('Mật khẩu hiện tại không đúng.')
    user.passwordHash = hashPassword(next)
    log(db, userId, 'Đổi mật khẩu')
  })
}

export type ProfileInput = Partial<Pick<User, 'fullName' | 'phone' | 'email' | 'avatar' | 'gender' | 'birthDate'>>

export async function updateProfile(userId: Id, input: ProfileInput) {
  mutate((db) => {
    const user = db.users.find((u) => u.id === userId)!
    if (input.email !== undefined && input.email.trim().toLowerCase() !== user.email.toLowerCase()) {
      // Email là tên đăng nhập của Supabase Auth, đổi email cần xác nhận lại nên chưa hỗ trợ.
      if (isRemote) fail('Email đăng nhập không thể đổi tại đây.')
      if (db.users.some((u) => u.id !== userId && u.email.toLowerCase() === input.email!.toLowerCase())) fail('Email đã được sử dụng.')
    }
    Object.assign(user, input)
  })
}

export const useAdminUser = () => useDb((db) => db.users.find((u) => u.id === db.session.adminId && u.isActive))
export const useCustomer = () => useDb((db) => db.users.find((u) => u.id === db.session.customerId && u.isActive))

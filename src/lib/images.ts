// Lưu ảnh người dùng tải lên: chế độ Supabase đưa lên Storage và trả về URL công khai;
// chế độ cục bộ trả về ảnh base64 đã thu nhỏ.
import { readImage } from './format'
import { isRemote, supabase } from './supabase'

export async function uploadImage(file: File, kind: 'product' | 'avatar', ownerId?: string) {
  const dataUrl = await readImage(file, kind === 'avatar' ? 256 : 720)
  if (!isRemote || !supabase) return dataUrl
  const blob = await (await fetch(dataUrl)).blob()
  const bucket = kind === 'avatar' ? 'avatars' : 'product-images'
  // Ảnh đại diện nằm trong thư mục mang id người dùng (theo quy tắc phân quyền của bucket).
  const path = `${kind === 'avatar' ? `${ownerId}/` : ''}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(`Không tải được ảnh lên: ${error.message}`)
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

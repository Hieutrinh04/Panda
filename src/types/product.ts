import type { Id, Status } from './common'
export type ProductGender = 'Nam' | 'Nữ' | 'Unisex'
export type Product = { id: Id; name: string; category: string; color: string; size: string; gender: ProductGender; quantity: number; salePrice: string; rentalPrice?: string; deposit?: string; imageUrl?: string; status: Status }

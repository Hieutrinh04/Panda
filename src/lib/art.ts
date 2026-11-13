// Ảnh minh họa tạm thời cho sản phẩm chưa có ảnh thật: vẽ dáng trang phục theo
// danh mục và tô theo màu của biến thể.

const COLOR_HEX: Record<string, string> = {
  'trắng': '#f3efe8',
  'trắng ngà': '#efe6d6',
  'đen': '#2a2a2e',
  'đen ánh kim': '#33313b',
  'đỏ': '#b8333a',
  'đỏ đô': '#7d1f2b',
  'đỏ ruby': '#9b1b30',
  'hồng': '#e7a3b5',
  'hồng phấn': '#efc1c8',
  'xanh navy': '#1f2f55',
  'xanh nhạt': '#a9c9e4',
  'xanh pastel': '#b8dccf',
  'xanh đậm': '#244b6b',
  'xanh lá': '#4f7f5a',
  'vàng': '#d9b04c',
  'vàng champagne': '#e2c99a',
  'be': '#d8c3a5',
  'xám': '#8d9198',
  'tím': '#7b5aa6',
  'nâu': '#7a5136',
}

export const colorHex = (name: string) => COLOR_HEX[name.trim().toLowerCase()] ?? '#c9b8a8'

const SHAPES: Record<string, string> = {
  dress:
    'M100 38c-9 0-15 6-18 12l-10 4 6 32-24 98h92l-24-98 6-32-10-4c-3-6-9-12-18-12z',
  aodai:
    'M100 34c-8 0-13 5-15 10l-22 10-8 46 12 2 6-30 6 26-18 86h40l-1-60 1 60h40l-18-86 6-26 6 30 12-2-8-46-22-10c-2-5-7-10-17-10z',
  suit:
    'M76 40l-24 12-8 74 16 2 4-48 4 104h28l4-70 4 70h28l4-104 4 48 16-2-8-74-24-12-24 30z',
  costume:
    'M100 36c-10 0-16 6-18 11l-26 10-14 40 16 6 12-24-6 107h72l-6-107 12 24 16-6-14-40-26-10c-2-5-8-11-18-11z',
  accessory:
    'M60 92c0-22 18-40 40-40s40 18 40 40v76H60z M80 92c0-11 9-20 20-20s20 9 20 20',
}

const shapeFor = (category: string) => {
  const c = category.toLowerCase()
  if (c.includes('áo dài')) return SHAPES.aodai
  if (c.includes('vest')) return SHAPES.suit
  if (c.includes('hóa trang')) return SHAPES.costume
  if (c.includes('phụ kiện')) return SHAPES.accessory
  return SHAPES.dress
}

const cache = new Map<string, string>()

export function productArt(category: string, color: string) {
  const key = `${category}|${color}`
  const hit = cache.get(key)
  if (hit) return hit
  const fill = colorHex(color)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f2ec"/><stop offset="1" stop-color="#ece3d8"/></linearGradient></defs><rect width="200" height="240" fill="url(#g)"/><ellipse cx="100" cy="214" rx="58" ry="7" fill="#000" opacity=".06"/><path d="${shapeFor(category)}" fill="${fill}" stroke="#00000022" stroke-width="1.5" fill-rule="evenodd"/></svg>`
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  cache.set(key, uri)
  return uri
}

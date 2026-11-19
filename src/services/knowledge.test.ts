// Kiểm thử kho tri thức RAG: mỗi sản phẩm đang bán một tài liệu, chính sách đủ các nhóm.
import { beforeEach, expect, it } from 'vitest'
import { getDb, mutate, resetDb } from '../data/store'
import { buildKnowledgeDocuments } from './knowledge'

beforeEach(() => resetDb())

it('tạo tài liệu cho sản phẩm đang bán và các chính sách', () => {
  const docs = buildKnowledgeDocuments(getDb())
  const products = docs.filter((d) => d.kind === 'product')
  expect(products).toHaveLength(getDb().products.filter((p) => p.status === 'active').length)
  expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length)
  expect(docs.filter((d) => d.kind === 'policy').map((d) => d.id)).toEqual(expect.arrayContaining(['policy:shipping', 'policy:rental', 'policy:returns', 'policy:payment']))
  const ruby = products.find((d) => d.refId === 'p-11')!
  expect(ruby.content).toContain('300.000')
  expect(ruby.content).toContain('chỉ cho thuê')
})

it('sản phẩm bị ẩn không nằm trong kho tri thức', () => {
  mutate((db) => {
    db.products.find((p) => p.id === 'p-1')!.status = 'hidden'
  })
  expect(buildKnowledgeDocuments(getDb()).some((d) => d.refId === 'p-1')).toBe(false)
})

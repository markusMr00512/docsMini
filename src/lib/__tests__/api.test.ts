import { describe, it, expect } from 'vitest'
import {
  registerSchema,
  loginSchema,
  createDocumentSchema,
  updateDocumentSchema,
  createVersionSchema,
} from '@/lib/api'

describe('registerSchema', () => {
  it('accepts a valid registration', () => {
    const r = registerSchema.safeParse({
      name: 'علی رضایی',
      email: 'ali@example.com',
      password: 'secret123',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a short name', () => {
    const r = registerSchema.safeParse({ name: 'آ', email: 'a@b.com', password: '123456' })
    expect(r.success).toBe(false)
  })

  it('rejects an invalid email', () => {
    const r = registerSchema.safeParse({ name: 'Ali', email: 'not-an-email', password: '123456' })
    expect(r.success).toBe(false)
  })

  it('rejects a password shorter than 6 chars', () => {
    const r = registerSchema.safeParse({ name: 'Ali', email: 'a@b.com', password: '12345' })
    expect(r.success).toBe(false)
  })

  it('accepts Persian characters in the name', () => {
    const r = registerSchema.safeParse({
      name: 'سارا محمدی',
      email: 'sara@example.com',
      password: 'abcdef',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a missing field', () => {
    const r = registerSchema.safeParse({ email: 'a@b.com', password: '123456' })
    expect(r.success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('accepts valid login', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: 'anything' })
    expect(r.success).toBe(true)
  })

  it('rejects empty password', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: '' })
    expect(r.success).toBe(false)
  })

  it('rejects invalid email', () => {
    const r = loginSchema.safeParse({ email: 'nope', password: 'x' })
    expect(r.success).toBe(false)
  })
})

describe('createDocumentSchema', () => {
  it('accepts an empty object (all optional)', () => {
    const r = createDocumentSchema.safeParse({})
    expect(r.success).toBe(true)
  })

  it('accepts a title + content', () => {
    const r = createDocumentSchema.safeParse({ title: 'یادداشت', content: 'متن' })
    expect(r.success).toBe(true)
  })

  it('rejects an empty title', () => {
    const r = createDocumentSchema.safeParse({ title: '' })
    expect(r.success).toBe(false)
  })

  it('rejects content over 1MB', () => {
    const r = createDocumentSchema.safeParse({ content: 'x'.repeat(1_000_001) })
    expect(r.success).toBe(false)
  })
})

describe('updateDocumentSchema', () => {
  it('accepts partial updates', () => {
    expect(updateDocumentSchema.safeParse({ title: 'new' }).success).toBe(true)
    expect(updateDocumentSchema.safeParse({ content: 'new' }).success).toBe(true)
    expect(updateDocumentSchema.safeParse({}).success).toBe(true)
  })

  it('rejects an empty title', () => {
    expect(updateDocumentSchema.safeParse({ title: '' }).success).toBe(false)
  })
})

describe('createVersionSchema', () => {
  it('defaults source to manual', () => {
    const r = createVersionSchema.safeParse({ content: 'abc' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.source).toBe('manual')
  })

  it('accepts autosave and restore sources', () => {
    expect(createVersionSchema.safeParse({ content: 'a', source: 'autosave' }).success).toBe(true)
    expect(createVersionSchema.safeParse({ content: 'a', source: 'restore' }).success).toBe(true)
  })

  it('rejects an unknown source', () => {
    expect(createVersionSchema.safeParse({ content: 'a', source: 'hack' }).success).toBe(false)
  })

  it('requires content', () => {
    expect(createVersionSchema.safeParse({}).success).toBe(false)
  })
})

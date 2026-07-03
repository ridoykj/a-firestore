import { describe, it, expect } from 'vitest'
import { normalizePath, pathIsCollection, documentIdIsValid } from '../api/firestore-utils'

describe('firestore-utils', () => {
  describe('normalizePath', () => {
    it('should remove leading and trailing slashes', () => {
      expect(normalizePath('/users')).toBe('users')
      expect(normalizePath('users/')).toBe('users')
      expect(normalizePath('/users/')).toBe('users')
    })

    it('should handle empty strings', () => {
      expect(normalizePath('')).toBe('')
      expect(normalizePath('/')).toBe('')
    })

    it('should preserve internal slashes', () => {
      expect(normalizePath('users/user1/posts')).toBe('users/user1/posts')
      expect(normalizePath('/users/user1/posts/')).toBe('users/user1/posts')
    })
  })

  describe('pathIsCollection', () => {
    it('should return true for odd-segment paths (collection)', () => {
      expect(pathIsCollection('users')).toBe(true)
      expect(pathIsCollection('users/user1/posts')).toBe(true)
      expect(pathIsCollection('a/b/c/d/e')).toBe(true)
    })

    it('should return false for even-segment paths (document)', () => {
      expect(pathIsCollection('users/user1')).toBe(false)
      expect(pathIsCollection('users/user1/posts/post1')).toBe(false)
    })

    it('should handle empty strings', () => {
      expect(pathIsCollection('')).toBe(false)
    })
  })

  describe('documentIdIsValid', () => {
    it('should reject IDs containing slashes', () => {
      expect(documentIdIsValid('user/123')).toBe(false)
      expect(documentIdIsValid('a/b')).toBe(false)
    })

    it('should reject "." and ".."', () => {
      expect(documentIdIsValid('.')).toBe(false)
      expect(documentIdIsValid('..')).toBe(false)
    })

    it('should accept valid document IDs', () => {
      expect(documentIdIsValid('user123')).toBe(true)
      expect(documentIdIsValid('abc-def-ghi')).toBe(true)
      expect(documentIdIsValid('test_123')).toBe(true)
    })

    it('should reject empty strings', () => {
      expect(documentIdIsValid('')).toBe(false)
    })
  })
})

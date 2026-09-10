import { describe, it, expect } from 'vitest'
import {
  contextKeyFor,
  documentIdIsValid,
  firestoreContextHeaders,
  normalizeDatabaseId,
  normalizePath,
  pathIsCollection,
  tabIdFor,
  toStoredDatabaseId,
} from '../api/firestore-utils'

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
      expect(normalizePath('///')).toBe('')
    })

    it('should preserve internal slashes', () => {
      expect(normalizePath('users/user1/posts')).toBe('users/user1/posts')
      expect(normalizePath('/users/user1/posts/')).toBe('users/user1/posts')
    })

    // DUP-001: matches the backend's FirestorePaths.normalize, so a path cannot be a collection on
    // one side of the wire and a document on the other.
    it('should drop interior empty segments like the backend does', () => {
      expect(normalizePath('//users')).toBe('users')
      expect(normalizePath('users//posts')).toBe('users/posts')
      expect(pathIsCollection('//users')).toBe(true)
      expect(pathIsCollection('users//posts')).toBe(false)
    })
  })

  // DUP-004: the "" <-> "(default)" round trip keys the connection, the tab, and localStorage.
  describe('database id normalization', () => {
    it('maps blank ids to the default database name', () => {
      expect(normalizeDatabaseId('')).toBe('(default)')
      expect(normalizeDatabaseId('   ')).toBe('(default)')
      expect(normalizeDatabaseId(undefined)).toBe('(default)')
      expect(normalizeDatabaseId(null)).toBe('(default)')
      expect(normalizeDatabaseId('(default)')).toBe('(default)')
      expect(normalizeDatabaseId('  analytics  ')).toBe('analytics')
    })

    it('maps the default database name back to a blank stored id', () => {
      expect(toStoredDatabaseId('')).toBe('')
      expect(toStoredDatabaseId('(default)')).toBe('')
      expect(toStoredDatabaseId('  analytics ')).toBe('analytics')
    })

    it('keys tabs, caches, and headers off the same normalization', () => {
      expect(tabIdFor('demo', '')).toBe('demo:(default)')
      expect(tabIdFor('demo', '(default)')).toBe('demo:(default)')
      expect(contextKeyFor('demo', '')).toBe('demo::(default)')
      expect(contextKeyFor('demo', 'analytics')).toBe('demo::analytics')
      expect(firestoreContextHeaders('demo', '')).toEqual({
        'X-Project-Id': 'demo',
        'X-Database-Id': '(default)',
      })
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

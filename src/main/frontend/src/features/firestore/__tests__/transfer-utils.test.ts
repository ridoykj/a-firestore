import { describe, it, expect } from 'vitest'
import { buildCollectionTransferJson, parseCollectionTransferJson } from '../api/firestore-transfer-utils'

describe('Firestore Transfer Utils', () => {
  describe('buildCollectionTransferJson', () => {
    it('should build valid JSON for collection export', () => {
      const records = [
        { id: 'doc1', path: 'users/doc1', payload: { name: 'Alice' } },
        { id: 'doc2', path: 'users/doc2', payload: { name: 'Bob' } }
      ]

      const json = buildCollectionTransferJson('users', records)
      
      expect(json).toBeTruthy()
      
      const parsed = JSON.parse(json)
      expect(parsed.path).toBe('users')
      expect(parsed.documents).toHaveLength(2)
      expect(parsed.formatVersion).toBeDefined()
    })

    it('should handle single record', () => {
      const records = [
        { id: 'doc1', path: 'users/doc1', payload: { name: 'Alice' } }
      ]

      const json = buildCollectionTransferJson('users', records)
      const parsed = JSON.parse(json)
      
      expect(parsed.documents).toHaveLength(1)
    })

    it('should handle empty records array', () => {
      const json = buildCollectionTransferJson('users', [])
      const parsed = JSON.parse(json)
      
      expect(parsed.documents).toHaveLength(0)
    })
  })

  describe('parseCollectionTransferJson', () => {
    it('should parse valid collection transfer JSON', () => {
      const records = [
        { id: 'doc1', path: 'users/doc1', payload: { name: 'Alice' } },
        { id: 'doc2', path: 'users/doc2', payload: { name: 'Bob' } }
      ]

      const json = buildCollectionTransferJson('users', records)
      const parsed = parseCollectionTransferJson(json)
      
      expect(parsed.path).toBe('users')
      expect(parsed.records).toHaveLength(2)
    })

    it('should throw on invalid JSON', () => {
      expect(() => parseCollectionTransferJson('invalid json')).toThrow()
    })
  })

  describe('document transfer utilities', () => {
    it('should build document transfer JSON', async () => {
      const { buildDocumentTransferJson } = await import('../api/firestore-transfer-utils')
      
      const json = buildDocumentTransferJson(
        'users/doc1',
        'doc1',
        { name: 'Alice', age: 30 }
      )
      
      expect(json).toBeTruthy()
      
      const parsed = JSON.parse(json)
      expect(parsed.path).toBe('users/doc1')
      expect(parsed.id).toBe('doc1')
      expect(parsed.payload.name).toBe('Alice')
    })

    it('should parse document transfer JSON', async () => {
      const { buildDocumentTransferJson, parseDocumentTransferJson } = await import('../api/firestore-transfer-utils')
      
      const original = { name: 'Alice', age: 30 }
      const json = buildDocumentTransferJson('users/doc1', 'doc1', original)
      const parsed = parseDocumentTransferJson(json)
      
      expect(parsed.path).toBe('users/doc1')
      expect(parsed.id).toBe('doc1')
      expect(parsed.payload.name).toBe('Alice')
    })
  })
})

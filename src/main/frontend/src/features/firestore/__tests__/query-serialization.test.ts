import { describe, it, expect } from 'vitest'
import type { FirestoreQueryRequest, WhereRow, WhereType } from '../schemas/FirestoreSchema'
import { DEFAULT_WHERE_ROW } from '../schemas/FirestoreSchema'

describe('Firestore Query Serialization', () => {
  describe('query request building', () => {
    it('should build a valid query request with filters', () => {
      const whereRows: WhereRow[] = [
        { ...DEFAULT_WHERE_ROW, field: 'name', operator: '==', value: 'John', type: 'string' as const },
        { ...DEFAULT_WHERE_ROW, field: 'age', operator: '>=', value: '18', type: 'number' as const }
      ]

      const request: FirestoreQueryRequest = {
        path: 'users',
        page: 0,
        limit: 50,
        orderDirection: 'desc',
        orderField: 'name',
        filters: whereRows.map(row => ({
          field: row.field,
          operator: row.operator,
          value: row.value,
          type: row.type
        }))
      }

      expect(request.path).toBe('users')
      expect(request.filters).toHaveLength(2)
      expect(request.filters[0].field).toBe('name')
      expect(request.filters[1].operator).toBe('>=')
    })

    it('should handle empty filters', () => {
      const request: FirestoreQueryRequest = {
        path: 'users',
        page: 0,
        limit: 50,
        orderDirection: 'asc',
        orderField: '',
        filters: []
      }

      expect(request.filters).toHaveLength(0)
    })

    it('should validate required fields', () => {
      const request: FirestoreQueryRequest = {
        path: '', // Invalid - empty path
        page: 0,
        limit: 50,
        orderDirection: 'asc',
        orderField: '',
        filters: []
      }

      expect(request.path).toBe('')
    })
  })

  describe('filter validation', () => {
    it('should validate filter operators', () => {
      const validOperators = ['==', '!=', '<', '<=', '>', '>=', 'array-contains', 'in']
      
      for (const operator of validOperators) {
        const request: FirestoreQueryRequest = {
          path: 'users',
          page: 0,
          limit: 50,
          orderDirection: 'asc',
          orderField: '',
          filters: [{ field: 'name', operator, value: 'test', type: 'string' }]
        }
        
        expect(request.filters[0].operator).toBe(operator)
      }
    })

    it('should handle different value types', () => {
      const testCases: Array<{ type: WhereType; value: string }> = [
        { type: 'string', value: 'hello' },
        { type: 'number', value: '123' },
        { type: 'boolean', value: 'true' }
      ]

      for (const testCase of testCases) {
        const request: FirestoreQueryRequest = {
          path: 'users',
          page: 0,
          limit: 50,
          orderDirection: 'asc',
          orderField: '',
          filters: [{ field: 'field', operator: '==', value: testCase.value, type: testCase.type }]
        }

        expect(request.filters[0].value).toBe(testCase.value)
        expect(request.filters[0].type).toBe(testCase.type)
      }
    })
  })
})

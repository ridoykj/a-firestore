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
        cursor: null,
        limit: 50,
        filterCombinator: 'and',
        collectionGroup: false,
        orderBy: [{ field: 'name', direction: 'desc' }],
        filters: whereRows.map(row => ({
          field: row.field,
          operator: row.operator,
          value: row.value,
          type: row.type,
          groupId: row.groupId
        }))
      }

      expect(request.path).toBe('users')
      expect(request.filters).toHaveLength(2)
      expect(request.filters[0].field).toBe('name')
      expect(request.filters[1].operator).toBe('>=')
      expect(request.orderBy[0]).toEqual({ field: 'name', direction: 'desc' })
    })

    it('should handle empty filters', () => {
      const request: FirestoreQueryRequest = {
        path: 'users',
        cursor: null,
        limit: 50,
        filterCombinator: 'and',
        collectionGroup: false,
        orderBy: [],
        filters: []
      }

      expect(request.filters).toHaveLength(0)
      expect(request.orderBy).toHaveLength(0)
    })
  })

  describe('OR groups and multiple order clauses (FFP-203)', () => {
    it('should carry per-filter group ids and an OR combinator', () => {
      const request: FirestoreQueryRequest = {
        path: 'orders',
        cursor: null,
        limit: 50,
        filterCombinator: 'or',
        collectionGroup: false,
        orderBy: [
          { field: 'total', direction: 'desc' },
          { field: 'createdAt', direction: 'asc' }
        ],
        filters: [
          { field: 'status', operator: '==', value: 'open', type: 'string', groupId: 0 },
          { field: 'status', operator: '==', value: 'pending', type: 'string', groupId: 1 }
        ]
      }

      expect(request.filterCombinator).toBe('or')
      expect(request.filters.map(f => f.groupId)).toEqual([0, 1])
      expect(request.orderBy).toHaveLength(2)
    })

    it('should support a collection-group query', () => {
      const request: FirestoreQueryRequest = {
        path: 'reviews',
        cursor: null,
        limit: 25,
        filterCombinator: 'and',
        collectionGroup: true,
        orderBy: [],
        filters: []
      }

      expect(request.collectionGroup).toBe(true)
    })
  })

  describe('filter value types', () => {
    it('should handle different value types', () => {
      const testCases: Array<{ type: WhereType; value: string }> = [
        { type: 'string', value: 'hello' },
        { type: 'number', value: '123' },
        { type: 'boolean', value: 'true' }
      ]

      for (const testCase of testCases) {
        const request: FirestoreQueryRequest = {
          path: 'users',
          cursor: null,
          limit: 50,
          filterCombinator: 'and',
          collectionGroup: false,
          orderBy: [],
          filters: [{ field: 'field', operator: '==', value: testCase.value, type: testCase.type, groupId: 0 }]
        }

        expect(request.filters[0].value).toBe(testCase.value)
        expect(request.filters[0].type).toBe(testCase.type)
      }
    })
  })
})

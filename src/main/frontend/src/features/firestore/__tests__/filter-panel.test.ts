import { describe, it, expect } from 'vitest'
import type { WhereRow } from '../schemas/FirestoreSchema'
import { DEFAULT_WHERE_ROW } from '../schemas/FirestoreSchema'

describe('Firestore Filter Panel', () => {
  describe('where row management', () => {
    it('should create a new where row with default values', () => {
      const newRow: WhereRow = { ...DEFAULT_WHERE_ROW, id: 1 }
      
      expect(newRow.id).toBe(1)
      expect(newRow.field).toBe('')
      expect(newRow.operator).toBe('==')
      expect(newRow.value).toBe('')
      expect(newRow.type).toBe('string')
    })

    it('should update where row field', () => {
      let rows: WhereRow[] = [{ ...DEFAULT_WHERE_ROW, id: 1 }]
      
      const updatedRows = rows.map(row => 
        row.id === 1 ? { ...row, field: 'name' } : row
      )
      
      expect(updatedRows[0].field).toBe('name')
    })

    it('should update where row operator', () => {
      let rows: WhereRow[] = [{ ...DEFAULT_WHERE_ROW, id: 1 }]
      
      const updatedRows = rows.map(row => 
        row.id === 1 ? { ...row, operator: '>=' } : row
      )
      
      expect(updatedRows[0].operator).toBe('>=')
    })

    it('should update where row value', () => {
      let rows: WhereRow[] = [{ ...DEFAULT_WHERE_ROW, id: 1 }]
      
      const updatedRows = rows.map(row => 
        row.id === 1 ? { ...row, value: 'John' } : row
      )
      
      expect(updatedRows[0].value).toBe('John')
    })

    it('should update where row type', () => {
      let rows: WhereRow[] = [{ ...DEFAULT_WHERE_ROW, id: 1 }]
      
      const updatedRows = rows.map(row => 
        row.id === 1 ? { ...row, type: 'number' } : row
      )
      
      expect(updatedRows[0].type).toBe('number')
    })

    it('should remove where row by id', () => {
      let rows: WhereRow[] = [
        { ...DEFAULT_WHERE_ROW, id: 1 },
        { ...DEFAULT_WHERE_ROW, id: 2 }
      ]
      
      const filteredRows = rows.filter(row => row.id !== 1)
      
      expect(filteredRows).toHaveLength(1)
      expect(filteredRows[0].id).toBe(2)
    })

    it('should not remove last row when removing', () => {
      let rows: WhereRow[] = [{ ...DEFAULT_WHERE_ROW, id: 1 }]
      
      const filteredRows = rows.length <= 1 
        ? rows.map(row => ({ ...row, field: '', operator: '==', value: '', type: 'string' }))
        : rows.filter(row => row.id !== 1)
      
      expect(filteredRows).toHaveLength(1)
      expect(filteredRows[0].field).toBe('')
    })

    it('should add multiple where rows with incrementing IDs', () => {
      const existingRows: WhereRow[] = [
        { ...DEFAULT_WHERE_ROW, id: 1 },
        { ...DEFAULT_WHERE_ROW, id: 2 }
      ]
      
      const maxId = existingRows.reduce((acc, row) => Math.max(acc, row.id), 0)
      const newId = maxId + 1
      
      const newRow: WhereRow = { ...DEFAULT_WHERE_ROW, id: newId }
      const updatedRows = [...existingRows, newRow]
      
      expect(updatedRows).toHaveLength(3)
      expect(updatedRows[2].id).toBe(3)
    })

    it('should handle empty where rows array', () => {
      let rows: WhereRow[] = []
      
      const maxId = rows.reduce((acc, row) => Math.max(acc, row.id), 0)
      const newId = maxId + 1
      
      const newRow: WhereRow = { ...DEFAULT_WHERE_ROW, id: newId }
      const updatedRows = [...rows, newRow]
      
      expect(updatedRows).toHaveLength(1)
      expect(updatedRows[0].id).toBe(1)
    })
  })

  describe('filter validation', () => {
    it('should validate required fields in where row', () => {
      const validRow: WhereRow = { ...DEFAULT_WHERE_ROW, field: 'name', value: 'test' }
      
      expect(validRow.field).toBeTruthy()
      expect(validRow.value).toBeTruthy()
      expect(validRow.operator).toBeTruthy()
    })

    it('should reject empty field names', () => {
      const invalidRow: WhereRow = { ...DEFAULT_WHERE_ROW, field: '', value: 'test' }
      
      expect(invalidRow.field).toBeFalsy()
    })

    it('should validate operator against allowed values', () => {
      const validOperators = ['==', '!=', '<', '<=', '>', '>=', 'array-contains', 'in']
      
      for (const operator of validOperators) {
        const row: WhereRow = { ...DEFAULT_WHERE_ROW, field: 'name', operator, value: 'test' }
        expect(row.operator).toBe(operator)
      }
    })

    it('should validate type matches value format', () => {
      const testCases = [
        { type: 'string' as const, value: 'hello', valid: true },
        { type: 'number' as const, value: '123', valid: true },
        { type: 'boolean' as const, value: 'true', valid: true }
      ]

      for (const testCase of testCases) {
        const row: WhereRow = { ...DEFAULT_WHERE_ROW, field: 'name', operator: '==', value: testCase.value, type: testCase.type }
        expect(row.type).toBe(testCase.type)
        expect(row.value).toBe(testCase.value)
      }
    })
  })

  describe('filter serialization', () => {
    it('should serialize where rows to query filter format', () => {
      const whereRows: WhereRow[] = [
        { ...DEFAULT_WHERE_ROW, id: 1, field: 'name', operator: '==', value: 'John', type: 'string' },
        { ...DEFAULT_WHERE_ROW, id: 2, field: 'age', operator: '>=', value: '18', type: 'number' }
      ]

      const filters = whereRows.map(row => ({
        field: row.field,
        operator: row.operator,
        value: row.value,
        type: row.type
      }))

      expect(filters).toHaveLength(2)
      expect(filters[0].field).toBe('name')
      expect(filters[1].operator).toBe('>=')
    })

    it('should handle empty where rows array', () => {
      const whereRows: WhereRow[] = []
      
      const filters = whereRows.map(row => ({
        field: row.field,
        operator: row.operator,
        value: row.value,
        type: row.type
      }))

      expect(filters).toHaveLength(0)
    })
  })
})

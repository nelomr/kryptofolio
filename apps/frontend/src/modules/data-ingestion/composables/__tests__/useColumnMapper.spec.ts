import { describe, it, expect } from 'vitest'
import { useColumnMapper } from '../useColumnMapper'

describe('useColumnMapper', () => {
  it('should initialize mapping correctly based on headers', () => {
    const { mapping, headers, initializeMapping, unmappedSourceColumns, mappedTargetColumns } = useColumnMapper()
    
    initializeMapping(['Date', 'Amount', 'Unrelated'])
    
    expect(headers.value).toEqual(['Date', 'Amount', 'Unrelated'])
    expect(mapping.value['Date']).toBe('date')
    expect(mapping.value['Amount']).toBe('amount')
    
    expect(mappedTargetColumns.value).toContain('date')
    expect(mappedTargetColumns.value).toContain('amount')
    expect(unmappedSourceColumns.value).toEqual([])
  })

  it('should update mapping correctly', () => {
    const { mapping, initializeMapping, updateMapping, isMappingComplete } = useColumnMapper()
    
    initializeMapping(['Time', 'Type', 'Coin', 'Side'])
    expect(isMappingComplete.value).toBe(false) // Needs date and type
    
    updateMapping('Time', 'date')
    updateMapping('Type', 'type')
    expect(isMappingComplete.value).toBe(true)

    updateMapping('Time', null)
    expect(mapping.value['Time']).toBeNull()
    expect(isMappingComplete.value).toBe(false)

    updateMapping('Time', 'date')
    expect(mapping.value['Time']).toBe('date')
    expect(isMappingComplete.value).toBe(true)
  })
})

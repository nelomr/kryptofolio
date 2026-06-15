import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { usePreviewTable } from '../usePreviewTable'
import type { MarketType } from '../../utils/marketDetector'

describe('usePreviewTable', () => {
  it('should generate preview rows correctly', () => {
    const marketType = ref<MarketType>('SPOT')
    const { rows, generatePreview, hasErrors, validRows, invalidRows } = usePreviewTable(marketType)
    
    const rawRows = [
      { Date: '2023-01-01', Amount: '100', Ticker: 'BTC', Type: 'Buy' }, // valid
      { Date: '2023-01-02', Amount: '200', Ticker: 'ETH', Type: '' } // invalid (missing type)
    ]
    const mapping = { Date: 'date', Amount: 'amount', Ticker: 'asset', Type: 'tx_type' }

    generatePreview(rawRows, mapping)

    expect(rows.value.length).toBe(2)
    expect(hasErrors.value).toBe(true)
    expect(validRows.value.length).toBe(1)
    expect(invalidRows.value.length).toBe(1)
  })

  it('should update row field and re-validate', () => {
    const marketType = ref<MarketType>('SPOT')
    const { rows, generatePreview, updateRowField, hasErrors } = usePreviewTable(marketType)
    
    const rawRows = [
      { Date: '2023-01-02', Amount: '200', Ticker: 'ETH', Type: '' }
    ]
    const mapping = { Date: 'date', Amount: 'amount', Ticker: 'asset', Type: 'tx_type' }

    generatePreview(rawRows, mapping)
    expect(hasErrors.value).toBe(true)

    const rowId = rows.value[0].id
    updateRowField(rowId, 'tx_type', 'Sell') // fix the error

    expect(hasErrors.value).toBe(false)
    expect(rows.value[0].mappedData.tx_type).toBe('Sell')
  })

  it('should delete row', () => {
    const marketType = ref<MarketType>('SPOT')
    const { rows, generatePreview, deleteRow } = usePreviewTable(marketType)
    
    const rawRows = [
      { Date: '2023-01-01', Amount: '100', Ticker: 'BTC', Type: 'Buy' }
    ]
    const mapping = { Date: 'date', Amount: 'amount', Ticker: 'asset', Type: 'tx_type' }

    generatePreview(rawRows, mapping)
    expect(rows.value.length).toBe(1)

    deleteRow(rows.value[0].id)
    expect(rows.value.length).toBe(0)
  })
})

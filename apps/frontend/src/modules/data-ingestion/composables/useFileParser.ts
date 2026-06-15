import { ref } from 'vue'
import { parseCsv, parseExcel, type ParseResult } from '../utils/parsers'

export function useFileParser() {
  const isParsing = ref(false)
  const parseErrors = ref<string[]>([])
  const rawHeaders = ref<string[]>([])
  const rawRows = ref<Record<string, unknown>[]>([])

  const parseFile = async (file: File) => {
    isParsing.value = true
    parseErrors.value = []
    
    try {
      let result: ParseResult
      
      if (file.name.endsWith('.csv')) {
        result = await parseCsv(file)
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        result = await parseExcel(file)
      } else {
        parseErrors.value = ['ingestion.errors.unsupported_format']
        return null
      }

      if (result.errors && result.errors.length > 0) {
        parseErrors.value = result.errors
      }

      rawHeaders.value = result.headers
      rawRows.value = result.data
      
      return result
    } catch (err) {
      parseErrors.value = [err instanceof Error ? err.message : 'ingestion.errors.unknown_parsing_error']
      return null
    } finally {
      isParsing.value = false
    }
  }

  const resetParser = () => {
    isParsing.value = false
    parseErrors.value = []
    rawHeaders.value = []
    rawRows.value = []
  }

  return {
    isParsing,
    parseErrors,
    rawHeaders,
    rawRows,
    parseFile,
    resetParser
  }
}

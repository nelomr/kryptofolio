import { ref, computed } from 'vue'
import { getAvailableColumns, guessColumnMapping } from '../utils/columnAutoMapper'

export function useColumnMapper() {
  const mapping = ref<Record<string, string | null>>({})
  const headers = ref<string[]>([])
  
  const availableTargetColumns = computed(() => getAvailableColumns())
  
  const mappedTargetColumns = computed(() => {
    return Object.values(mapping.value).filter(val => val !== null && val !== 'metadata') as string[]
  })
  
  const unmappedSourceColumns = computed(() => {
    return headers.value.filter(header => mapping.value[header] === null)
  })

  const isMappingComplete = computed(() => {
    const mandatory = ['date', 'type']
    return mandatory.every(field => Object.values(mapping.value).includes(field))
  })

  const initializeMapping = (sourceHeaders: string[]) => {
    headers.value = sourceHeaders
    mapping.value = guessColumnMapping(sourceHeaders)
  }

  const updateMapping = (sourceHeader: string, targetProp: string | null) => {
    const newMapping = { ...mapping.value }
    
    // If we're mapping a header to a non-metadata target, ensure that target isn't used elsewhere
    if (targetProp !== null && targetProp !== 'metadata') {
      for (const [key, val] of Object.entries(newMapping)) {
        if (val === targetProp && key !== sourceHeader) {
          newMapping[key] = null
        }
      }
    }
    
    newMapping[sourceHeader] = targetProp
    mapping.value = newMapping
  }

  return {
    mapping,
    headers,
    availableTargetColumns,
    mappedTargetColumns,
    unmappedSourceColumns,
    isMappingComplete,
    initializeMapping,
    updateMapping
  }
}

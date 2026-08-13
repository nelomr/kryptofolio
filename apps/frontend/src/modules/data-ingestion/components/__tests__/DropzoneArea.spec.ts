/**
 * The wizard's file-picker entry point. A file-selection affordance that names a format the parser
 * cannot read defeats the point of `useFileParser` rejecting it — the user never gets that far
 * because the OS-native picker already filtered the format out. `application/vnd.ms-excel` (the
 * legacy `.xls` MIME) briefly regressed back into this list even after `.xls` was removed from
 * `useFileParser`, which is exactly the state this test exists to catch.
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DropzoneArea from '../DropzoneArea.vue'
import { CsvImportWizardKey, type CsvImportWizardContext } from '../../composables/useCsvImportWizard'
import { I18N_PORT_KEY } from '@/core/injectionKeys'

function mountDropzone() {
  return mount(DropzoneArea, {
    global: {
      provide: {
        [CsvImportWizardKey as symbol]: {
          handleFileUpload: async () => true,
          goToNextStep: () => {},
        } as unknown as CsvImportWizardContext,
        [I18N_PORT_KEY as symbol]: {
          translate: (key: string) => key,
        },
      },
    },
  })
}

describe('DropzoneArea', () => {
  it('only offers formats parseExcel/parseCsv can actually read', () => {
    const wrapper = mountDropzone()
    const accept = wrapper.find('input[type="file"]').attributes('accept')

    expect(accept).toContain('.csv')
    expect(accept).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(accept).not.toContain('vnd.ms-excel')
    expect(accept).not.toMatch(/\.xls\b/)
  })
})

<script setup lang="ts">
import { ref } from 'vue';
import { useCsvImportWizard } from '../composables/useCsvImportWizard';
import { UploadCloud } from 'lucide-vue-next';
import { useI18n } from '@/composables/useI18n';

const wizard = useCsvImportWizard();
const { t } = useI18n();
const isDragging = ref(false);

const handleDragEnter = (e: DragEvent) => {
  e.preventDefault();
  isDragging.value = true;
};

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault();
  isDragging.value = false;
};

const handleDrop = async (e: DragEvent) => {
  e.preventDefault();
  isDragging.value = false;
  
  const file = e.dataTransfer?.files[0];
  if (file) {
    const success = await wizard.handleFileUpload(file);
    if (success) wizard.goToNextStep();
  }
};

const handleFileInput = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    const success = await wizard.handleFileUpload(file);
    if (success) wizard.goToNextStep();
  }
};
</script>

<template>
  <div
    class="flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl transition-colors duration-200"
    :class="[
      isDragging ? 'border-brand bg-brand-soft/50' : 'border-border bg-surface-2 hover:bg-surface-3'
    ]"
    @dragenter="handleDragEnter"
    @dragover.prevent
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="p-4 rounded-full bg-surface shadow-soft mb-4">
      <UploadCloud class="w-8 h-8 text-brand" />
    </div>
    
    <h3 class="text-lg font-semibold text-fg mb-1">
      {{ t('ingestion.dropzone.drag_drop') }}
    </h3>
    <p class="text-sm text-muted mb-6 text-center max-w-sm">
      {{ t('ingestion.dropzone.format_help') }}
    </p>

    <label
      class="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-surface border border-border shadow-soft text-sm font-medium text-fg hover:bg-surface-2 hover:text-brand transition-colors cursor-pointer"
    >
      <span>{{ t('ingestion.wizard.step_upload') }}</span>
      <input
        type="file"
        class="hidden"
        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        @change="handleFileInput"
      >
    </label>
  </div>
</template>

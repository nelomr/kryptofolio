<script setup lang="ts">
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertTriangle, CheckCircle2, Hospital } from 'lucide-vue-next'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

interface IntegrityWarning {
  id: string
  title: string
  description: string
  severity: 'warning' | 'critical'
}

const props = withDefaults(defineProps<{
  warnings?: IntegrityWarning[]
  isLoading?: boolean
}>(), {
  warnings: () => [],
  isLoading: false
})
</script>

<template>
  <Card class="bg-card/50 backdrop-blur-sm border-primary/10">
    <CardHeader class="flex flex-row items-center gap-2 pb-2">
      <Hospital class="h-5 w-5 text-primary" />
      <CardTitle class="text-lg">{{ t('tax.integrity.title') }}</CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="isLoading" class="text-sm text-muted-foreground animate-pulse">
        {{ t('tax.integrity.analyzing') }}
      </div>
      
      <div v-else-if="warnings.length === 0" class="flex items-center gap-2 text-profit">
        <CheckCircle2 class="h-5 w-5" />
        <span class="text-sm font-medium">{{ t('tax.integrity.healthy') }}</span>
      </div>

      <div v-else class="space-y-3">
        <Alert 
          v-for="warning in warnings" 
          :key="warning.id"
          :variant="warning.severity === 'critical' ? 'destructive' : 'default'"
          :class="{
            'border-warning/50 text-warning': warning.severity === 'warning',
          }"
        >
          <AlertTriangle class="h-4 w-4" :class="{ 'text-warning': warning.severity === 'warning' }" />
          <AlertTitle>{{ warning.title }}</AlertTitle>
          <AlertDescription>
            {{ warning.description }}
          </AlertDescription>
        </Alert>
      </div>
    </CardContent>
  </Card>
</template>

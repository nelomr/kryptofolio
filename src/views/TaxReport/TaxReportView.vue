<script setup lang="ts">
import TaxReportHeader from './components/TaxReportHeader.vue'
import TaxReportSummaryCards from './components/TaxReportSummaryCards.vue'
import IntegrityCard from './components/IntegrityCard.vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTaxReportPort } from './composables/useTaxReportPort'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const { isLoading, metrics, warnings, syncWeb3, uploadCsv, clearData } = useTaxReportPort()
</script>

<template>
  <div class="space-y-6 relative w-full">
    <!-- Background Decoration -->
    <div class="absolute -z-10 inset-0 overflow-hidden pointer-events-none">
      <div class="absolute -top-1/2 -right-1/2 w-[1000px] h-[1000px] rounded-full bg-primary/5 blur-[120px]" />
      <div class="absolute -bottom-1/2 -left-1/2 w-[800px] h-[800px] rounded-full bg-primary/5 blur-[100px]" />
    </div>

    <!-- Adapter orchestrating Dumb components -->
    <TaxReportHeader 
      @sync="syncWeb3"
      @upload="uploadCsv"
      @clear="clearData"
    />

    <TaxReportSummaryCards :metrics="metrics" />

    <Tabs defaultValue="report" class="space-y-4">
      <TabsList class="bg-card/50 backdrop-blur-sm border-primary/10">
        <TabsTrigger value="ledgers" class="cursor-pointer">{{ t('tax.tabs.ledgers') }}</TabsTrigger>
        <TabsTrigger value="report" class="cursor-pointer">{{ t('tax.tabs.report') }}</TabsTrigger>
        <TabsTrigger value="chat" class="cursor-pointer">{{ t('tax.tabs.chat') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="ledgers" class="space-y-4 mt-4">
        <!-- Placeholder for ledgers -->
        <div class="h-64 rounded-xl border border-primary/10 bg-card/50 flex items-center justify-center text-muted-foreground">
          {{ t('tax.tabs.ledgers') }} {{ t('tax.tabs.in_development') }}
        </div>
      </TabsContent>

      <TabsContent value="report" class="space-y-4 mt-4">
        <IntegrityCard :warnings="warnings" :isLoading="isLoading" />
      </TabsContent>

      <TabsContent value="chat" class="space-y-4 mt-4">
        <!-- Placeholder for chat -->
        <div class="h-64 rounded-xl border border-primary/10 bg-card/50 flex items-center justify-center text-muted-foreground">
          {{ t('tax.tabs.chat') }} {{ t('tax.tabs.in_development') }}
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>

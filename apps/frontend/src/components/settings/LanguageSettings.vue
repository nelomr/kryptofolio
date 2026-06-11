<script setup lang="ts">
import { ref, inject } from 'vue';
import { useI18n } from '@/composables/useI18n';
import { useUpdateLanguageMutation } from '@/composables/queries/useSettingsMutations';
import { I18N_PORT_KEY } from '@/core/injectionKeys';

// UI Components
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { GlobeIcon } from 'lucide-vue-next';

const { t } = useI18n();
const i18nPort = inject(I18N_PORT_KEY);

const supportedLocales = i18nPort?.getSupportedLocales() ?? [
  { code: 'en', labelKey: 'settings.language.option_en' },
];

const selectedLocale = ref<string>(i18nPort?.getLocale() ?? 'en');

const { mutate, isLoading } = useUpdateLanguageMutation();

const handleSave = () => {
  mutate(selectedLocale.value);
};
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center gap-2">
        <GlobeIcon class="w-5 h-5 text-muted-foreground" />
        <div class="space-y-1">
          <CardTitle>{{ t('settings.language.title') }}</CardTitle>
          <CardDescription>{{ t('settings.language.description') }}</CardDescription>
        </div>
      </div>
    </CardHeader>

    <CardContent>
      <div class="flex items-center gap-3">
        <!-- Language Selector -->
        <Select v-model="selectedLocale">
          <SelectTrigger class="w-[200px]" id="language-select">
            <SelectValue :placeholder="t('settings.language.select_placeholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="locale in supportedLocales"
              :key="locale.code"
              :value="locale.code"
            >
              {{ t(locale.labelKey) }}
            </SelectItem>
          </SelectContent>
        </Select>

        <!-- Save Button -->
        <Button
          id="language-save-btn"
          :disabled="isLoading"
          @click="handleSave"
        >
          {{ isLoading ? t('settings.language.saving_btn') : t('settings.language.save_btn') }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>


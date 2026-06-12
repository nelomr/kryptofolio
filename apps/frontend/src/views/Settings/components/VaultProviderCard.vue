<script setup lang="ts">
import { useI18n } from "@/composables/useI18n";
import type { VaultProvider } from "@/core/domain/models/VaultEntities";

// UI Components
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import Input from "@/components/ui/input/Input.vue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

const { t } = useI18n();

const props = defineProps<{
  provider: VaultProvider;
  isConfigured: boolean;
  isEnabled: boolean;
  isToggling: boolean;
  isSaving: boolean;
  formData: Record<string, string>;
  errors: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: "toggle", enabled: boolean): void;
  (e: "sanitize", fieldKey: string): void;
  (e: "save"): void;
  (e: "update:form-field", fieldKey: string, value: string): void;
}>();

const getFieldLabel = (fieldKey: string, fallback: string) => {
  const tKey = `vault.provider.generic.fields.${fieldKey}.label`;
  const translation = t(tKey);
  return translation === tKey ? fallback : translation;
};
</script>

<template>
  <Card class="border bg-accent">
    <CardHeader class="pb-3">
      <div class="flex justify-between items-start">
        <div>
          <CardTitle class="text-base">{{ provider.name }}</CardTitle>
          <CardDescription class="text-xs">
            {{
              t("vault.provider.generic.description", {
                providerName: provider.name,
              })
            }}
          </CardDescription>
        </div>
        <div class="flex items-center gap-3">
          <Switch
            :model-value="isEnabled"
            @update:model-value="emit('toggle', $event)"
            :disabled="isToggling || !isConfigured"
            class="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-input shadow-none"
          />
          <Badge
            :variant="isConfigured ? 'default' : 'destructive'"
            :class="{
              'bg-emerald-500 hover:bg-emerald-500 text-white': isConfigured,
              'hover:bg-destructive': !isConfigured,
            }"
          >
            {{
              isConfigured
                ? t("vault.provider.status.configured")
                : t("vault.provider.status.not_configured")
            }}
          </Badge>
        </div>
      </div>
    </CardHeader>
    <CardContent class="space-y-2">
      <div
        v-for="field in provider.fields"
        :key="field.key"
        class="flex flex-col gap-1.5"
      >
        <Input
          :model-value="formData?.[field.key] || ''"
          @update:model-value="
            emit('update:form-field', field.key, $event as string)
          "
          :type="field.type"
          :placeholder="getFieldLabel(field.key, field.label)"
          :title="t('vault.provider.generic.fields.format_title')"
          :class="{
            'border-destructive focus-visible:ring-destructive':
              errors?.[field.key],
          }"
          @input="emit('sanitize', field.key)"
        />
        <span v-if="errors?.[field.key]" class="text-xs text-destructive">
          {{ t(errors[field.key]) }}
        </span>
      </div>
      <div class="flex justify-end pt-2">
        <Button
          variant="default"
          :disabled="
            isSaving || !formData || Object.values(formData).every((v) => !v)
          "
          @click="emit('save')"
        >
          {{ t("vault.actions.save") }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>

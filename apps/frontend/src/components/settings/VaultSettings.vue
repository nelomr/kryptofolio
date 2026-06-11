<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/composables/useI18n";
import {
  useVaultStatusQuery,
  useVaultProvidersQuery,
} from "@/composables/queries/useVaultQueries";
import { useToggleVaultProviderMutation } from "@/composables/queries/useVaultMutations";
import { useVaultForm } from "./composables/useVaultForm";

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
import { LockIcon, UnlockIcon } from "lucide-vue-next";

const { t } = useI18n();

// Queries
const { data: status } = useVaultStatusQuery();
const { data: providers } = useVaultProvidersQuery();

// Form & State
const isUnlocked = computed(() => status.value?.isUnlocked ?? false);
const {
  password,
  formData,
  errors,
  isUnlocking,
  isSaving,
  sanitizeInput,
  handleUnlock,
  handleSaveProvider,
} = useVaultForm(providers);

const { mutate: toggleProvider, isLoading: isToggling } = useToggleVaultProviderMutation();

const handleToggle = (providerId: string, enabled?: boolean) => {
  toggleProvider({ service: providerId, enabled: enabled ?? false });
};

const isProviderConfigured = (providerId: string): boolean => {
  return status.value?.configuredServices?.includes(providerId) ?? false;
};

const isProviderEnabled = (providerId: string): boolean => {
  return status.value?.enabledServices?.includes(providerId) ?? false;
};

// UI Helpers
const getFieldLabel = (fieldKey: string, fallback: string) => {
  const tKey = `vault.provider.generic.fields.${fieldKey}.label`;
  const translation = t(tKey);
  return translation === tKey ? fallback : translation;
};
</script>

<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div class="space-y-1">
            <CardTitle class="flex items-center gap-2">
              <LockIcon v-if="!isUnlocked" class="w-5 h-5 text-destructive" />
              <UnlockIcon v-else class="w-5 h-5 text-emerald-500" />
              {{ t("vault.title") }}
            </CardTitle>
            <CardDescription>{{ t("vault.subtitle") }}</CardDescription>
          </div>
          <Badge 
            :variant="isUnlocked ? 'default' : 'destructive'"
            :class="{ 'bg-emerald-500 hover:bg-emerald-500 text-white': isUnlocked, 'hover:bg-destructive': !isUnlocked }"
          >
            {{
              isUnlocked ? t("vault.unlocked.title") : t("vault.locked.title")
            }}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <!-- Locked State -->
        <div v-if="!isUnlocked" class="space-y-4">
          <p class="text-sm text-muted-foreground">
            {{ t("vault.locked.desc") }}
          </p>
          <div class="flex gap-2 max-w-sm">
            <Input
              v-model="password"
              type="password"
              :placeholder="t('vault.locked.password_placeholder')"
              @keyup.enter="handleUnlock"
            />
            <Button :disabled="isUnlocking || !password" @click="handleUnlock">
              {{ t("vault.locked.unlock_btn") }}
            </Button>
          </div>
        </div>

        <!-- Unlocked State -->
        <div v-else class="space-y-6">
          <p class="text-sm text-muted-foreground">
            {{ t("vault.unlocked.desc") }}
          </p>

          <div class="grid gap-4 md:grid-cols-2">
            <!-- Dynamic Services -->
            <Card
              v-for="provider in providers"
              :key="provider.id"
              class="border-muted bg-card/50"
            >
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
                      :model-value="isProviderEnabled(provider.id)"
                      @update:model-value="handleToggle(provider.id, $event)"
                      :disabled="isToggling || !isProviderConfigured(provider.id)"
                      class="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-input shadow-none"
                    />
                    <Badge
                      :variant="isProviderConfigured(provider.id) ? 'default' : 'destructive'"
                      :class="{ 'bg-emerald-500 hover:bg-emerald-500 text-white': isProviderConfigured(provider.id), 'hover:bg-destructive': !isProviderConfigured(provider.id) }"
                    >
                      {{
                        isProviderConfigured(provider.id)
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
                    v-model="formData[provider.id][field.key]"
                    :type="field.type"
                    :placeholder="getFieldLabel(field.key, field.label)"
                    title="Only alphanumeric characters and basic symbols (-_+=/.) are allowed"
                    :class="{
                      'border-destructive focus-visible:ring-destructive':
                        errors[provider.id]?.[field.key],
                    }"
                    @input="sanitizeInput(provider.id, field.key)"
                  />
                  <span
                    v-if="errors[provider.id]?.[field.key]"
                    class="text-xs text-destructive"
                  >
                    {{ t(errors[provider.id][field.key]) }}
                  </span>
                </div>
                <div class="flex justify-end pt-2">
                  <Button
                    variant="default"
                    :disabled="
                      isSaving ||
                      Object.values(formData[provider.id] || {}).every(
                        (v) => !v,
                      )
                    "
                    @click="handleSaveProvider(provider.id)"
                  >
                    {{ t('vault.actions.save') }}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

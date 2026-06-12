<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "@/composables/useI18n";
import {
  useVaultStatusQuery,
  useVaultProvidersQuery,
} from "@/composables/queries/useVaultQueries";
import { useToggleVaultProviderMutation } from "@/composables/queries/useVaultMutations";
import { useVaultForm } from "./composables/useVaultForm";

import VaultLockedState from "./VaultLockedState.vue";
import VaultProviderCard from "./VaultProviderCard.vue";

// UI Components
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const { mutate: toggleProvider, isLoading: isToggling } =
  useToggleVaultProviderMutation();

const handleToggle = (providerId: string, enabled?: boolean) => {
  toggleProvider({ service: providerId, enabled: enabled ?? false });
};

const isProviderConfigured = (providerId: string): boolean => {
  return status.value?.configuredServices?.includes(providerId) ?? false;
};

const isProviderEnabled = (providerId: string): boolean => {
  return status.value?.enabledServices?.includes(providerId) ?? false;
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
            :class="{
              'bg-emerald-500 hover:bg-emerald-500 text-white': isUnlocked,
              'hover:bg-destructive': !isUnlocked,
            }"
          >
            {{
              isUnlocked ? t("vault.unlocked.title") : t("vault.locked.title")
            }}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <!-- Locked State -->
        <VaultLockedState 
          v-if="!isUnlocked" 
          v-model="password"
          :is-unlocking="isUnlocking"
          @unlock="handleUnlock"
        />

        <!-- Unlocked State -->
        <div v-else class="space-y-6">
          <p class="text-sm text-muted-foreground">
            {{ t("vault.unlocked.desc") }}
          </p>

          <div class="grid gap-4 md:grid-cols-2">
            <!-- Dynamic Services -->
            <VaultProviderCard
              v-for="provider in providers"
              :key="provider.id"
              :provider="provider"
              :is-configured="isProviderConfigured(provider.id)"
              :is-enabled="isProviderEnabled(provider.id)"
              :is-toggling="isToggling"
              :is-saving="isSaving"
              :form-data="formData[provider.id] || {}"
              :errors="errors[provider.id] || {}"
              @toggle="handleToggle(provider.id, $event)"
              @sanitize="sanitizeInput(provider.id, $event)"
              @save="handleSaveProvider(provider.id)"
              @update:form-field="(key, value) => formData[provider.id][key] = value"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

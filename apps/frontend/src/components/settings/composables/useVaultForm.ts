import { ref, watch, type Ref } from 'vue';
import { toast } from 'vue-sonner';
import { useI18n } from '@/composables/useI18n';
import { useSaveVaultKeyMutation, useUnlockVaultMutation } from '@/composables/queries/useVaultMutations';
import type { VaultProvider } from '@/core/domain/models/VaultEntities';

export function useVaultForm(providers: Ref<VaultProvider[] | undefined>) {
  const { t } = useI18n();
  const { mutateAsync: saveKey, isLoading: isSaving } = useSaveVaultKeyMutation();
  const { mutateAsync: unlockVault, isLoading: isUnlocking } = useUnlockVaultMutation();

  const formData = ref<Record<string, Record<string, string>>>({});
  const errors = ref<Record<string, Record<string, string>>>({});
  const password = ref("");

  // Initialize form data declaratively when providers load
  watch(providers, (provs) => {
    if (!provs) return;
    provs.forEach(p => {
      formData.value[p.id] ??= {};
      errors.value[p.id] ??= {};
      p.fields.forEach(f => {
        formData.value[p.id][f.key] ??= "";
        errors.value[p.id][f.key] ??= "";
      });
    });
  }, { immediate: true });

  const sanitizeInput = (providerId: string, fieldKey: string) => {
    const val = formData.value[providerId]?.[fieldKey];
    if (val) {
      const sanitized = val.replace(/[^a-zA-Z0-9_+=/.-]/g, '');
      if (sanitized !== val) {
        formData.value[providerId][fieldKey] = sanitized;
        // Mark that invalid characters were stripped
        errors.value[providerId][fieldKey] = "vault.errors.invalid_format";
      } else {
        // Clear error if input is fully valid
        if (errors.value[providerId]?.[fieldKey]) {
          errors.value[providerId][fieldKey] = "";
        }
      }
    } else {
      if (errors.value[providerId]?.[fieldKey]) {
        errors.value[providerId][fieldKey] = "";
      }
    }
  };

  const clearProviderForm = (providerId: string) => {
    const payload = formData.value[providerId];
    if (payload) {
      Object.keys(payload).forEach(k => {
        formData.value[providerId][k] = "";
        if (errors.value[providerId]) {
          errors.value[providerId][k] = "";
        }
      });
    }
  };

  const handleUnlock = async () => {
    if (!password.value) return;
    try {
      await unlockVault(password.value);
      password.value = "";
      toast.success(t("vault.success.unlocked"));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      const msg = message === "VAULT_LOCKED" || message === "vault.errors.unlock_failed"
        ? t("vault.errors.unlock_failed")
        : message.startsWith("vault.errors.") 
          ? t(message) 
          : (message || t("vault.errors.unlock_failed"));
      toast.error(msg);
    }
  };

  const handleSaveProvider = async (providerId: string) => {
    const payload = formData.value[providerId];
    if (!payload || Object.values(payload).every(v => !v)) return;
    
    // Frontend Validation
    let hasError = false;
    Object.entries(payload).forEach(([key, value]) => {
      if (value && !/^[a-zA-Z0-9_+=/.-]+$/.test(value)) {
        errors.value[providerId][key] = "vault.errors.invalid_format";
        hasError = true;
      }
    });

    if (hasError) return;
    
    try {
      await saveKey({ service: providerId, payload });
      clearProviderForm(providerId);
      toast.success(t("vault.success.saved"));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      const msg = message === "VAULT_LOCKED"
        ? t("vault.errors.unlock_failed")
        : message === "vault.errors.save_failed" || message.startsWith("vault.errors.")
          ? t(message)
          : (message || t("vault.errors.save_failed"));
      toast.error(msg);
    }
  };

  return {
    password,
    formData,
    errors,
    isSaving,
    isUnlocking,
    sanitizeInput,
    handleUnlock,
    handleSaveProvider
  };
}

import { ref, watch, type Ref } from 'vue';
import { toast } from 'vue-sonner';
import { useI18n } from '@/composables/useI18n';
import { useSaveVaultKeyMutation, useUnlockVaultMutation } from '@/composables/queries/useVaultMutations';
import type { VaultProvider } from '@/core/domain/models/VaultEntities';

const SEMANTIC_ERROR_MAP: Record<string, string> = {
  "INVALID_PASSWORD": "vault.errors.invalid_password",
  "VAULT_UNLOCK_FAILED": "vault.errors.unlock_failed",
  "VAULT_LOCKED": "vault.errors.unlock_failed",
  "UNKNOWN_PROVIDER": "vault.errors.unknown_provider",
  "INVALID_CREDENTIAL_FORMAT": "vault.errors.invalid_format",
  "VAULT_OPERATION_FAILED": "vault.errors.save_failed",
  "FAILED_TO_TOGGLE_PROVIDER": "vault.errors.toggle_failed"
};

const getTranslatedError = (error: unknown, fallbackKey: string, t: (key: string) => string) => {
  const message = error instanceof Error ? error.message : String(error);
  if (!message) return t(fallbackKey);
  if (SEMANTIC_ERROR_MAP[message]) return t(SEMANTIC_ERROR_MAP[message]);
  if (message.startsWith("vault.errors.")) return t(message);
  return message || t(fallbackKey);
};

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
      toast.error(getTranslatedError(error, "vault.errors.unlock_failed", t));
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
      toast.error(getTranslatedError(error, "vault.errors.save_failed", t));
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

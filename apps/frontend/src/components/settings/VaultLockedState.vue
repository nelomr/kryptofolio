<script setup lang="ts">
import { useI18n } from "@/composables/useI18n";
import Input from "@/components/ui/input/Input.vue";
import { Button } from "@/components/ui/button";

const { t } = useI18n();

const password = defineModel<string>({ required: true });

defineProps<{
  isUnlocking: boolean;
}>();

const emit = defineEmits<{
  (e: "unlock"): void;
}>();
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-muted-foreground">
      {{ t("vault.locked.desc") }}
    </p>
    <div class="flex gap-2 max-w-sm">
      <Input
        v-model="password"
        type="password"
        :placeholder="t('vault.locked.password_placeholder')"
        @keyup.enter="emit('unlock')"
      />
      <Button :disabled="isUnlocking || !password" @click="emit('unlock')">
        {{ t("vault.locked.unlock_btn") }}
      </Button>
    </div>
  </div>
</template>

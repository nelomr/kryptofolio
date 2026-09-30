## Why

The vault's master key lives only in process memory (`AesGcmCryptographyAdapter.masterKey`), so every backend restart re-locks it and the user must re-enter the master password. Until they do, every stored credential is unavailable: the AI advisor skips each chain entry whose provider needs an API key (OpenAI, Anthropic, Google, OpenCode, Ollama Cloud) with `VAULT_LOCKED`, leaving only the local `ollama` provider. In development the backend runs under `tsx watch`, which restarts on every saved file, so the vault is re-locked constantly and unlocking it repeatedly just to use the advisor is unreasonable.

## What Changes

- New opt-in "remember on this device" option, off by default.
- After a successful password unlock with the option on, the password-derived key is stored in the OS keyring under a dedicated entry.
- At backend boot, if that entry exists, the key is read, passed to the existing Buffer path of `initialize`, and verified against the existing `vault_metadata.verification_payload`. If verification fails, the entry is deleted and the vault stays locked.
- An explicit lock, or turning the option off, deletes the keyring entry.
- If no OS keyring is available (headless/Docker), the option cannot be enabled and the vault stays locked; this is reported, never silently replaced by another mechanism.
- The key itself is never replaced: existing ciphertexts, the KDF and `kdf_salt` are untouched, and no migration is needed. The adapter's existing no-argument keyring mode (random `master_key`) is not activated, because a random key cannot decrypt a password-derived vault.
- Security trade-off, stated in the UI: the database file alone stays useless (the key is not stored beside the data), but any process running as the same OS user that can read the keyring entry could decrypt the vault. That is why it is opt-in.
- Out of scope: the encryption scheme, the password KDF, per-secret policies, Docker/headless zero-touch unlock via `KRYPTO_MASTER_KEY` (separate roadmap item), and any change to the AI advisor.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `local-secrets-vault`: the master-key requirement gains an opt-in remembered-key path (store derived key in the OS keyring after unlock, restore it at boot, delete it on lock/opt-out, no fallback when no keyring exists).
- `vault-verifier`: verification of the stored `verification_payload` also applies to a key restored at boot, and a failed check discards the stored entry.

## Impact

- **Backend**: `AesGcmCryptographyAdapter.ts` (keyring read/write/delete for the derived key, via the existing `@napi-rs/keyring` dependency), `UnlockVaultUseCase`, the lock use case, a boot-time unlock attempt wired in `di/container.ts` / `app.ts`, the vault routes and possibly the vault status DTO.
- **Frontend**: `views/Settings/components/VaultSettings.vue` (toggle and trade-off text), its adapter/DTO, and `en.ts` / `es.ts` dictionaries.
- **Docs**: `docs/architecture/secrets-vault.md`.
- **Rules**: rule 2 (keyring access stays inside an adapter behind a port); rule 5 (remembered/not-remembered/unavailable modelled as a union, not a boolean plus optional payload); rule 8 (no fallback shim to a random or env key). Rules 4, 6 and 7 are not touched.
- **Dependency**: does not edit `add-ai-portfolio-advisor`; the advisor benefits without changes.

## Open questions

1. **Toggle location.** Proposed: the vault section of Settings (`VaultSettings.vue`), shown only while unlocked.
2. **Keyring entry name and encoding.** Must not collide with the adapter's existing `kryptofolio`/`master_key` entry; candidate: a separate account name, base64-encoded key.
3. **Status API.** Whether the vault status response needs a field telling the UI that remember-on-device is active or unavailable.
4. **Future change-password flow.** The stored key must be invalidated or re-written when the password changes.
5. **macOS keychain prompts.** How keychain access prompts behave for a Node process in development (unsigned binary, `tsx watch` restarts) needs checking on a real machine.

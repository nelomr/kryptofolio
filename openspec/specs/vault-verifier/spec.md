# Vault Verifier Specification

## Purpose

Password verification for the vault.

## Requirements

### Requirement: Password Verification
The system SHALL verify the master password during the `/vault/unlock` operation by decrypting a known verification payload.

#### Scenario: Successful unlock with correct password
- **WHEN** the user provides the correct password for an existing vault
- **THEN** the system successfully decrypts the verification payload and unlocks the vault

#### Scenario: Failed unlock with incorrect password
- **WHEN** the user provides an incorrect password for an existing vault
- **THEN** the system fails to decrypt the verification payload
- **THEN** the system throws an "INVALID_PASSWORD" error immediately

#### Scenario: First-time vault initialization
- **WHEN** the vault is unlocked for the first time (no salt exists)
- **THEN** the system generates a new salt and derives the key
- **THEN** the system encrypts a known verification payload and stores it in the database

#### Scenario: Missing verification payload on existing vault
- **WHEN** an older vault is unlocked that has a salt but no verification payload
- **THEN** the system assumes the provided key is valid and retroactively encrypts and stores a new verification payload using the provided key

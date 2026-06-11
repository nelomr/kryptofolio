import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { bffLogger } from '../utils/logger.ts';
import { container } from '../core/infrastructure/di/container.ts';

type Env = { Bindings: { MODE?: string, SECRET_API_KEY?: string, PROD_API_URL?: string } };

const credentialsApi = new Hono<Env>()
.post('/vault/unlock', zValidator('json', z.object({ password: z.string() })), async (c) => {
  const { password } = c.req.valid('json');
  
  try {
    await container.unlockVaultUseCase.execute(password);
    bffLogger.info('Vault Unlocked successfully');
    return c.json({ success: true, message: 'VAULT_UNLOCKED' });
  } catch (error) {
    const err = error as Error;
    if (err.message === 'INVALID_PASSWORD') {
      bffLogger.warn('Failed to unlock vault: Invalid password');
      return c.json({ success: false, error: 'INVALID_PASSWORD' }, 401);
    }
    bffLogger.error({ err: error }, 'Failed to unlock vault');
    return c.json({ success: false, error: 'VAULT_UNLOCK_FAILED' }, 500);
  }
})
.get('/vault/status', async (c) => {
  const status = await container.getVaultStatusUseCase.execute();
  return c.json(status);
})
.get('/vault/providers', async (c) => {
  const providers = await container.getAvailableProvidersUseCase.execute();
  return c.json(providers);
})
.post('/vault/:service', zValidator('json', z.object({ 
  payload: z.record(z.string().regex(/^[a-zA-Z0-9_+=/.-]{0,512}$/, 'INVALID_CREDENTIAL_FORMAT'))
})), async (c) => {
  const serviceIdentifier = c.req.param('service');

  // Validate against known provider registry
  const providers = await container.getAvailableProvidersUseCase.execute();
  if (!providers.some(p => p.id === serviceIdentifier)) {
    return c.json({ success: false, error: 'UNKNOWN_PROVIDER' }, 400);
  }

  const { payload } = c.req.valid('json');
  
  try {
    await container.storeServiceCredentialUseCase.execute(serviceIdentifier, payload);
    bffLogger.info({ service: serviceIdentifier }, 'Secured new credentials in vault');
    return c.json({ success: true, message: 'CREDENTIALS_SECURED' });
  } catch (error) {
    const err = error as Error;
    bffLogger.error({ err }, `Failed to store credentials for ${serviceIdentifier}`);
    const status = err.message === 'Vault is locked' ? 401 : 500;
    return c.json({ success: false, error: status === 401 ? 'VAULT_LOCKED' : 'VAULT_OPERATION_FAILED' }, status);
  }
})
.patch('/vault/:service/status', zValidator('json', z.object({
  enabled: z.boolean()
})), async (c) => {
  const serviceIdentifier = c.req.param('service');
  const { enabled } = c.req.valid('json');

  try {
    await container.toggleVaultProviderUseCase.execute(serviceIdentifier, enabled);
    return c.json({ success: true, enabled });
  } catch (error) {
    const err = error as Error;
    bffLogger.error({ err }, `Failed to toggle provider ${serviceIdentifier}`);
    const status = err.message === 'Vault is locked' ? 401 : 500;
    return c.json({ success: false, error: status === 401 ? 'VAULT_LOCKED' : 'FAILED_TO_TOGGLE_PROVIDER' }, status);
  }
});

export default credentialsApi;

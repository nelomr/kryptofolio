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
    return c.json({ success: true, message: 'Vault Unlocked' });
  } catch (error) {
    bffLogger.error({ err: error }, 'Failed to unlock vault');
    return c.json({ success: false, error: 'Failed to unlock vault' }, 401);
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
  payload: z.record(z.string().regex(/^[a-zA-Z0-9_+=/.-]{0,512}$/, 'Invalid credential format: malicious characters detected or length exceeded'))
})), async (c) => {
  const serviceIdentifier = c.req.param('service');

  // Validate against known provider registry
  const providers = await container.getAvailableProvidersUseCase.execute();
  if (!providers.some(p => p.id === serviceIdentifier)) {
    return c.json({ success: false, error: 'Unknown provider' }, 400);
  }

  const { payload } = c.req.valid('json');
  
  try {
    await container.storeServiceCredentialUseCase.execute(serviceIdentifier, payload);
    
    bffLogger.info({ service: serviceIdentifier }, 'Secured new credentials in vault');
    return c.json({ success: true, message: 'Credentials secured in vault.' });
  } catch (error) {
    bffLogger.error({ err: error }, 'Vault operation failed');
    const err = error as Error;
    const status = err?.message === 'VAULT_LOCKED' ? 403 : 500;
    return c.json({ success: false, error: err?.message || 'Vault operation failed' }, status);
  }
})
.patch('/vault/:service/status', zValidator('json', z.object({
  enabled: z.boolean()
})), async (c) => {
  const serviceIdentifier = c.req.param('service');
  const { enabled } = c.req.valid('json');

  try {
    await container.toggleVaultProviderUseCase.execute(serviceIdentifier, enabled);
    bffLogger.info({ service: serviceIdentifier, enabled }, 'Toggled vault provider status');
    return c.json({ success: true, enabled });
  } catch (error) {
    bffLogger.error({ err: error }, 'Failed to toggle vault provider');
    const err = error as Error;
    const status = err?.message === 'VAULT_LOCKED' ? 403 : err?.message === 'PROVIDER_NOT_CONFIGURED' ? 400 : 500;
    return c.json({ success: false, error: err?.message || 'Failed to toggle provider' }, status);
  }
});

export default credentialsApi;

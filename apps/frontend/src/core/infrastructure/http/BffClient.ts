import { hc } from 'hono/client';
import type { AppType } from '@kryptofolio/backend';

// VITE_API_URL is the single configurable entrypoint for the backend.
// In development: defaults to http://localhost:3001 (apps/backend)
// In production: set to the URL of your deployed backend (or BYOB endpoint)
export const BFF_BASE_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const bffClient = hc<AppType>(BFF_BASE_URL);

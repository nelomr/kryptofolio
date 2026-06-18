import { hc } from 'hono/client';
import type { AppType } from '@kryptofolio/backend';

// VITE_API_URL is the single configurable entrypoint for the backend.
// In development: defaults to http://localhost:3001 (apps/backend)
// In production: set to the URL of your deployed backend (or BYOB endpoint)
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const bffClient = hc<AppType>(BASE_URL);

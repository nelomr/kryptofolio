import { hc } from 'hono/client';
import type { AppType } from '@dashboar-portfolio/api-gateway';

const isMock = import.meta.env.VITE_USE_MOCK === 'true';
const BASE_URL = (!isMock && import.meta.env.VITE_API_BASE_URL) || 'http://localhost:3001';

export const bffClient = hc<AppType>(BASE_URL);

/**
 * FetchHttpClient — IHttpClient implementation using the native Fetch API.
 *
 * This adapter wraps the browser's built-in fetch() to implement IHttpClient.
 * It reads the base URL from the VITE_API_BASE_URL environment variable.
 * Using fetch avoids adding axios as an external dependency.
 *
 * @see src/core/domain/repositories/IHttpClient.ts
 */

import type { IHttpClient } from '@/core/domain/ports/IHttpClient'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

async function request<T>(url: string, options: RequestInit = {}): Promise<{ data: T }> {
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} — ${url}`)
  }

  const data: T = await response.json()
  return { data }
}

export class FetchHttpClient implements IHttpClient {
  get<T>(url: string): Promise<{ data: T }> {
    return request<T>(url, { method: 'GET' })
  }

  post<T>(url: string, body?: unknown): Promise<{ data: T }> {
    return request<T>(url, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  put<T>(url: string, body?: unknown): Promise<{ data: T }> {
    return request<T>(url, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  delete<T>(url: string): Promise<{ data: T }> {
    return request<T>(url, { method: 'DELETE' })
  }

  async postForm<T>(url: string, formData: FormData): Promise<{ data: T }> {
    const response = await fetch(`${BASE_URL}${url}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} — ${url}`);
    }

    const data: T = await response.json();
    return { data };
  }
}

// Export with AxiosHttpClient alias for backward compatibility with main.ts import
export { FetchHttpClient as AxiosHttpClient }

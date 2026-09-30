import { en } from '@/i18n/dictionaries/en'

/** Interpolates `{name}` placeholders the way the real i18n adapter does. */
export function translateEnglish(key: string, params?: Record<string, string>): string {
  const template = en[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? `{${name}}`)
}

/** The English copy for a key, failing loudly when the dictionary does not carry it. */
export function copy(key: string, params?: Record<string, string>): string {
  if (en[key] === undefined) throw new Error(`missing en dictionary key: ${key}`)
  return translateEnglish(key, params)
}

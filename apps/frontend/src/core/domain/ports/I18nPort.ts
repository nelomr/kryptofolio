export interface I18nPort {
  translate(key: string, params?: Record<string, string>): string;
}

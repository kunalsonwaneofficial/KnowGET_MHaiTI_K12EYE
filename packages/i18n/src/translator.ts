import {
  fallbackChain,
  interpolate,
  isPluralForms,
  type Locale,
  type MessageCatalog,
  type MessageValue,
  type TranslateOptions,
  type TranslateParams,
} from "./message-catalog";

export interface TranslatorOptions {
  readonly defaultLocale: Locale;
}

/**
 * Resolves message keys to localized, interpolated strings. Lookups walk a
 * fallback chain (specific → general → default), so a missing `en-US` key falls
 * back to `en` and then the default locale. Plural messages select a CLDR
 * category via `Intl.PluralRules` from the supplied `count`. A missing key
 * returns the key itself, making gaps visible without throwing.
 */
export class Translator {
  private readonly catalogs = new Map<Locale, MessageCatalog>();
  private readonly defaultLocale: Locale;

  constructor(options: TranslatorOptions) {
    this.defaultLocale = options.defaultLocale;
  }

  addCatalog(locale: Locale, catalog: MessageCatalog): void {
    this.catalogs.set(locale, { ...(this.catalogs.get(locale) ?? {}), ...catalog });
  }

  has(key: string, locale?: Locale): boolean {
    return this.resolve(key, locale ?? this.defaultLocale) !== undefined;
  }

  translate(key: string, params: TranslateParams = {}, options: TranslateOptions = {}): string {
    const locale = options.locale ?? this.defaultLocale;
    const value = this.resolve(key, locale);
    if (value === undefined) {
      return key;
    }
    const template = this.selectTemplate(value, locale, options.count);
    const withCount = options.count !== undefined ? { count: options.count, ...params } : params;
    return interpolate(template, withCount);
  }

  private resolve(key: string, locale: Locale): MessageValue | undefined {
    for (const candidate of fallbackChain(locale, this.defaultLocale)) {
      const value = this.catalogs.get(candidate)?.[key];
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private selectTemplate(value: MessageValue, locale: Locale, count?: number): string {
    if (!isPluralForms(value)) {
      return value;
    }
    const category = count !== undefined ? new Intl.PluralRules(locale).select(count) : "other";
    return value[category] ?? value.other ?? "";
  }
}

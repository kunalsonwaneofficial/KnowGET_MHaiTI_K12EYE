/** A BCP-47-ish locale tag, e.g. "en", "en-US", "hi". */
export type Locale = string;

/** Plural variants keyed by CLDR plural category. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;

/** A message is either a single template or a set of plural variants. */
export type MessageValue = string | PluralForms;

/** A flat map of message keys to their (locale-specific) values. */
export type MessageCatalog = Readonly<Record<string, MessageValue>>;

/** Interpolation parameters substituted into `{placeholder}` slots. */
export type TranslateParams = Readonly<Record<string, string | number>>;

export interface TranslateOptions {
  readonly locale?: Locale;
  /** Selects the plural variant (via `Intl.PluralRules`) and fills `{count}`. */
  readonly count?: number;
}

/** Type-guard distinguishing a plural-forms value from a plain template. */
export const isPluralForms = (value: MessageValue): value is PluralForms =>
  typeof value === "object";

/** Replace `{name}` slots with params; unknown slots are left untouched. */
export function interpolate(template: string, params: TranslateParams): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Build the lookup chain for a locale, most-specific first, ending with the
 * default: `"en-US"` → `["en-US", "en", <default>]` (de-duplicated).
 */
export function fallbackChain(locale: Locale, defaultLocale: Locale): Locale[] {
  const chain: Locale[] = [];
  const parts = locale.split("-");
  for (let i = parts.length; i > 0; i -= 1) {
    chain.push(parts.slice(0, i).join("-"));
  }
  if (!chain.includes(defaultLocale)) {
    chain.push(defaultLocale);
  }
  return chain;
}

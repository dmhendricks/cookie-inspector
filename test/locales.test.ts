import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = join(__dirname, '..', 'public', '_locales');
const DEFAULT_LOCALE = 'en';

type Message = { message: string; description?: string; placeholders?: Record<string, unknown> };
type LocaleFile = Record<string, Message>;

function loadLocale(locale: string): LocaleFile {
  return JSON.parse(
    readFileSync(join(LOCALES_DIR, locale, 'messages.json'), 'utf8'),
  );
}

function placeholderRefs(message: string): string[] {
  // chrome.i18n placeholders look like $NAME$ (named) or $1/$2 (positional)
  return [...message.matchAll(/\$([A-Za-z0-9_]+)\$|\$(\d+)/g)]
    .map((m) => (m[1] ?? m[2]!).toLowerCase())
    .sort();
}

const locales = readdirSync(LOCALES_DIR).filter((l) => l !== DEFAULT_LOCALE);
const base = loadLocale(DEFAULT_LOCALE);
const baseKeys = Object.keys(base).sort();

describe('_locales consistency', () => {
  it('has a default locale', () => {
    expect(baseKeys.length).toBeGreaterThan(0);
  });

  describe.each(locales)('%s', (locale) => {
    const data = loadLocale(locale);
    const keys = Object.keys(data).sort();

    it('defines exactly the same keys as the default locale', () => {
      const missing = baseKeys.filter((k) => !(k in data));
      const extra = keys.filter((k) => !(k in base));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it('has a non-empty message string for every key', () => {
      const empty = keys.filter((k) => {
        const entry = data[k];
        return typeof entry?.message !== 'string' || entry.message.trim() === '';
      });
      expect(empty).toEqual([]);
    });

    it('uses the same placeholder references as the default locale', () => {
      const mismatches: Record<string, { base: string[]; locale: string[] }> = {};
      for (const k of baseKeys) {
        const baseEntry = base[k];
        const localeEntry = data[k];
        if (!baseEntry || !localeEntry) continue;
        const expected = placeholderRefs(baseEntry.message);
        const actual = placeholderRefs(localeEntry.message);
        if (expected.join(',') !== actual.join(',')) {
          mismatches[k] = { base: expected, locale: actual };
        }
      }
      expect(mismatches).toEqual({});
    });
  });
});

const cache = new Map<string, string>();

function cacheKey(key: string, substitutions?: string | string[]): string {
  if (substitutions === undefined) return key;
  return `${key}\0${Array.isArray(substitutions) ? substitutions.join('\0') : substitutions}`;
}

/**
 * Resolve a localized string. Cache successes so that after an extension reload
 * (when chrome.i18n throws) we keep showing the last good text instead of keys
 * or crashing the Preact tree — same "go quiet" idea as Style Detective.
 */
export const t = (key: string, substitutions?: string | string[]) => {
  const ck = cacheKey(key, substitutions);
  try {
    const msg = chrome.i18n.getMessage(key, substitutions) || key;
    cache.set(ck, msg);
    return msg;
  } catch {
    return cache.get(ck) ?? key;
  }
};

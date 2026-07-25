import type {
  ValidatedCookieFormInput,
  ValidatedUpdatePayload,
} from '../shared/cookie-schema';

export type Cookie = chrome.cookies.Cookie;

export type CookieFormInput = ValidatedCookieFormInput;
export type UpdatePayload = ValidatedUpdatePayload;

function urlForCookie(cookie: Pick<Cookie, 'domain' | 'path' | 'secure'>): string {
  const protocol = cookie.secure ? 'https' : 'http';
  const host = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
  return `${protocol}://${host}${cookie.path ?? '/'}`;
}

/** tabId → last known URL. Cleared on navigation / disconnect. */
const tabUrlCache = new Map<number, string>();
/** In-flight tabs.get promises so concurrent ops share one lookup. */
const tabUrlInflight = new Map<number, Promise<string>>();

async function tabUrl(tabId: number): Promise<string> {
  const cached = tabUrlCache.get(tabId);
  if (cached !== undefined) return cached;

  const inflight = tabUrlInflight.get(tabId);
  if (inflight) return inflight;

  const pending = chrome.tabs
    .get(tabId)
    .then((tab) => {
      const url = tab.url ?? '';
      tabUrlCache.set(tabId, url);
      return url;
    })
    .finally(() => {
      tabUrlInflight.delete(tabId);
    });

  tabUrlInflight.set(tabId, pending);
  return pending;
}

export const CookieService = {
  /** Drop cached URL so the next op re-reads chrome.tabs.get. */
  invalidateTabUrl(tabId: number): void {
    tabUrlCache.delete(tabId);
    tabUrlInflight.delete(tabId);
  },

  /** Seed/refresh the cache from a known navigation URL (avoids tabs.get). */
  rememberTabUrl(tabId: number, url: string): void {
    tabUrlInflight.delete(tabId);
    tabUrlCache.set(tabId, url);
  },

  async list(tabId: number): Promise<Cookie[]> {
    const url = await tabUrl(tabId);
    if (!url) return [];
    return chrome.cookies.getAll({ url });
  },

  async create(tabId: number, input: CookieFormInput): Promise<Cookie | null> {
    const url = await tabUrl(tabId);
    const details: chrome.cookies.SetDetails = {
      url,
      name: input.name,
      value: input.value,
      path: input.path,
      secure: input.secure,
      httpOnly: input.httpOnly,
      sameSite: input.sameSite,
      storeId: input.storeId,
    };
    if (!input.hostOnly) {
      details.domain = input.domain;
    }
    if (!input.session && input.expirationDate !== undefined) {
      details.expirationDate = input.expirationDate;
    }
    return chrome.cookies.set(details);
  },

  async delete(tabId: number, name: string): Promise<chrome.cookies.CookieDetails | null> {
    const url = await tabUrl(tabId);
    return chrome.cookies.remove({ url, name });
  },

  async importMerge(tabId: number, inputs: CookieFormInput[]): Promise<Cookie[]> {
    if (!(await tabUrl(tabId))) return [];
    const created: Cookie[] = [];
    for (const input of inputs) {
      const cookie = await this.create(tabId, input);
      if (cookie) created.push(cookie);
    }
    return created;
  },

  async removeAll(tabId: number): Promise<void> {
    const url = await tabUrl(tabId);
    if (!url) return;
    const cookies = await chrome.cookies.getAll({ url });
    await Promise.all(
      cookies.map((c) =>
        chrome.cookies.remove({ url: urlForCookie(c), name: c.name, storeId: c.storeId }),
      ),
    );
  },

  /**
   * Merge previous + changed and re-set the cookie. Removes the prior cookie
   * first so renames or domain/path changes don't leave a stale record.
   * Preserves sameSite, storeId, and any other server-set attributes.
   */
  async update(tabId: number, payload: UpdatePayload): Promise<Cookie | null> {
    const { previousAttributes: prev, changedAttributes: changed } = payload;
    const tabUrlValue = await tabUrl(tabId);

    const merged = { ...prev, ...changed };

    const removeUrl = urlForCookie(prev);
    await chrome.cookies.remove({
      url: removeUrl,
      name: prev.name,
      storeId: prev.storeId,
    });

    const setDetails: chrome.cookies.SetDetails = {
      url: tabUrlValue || urlForCookie(merged),
      name: merged.name,
      value: merged.value,
      path: merged.path,
      secure: merged.secure,
      httpOnly: merged.httpOnly,
      sameSite: merged.sameSite,
      storeId: merged.storeId,
    };

    if (!merged.hostOnly) {
      setDetails.domain = merged.domain;
    }

    if (merged.session) {
      setDetails.expirationDate = undefined;
    } else if (merged.expirationDate !== undefined) {
      setDetails.expirationDate = merged.expirationDate;
    }

    return chrome.cookies.set(setDetails);
  },
};

import type {
  ValidatedCookieFormInput,
  ValidatedUpdatePayload,
} from '../shared/cookie-schema';

export type Cookie = chrome.cookies.Cookie;

export type CookieFormInput = ValidatedCookieFormInput;
export type UpdatePayload = ValidatedUpdatePayload;

type CookieLike = Pick<
  Cookie,
  | 'name'
  | 'value'
  | 'domain'
  | 'path'
  | 'secure'
  | 'httpOnly'
  | 'hostOnly'
  | 'session'
  | 'sameSite'
  | 'storeId'
> & { expirationDate?: number };

function urlForCookie(cookie: Pick<Cookie, 'domain' | 'path' | 'secure'>): string {
  const protocol = cookie.secure ? 'https' : 'http';
  const host = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
  return `${protocol}://${host}${cookie.path ?? '/'}`;
}

/** Name/domain/path/hostOnly/storeId form the cookie's identity in Chrome. */
function identityChanged(prev: CookieLike, next: CookieLike): boolean {
  return (
    prev.name !== next.name ||
    prev.domain !== next.domain ||
    prev.path !== next.path ||
    prev.hostOnly !== next.hostOnly ||
    prev.storeId !== next.storeId
  );
}

function toSetDetails(cookie: CookieLike, url: string): chrome.cookies.SetDetails {
  const details: chrome.cookies.SetDetails = {
    url,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    storeId: cookie.storeId,
  };
  if (!cookie.hostOnly) {
    details.domain = cookie.domain;
  }
  if (cookie.session) {
    details.expirationDate = undefined;
  } else if (cookie.expirationDate !== undefined) {
    details.expirationDate = cookie.expirationDate;
  }
  return details;
}

async function restoreCookie(prev: CookieLike): Promise<void> {
  await chrome.cookies.set(toSetDetails(prev, urlForCookie(prev)));
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
   * Merge previous + changed and re-set the cookie.
   *
   * When identity (name/domain/path/hostOnly/storeId) is unchanged, a single
   * `cookies.set` overwrites in place — no remove, so a failed set cannot
   * orphan the cookie. When identity changes, remove the old record first,
   * then set; if set fails, restore `previousAttributes`.
   */
  async update(tabId: number, payload: UpdatePayload): Promise<Cookie | null> {
    const { previousAttributes: prev, changedAttributes: changed } = payload;
    const tabUrlValue = await tabUrl(tabId);
    const merged: CookieLike = { ...prev, ...changed };
    const setUrl = tabUrlValue || urlForCookie(merged);
    const setDetails = toSetDetails(merged, setUrl);

    if (!identityChanged(prev, merged)) {
      return chrome.cookies.set(setDetails);
    }

    await chrome.cookies.remove({
      url: urlForCookie(prev),
      name: prev.name,
      storeId: prev.storeId,
    });

    try {
      const result = await chrome.cookies.set(setDetails);
      if (!result) {
        await restoreCookie(prev);
        return null;
      }
      return result;
    } catch (err) {
      try {
        await restoreCookie(prev);
      } catch {
        // Prefer surfacing the set failure; restore is best-effort.
      }
      throw err;
    }
  },
};

import type { UICookie, SortColumn, SortDir } from './types';

const byteEncoder = new TextEncoder();

/** True while this panel can still call extension APIs. */
export function isExtensionContextValid(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

export function cookieSize(c: UICookie): number {
  return byteEncoder.encode((c.name ?? '') + (c.value ?? '')).byteLength;
}

export function expirationDate(c: UICookie): Date | null {
  if (c.expirationDate === undefined || c.expirationDate === null) return null;
  return new Date(c.expirationDate * 1000);
}

const expirationFormatter = new Intl.DateTimeFormat(
  chrome.i18n.getUILanguage(),
  {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  },
);

export function formatExpiration(d: Date): string {
  return expirationFormatter.format(d);
}

export function isSession(c: UICookie): boolean {
  if (c.session !== undefined) return c.session;
  return c.expirationDate === undefined || c.expirationDate === null;
}

function sortKey(c: UICookie, col: SortColumn): string | number | null {
  switch (col) {
    case 'size':
      return cookieSize(c);
    case 'expires': {
      const d = expirationDate(c);
      return d ? d.getTime() : 0;
    }
    case 'httpOnly':
      return c.httpOnly ? 1 : 0;
    case 'secure':
      return c.secure ? 1 : 0;
    case 'name':
      return c.name ?? '';
    case 'value':
      return c.value ?? '';
    case 'domain':
      return c.domain ?? '';
    case 'path':
      return c.path ?? '';
  }
}

function isIpAddress(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.startsWith('[') && host.endsWith(']')) return true;
  return false;
}

export function buildExportFilename(tabUrl: string | undefined, now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  let host = '';
  if (tabUrl) {
    try {
      host = new URL(tabUrl).hostname;
    } catch {
      host = '';
    }
  }
  if (!host || isIpAddress(host)) return `cookies.${date}.json`;
  return `${host.replace(/\./g, '-')}.cookies.${date}.json`;
}

export function sortCookies(
  cookies: UICookie[],
  col: SortColumn,
  dir: SortDir,
): UICookie[] {
  const decorated = cookies.map((c, i) => ({ c, i, k: sortKey(c, col) }));
  const sign = dir === 'asc' ? 1 : -1;
  decorated.sort((a, b) => {
    const ka = a.k;
    const kb = b.k;
    if (ka === kb) return a.i - b.i;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return ka < kb ? -sign : sign;
  });
  return decorated.map((d) => d.c);
}

import { useEffect, useState, useCallback } from 'preact/hooks';
import { isExtensionContextValid } from '../util';

export type FilterBy = 'name' | 'value' | 'name-value';

export interface Settings {
  showCopyIcons: boolean;
  showFilterBar: boolean;
  filterBy: FilterBy;
}

const DEFAULTS: Settings = {
  showCopyIcons: true,
  showFilterBar: true,
  filterBy: 'name',
};

const FILTER_BY_VALUES: readonly FilterBy[] = ['name', 'value', 'name-value'];

const KEYS = Object.keys(DEFAULTS) as (keyof Settings)[];

function isFilterBy(v: unknown): v is FilterBy {
  return typeof v === 'string' && (FILTER_BY_VALUES as readonly string[]).includes(v);
}

function resolve(raw: Record<string, unknown>): Settings {
  const out: Settings = { ...DEFAULTS };
  if (typeof raw.showCopyIcons === 'boolean') out.showCopyIcons = raw.showCopyIcons;
  if (typeof raw.showFilterBar === 'boolean') out.showFilterBar = raw.showFilterBar;
  if (isFilterBy(raw.filterBy)) out.filterBy = raw.filterBy;
  return out;
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    if (!isExtensionContextValid()) return;
    try {
      chrome.storage.sync.get(KEYS, (raw) => {
        setSettings(resolve(raw));
      });
    } catch {
      return;
    }
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'sync') return;
      const relevant = KEYS.some((key) => key in changes);
      if (!relevant) return;
      if (!isExtensionContextValid()) return;
      try {
        chrome.storage.sync.get(KEYS, (raw) => {
          setSettings(resolve(raw));
        });
      } catch {
        // Panel may have outlived an extension reload.
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      try {
        chrome.storage.onChanged.removeListener(listener);
      } catch {
        // ignore
      }
    };
  }, []);

  const setSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    if (!isExtensionContextValid()) return;
    try {
      chrome.storage.sync.set({ [key]: value });
    } catch {
      // ignore
    }
  }, []);

  return { settings, setSetting };
}

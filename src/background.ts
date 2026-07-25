import * as v from 'valibot';
import { CookieService } from './background/cookie-service';
import {
  CookieFormInputSchema,
  UpdatePayloadSchema,
} from './shared/cookie-schema';

const PortMessageSchema = v.object({
  command: v.string(),
  tabId: v.pipe(v.number(), v.integer(), v.minValue(0)),
  data: v.optional(v.unknown()),
});

/**
 * Map of tabId → connected devtools port. Lost when the SW suspends; that's
 * fine — the panel reconnects and re-sends `saveListener` on resume.
 */
const ports = new Map<number, chrome.runtime.Port>();

/**
 * tabIds whose panel is currently hidden. We skip navigation-driven cookie
 * pushes for these; the panel sends a fresh read when it resumes.
 */
const paused = new Set<number>();

function send(port: chrome.runtime.Port, command: string, data: unknown): void {
  try {
    port.postMessage({ command, data });
  } catch {
    // Port disconnected between request and response. The panel will reconnect.
  }
}

async function pushCookies(tabId: number): Promise<void> {
  const port = ports.get(tabId);
  if (!port) return;
  if (paused.has(tabId)) return;
  const cookies = await CookieService.list(tabId);
  send(port, 'cookies:read', { cookies });
}

async function onCommitted(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
): Promise<void> {
  if (details.frameId !== 0) return;
  CookieService.rememberTabUrl(details.tabId, details.url);
  await pushCookies(details.tabId);
}

async function onHistoryStateUpdated(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
): Promise<void> {
  if (details.frameId !== 0) return;
  CookieService.rememberTabUrl(details.tabId, details.url);
  await pushCookies(details.tabId);
}

function onBeforeNavigate(
  details: chrome.webNavigation.WebNavigationBaseCallbackDetails,
): void {
  if (details.frameId !== 0) return;
  // URL is about to change — drop the cache so in-flight ops don't use a stale URL.
  CookieService.invalidateTabUrl(details.tabId);
  const port = ports.get(details.tabId);
  if (!port) return;
  if (paused.has(details.tabId)) return;
  send(port, 'navigate', undefined);
}

function attachNavigationListeners(): void {
  if (chrome.webNavigation.onCommitted.hasListener(onCommitted)) return;
  chrome.webNavigation.onCommitted.addListener(onCommitted);
  chrome.webNavigation.onHistoryStateUpdated.addListener(onHistoryStateUpdated);
  chrome.webNavigation.onBeforeNavigate.addListener(onBeforeNavigate);
}

function detachNavigationListeners(): void {
  if (!chrome.webNavigation.onCommitted.hasListener(onCommitted)) return;
  chrome.webNavigation.onCommitted.removeListener(onCommitted);
  chrome.webNavigation.onHistoryStateUpdated.removeListener(onHistoryStateUpdated);
  chrome.webNavigation.onBeforeNavigate.removeListener(onBeforeNavigate);
}

async function handle(rawMsg: unknown, port: chrome.runtime.Port): Promise<void> {
  const parsed = v.safeParse(PortMessageSchema, rawMsg);
  if (!parsed.success) return;
  const { command, tabId, data } = parsed.output;

  switch (command) {
    case 'saveListener': {
      ports.set(tabId, port);
      attachNavigationListeners();
      port.onDisconnect.addListener(() => {
        if (ports.get(tabId) === port) ports.delete(tabId);
        paused.delete(tabId);
        CookieService.invalidateTabUrl(tabId);
        if (ports.size === 0) detachNavigationListeners();
      });
      return;
    }

    case 'panel:pause': {
      paused.add(tabId);
      return;
    }

    case 'panel:resume': {
      paused.delete(tabId);
      const cookies = await CookieService.list(tabId);
      send(port, 'cookies:read', { cookies });
      return;
    }

    case 'cookies:read': {
      const cookies = await CookieService.list(tabId);
      send(port, command, { cookies });
      return;
    }

    case 'cookies:create': {
      const input = v.safeParse(CookieFormInputSchema, data ?? {});
      if (!input.success) return;
      const cookie = await CookieService.create(tabId, input.output);
      send(port, command, cookie);
      return;
    }

    case 'cookies:delete': {
      const input = v.safeParse(CookieFormInputSchema, data ?? {});
      if (!input.success) return;
      await CookieService.delete(tabId, input.output.name ?? '');
      send(port, command, input.output);
      return;
    }

    case 'cookies:update': {
      const payload = v.safeParse(UpdatePayloadSchema, data);
      if (!payload.success) return;
      const cookie = await CookieService.update(tabId, {
        previousAttributes: payload.output.previousAttributes,
        changedAttributes: payload.output.changedAttributes,
      });
      const enriched = cookie
        ? { ...cookie, id: payload.output.previousAttributes.id }
        : null;
      send(port, command, enriched);
      return;
    }

    case 'removeAllCookies': {
      await CookieService.removeAll(tabId);
      send(port, command, { cookies: [] });
      return;
    }

    case 'cookies:import': {
      const input = v.safeParse(v.array(CookieFormInputSchema), data);
      if (!input.success) return;
      const cookies = await CookieService.importMerge(tabId, input.output);
      for (const cookie of cookies) send(port, 'cookies:create', cookie);
      return;
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.sender?.id !== chrome.runtime.id) return;
  port.onMessage.addListener((msg: unknown) => {
    void handle(msg, port);
  });
});


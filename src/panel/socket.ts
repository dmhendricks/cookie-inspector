import type { Cookie } from '../background/cookie-service';
import { isExtensionContextValid } from './util';

export type IncomingCommand =
  | 'cookies:read'
  | 'cookies:create'
  | 'cookies:update'
  | 'cookies:delete'
  | 'removeAllCookies'
  | 'navigate';

export interface IncomingMessage {
  command: IncomingCommand;
  data?: unknown;
}

export interface OutgoingMessage {
  command: string;
  tabId: number;
  data?: unknown;
}

type Listener = (data: unknown) => void;

const PANEL_RELOAD_FLAG = '__cookieInspectorPanelReloaded__';

/**
 * DevTools panels can outlive an extension reload. Style Detective avoids this
 * class of bug because it has no surviving panel — orphaned content scripts
 * simply no-op. Here we (1) try to reload the panel document so it picks up the
 * new extension, and (2) if that already failed, go quiet like Style Detective
 * instead of spamming reconnect / chrome.i18n errors.
 */
export class Socket {
  readonly tabId: number;
  private port: chrome.runtime.Port | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private dead = false;

  constructor(tabId: number) {
    this.tabId = tabId;
    if (!isExtensionContextValid()) {
      this.markDead();
      return;
    }
    try {
      this.port = this.connect();
      try {
        sessionStorage.removeItem(PANEL_RELOAD_FLAG);
      } catch {
        // ignore
      }
    } catch {
      this.recoverOrQuiet();
    }
  }

  get isDead(): boolean {
    return this.dead;
  }

  private markDead(): void {
    this.dead = true;
    this.port = null;
  }

  /** Prefer reloading the panel (picks up new extension); otherwise stay silent. */
  private recoverOrQuiet(): void {
    this.markDead();
    try {
      if (!sessionStorage.getItem(PANEL_RELOAD_FLAG)) {
        sessionStorage.setItem(PANEL_RELOAD_FLAG, '1');
        window.location.reload();
      }
    } catch {
      // ignore — keep last-rendered UI frozen
    }
  }

  private connect(): chrome.runtime.Port {
    if (!isExtensionContextValid()) {
      throw new Error('Extension context invalidated');
    }

    const port = chrome.runtime.connect();
    port.onMessage.addListener((msg: IncomingMessage) => {
      const set = this.listeners.get(msg.command);
      if (set) for (const fn of set) fn(msg.data);
    });
    port.onDisconnect.addListener(() => {
      if (this.dead) return;
      // SW idle (context still valid): reconnect. Extension reload: recover/quiet.
      if (!isExtensionContextValid()) {
        this.recoverOrQuiet();
        return;
      }
      try {
        this.port = this.connect();
        this.send({ command: 'saveListener' });
      } catch {
        this.recoverOrQuiet();
      }
    });
    return port;
  }

  on(command: IncomingCommand, fn: Listener): () => void {
    let set = this.listeners.get(command);
    if (!set) {
      set = new Set();
      this.listeners.set(command, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  send(msg: Omit<OutgoingMessage, 'tabId'>): void {
    if (this.dead || !this.port) return;
    try {
      this.port.postMessage({ ...msg, tabId: this.tabId });
    } catch {
      if (!isExtensionContextValid()) {
        this.recoverOrQuiet();
        return;
      }
      try {
        this.port = this.connect();
        this.port.postMessage({ ...msg, tabId: this.tabId });
      } catch {
        this.recoverOrQuiet();
      }
    }
  }

  saveListener(): void {
    this.send({ command: 'saveListener' });
  }

  read(): void {
    this.send({ command: 'cookies:read' });
  }

  create(cookie: Partial<Cookie> & { session?: boolean; hostOnly?: boolean }): void {
    this.send({ command: 'cookies:create', data: cookie });
  }

  remove(cookie: Cookie): void {
    this.send({ command: 'cookies:delete', data: cookie });
  }

  removeAll(): void {
    this.send({ command: 'removeAllCookies' });
  }

  setVisibility(visible: boolean): void {
    this.send({ command: visible ? 'panel:resume' : 'panel:pause' });
  }

  import(cookies: Array<Partial<Cookie> & { session?: boolean; hostOnly?: boolean }>): void {
    this.send({ command: 'cookies:import', data: cookies });
  }

  update(
    previousAttributes: Cookie & { id?: string },
    changedAttributes: Partial<Cookie> & { session?: boolean; hostOnly?: boolean },
  ): void {
    this.send({
      command: 'cookies:update',
      data: { previousAttributes, changedAttributes },
    });
  }
}

// When DbGate is served under a path (WEB_ROOT, e.g. /prod and /dev on one host), every instance on that host would
// share the browser's storage: open tabs, the access token, sidebar settings. A tab from one instance would then open
// in the other, and each instance's sign-in would throw the other's out. This gives each path its own storage:
//  - localStorage and sessionStorage: a view that keeps this instance's keys under "dbgate@<root>:" (for..in, key(),
//    length and clear() see only those);
//  - localforage (IndexedDB): its own database, "dbgate@<root>".
// It must run before anything reads storage, so main.ts imports it first. Without a path (served at "/", Electron)
// nothing changes.
import localforage from 'localforage';

export function webRootOf(pathname: string): string | null {
  const m = /^\/([^/]+)\//.exec(pathname || '');
  return m && !m[1].includes('.') ? m[1] : null;
}

export function namespacedStorage(raw: Storage, prefix: string): Storage {
  const own = (): string[] => {
    const out: string[] = [];
    for (let i = 0; i < raw.length; i++) {
      const k = raw.key(i);
      if (k != null && k.startsWith(prefix)) out.push(k.slice(prefix.length));
    }
    return out;
  };
  const api = {
    getItem: (k: string) => raw.getItem(prefix + k),
    setItem: (k: string, v: string) => raw.setItem(prefix + k, String(v)),
    removeItem: (k: string) => raw.removeItem(prefix + k),
    key: (i: number) => own()[i] ?? null,
    clear: () => own().forEach(k => raw.removeItem(prefix + k)),
    get length() {
      return own().length;
    },
  };
  return new Proxy(api, {
    get(target, p) {
      if (p in target) return (target as any)[p];
      return typeof p === 'string' ? (raw.getItem(prefix + p) ?? undefined) : undefined;
    },
    set(target, p, v) {
      if (typeof p === 'string') raw.setItem(prefix + p, String(v));
      return true;
    },
    deleteProperty(target, p) {
      if (typeof p === 'string') raw.removeItem(prefix + p);
      return true;
    },
    has(target, p) {
      return p in target || (typeof p === 'string' && raw.getItem(prefix + p) !== null);
    },
    ownKeys() {
      return own();
    },
    getOwnPropertyDescriptor(target, p) {
      if (typeof p !== 'string') return undefined;
      const v = raw.getItem(prefix + p);
      return v === null ? undefined : { value: v, enumerable: true, configurable: true, writable: true };
    },
  }) as unknown as Storage;
}

const root = typeof window === 'undefined' ? null : webRootOf(window.location.pathname);
if (root) {
  const prefix = `dbgate@${root}:`;
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      const view = namespacedStorage((window as any)[name], prefix);
      Object.defineProperty(window, name, { configurable: true, get: () => view });
    } catch (e) {
      console.warn(`DbGate: ${name} not namespaced for /${root}/`, e);
    }
  }
  localforage.config({ name: `dbgate@${root}` });
}

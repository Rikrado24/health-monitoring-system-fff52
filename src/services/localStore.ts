const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const readStore = <T>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    return parseJson(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
};

export const writeStore = <T>(key: string, value: T) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(`sehatai:${key}`, { detail: value }));
  } catch {
    // Ignore storage failures in restrictive browsers.
  }
};

export const subscribeStore = <T>(key: string, onChange: (value: T) => void) => {
  if (typeof window === "undefined") return () => {};
  const eventName = `sehatai:${key}`;
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<T>;
    onChange(customEvent.detail);
  };
  window.addEventListener(eventName, handler as EventListener);
  return () => window.removeEventListener(eventName, handler as EventListener);
};

export const createLocalId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

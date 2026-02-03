import { useEffect, useState } from "react";

type StorageOptions<T> = {
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
};

const defaultSerialize = <T,>(value: T) => String(value);
const defaultDeserialize = <T,>(value: string) => value as T;

export function useLocalStorageState<T>(key: string, defaultValue: T, options: StorageOptions<T> = {}) {
  const { serialize = defaultSerialize, deserialize = defaultDeserialize } = options;
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    try {
      return deserialize(stored);
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, serialize(state));
  }, [key, serialize, state]);

  return [state, setState] as const;
}

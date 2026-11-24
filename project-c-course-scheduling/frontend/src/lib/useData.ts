import { useEffect, useState } from "react";

const cache = new Map<string, Promise<unknown>>();

/** Fetch once per key for the whole app session (static endpoints). */
export function useData<T>(key: string, fn: () => Promise<T>): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let p = cache.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fn();
      cache.set(key, p);
      p.catch(() => cache.delete(key));
    }
    p.then((d) => alive && setData(d)).catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, error };
}

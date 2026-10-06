import type { Trip } from '../types';

const TRIPS_KEY = 'tripbooker.trips.v1';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked (private mode) — trips just won't persist */
  }
}

export function loadTrips(): Trip[] {
  const raw = safeGet(TRIPS_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveTrips(trips: Trip[]) {
  safeSet(TRIPS_KEY, JSON.stringify(trips));
}

export function loadJSON<T>(key: string, fallback: T): T {
  const raw = safeGet(key);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown) {
  safeSet(key, JSON.stringify(value));
}

export { safeGet, safeSet };

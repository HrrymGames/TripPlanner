import { useEffect, useState } from 'react';
import type { Destination, StayListing } from '../types';
import { safeGet, safeSet } from './storage';

const memory = new Map<string, string | null>();

/** Hero photo for a destination from Wikipedia (free, no key, CORS-enabled). */
export function useDestinationImage(dest: Destination): string | null {
  const key = `tripbooker.img.${dest.wiki}`;
  const [url, setUrl] = useState<string | null>(() => memory.get(key) ?? safeGet(key));
  useEffect(() => {
    const cached = memory.get(key) ?? safeGet(key);
    if (cached) {
      setUrl(cached);
      return;
    }
    if (memory.has(key)) return;
    memory.set(key, null);
    let cancelled = false;
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(dest.wiki)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const original = data?.originalimage;
        const thumb: string | undefined = data?.thumbnail?.source;
        if (!original?.source && !thumb) return;
        // Use a phone-friendly standard width (960px) instead of a huge original.
        const sized: string = original?.width && original.width <= 1280 ? original.source : thumb ? thumb.replace(/\/\d+px-/, '/960px-') : original.source;
        memory.set(key, sized);
        safeSet(key, sized);
        if (!cancelled) setUrl(sized);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key, dest.wiki]);
  return url;
}

/** Photo matching the type of stay (villa with pool, hotel room…). */
export function listingImage(l: StayListing, w = 640, h = 420): string {
  return `https://loremflickr.com/${w}/${h}/${l.imageKeywords}?lock=${l.imageSeed + 1}`;
}

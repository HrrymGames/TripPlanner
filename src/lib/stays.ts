import type { Amenity, Destination, ISODate, StayFilters, StayKind, StayListing, StayQuote, StaySource } from '../types';
import { destById } from '../data/destinations';
import { addDays, dayOfWeek } from './dates';
import { rng, type Rng } from './random';
import { staySeasonFactor } from './season';

const NAME_WORDS: Record<Destination['lang'], string[]> = {
  pt: ['Sol', 'Mar', 'Brisa', 'Oliveira', 'Algarvia', 'Azul', 'Rocha', 'Laranjeira', 'Gaivota', 'Estrela', 'Amendoeira', 'Luz'],
  es: ['del Sol', 'Mar Azul', 'Brisa', 'Los Olivos', 'La Palmera', 'Las Rocas', 'Bonita', 'Estrella', 'El Faro', 'Buena Vista', 'Alegría', 'Luna'],
  it: ['Limoni', 'Bella Vista', 'Il Sole', 'Ulivo', 'Azzurra', 'La Terrazza', 'Stella', 'Dolce Vita', 'Roseto', 'Il Glicine'],
  gr: ['Thalassa', 'Ilios', 'Elia', 'Galini', 'Kyma', 'Asteri', 'Anemos', 'Agapi', 'Levanda', 'Pefkos'],
  hr: ['More', 'Sunce', 'Maslina', 'Lavanda', 'Zora', 'Galeb', 'Kamen', 'Plava'],
  tr: ['Deniz', 'Güneş', 'Zeytin', 'Lale', 'Mavi', 'Yildiz', 'Begonvil', 'Defne'],
  fr: ['Lavande', 'Soleil', 'Les Pins', 'Belle Vue', 'Le Mas', 'Bleu', 'Les Oliviers', 'Étoile'],
  en: ['Palm', 'Ocean', 'Skyline', 'Harbour', 'Sunset', 'Coral', 'Golden', 'Park'],
  de: ['Linden', 'Spree', 'Garten', 'Stern', 'Brücke', 'Hof'],
  nl: ['Gracht', 'Tulp', 'Molen', 'Brug', 'Linden', 'Haven'],
  cz: ['Vltava', 'Zlatá', 'Lípa', 'Hvězda', 'Most', 'Růže'],
  pl: ['Wawel', 'Złota', 'Lipa', 'Gwiazda', 'Wisła', 'Róża'],
  hu: ['Duna', 'Arany', 'Csillag', 'Liget', 'Híd', 'Rózsa'],
  ar: ['Yasmine', 'Zitoun', 'Nour', 'Atlas', 'Amira', 'Dar Sahara', 'Kenza', 'Layla'],
  id: ['Sari', 'Kembang', 'Bulan', 'Surya', 'Tirta', 'Alam', 'Padi', 'Lotus'],
  is: ['Norður', 'Hraun', 'Fjall', 'Sól', 'Ljós', 'Vík'],
  mt: ['Bahar', 'Xemx', 'Ġnien', 'Kwiekeb', 'Fanal', 'Lellux'],
};

const VILLA_PREFIX: Partial<Record<Destination['lang'], string>> = { pt: 'Casa', es: 'Villa', it: 'Villa', gr: 'Villa', hr: 'Vila', tr: 'Villa', fr: 'Mas', ar: 'Riad', id: 'Villa', en: 'The' };

const ALL_AMENITIES: Amenity[] = ['wifi', 'aircon', 'kitchen', 'parking', 'bbq', 'hot-tub', 'sea-view', 'gym', 'garden', 'games-room', 'pet-friendly', 'washing-machine', 'terrace', 'spa'];

const listingCache = new Map<string, StayListing[]>();

function amenitiesFor(r: Rng, kind: StayKind, dest: Destination): Amenity[] {
  const warm = Math.max(...dest.temps) >= 25;
  const base: Amenity[] = ['wifi'];
  const add = (a: Amenity, p: number) => {
    if (r.chance(p)) base.push(a);
  };
  if (kind === 'villa') {
    add('aircon', warm ? 0.9 : 0.3);
    base.push('kitchen');
    add('parking', 0.9);
    add('bbq', 0.8);
    add('hot-tub', dest.tags.includes('ski') ? 0.7 : 0.3);
    add('sea-view', dest.tags.includes('beach') ? 0.45 : 0.1);
    add('garden', 0.8);
    add('games-room', 0.35);
    add('pet-friendly', 0.2);
    add('washing-machine', 0.9);
    add('terrace', 0.9);
  } else if (kind === 'apartment') {
    add('aircon', warm ? 0.85 : 0.25);
    base.push('kitchen');
    add('parking', 0.45);
    add('sea-view', dest.tags.includes('beach') ? 0.4 : 0.05);
    add('gym', 0.2);
    add('pet-friendly', 0.15);
    add('washing-machine', 0.75);
    add('terrace', 0.7);
    add('bbq', 0.15);
  } else if (kind === 'hotel') {
    add('aircon', warm ? 0.97 : 0.6);
    add('parking', 0.6);
    add('sea-view', dest.tags.includes('beach') ? 0.5 : 0.1);
    add('gym', 0.65);
    add('spa', 0.4);
    add('terrace', 0.5);
    add('hot-tub', 0.2);
  } else {
    add('aircon', warm ? 0.6 : 0.1);
    add('kitchen', 0.8);
    add('terrace', 0.5);
    add('games-room', 0.5);
  }
  return ALL_AMENITIES.filter((a) => base.includes(a));
}

function sourceFor(r: Rng, kind: StayKind): StaySource {
  if (kind === 'villa') return r.pick(['Airbnb', 'Airbnb', 'Airbnb', 'Vrbo', 'Vrbo', 'Booking.com'] as const);
  if (kind === 'apartment') return r.pick(['Airbnb', 'Airbnb', 'Booking.com', 'Booking.com', 'Vrbo'] as const);
  if (kind === 'hotel') return r.pick(['Booking.com', 'Booking.com', 'Hotels.com'] as const);
  return 'Booking.com';
}

/**
 * Build a stable set of illustrative listings for a destination. They model what's typically on
 * Airbnb / Booking.com / Vrbo there (sizes, pools, price levels) — the deep links open the real thing.
 */
export function listingsFor(destId: string): StayListing[] {
  const hit = listingCache.get(destId);
  if (hit) return hit;
  const dest = destById(destId);
  const r = rng(`stays:${destId}`);
  const words = NAME_WORDS[dest.lang];
  const usedNames = new Set<string>();
  const uniqueName = (gen: () => string) => {
    for (let i = 0; i < 12; i++) {
      const name = gen();
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
    const name = `${gen()} ${['II', 'Garden', 'View', 'Nova', 'Prime', 'Grande', 'Hills', 'Bay'][usedNames.size % 8]}`;
    usedNames.add(name);
    return name;
  };
  const warm = Math.max(...dest.temps) >= 24;
  const beach = dest.tags.includes('beach');
  const isCity = dest.tags.includes('city') && !beach;
  const list: StayListing[] = [];
  let i = 0;
  const push = (l: Omit<StayListing, 'id' | 'destId' | 'imageSeed'>) => {
    list.push({ ...l, id: `${destId}-${l.kind}-${i}`, destId, imageSeed: (i * 7919 + destId.length * 31) % 1000 });
    i++;
  };

  // Villas / chalets / houses.
  const villaCount = isCity ? 5 : 12;
  for (let v = 0; v < villaCount; v++) {
    const bedrooms = r.pick([3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8]);
    const quality = r.range(0.75, 1.65);
    const pool: StayListing['pool'] = !warm && !dest.tags.includes('ski') ? (r.chance(0.3) ? 'private' : 'none') : r.chance(isCity ? 0.4 : 0.85) ? 'private' : r.chance(0.3) ? 'shared' : 'none';
    const area = r.pick(dest.areas);
    const prefix = dest.tags.includes('ski') ? 'Chalet' : (VILLA_PREFIX[dest.lang] ?? 'Villa');
    const name = uniqueName(() => `${prefix} ${r.pick(words)}`);
    push({
      kind: 'villa',
      source: sourceFor(r, 'villa'),
      name,
      area,
      bedrooms,
      sleeps: bedrooms * 2 + r.pick([0, 0, 1, 2]),
      beds: bedrooms + r.int(0, Math.ceil(bedrooms / 2)),
      bathrooms: Math.max(2, Math.round(bedrooms * r.range(0.6, 1))),
      unitsAvailable: 1,
      pool,
      rating: Math.round(r.range(4.4, 4.98) * 100) / 100,
      reviews: r.int(6, 260),
      baseNightly: Math.round(dest.nightly.villaPerBedroom * bedrooms * quality * (pool === 'private' ? 1.1 : 0.9)),
      cleaningFee: Math.round(r.range(60, 180) + bedrooms * 15),
      beachKm: beach ? Math.round(r.range(0.3, 6) * 10) / 10 : Math.round(r.range(2, 25) * 10) / 10,
      centreKm: Math.round(r.range(0.8, 8) * 10) / 10,
      amenities: amenitiesFor(r, 'villa', dest),
      imageKeywords: dest.tags.includes('ski') ? 'chalet,snow' : pool === 'private' ? 'villa,pool' : 'villa,house',
    });
  }

  // Apartments (some in complexes with several identical units → good for splitting a big group).
  const aptCount = 12;
  for (let a = 0; a < aptCount; a++) {
    const bedrooms = r.pick([1, 1, 2, 2, 2, 3, 3, 4]);
    const quality = r.range(0.7, 1.6);
    const pool: StayListing['pool'] = warm ? (r.chance(0.55) ? 'shared' : r.chance(0.1) ? 'private' : 'none') : r.chance(0.1) ? 'shared' : 'none';
    const area = r.pick(dest.areas);
    const style = r.pick(['Apartments', 'Residences', 'Suites', 'Lofts', 'Flats']);
    const name = uniqueName(() => (r.chance(0.5) ? `${area} ${r.pick(words)} ${style}` : `${r.pick(words)} ${style}`));
    push({
      kind: 'apartment',
      source: sourceFor(r, 'apartment'),
      name,
      area,
      bedrooms,
      sleeps: bedrooms * 2 + r.pick([0, 1, 2]),
      beds: bedrooms + r.int(0, bedrooms),
      bathrooms: Math.max(1, Math.round(bedrooms * r.range(0.5, 1))),
      unitsAvailable: r.chance(0.5) ? r.int(2, 5) : 1,
      pool,
      rating: Math.round(r.range(4.1, 4.95) * 100) / 100,
      reviews: r.int(10, 900),
      baseNightly: Math.round(dest.nightly.apartment1br * (1 + 0.45 * (bedrooms - 1)) * quality),
      cleaningFee: Math.round(r.range(25, 70) + bedrooms * 8),
      beachKm: beach ? Math.round(r.range(0.1, 3) * 10) / 10 : Math.round(r.range(2, 20) * 10) / 10,
      centreKm: Math.round(r.range(0.1, 4) * 10) / 10,
      amenities: amenitiesFor(r, 'apartment', dest),
      imageKeywords: pool !== 'none' ? 'apartment,pool' : 'apartment,interior',
    });
  }

  // Hotels & resorts (priced per room).
  const hotelCount = 10;
  const STAR_MULT: Record<number, number> = { 2: 0.65, 3: 1, 4: 1.55, 5: 2.7 };
  for (let h = 0; h < hotelCount; h++) {
    const stars = r.pick([2, 3, 3, 4, 4, 4, 5, 5]);
    const area = r.pick(dest.areas);
    const resort = beach && r.chance(0.5);
    const pool: StayListing['pool'] = stars >= 5 || (warm && r.chance(stars >= 4 ? 0.9 : 0.55)) ? 'shared' : 'none';
    const name = uniqueName(() =>
      resort
        ? `${r.pick(words)} ${r.pick(['Beach Resort', 'Resort & Spa', 'Beach Hotel', 'Village Resort'])}`
        : r.chance(0.5)
          ? `Hotel ${r.pick(words)}`
          : `The ${area.split(' ')[0]} ${r.pick(['Grand', 'Boutique Hotel', 'House', 'Collection'])}`,
    );
    const allInclusive = resort && ['tr', 'ar', 'es', 'gr'].includes(dest.lang) && r.chance(0.6);
    const breakfast = !allInclusive && r.chance(0.5);
    const roomSleeps = r.chance(0.25) ? 4 : r.chance(0.2) ? 3 : 2;
    const boardMult = allInclusive ? 1.7 : breakfast ? 1.12 : 1;
    push({
      kind: 'hotel',
      source: sourceFor(r, 'hotel'),
      name,
      area,
      bedrooms: 1,
      sleeps: roomSleeps,
      beds: roomSleeps >= 3 ? 2 : r.pick([1, 2]),
      bathrooms: 1,
      unitsAvailable: r.int(4, 20),
      pool,
      stars,
      rating: Math.round(r.range(stars >= 4 ? 4.2 : 3.8, stars >= 4 ? 4.9 : 4.6) * 100) / 100,
      reviews: r.int(80, 4000),
      baseNightly: Math.round(dest.nightly.hotel3 * STAR_MULT[stars] * r.range(0.8, 1.25) * boardMult * (roomSleeps >= 3 ? 1.35 : 1)),
      cleaningFee: 0,
      beachKm: beach ? Math.round(r.range(0, resort ? 0.4 : 2.5) * 10) / 10 : Math.round(r.range(2, 20) * 10) / 10,
      centreKm: Math.round(r.range(0.1, resort ? 6 : 2.5) * 10) / 10,
      amenities: amenitiesFor(r, 'hotel', dest),
      boardBasis: allInclusive ? 'all-inclusive' : breakfast ? 'breakfast' : 'room-only',
      imageKeywords: resort ? 'resort,pool' : 'hotel,room',
    });
  }

  // Hostels (priced per bed) — mostly city & party spots.
  if (dest.tags.includes('city') || dest.tags.includes('party')) {
    for (let h = 0; h < 3; h++) {
      const area = r.pick(dest.areas);
      push({
        kind: 'hostel',
        source: 'Booking.com',
        name: uniqueName(() => `${r.pick(words)} ${r.pick(['Social Hostel', 'Hostel', 'Backpackers', 'Party Hostel'])}`),
        area,
        bedrooms: 1,
        sleeps: 1,
        beds: 1,
        bathrooms: 0,
        unitsAvailable: r.int(8, 24),
        pool: warm && r.chance(0.3) ? 'shared' : 'none',
        rating: Math.round(r.range(4.0, 4.8) * 100) / 100,
        reviews: r.int(200, 3000),
        baseNightly: Math.round(dest.nightly.hostelBed * r.range(0.8, 1.3)),
        cleaningFee: 0,
        beachKm: beach ? Math.round(r.range(0.2, 2) * 10) / 10 : 8,
        centreKm: Math.round(r.range(0.1, 1.5) * 10) / 10,
        amenities: amenitiesFor(r, 'hostel', dest),
        imageKeywords: 'hostel,dorm',
      });
    }
  }

  listingCache.set(destId, list);
  return list;
}

export function listingById(destId: string, id: string): StayListing | undefined {
  return listingsFor(destId).find((l) => l.id === id);
}

/** How many units (rooms / apartments / beds) the group needs, or null if it can't fit. */
export function unitsNeeded(listing: StayListing, guests: number): number | null {
  if (listing.kind === 'villa') return listing.sleeps >= guests ? 1 : null;
  const units = Math.ceil(guests / listing.sleeps);
  return units <= listing.unitsAvailable ? units : null;
}

export function nightlyRate(listing: StayListing, iso: ISODate): number {
  const dest = destById(listing.destId);
  const dow = dayOfWeek(iso);
  const weekend = dow === 5 || dow === 6 ? 1.08 : 1;
  return listing.baseNightly * staySeasonFactor(dest, iso) * weekend;
}

/** Service fee the platform adds on top (approximate). */
const SERVICE_FEE: Record<StaySource, number> = { Airbnb: 0.14, Vrbo: 0.1, 'Booking.com': 0, 'Hotels.com': 0 };

export function quoteStay(listing: StayListing, checkIn: ISODate, nights: number, guests: number, unitsOverride?: number): StayQuote | null {
  const units = unitsOverride ?? unitsNeeded(listing, guests);
  if (!units) return null;
  let accommodation = 0;
  for (let i = 0; i < nights; i++) accommodation += nightlyRate(listing, addDays(checkIn, i));
  accommodation = Math.round(accommodation * units);
  const cleaning = listing.cleaningFee * units;
  const fees = Math.round(cleaning + (accommodation + cleaning) * SERVICE_FEE[listing.source]);
  const total = accommodation + fees;
  return { listing, units, nights, accommodation, fees, total, avgNightly: Math.round(total / Math.max(1, nights)) };
}

export const DEFAULT_FILTERS: StayFilters = {
  kinds: [],
  pool: 'any',
  minBedrooms: 0,
  minBeds: 0,
  amenities: [],
  sort: 'value',
  sources: [],
};

/** Value score: rating & reviews matter, price matters more. Lower = better. */
function valueScore(q: StayQuote): number {
  const quality = q.listing.rating + Math.min(q.listing.reviews, 500) / 2000 + (q.listing.pool !== 'none' ? 0.1 : 0) - (q.listing.kind === 'hostel' ? 1 : 0);
  return q.total / Math.pow(quality, 3);
}

export function searchStays(destId: string, checkIn: ISODate, nights: number, guests: number, filters: StayFilters): StayQuote[] {
  const quotes: StayQuote[] = [];
  for (const l of listingsFor(destId)) {
    if (filters.kinds.length && !filters.kinds.includes(l.kind)) continue;
    if (filters.sources.length && !filters.sources.includes(l.source)) continue;
    if (filters.pool === 'pool' && l.pool === 'none') continue;
    if (filters.pool === 'private' && l.pool !== 'private') continue;
    if (filters.area && l.area !== filters.area) continue;
    if (filters.amenities.some((a) => !l.amenities.includes(a))) continue;
    const q = quoteStay(l, checkIn, nights, guests);
    if (!q) continue;
    const totalBedrooms = l.bedrooms * q.units;
    const totalBeds = l.beds * q.units;
    if (l.kind !== 'hotel' && l.kind !== 'hostel' && totalBedrooms < filters.minBedrooms) continue;
    if (l.kind === 'hotel' && q.units < filters.minBedrooms) continue;
    if (totalBeds < filters.minBeds) continue;
    if (filters.maxPerNight && q.total / nights > filters.maxPerNight) continue;
    quotes.push(q);
  }
  const sorters: Record<StayFilters['sort'], (a: StayQuote, b: StayQuote) => number> = {
    price: (a, b) => a.total - b.total,
    rating: (a, b) => b.listing.rating - a.listing.rating || a.total - b.total,
    value: (a, b) => valueScore(a) - valueScore(b),
    beach: (a, b) => a.listing.beachKm - b.listing.beachKm || a.total - b.total,
    centre: (a, b) => a.listing.centreKm - b.listing.centreKm || a.total - b.total,
  };
  return quotes.sort(sorters[filters.sort]);
}

export const KIND_LABEL: Record<StayKind, string> = { villa: 'Villa', apartment: 'Apartment', hotel: 'Hotel', hostel: 'Hostel' };

export const AMENITY_LABEL: Record<Amenity, string> = {
  wifi: 'Wi-Fi',
  aircon: 'Air con',
  kitchen: 'Kitchen',
  parking: 'Parking',
  bbq: 'BBQ',
  'hot-tub': 'Hot tub',
  'sea-view': 'Sea view',
  gym: 'Gym',
  garden: 'Garden',
  'games-room': 'Games room',
  'pet-friendly': 'Pet friendly',
  'washing-machine': 'Washing machine',
  terrace: 'Terrace',
  spa: 'Spa',
};

export function unitLabel(q: StayQuote): string {
  const l = q.listing;
  if (l.kind === 'villa') return `Whole villa · ${l.bedrooms} bedrooms · sleeps ${l.sleeps}`;
  if (l.kind === 'apartment')
    return q.units > 1
      ? `${q.units} × ${l.bedrooms}-bed apartments · sleeps ${l.sleeps * q.units}`
      : `${l.bedrooms}-bed apartment · sleeps ${l.sleeps}`;
  if (l.kind === 'hotel') {
    const room = l.sleeps === 2 ? 'double/twin' : l.sleeps === 3 ? 'triple' : 'family';
    return `${q.units} × ${room} room${q.units > 1 ? 's' : ''}`;
  }
  return `${q.units} dorm bed${q.units > 1 ? 's' : ''}`;
}

const KIND_PLURAL: Record<StayKind, string> = { villa: 'Villas', apartment: 'Apartments', hotel: 'Hotels', hostel: 'Hostels' };

/** What kind of stay, where: "Villas in Galé" (no made-up property names). */
export function stayKindArea(l: StayListing): string {
  const kind = l.kind === 'hotel' && l.stars ? `${l.stars}-star hotels` : KIND_PLURAL[l.kind];
  return `${kind} in ${l.area}`;
}

/** Same, with the destination for context: "Villas in Galé, Albufeira". */
export function stayTitle(l: StayListing): string {
  const place = destById(l.destId).name.replace(/\s*\(.*\)/, '').replace(/ & .*/, '');
  return l.area.toLowerCase().includes(place.toLowerCase()) ? stayKindArea(l) : `${stayKindArea(l)}, ${place}`;
}

export const stayEstimateNote = (source: StaySource) =>
  `Estimated price for this type of stay. The link opens a ${source} search with matching filters, not one specific place.`;

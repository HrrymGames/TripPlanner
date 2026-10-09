import type { Destination, SeasonProfile, Tag } from '../types';
import placesRaw from '../data/geo-places.txt?raw';
import airportsRaw from '../data/geo-airports.txt?raw';

/**
 * Offline gazetteer: ~33k towns (GeoNames) and ~3.2k airports with scheduled flights (OurAirports).
 * Lets people type any town, US state, region or country and get the nearest useful airport.
 */

export interface Place {
  name: string;
  cc: string;
  adm: string;
  lat: number;
  lon: number;
  /** Thousands of people. */
  pop: number;
}

export interface Airport {
  iata: string;
  name: string;
  city: string;
  cc: string;
  adm: string;
  lat: number;
  lon: number;
  large: boolean;
}

export interface GeoMatch {
  kind: 'city' | 'region' | 'country';
  id: string;
  label: string;
  /** How many words of the prompt it matched (longer = more specific). */
  words: number;
  start: number;
}

let places: Place[] | null = null;
let airports: Airport[] | null = null;
let placeIndex: Map<string, Place[]> | null = null;

export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function loadPlaces(): Place[] {
  if (!places) {
    places = placesRaw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, cc, adm, lat, lon, pop] = line.split('|');
        return { name, cc, adm, lat: Number(lat), lon: Number(lon), pop: Number(pop) };
      });
  }
  return places;
}

export function loadAirports(): Airport[] {
  if (!airports) {
    airports = airportsRaw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [iata, name, city, cc, adm, lat, lon, size] = line.split('|');
        return { iata, name, city, cc, adm, lat: Number(lat), lon: Number(lon), large: size === 'L' };
      });
  }
  return airports;
}

function index(): Map<string, Place[]> {
  if (!placeIndex) {
    placeIndex = new Map();
    for (const p of loadPlaces()) {
      const k = norm(p.name);
      const list = placeIndex.get(k);
      if (list) list.push(p);
      else placeIndex.set(k, [p]);
    }
  }
  return placeIndex;
}

export function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function airportByCode(code: string): Airport | undefined {
  return loadAirports().find((a) => a.iata === code);
}

/** Best airport for international flights: big airports win unless a smaller one is much closer. */
export function nearestAirports(lat: number, lon: number, n = 3): (Airport & { km: number })[] {
  return loadAirports()
    .map((a) => ({ ...a, km: km(lat, lon, a.lat, a.lon) }))
    .filter((a) => a.km < 400)
    .sort((a, b) => a.km + (a.large ? 0 : 90) - (b.km + (b.large ? 0 : 90)))
    .slice(0, n);
}

// ——— Regions people type instead of a town ———
export const REGIONS: Record<string, Record<string, string>> = {
  US: {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
    DC: 'Washington DC', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
    KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
    MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York State',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
    SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington State',
    WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  },
  CA: { '01': 'Alberta', '02': 'British Columbia', '03': 'Manitoba', '04': 'New Brunswick', '05': 'Newfoundland', '07': 'Nova Scotia', '08': 'Ontario', '10': 'Quebec', '11': 'Saskatchewan' },
  AU: { '01': 'Australian Capital Territory', '02': 'New South Wales', '03': 'Northern Territory', '04': 'Queensland', '05': 'South Australia', '06': 'Tasmania', '07': 'Victoria Australia', '08': 'Western Australia' },
  GB: { ENG: 'England', SCT: 'Scotland', WLS: 'Wales', NIR: 'Northern Ireland' },
};

const REGION_ALIASES: Record<string, [string, string]> = {};
for (const [cc, map] of Object.entries(REGIONS)) {
  for (const [adm, name] of Object.entries(map)) REGION_ALIASES[norm(name)] = [cc, adm];
}
// Common short forms.
Object.assign(REGION_ALIASES, {
  'new york state': ['US', 'NY'],
  'washington state': ['US', 'WA'],
  'jersey shore': ['US', 'NJ'],
  'cali': ['US', 'CA'],
  'nsw': ['AU', '02'],
});

let countryNames: Map<string, string> | null = null;
const displayNames = (() => {
  try {
    return new Intl.DisplayNames(['en-GB'], { type: 'region' });
  } catch {
    return null;
  }
})();

export function countryName(cc: string): string {
  const special: Record<string, string> = { US: 'USA', GB: 'UK', AE: 'UAE' };
  return special[cc] ?? displayNames?.of(cc) ?? cc;
}

function countryIndex(): Map<string, string> {
  if (!countryNames) {
    countryNames = new Map();
    const codes = new Set(loadPlaces().map((p) => p.cc));
    for (const cc of codes) {
      const name = displayNames?.of(cc);
      if (name && name !== cc) countryNames.set(norm(name), cc);
    }
    for (const [alias, cc] of Object.entries({ usa: 'US', america: 'US', 'united states': 'US', uk: 'GB', britain: 'GB', holland: 'NL', 'czech republic': 'CZ', uae: 'AE', 'south korea': 'KR', korea: 'KR' })) countryNames.set(alias, cc);
  }
  return countryNames;
}

export function regionName(cc: string, adm: string): string | undefined {
  return REGIONS[cc]?.[adm]?.replace(/ (State|Australia)$/, '');
}

/** Words that are also town names but almost never mean the town in a trip request. */
const COMMON = new Set(
  (
    'a an and or the of to in at on for from with by near by each per person people pp total budget max under over about around ish week weeks night nights day days ' +
    'month months year next this last summer winter spring autumn fall holiday holidays trip break city weekend long short half term easter christmas new years ' +
    'villa villas pool pools private hotel hotels apartment apartments hostel house home beach beaches sea view hot tub cheap cheapest luxury posh family friends lads girls boys kids ' +
    'children adults couple us we our me my mates group party stag hen direct flights flight bags bag luggage sunny warm sun best good nice great lovely somewhere anywhere ' +
    'reading bath march may mobile orange bar hope joy sale deal pay gold lake bay springs park central centre center old town down up all inclusive breakfast ' +
    'one two three four five six seven eight nine ten eleven twelve twenty dozen few several plus k grand quid pounds euros dollars just only want need like go going'
  ).split(' '),
);

/** Find the places named in a prompt. Longer, more specific matches win; regions beat small towns. */
export function searchPlaces(text: string, opts: { exclude?: string[] } = {}): GeoMatch[] {
  const tokens = norm(text).split(' ').filter(Boolean);
  const exclude = new Set((opts.exclude ?? []).map(norm));
  const found: GeoMatch[] = [];
  const used = new Array(tokens.length).fill(false);
  const ci = countryIndex();
  const idx = index();
  for (let len = Math.min(4, tokens.length); len >= 1; len--) {
    for (let i = 0; i + len <= tokens.length; i++) {
      if (used.slice(i, i + len).some(Boolean)) continue;
      const words = tokens.slice(i, i + len);
      if (words.every((w) => COMMON.has(w) || /^\d/.test(w))) continue;
      const phrase = words.join(' ');
      if (exclude.has(phrase)) continue;
      if (len === 1 && phrase.length < 4) continue;
      let match: GeoMatch | undefined;
      const region = REGION_ALIASES[phrase];
      const cityList = idx.get(phrase);
      const bigCity = cityList?.reduce((a, b) => (b.pop > a.pop ? b : a));
      // A region normally wins, unless a much bigger city shares the name (Washington DC vs the state).
      if (region && !(bigCity && bigCity.pop > 500 && bigCity.cc !== region[0])) {
        match = { kind: 'region', id: `geo-region:${region[0]}:${region[1]}`, label: `${REGIONS[region[0]][region[1]]}, ${countryName(region[0])}`, words: len, start: i };
      } else if (ci.has(phrase) && !(bigCity && bigCity.pop > 1000)) {
        const cc = ci.get(phrase)!;
        match = { kind: 'country', id: `geo-country:${cc}`, label: countryName(cc), words: len, start: i };
      } else if (!cityList && len >= 2) {
        // "lake tahoe" → South Lake Tahoe, "outer banks" → nothing: allow the phrase inside a longer town name.
        let best: Place | undefined;
        for (const [k, list] of idx) {
          if (k.length > phrase.length && (k.endsWith(` ${phrase}`) || k.startsWith(`${phrase} `))) {
            for (const p of list) if (!best || p.pop > best.pop) best = p;
          }
        }
        if (best) match = { kind: 'city', id: placeId(best), label: placeLabel(best), words: len, start: i };
      } else if (cityList) {
        // "wilmington delaware" / "paris texas": a following region or country narrows it down.
        const next = tokens.slice(i + len, i + len + 2).join(' ');
        const next1 = tokens[i + len] ?? '';
        const regionAfter = REGION_ALIASES[next] ?? REGION_ALIASES[next1];
        const ccAfter = ci.get(next) ?? ci.get(next1);
        let pool = cityList;
        if (regionAfter) pool = cityList.filter((c) => c.cc === regionAfter[0] && c.adm === regionAfter[1]);
        else if (ccAfter) pool = cityList.filter((c) => c.cc === ccAfter);
        if (!pool.length) pool = cityList;
        const best = pool.reduce((a, b) => (b.pop > a.pop ? b : a));
        // Single short common-ish words need a decent-sized town to count.
        if (len === 1 && best.pop < 20 && !regionAfter && !ccAfter) continue;
        match = { kind: 'city', id: placeId(best), label: placeLabel(best), words: len, start: i };
        if (regionAfter || ccAfter) {
          const extra = regionAfter && REGION_ALIASES[next] ? 2 : 1;
          for (let k = i + len; k < Math.min(tokens.length, i + len + extra); k++) used[k] = true;
        }
      }
      if (match) {
        for (let k = i; k < i + len; k++) used[k] = true;
        if (!found.some((f) => f.id === match!.id)) found.push(match);
      }
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

export const placeId = (p: Place) => `geo:${p.cc}:${p.adm}:${norm(p.name).replace(/ /g, '-')}`;

export function placeLabel(p: Place): string {
  const region = regionName(p.cc, p.adm);
  return [p.name, region && region !== p.name ? region : undefined, countryName(p.cc)].filter(Boolean).join(', ');
}

/** Relative price level vs the UK (accommodation, taxis, food). */
const COST: Record<string, number> = {
  GB: 1, IE: 1.1, US: 1.15, CA: 1.05, AU: 1.05, NZ: 1, CH: 1.5, NO: 1.35, IS: 1.4, DK: 1.25, SE: 1.1, FI: 1.1, NL: 1.1, BE: 1, LU: 1.15,
  FR: 1, DE: 0.95, AT: 1, IT: 0.95, ES: 0.85, PT: 0.75, GR: 0.75, CY: 0.8, MT: 0.8, HR: 0.8, SI: 0.8, CZ: 0.7, SK: 0.65, PL: 0.6, HU: 0.6,
  RO: 0.55, BG: 0.5, RS: 0.55, ME: 0.6, AL: 0.5, BA: 0.5, MK: 0.5, EE: 0.75, LV: 0.65, LT: 0.65, TR: 0.5, MA: 0.5, TN: 0.45, EG: 0.4,
  AE: 1.15, QA: 1.1, SA: 0.95, IL: 1.2, JO: 0.7, ZA: 0.55, KE: 0.6, TZ: 0.6, MU: 0.75, SC: 1.1, MV: 1.3, IN: 0.35, LK: 0.4, NP: 0.35,
  TH: 0.45, VN: 0.4, KH: 0.4, LA: 0.4, MY: 0.5, SG: 1.15, ID: 0.45, PH: 0.45, JP: 0.9, KR: 0.85, CN: 0.65, HK: 1.1, TW: 0.75,
  MX: 0.6, CR: 0.75, CU: 0.55, DO: 0.65, JM: 0.8, BS: 1.2, BB: 1.1, BR: 0.6, AR: 0.5, CL: 0.65, PE: 0.5, CO: 0.5,
};
export const costIndex = (cc: string) => COST[cc] ?? 0.7;

const EUROPE = new Set('GB IE JE GG IM FO FR ES PT IT DE AT CH NL BE LU DK SE NO FI IS PL CZ SK HU RO BG GR CY MT HR SI RS ME AL BA MK EE LV LT TR AD MC SM LI GI XK MD UA'.split(' '));
const NORTH_AFRICA = new Set('MA TN EG'.split(' '));
export const AMERICAS = new Set('US CA MX CR CU DO JM BS BB BR AR CL PE CO PA GT BZ'.split(' '));

/** Rough average daily high by month from latitude (and how continental the country is). */
function climate(lat: number, cc: string): number[] {
  const a = Math.abs(lat);
  const mean = 31 - 0.006 * a * a;
  const continental = ['US', 'CA', 'RU', 'CN', 'KZ', 'MN'].includes(cc) ? 1.45 : 1;
  const amp = Math.min(15, (0.5 + 0.2 * a) * continental);
  const peak = lat >= 0 ? 6.5 : 0.5; // mid-July or mid-January
  return Array.from({ length: 12 }, (_, m) => Math.round(mean + amp * Math.cos((2 * Math.PI * (m - peak)) / 12)));
}

const LONDON = { lat: 51.5, lon: -0.12 };

const LANG: Record<string, Destination['lang']> = {
  PT: 'pt', BR: 'pt', ES: 'es', MX: 'es', AR: 'es', CL: 'es', CO: 'es', PE: 'es', CR: 'es', CU: 'es', DO: 'es', IT: 'it', FR: 'fr', BE: 'fr',
  DE: 'de', AT: 'de', CH: 'de', GR: 'gr', CY: 'gr', TR: 'tr', HR: 'hr', NL: 'nl', CZ: 'cz', PL: 'pl', HU: 'hu', MA: 'ar', TN: 'ar', EG: 'ar', AE: 'ar', ID: 'id', IS: 'is', MT: 'mt',
};

const cache = new Map<string, Destination | null>();

/** Build a full destination (prices, climate, areas, airport) for any town, region or country. */
export function geoDestination(id: string): Destination | null {
  if (cache.has(id)) return cache.get(id)!;
  const d = buildGeo(id);
  cache.set(id, d);
  return d;
}

function buildGeo(id: string): Destination | null {
  const all = loadPlaces();
  let centre: Place | undefined;
  let areaPlaces: Place[] = [];
  let name: string;
  let label: string;
  if (id.startsWith('geo-region:')) {
    const [, cc, adm] = id.split(':');
    const inRegion = all.filter((p) => p.cc === cc && p.adm === adm);
    if (!inRegion.length) return null;
    centre = inRegion[0];
    areaPlaces = inRegion.slice(0, 6);
    name = REGIONS[cc]?.[adm]?.replace(/ State$/, '') ?? centre.name;
    label = `${name}, ${countryName(cc)}`;
  } else if (id.startsWith('geo-country:')) {
    const cc = id.split(':')[1];
    const inCountry = all.filter((p) => p.cc === cc);
    if (!inCountry.length) return null;
    centre = inCountry[0];
    areaPlaces = inCountry.slice(0, 6);
    name = countryName(cc);
    label = name;
  } else {
    const [, cc, adm, slug] = id.split(':');
    centre = all.find((p) => p.cc === cc && p.adm === adm && norm(p.name).replace(/ /g, '-') === slug);
    if (!centre) return null;
    const c = centre;
    const nearby = all.filter((p) => p !== c && km(c.lat, c.lon, p.lat, p.lon) < 30).slice(0, 4);
    areaPlaces = [c, ...nearby];
    name = c.name;
    label = placeLabel(c);
  }
  const cc = centre.cc;
  const [airport] = nearestAirports(centre.lat, centre.lon, 1);
  if (!airport) return null;
  const ci = costIndex(cc);
  const distFromUK = km(LONDON.lat, LONDON.lon, airport.lat, airport.lon);
  const flightGBP = Math.round(distFromUK < 3500 ? 22 + 0.026 * distFromUK : distFromUK < 5000 ? 60 + 0.04 * distFromUK : 80 + 0.03 * distFromUK);
  const flightHours = Math.round((distFromUK / 780 + 0.6) * 4) / 4;
  const europe = EUROPE.has(cc) || NORTH_AFRICA.has(cc);
  const longHaul = distFromUK > 4500;
  const temps = climate(centre.lat, cc);
  const resorty = /beach|playa|praia|plage|bay|island|isla|ilha|costa|coast|mar\b|sands|shores|key/i.test(areaPlaces.map((p) => p.name).join(' '));
  const tags: Tag[] = ['city'];
  if (resorty) tags.push('beach');
  if (longHaul) tags.push('long-haul');
  const season: SeasonProfile = Math.abs(centre.lat) < 23 ? 'winter-sun' : AMERICAS.has(cc) && cc !== 'MX' ? 'usa' : resorty && europe ? 'med-beach' : 'city';
  const airlines = europe
    ? ['ryanair', 'easyjet', 'jet2', 'ba', 'wizz', 'tui', 'klm', 'aerlingus']
    : AMERICAS.has(cc)
      ? ['ba', 'virgin', 'aerlingus', 'united', 'american', 'delta', 'klm']
      : ['emirates', 'qatar', 'turkish', 'ba', 'klm', 'virgin'];
  // Smaller airports outside Europe rarely have flights from the UK, so route via the nearest big one.
  const hub = !airport.large && !europe ? loadAirports().filter((a) => a.large && a.cc === cc).sort((a, b) => km(airport.lat, airport.lon, a.lat, a.lon) - km(airport.lat, airport.lon, b.lat, b.lon))[0] : undefined;
  const areaNames = areaPlaces.map((p, i) => (i === 0 && !id.startsWith('geo-region:') && !id.startsWith('geo-country:') ? `${p.name} centre` : p.name));
  const areaCoords: Record<string, [number, number]> = {};
  areaPlaces.forEach((p, i) => (areaCoords[areaNames[i]] = [p.lat, p.lon]));
  const airportKm = Math.round(km(centre.lat, centre.lon, airport.lat, airport.lon));
  return {
    id,
    name,
    country: countryName(cc),
    airport: airport.iata,
    airportName: airport.name,
    wiki: centre.name.replace(/ /g, '_'),
    aliases: [],
    tags,
    season,
    flightGBP,
    flightHours,
    tzDiff: Math.round(airport.lon / 15),
    temps,
    dailySpend: Math.round(48 * ci),
    nightly: { hostelBed: Math.round(26 * ci), apartment1br: Math.round(85 * ci), villaPerBedroom: Math.round(55 * ci), hotel3: Math.round(100 * ci) },
    transferTaxi: Math.round(taxiFare(cc, airportKm)),
    carHireDay: Math.round(36 * ci),
    areas: areaNames,
    airlines,
    lang: LANG[cc] ?? 'en',
    blurb: `${label}. Nearest airport with good connections: ${airport.name} (${airport.iata}), about ${airportKm} km away.`,
    geo: {
      lat: centre.lat,
      lon: centre.lon,
      cc,
      label,
      airportLat: airport.lat,
      airportLon: airport.lon,
      airportKm,
      areaCoords,
      connectVia: hub ? { code: hub.iata, city: hub.city || hub.name } : undefined,
    },
  };
}

/** One-way taxi for one car, by distance and local prices. */
export function taxiFare(cc: string, distanceKm: number): number {
  const road = distanceKm * 1.25;
  return Math.max(15, (6 + 1.6 * road) * costIndex(cc));
}

/** Search box results: regions/countries first, then towns that match the start of the name, biggest first. */
export function findPlaces(query: string, n = 6): GeoMatch[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const out: GeoMatch[] = [];
  const region = REGION_ALIASES[q];
  if (region) out.push({ kind: 'region', id: `geo-region:${region[0]}:${region[1]}`, label: `${REGIONS[region[0]][region[1]]}, ${countryName(region[0])}`, words: 1, start: 0 });
  const cc = countryIndex().get(q);
  if (cc) out.push({ kind: 'country', id: `geo-country:${cc}`, label: countryName(cc), words: 1, start: 0 });
  for (const [name, [rcc, adm]] of Object.entries(REGION_ALIASES)) {
    if (out.length >= 2) break;
    if (name !== q && name.startsWith(q) && q.length >= 3) out.push({ kind: 'region', id: `geo-region:${rcc}:${adm}`, label: `${REGIONS[rcc][adm]}, ${countryName(rcc)}`, words: 1, start: 0 });
  }
  // "wilmington delaware" → filter by the trailing region/country.
  const words = q.split(' ');
  let nameQ = q;
  let filter: ((p: Place) => boolean) | undefined;
  for (let k = 1; k <= 2 && k < words.length; k++) {
    const tail = words.slice(-k).join(' ');
    const r = REGION_ALIASES[tail];
    const c = countryIndex().get(tail);
    if (r || c) {
      nameQ = words.slice(0, -k).join(' ');
      filter = r ? (p) => p.cc === r[0] && p.adm === r[1] : (p) => p.cc === c;
      break;
    }
  }
  const towns = loadPlaces().filter((p) => {
    const k = norm(p.name);
    return (k === nameQ || k.startsWith(`${nameQ} `) || (nameQ.length >= 4 && k.startsWith(nameQ))) && (!filter || filter(p));
  });
  towns.sort((a, b) => Number(norm(b.name) === nameQ) - Number(norm(a.name) === nameQ) || b.pop - a.pop);
  for (const p of towns) {
    if (out.length >= n) break;
    out.push({ kind: 'city', id: placeId(p), label: placeLabel(p), words: 1, start: 0 });
  }
  return out;
}

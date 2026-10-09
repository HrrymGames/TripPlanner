import type { Destination, Direction, FlightOption, ISODate, OriginAirport } from '../types';
import { AIRLINES, ORIGIN_AIRLINES, originByCode } from '../data/airports';
import { destById } from '../data/destinations';
import { addDays, dayOfWeek, diffDays, schoolHolidayOn, todayISO } from './dates';
import { hashString, rng } from './random';
import { seasonFactor } from './season';
import { AMERICAS } from './geo';

const DOW_OUT = [1.05, 0.95, 0.85, 0.88, 1.0, 1.15, 1.12];
const DOW_BACK = [1.15, 1.0, 0.85, 0.88, 0.95, 1.05, 1.1];

const HUBS: { airline: string; via: string; viaCode: string; extraHours: [number, number] }[] = [
  { airline: 'klm', via: 'Amsterdam', viaCode: 'AMS', extraHours: [2, 4] },
  { airline: 'turkish', via: 'Istanbul', viaCode: 'IST', extraHours: [3, 6] },
  { airline: 'emirates', via: 'Dubai', viaCode: 'DXB', extraHours: [3, 6] },
  { airline: 'qatar', via: 'Doha', viaCode: 'DOH', extraHours: [3, 6] },
  { airline: 'ba', via: 'London Heathrow', viaCode: 'LHR', extraHours: [2, 4] },
  { airline: 'aerlingus', via: 'Dublin', viaCode: 'DUB', extraHours: [2, 4] },
  { airline: 'tap', via: 'Lisbon', viaCode: 'LIS', extraHours: [2, 4] },
];

let referenceToday = todayISO();
/** Lets tests pin "today" so lead-time pricing is stable. */
export function setPricingToday(iso: ISODate) {
  referenceToday = iso;
  cache.clear();
}

const cache = new Map<string, FlightOption[]>();

const LONGHAUL_DIRECT = new Set(['ba', 'virgin', 'united', 'american', 'delta', 'emirates', 'qatar', 'tui']);
/** Gulf and US carriers only fly nonstop from the UK to their own countries. */
function servesNonstop(airline: string, dest: Destination): boolean {
  const usa = dest.country === 'USA';
  switch (airline) {
    case 'emirates':
      return dest.airport === 'DXB';
    case 'qatar':
      return dest.airport === 'DOH';
    case 'united':
    case 'american':
    case 'delta':
      return usa;
    case 'virgin':
      return !dest.geo || AMERICAS.has(dest.geo.cc);
    case 'tui':
      return !dest.geo;
    default:
      return true;
  }
}

const LONGHAUL_AIRPORTS = new Set(['LHR', 'LGW', 'MAN', 'EDI', 'GLA', 'BHX', 'DUB', 'NCL', 'BRS']);

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (mins: number) => `${pad(Math.floor(((mins % 1440) + 1440) % 1440 / 60))}:${pad(((mins % 60) + 60) % 60)}`;

function priceRound(p: number, lowCost: boolean): number {
  const floor = lowCost ? 19.99 : 49;
  const v = Math.max(floor, p);
  return lowCost ? Math.round(v) - 0.01 : Math.round(v);
}

function leadFactor(date: ISODate): number {
  const days = diffDays(referenceToday, date);
  if (days < 7) return 1.6;
  if (days < 21) return 1.3;
  if (days < 60) return 1.1;
  if (days > 300) return 1.05;
  return 1;
}

/** Airports used for a given origin choice together with the airline keys that fly from them. */
function originAirlinePairs(origin: OriginAirport): { airport: string; airline: string }[] {
  return origin.airports.flatMap((airport) => (ORIGIN_AIRLINES[airport] ?? []).map((airline) => ({ airport, airline })));
}

/** Does this airline run this route at all? Stable per route, so the same carriers show every day. */
function routeExists(airport: string, airline: string, dest: Destination): boolean {
  const h = hashString(`route:${airport}:${airline}:${dest.id}`) % 100;
  return h < 72;
}

/** Some routes don't run daily. */
function operatesOn(airport: string, airline: string, dest: Destination, date: ISODate): boolean {
  const weekly = 3 + (hashString(`freq:${airport}:${airline}:${dest.id}`) % 5); // 3–7 days a week
  if (weekly >= 7) return true;
  const dow = dayOfWeek(date);
  const offset = hashString(`days:${airport}:${airline}:${dest.id}`) % 7;
  return ((dow + offset) % 7) < weekly;
}

export function getFlights(originCode: string, destId: string, date: ISODate, direction: Direction): FlightOption[] {
  const key = `${originCode}|${destId}|${date}|${direction}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const origin = originByCode(originCode);
  const dest = destById(destId);
  const r = rng(key);
  const options: FlightOption[] = [];
  const isLongHaul = dest.flightHours > 6;
  // Ultra long-haul (e.g. Bali) always connects somewhere; flightHours already includes the stop.
  const ultra = dest.flightHours > 13;
  const season = seasonFactor(dest, date);
  const dow = (direction === 'out' ? DOW_OUT : DOW_BACK)[dayOfWeek(date)];
  const holiday = schoolHolidayOn(date) ? 1.35 : 1;
  const lead = leadFactor(date);

  // Long-haul nonstops only come from the big UK airports on long-haul carriers; the rest connect.
  const canFlyDirect = (airport: string, airline: string) =>
    !isLongHaul || (LONGHAUL_DIRECT.has(airline) && LONGHAUL_AIRPORTS.has(airport) && servesNonstop(airline, dest));
  const pairs = originAirlinePairs(origin).filter(
    (p) => dest.airlines.includes(p.airline) && canFlyDirect(p.airport, p.airline) && routeExists(p.airport, p.airline, dest),
  );
  // Always guarantee at least one direct carrier if the destination is served from that origin at all.
  if (pairs.length === 0) {
    const fallback = originAirlinePairs(origin).find((p) => dest.airlines.includes(p.airline) && canFlyDirect(p.airport, p.airline));
    if (fallback) pairs.push(fallback);
  }
  const connectVia = dest.geo?.connectVia;

  const make = (airport: string, airlineKey: string, stops: number, via?: { via: string; extra: number }) => {
    const airline = AIRLINES[airlineKey];
    const flightsToday = r.chance(0.35) ? 2 : 1;
    for (let i = 0; i < flightsToday; i++) {
      const departMins = r.int(6, 21) * 60 + r.pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
      const baseDuration = dest.flightHours * 60 + r.int(-10, 15);
      const durationMins = Math.round(baseDuration + (via ? via.extra * 60 : 0));
      const tz = direction === 'out' ? dest.tzDiff : -dest.tzDiff;
      const arriveAbs = departMins + durationMins + tz * 60;
      const timeOfDay = departMins < 8 * 60 || departMins > 19 * 60 ? 0.88 : departMins > 10 * 60 && departMins < 16 * 60 ? 1.06 : 1;
      const noise = r.range(0.82, 1.28);
      const stopFactor = stops ? 0.92 : 1;
      const raw = dest.flightGBP * origin.priceFactor * airline.factor * season * dow * holiday * lead * noise * timeOfDay * stopFactor;
      const lowCost = airline.lowCost && !isLongHaul;
      const from = direction === 'out' ? airport : dest.airport;
      const to = direction === 'out' ? dest.airport : airport;
      options.push({
        id: `${key}|${airlineKey}|${airport}|${i}|${stops}`,
        direction,
        date,
        airline: airline.name,
        flightNo: `${airline.code}${100 + (hashString(`${key}${airlineKey}${i}`) % 8900)}`,
        from,
        to,
        depart: hhmm(departMins),
        arrive: hhmm(arriveAbs),
        arriveNextDay: arriveAbs >= 1440,
        durationMins,
        stops,
        via: via?.via,
        price: priceRound(raw, lowCost),
        bagPrice: lowCost ? Math.round(airline.bag * (season > 1.2 ? 1.15 : 1)) : 0,
        lowCost,
      });
    }
  };

  if (connectVia) {
    // Small airport (e.g. Wilmington, Delaware): fly into the nearest big hub and connect.
    for (const p of pairs.length ? pairs : originAirlinePairs(origin).filter((x) => dest.airlines.includes(x.airline))) {
      if (options.length >= 5) break;
      make(p.airport, p.airline, 1, { via: connectVia.city, extra: r.range(1.5, 4) });
    }
  } else if (!ultra) {
    for (const p of pairs) {
      if (operatesOn(p.airport, p.airline, dest, date)) make(p.airport, p.airline, 0);
    }
  }

  // Connecting options: always for long-haul, sometimes on short-haul for extra choice.
  const wantConnections = !connectVia && (options.length < 2 || isLongHaul || r.chance(0.4));
  if (wantConnections) {
    for (const hub of HUBS) {
      if (hub.viaCode === dest.airport) continue;
      const servesDest = dest.airlines.includes(hub.airline);
      const europeanHub = !isLongHaul && ['klm', 'aerlingus', 'tap', 'turkish'].includes(hub.airline);
      const baFromRegions = hub.airline === 'ba' && origin.city !== 'London' && servesDest;
      if (!(baFromRegions || (hub.airline !== 'ba' && (servesDest || europeanHub)))) continue;
      const from = origin.airports.find((a) => (ORIGIN_AIRLINES[a] ?? []).includes(hub.airline) && a !== hub.viaCode);
      if (!from) continue;
      if (!ultra && hashString(`hub:${hub.airline}:${dest.id}`) % 3 === 0) continue;
      if (options.filter((o) => o.stops > 0).length >= 3) break;
      const extra = ultra ? r.range(0, 2) : r.range(hub.extraHours[0], hub.extraHours[1]);
      make(from, hub.airline, 1, { via: hub.via, extra });
    }
  }

  options.sort((a, b) => a.price - b.price || a.durationMins - b.durationMins);
  cache.set(key, options);
  return options;
}

/** Cheapest outbound + return pair for a trip, optionally direct-only, including hold bags per person. */
export function cheapestPair(
  originCode: string,
  destId: string,
  start: ISODate,
  nights: number,
  opts: { directOnly?: boolean; bagsPerPerson?: number } = {},
): { out?: FlightOption; back?: FlightOption; perPerson: number } {
  const bags = opts.bagsPerPerson ?? 0;
  const pick = (list: FlightOption[]) => {
    const usable = opts.directOnly ? list.filter((f) => f.stops === 0) : list;
    let best: FlightOption | undefined;
    let bestCost = Infinity;
    for (const f of usable) {
      const c = f.price + f.bagPrice * bags;
      if (c < bestCost) {
        bestCost = c;
        best = f;
      }
    }
    return best;
  };
  const out = pick(getFlights(originCode, destId, start, 'out'));
  const back = pick(getFlights(originCode, destId, addDays(start, nights), 'back'));
  const perPerson = out && back ? out.price + back.price + (out.bagPrice + back.bagPrice) * bags : Infinity;
  return { out, back, perPerson };
}

export const flightCost = (f: FlightOption | undefined, bagsPerPerson: number) => (f ? f.price + f.bagPrice * bagsPerPerson : 0);

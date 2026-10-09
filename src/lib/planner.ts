import type { CostBreakdown, Destination, Extras, FlightOption, ISODate, ParsedRequest, StayFilters, StayQuote, Travellers } from '../types';
import { DESTINATIONS, destById } from '../data/destinations';
import { addDays, diffDays, monthOf, schoolHolidayOn } from './dates';
import { cheapestPair } from './flights';
import { DEFAULT_FILTERS, searchStays } from './stays';
import { avgTemp, staySeasonFactor } from './season';
import { computeCosts, DEFAULT_EXTRAS, transferCost } from './costs';

export interface TripPackage {
  id: string;
  label: string;
  tone: 'cheap' | 'value' | 'luxury' | 'budget' | 'alt';
  blurb: string;
  destId: string;
  origin: string;
  travellers: Travellers;
  startDate: ISODate;
  endDate: ISODate;
  nights: number;
  outbound: FlightOption;
  inbound: FlightOption;
  stay: StayQuote;
  extras: Extras;
  costs: CostBreakdown;
  withinBudget?: boolean;
  temp: number;
  holiday?: string;
}

export interface DateIdea {
  start: ISODate;
  nights: number;
  flightsPerPerson: number;
  score: number;
}

export interface DestinationPlan {
  dest: Destination;
  headline: TripPackage[];
  more: TripPackage[];
  bestDates: DateIdea[];
  relaxed: string[];
  cheapestPerPerson: number;
  matchReason?: string;
}

export interface PlanResult {
  parsed: ParsedRequest;
  plans: DestinationPlan[];
  budgetNote?: string;
}

const people = (t: Travellers) => t.adults + t.children;

export function budgetTotal(p: ParsedRequest): number | undefined {
  if (!p.budget) return undefined;
  return p.budget.per === 'person' ? p.budget.amount * people(p.travellers) : p.budget.amount;
}

/** Rank destinations for vague requests ("somewhere hot with a pool in may"). */
export function pickDestinations(p: ParsedRequest, max = 4): { dest: Destination; reason: string }[] {
  if (p.destIds.length) return p.destIds.slice(0, 6).map((id) => ({ dest: destById(id), reason: '' }));
  const mid = addDays(p.window.start, Math.floor(diffDays(p.window.start, p.window.end) / 2));
  const month = monthOf(mid);
  const group = people(p.travellers);
  const budgetPP = p.budget ? (p.budget.per === 'person' ? p.budget.amount : p.budget.amount / group) : undefined;
  const scored = DESTINATIONS.map((d) => {
    let score = 0;
    const reasons: string[] = [];
    const matched = p.vibeTags.filter((t) => d.tags.includes(t));
    score += matched.length * 3;
    if (matched.length) reasons.push(matched.join(', '));
    const temp = d.temps[month];
    if (p.wantsHot) {
      if (temp >= 26) score += 4;
      else if (temp >= 23) score += 2;
      else if (temp >= 21) score += 0;
      else if (temp >= 18) score -= 3;
      else score -= 6;
      reasons.push(`~${temp}°C`);
    } else if (p.vibeTags.includes('beach')) {
      score += temp >= 25 ? 1.5 : temp < 20 ? -3 : 0;
    }
    const ski = p.vibeTags.includes('ski');
    if (ski && !d.tags.includes('ski')) score -= 10;
    if (!ski && d.tags.includes('ski') && (month < 11 && month > 3)) score -= 2;
    const longHaul = d.tags.includes('long-haul');
    if (longHaul && !p.vibeTags.includes('long-haul') && p.nights.ideal < 9) score -= 3;
    // Rough cost per person for a week.
    const roughPP = d.flightGBP * 2 * (0.6 + 0.6 * monthFactor(d, month)) + d.nightly.apartment1br * 0.5 * p.nights.ideal;
    if (budgetPP) {
      const ratio = roughPP / budgetPP;
      score += ratio < 0.6 ? 2 : ratio < 0.9 ? 1 : ratio < 1.15 ? 0 : -3 * (ratio - 1);
    }
    if (p.priority === 'cheap') score -= roughPP / 300;
    if (p.priority === 'luxury') score += d.nightly.villaPerBedroom / 80;
    if (p.stay.pool !== 'any' && Math.max(...d.temps) < 22) score -= 2;
    // Small nudge so results feel varied but stable.
    score -= roughPP / 2000;
    return { dest: d, score, reason: reasons.join(' · ') };
  });
  scored.sort((a, b) => b.score - a.score);
  // Avoid four results that all fly into the same airport.
  const out: { dest: Destination; reason: string }[] = [];
  for (const s of scored) {
    if (out.some((o) => o.dest.airport === s.dest.airport)) continue;
    out.push({ dest: s.dest, reason: s.reason });
    if (out.length >= max) break;
  }
  return out;
}

function monthFactor(d: Destination, month: number): number {
  return staySeasonFactor(d, `2030-${String(month + 1).padStart(2, '0')}-15`);
}

/** Find the cheapest departure dates in the window. */
export function bestDates(p: ParsedRequest, destId: string, limit = 5): DateIdea[] {
  const dest = destById(destId);
  const group = people(p.travellers);
  const lengths = Array.from(new Set([p.nights.ideal, p.nights.min, p.nights.max])).filter((n) => n >= 1);
  const starts: ISODate[] = [];
  if (p.fixedStart) {
    for (let i = -1; i <= 1; i++) starts.push(addDays(p.fixedStart, i));
  } else {
    const span = diffDays(p.window.start, p.window.end);
    const step = span > 200 ? 2 : 1;
    for (let i = 0; i <= span; i += step) starts.push(addDays(p.window.start, i));
  }
  const rough = dest.nightly.villaPerBedroom * Math.max(1, Math.ceil(group / 2)) * 0.9;
  const ideas: DateIdea[] = [];
  for (const start of starts) {
    for (const nights of lengths) {
      const f = cheapestPair(p.origin, destId, start, nights, { directOnly: p.directOnly, bagsPerPerson: p.bagsPerPerson });
      if (!Number.isFinite(f.perPerson)) continue;
      const stay = rough * staySeasonFactor(dest, start) * nights;
      const total = f.perPerson * group + stay;
      const score = (total / nights) * (1 + 0.04 * Math.abs(nights - p.nights.ideal)) * (p.fixedStart && start !== p.fixedStart ? 1.08 : 1);
      ideas.push({ start, nights, flightsPerPerson: Math.round(f.perPerson), score });
    }
  }
  ideas.sort((a, b) => a.score - b.score);
  const picked: DateIdea[] = [];
  for (const idea of ideas) {
    if (picked.some((x) => Math.abs(diffDays(x.start, idea.start)) < 4)) continue;
    picked.push(idea);
    if (picked.length >= limit) break;
  }
  return picked;
}

function filtersFrom(p: ParsedRequest): StayFilters {
  return {
    ...DEFAULT_FILTERS,
    kinds: p.stay.allInclusive ? ['hotel'] : p.stay.kinds,
    pool: p.stay.pool,
    minBedrooms: p.stay.minBedrooms,
    amenities: p.stay.amenities.filter((a) => a !== 'wifi'),
    sources: p.stay.sources,
    sort: 'value',
  };
}

function quality(q: StayQuote): number {
  const l = q.listing;
  let s = l.rating * 2 + Math.min(l.reviews, 400) / 400;
  if (l.stars) s += (l.stars - 3) * 0.8;
  if (l.kind === 'villa') s += 0.8;
  if (l.pool === 'private') s += 1;
  else if (l.pool === 'shared') s += 0.4;
  if (l.amenities.includes('hot-tub')) s += 0.3;
  if (l.amenities.includes('sea-view')) s += 0.4;
  if (l.boardBasis === 'all-inclusive') s += 0.5;
  if (l.kind === 'hostel') s -= 2;
  return s;
}

export function makePackage(
  args: Omit<TripPackage, 'id' | 'costs' | 'endDate' | 'temp' | 'holiday'>,
): TripPackage {
  const dest = destById(args.destId);
  const endDate = addDays(args.startDate, args.nights);
  // Getting from the airport: use whichever is cheaper for this group and stay, taxis or a hire car.
  let extras = args.extras;
  if (extras.transfer !== 'none') {
    const people = args.travellers.adults + args.travellers.children;
    const taxi = transferCost(dest, people, args.nights, 'taxi', args.stay.listing.area);
    const car = transferCost(dest, people, args.nights, 'car-hire', args.stay.listing.area);
    extras = { ...extras, transfer: car < taxi * 0.9 ? 'car-hire' : 'taxi' };
  }
  const costs = computeCosts({ dest, travellers: args.travellers, nights: args.nights, outbound: args.outbound, inbound: args.inbound, stay: args.stay, extras });
  return {
    ...args,
    extras,
    id: `${args.destId}|${args.startDate}|${args.nights}|${args.stay.listing.id}`,
    endDate,
    costs,
    temp: avgTemp(dest, args.startDate),
    holiday: schoolHolidayOn(args.startDate),
  };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}

export function planDestination(p: ParsedRequest, destId: string, matchReason?: string): DestinationPlan {
  const dest = destById(destId);
  const group = people(p.travellers);
  const dates = bestDates(p, destId, 5);
  const relaxed: string[] = [];
  const extras: Extras = { ...DEFAULT_EXTRAS, bagsPerPerson: p.bagsPerPerson };

  let filters = filtersFrom(p);
  const searchFor = (f: StayFilters, start: ISODate, nights: number) => {
    let res = searchStays(destId, start, nights, group, f);
    if (p.stay.nearBeach) res = res.filter((q) => q.listing.beachKm <= 1.5);
    if (p.stay.central) res = res.filter((q) => q.listing.centreKm <= 1.5);
    if (p.stay.breakfast) res = res.filter((q) => q.listing.boardBasis === 'breakfast' || q.listing.boardBasis === 'all-inclusive' || q.listing.kind !== 'hotel');
    if (p.stay.allInclusive) res = res.filter((q) => q.listing.boardBasis === 'all-inclusive');
    return res;
  };

  // Make sure there's *something* — relax filters one at a time if the group/filters are too demanding.
  const probe = dates[0];
  if (probe) {
    const steps: [string, (f: StayFilters) => StayFilters][] = [
      ['amenities', (f) => ({ ...f, amenities: [] })],
      ['booking site', (f) => ({ ...f, sources: [] })],
      ['bedrooms', (f) => ({ ...f, minBedrooms: 0 })],
      ['stay type', (f) => ({ ...f, kinds: [] })],
      ['private pool → any pool', (f) => ({ ...f, pool: f.pool === 'private' ? 'pool' : f.pool })],
      ['pool', (f) => ({ ...f, pool: 'any' })],
    ];
    for (const [name, relax] of steps) {
      if (searchFor(filters, probe.start, probe.nights).length >= 2) break;
      const next = relax(filters);
      if (JSON.stringify(next) !== JSON.stringify(filters)) {
        filters = next;
        relaxed.push(name);
      }
    }
  }

  const combos: TripPackage[] = [];
  for (const d of dates.slice(0, 4)) {
    const f = cheapestPair(p.origin, destId, d.start, d.nights, { directOnly: p.directOnly, bagsPerPerson: p.bagsPerPerson });
    if (!f.out || !f.back) continue;
    for (const q of searchFor(filters, d.start, d.nights)) {
      combos.push(
        makePackage({
          label: '',
          tone: 'alt',
          blurb: '',
          destId,
          origin: p.origin,
          travellers: p.travellers,
          startDate: d.start,
          nights: d.nights,
          outbound: f.out,
          inbound: f.back,
          stay: q,
          extras,
        }),
      );
    }
  }

  const limit = budgetTotal(p);
  const byPrice = [...combos].sort((a, b) => a.costs.bookableTotal - b.costs.bookableTotal);
  const prices = byPrice.map((c) => c.costs.bookableTotal);
  const used = new Set<string>();
  const take = (c: TripPackage | undefined, label: string, tone: TripPackage['tone'], blurb: string): TripPackage | undefined => {
    if (!c || used.has(c.stay.listing.id + c.startDate)) return undefined;
    used.add(c.stay.listing.id + c.startDate);
    return { ...c, label, tone, blurb, withinBudget: limit ? c.costs.bookableTotal <= limit : undefined };
  };
  const bestBy = (list: TripPackage[], fn: (c: TripPackage) => number) => {
    let best: TripPackage | undefined;
    let bestV = -Infinity;
    for (const c of list) {
      if (used.has(c.stay.listing.id + c.startDate)) continue;
      const v = fn(c);
      if (v > bestV) {
        bestV = v;
        best = c;
      }
    }
    return best;
  };
  const value = (c: TripPackage) => Math.pow(quality(c.stay), 3) / c.costs.bookableTotal;

  const headline: (TripPackage | undefined)[] = [];
  // Hostel dorms only lead the results when someone asks for them; they still appear as an extra idea.
  const wantsHostel = p.stay.kinds.includes('hostel');
  const main = wantsHostel ? byPrice : byPrice.filter((c) => c.stay.listing.kind !== 'hostel');
  const mainPrices = main.map((c) => c.costs.bookableTotal);
  const within = limit ? main.filter((c) => c.costs.bookableTotal <= limit) : [];
  if (limit && within.length) {
    headline.push(take(within[0], 'Cheapest', 'cheap', 'Lowest total price that ticks your boxes.'));
    headline.push(take(bestBy(within, value), 'Best value in budget', 'value', 'Best quality for the money while staying under budget.'));
    headline.push(take(bestBy(within, (c) => quality(c.stay) + c.costs.bookableTotal / limit), 'Best within budget', 'budget', 'The nicest option that still fits your budget.'));
  } else {
    const lo = percentile(mainPrices, 0.3);
    const hi = percentile(mainPrices, 0.7);
    const mid = main.filter((c) => c.costs.bookableTotal >= lo && c.costs.bookableTotal <= hi);
    const top = main.filter((c) => c.costs.bookableTotal >= percentile(mainPrices, 0.7));
    headline.push(take(main[0], 'Cheap option', 'cheap', 'Lowest total price for your group and dates.'));
    headline.push(take(bestBy(mid.length ? mid : main, value), 'Average option', 'value', 'Mid-range price with the best quality for the money.'));
    headline.push(take(bestBy(top.length ? top : main, (c) => quality(c.stay)), 'Expensive option', 'luxury', 'Top-rated stay — the treat-yourselves pick.'));
  }
  if (p.priority === 'luxury') headline.reverse();

  // Extra combinations with a twist, so each prompt gives lots of different ideas.
  const pool = limit && within.length ? byPrice.filter((c) => c.costs.bookableTotal <= limit) : byPrice;
  const more: (TripPackage | undefined)[] = [];
  const kindBest = (kind: string) => bestBy(pool.filter((c) => c.stay.listing.kind === kind), value);
  const v = kindBest('villa');
  if (v) more.push(take(v, 'Everyone in one villa', 'alt', `Whole place to yourselves — ${v.stay.listing.bedrooms} bedrooms${v.stay.listing.pool === 'private' ? ' and a private pool' : ''}.`));
  const multiApt = bestBy(pool.filter((c) => c.stay.listing.kind === 'apartment' && c.stay.units > 1), value);
  if (multiApt) more.push(take(multiApt, `Split across ${multiApt.stay.units} apartments`, 'alt', 'Side-by-side apartments in the same complex — more bathrooms, more privacy.'));
  const apt = kindBest('apartment');
  if (apt) more.push(take(apt, 'Apartment pick', 'alt', 'Self-catering to keep costs down.'));
  const ai = bestBy(pool.filter((c) => c.stay.listing.boardBasis === 'all-inclusive'), value);
  if (ai) more.push(take(ai, 'All-inclusive', 'alt', 'Food & drinks included — spending money estimate is much lower.'));
  const hotel = bestBy(pool.filter((c) => c.stay.listing.kind === 'hotel'), value);
  if (hotel) more.push(take(hotel, 'Hotel rooms', 'alt', `${hotel.stay.units} rooms${hotel.stay.listing.boardBasis === 'breakfast' ? ' with breakfast' : ''} — no cooking or cleaning.`));
  const priv = bestBy(pool.filter((c) => c.stay.listing.pool === 'private'), value);
  if (priv) more.push(take(priv, 'Private pool', 'alt', 'Your own pool, no sunbed wars.'));
  const beach = bestBy(pool, (c) => -c.stay.listing.beachKm * 3 + quality(c.stay) / 4 - c.costs.bookableTotal / (prices[0] * 6 || 1));
  if (beach && dest.tags.includes('beach')) more.push(take(beach, 'Closest to the beach', 'alt', `${beach.stay.listing.beachKm} km from the sand.`));
  const central = bestBy(pool, (c) => -c.stay.listing.centreKm * 3 + quality(c.stay) / 4 - c.costs.bookableTotal / (prices[0] * 6 || 1));
  if (central) more.push(take(central, 'Most central', 'alt', `${central.stay.listing.centreKm} km from the centre — walk everywhere.`));
  const hostel = kindBest('hostel');
  if (hostel) more.push(take(hostel, 'Rock-bottom: hostel beds', 'alt', 'Cheapest way to go — social, basic, great for parties.'));
  const altDate = dates[1] ? bestBy(pool.filter((c) => c.startDate === dates[1].start), value) : undefined;
  if (altDate) more.push(take(altDate, 'Alternative dates', 'alt', 'Different dates with similar prices, in case the first ones don’t work.'));

  return {
    dest,
    headline: headline.filter((x): x is TripPackage => !!x),
    more: more.filter((x): x is TripPackage => !!x).slice(0, 8),
    bestDates: dates,
    relaxed,
    cheapestPerPerson: byPrice[0] ? Math.round(byPrice[0].costs.bookableTotal / group) : 0,
    matchReason,
  };
}

export function planTrips(p: ParsedRequest): PlanResult {
  const picks = pickDestinations(p);
  const plans = picks.map((d) => planDestination(p, d.dest.id, d.reason)).filter((pl) => pl.headline.length);
  // For vague requests, show the destinations in order of how well they fit the budget / price.
  if (!p.destinationFound) {
    const limit = budgetTotal(p);
    plans.sort((a, b) => {
      if (limit) {
        const fa = a.headline.some((h) => h.withinBudget) ? 0 : 1;
        const fb = b.headline.some((h) => h.withinBudget) ? 0 : 1;
        if (fa !== fb) return fa - fb;
      }
      return 0;
    });
  }
  let budgetNote: string | undefined;
  const limit = budgetTotal(p);
  if (limit && p.budget) {
    const fits = plans.filter((pl) => pl.headline.some((h) => h.withinBudget));
    if (!fits.length && plans.length) {
      const cheapest = Math.min(...plans.map((pl) => pl.cheapestPerPerson));
      const budgetPP = Math.round(limit / people(p.travellers));
      budgetNote = `Nothing fits £${budgetPP.toLocaleString('en-GB')} per person for these dates — the cheapest is about £${cheapest.toLocaleString('en-GB')} pp. Try fewer nights, flexible dates, a hostel/apartment, or one of the cheaper destinations below.`;
    }
  }
  return { parsed: p, plans, budgetNote };
}

/** Cheaper alternatives with a similar vibe, for when the budget doesn't stretch. */
export function cheaperAlternatives(p: ParsedRequest, exclude: string[], max = 3): DestinationPlan[] {
  const like = destById(exclude[0]);
  const vibe: ParsedRequest = { ...p, destIds: [], destinationFound: false, vibeTags: p.vibeTags.length ? p.vibeTags : like.tags.slice(0, 2), priority: 'cheap' };
  return pickDestinations(vibe, max + exclude.length)
    .filter((d) => !exclude.includes(d.dest.id))
    .slice(0, max)
    .map((d) => planDestination(vibe, d.dest.id, d.reason))
    .filter((pl) => pl.headline.length);
}

import type { Extras, FlightOption, ISODate, RealPicks, StayFilters, StayQuote, Travellers, Trip } from '../types';
import { destById } from '../data/destinations';
import { addDays, formatDate, monthOf, MONTHS_SHORT, todayISO } from './dates';
import { getFlights } from './flights';
import { DEFAULT_FILTERS, listingById, quoteStay, stayTitle } from './stays';
import { computeCosts, DEFAULT_EXTRAS } from './costs';
import { uid } from './format';
import type { TripPackage } from './planner';

export interface PlannerDraft {
  destId: string;
  origin: string;
  travellers: Travellers;
  nights: number;
  startDate?: ISODate;
  outboundId?: string;
  inboundId?: string;
  directOnly: boolean;
  filters: StayFilters;
  stayId?: string;
  stayUnits?: number;
  extras: Extras;
  name?: string;
  editingTripId?: string;
  viewMonth?: string; // "YYYY-MM"
  picks?: RealPicks;
}

export const DEFAULT_DRAFT: PlannerDraft = {
  destId: 'albufeira',
  origin: 'LON',
  travellers: { adults: 2, children: 0 },
  nights: 7,
  directOnly: false,
  filters: DEFAULT_FILTERS,
  extras: DEFAULT_EXTRAS,
};

export interface ResolvedDraft {
  outbound?: FlightOption;
  inbound?: FlightOption;
  outOptions: FlightOption[];
  backOptions: FlightOption[];
  endDate?: ISODate;
  stay?: StayQuote | null;
  costs: ReturnType<typeof computeCosts>;
}

export function resolveDraft(d: PlannerDraft): ResolvedDraft {
  const dest = destById(d.destId);
  const people = d.travellers.adults + d.travellers.children;
  let outOptions: FlightOption[] = [];
  let backOptions: FlightOption[] = [];
  let outbound: FlightOption | undefined;
  let inbound: FlightOption | undefined;
  let endDate: ISODate | undefined;
  let stay: StayQuote | null | undefined;
  if (d.startDate) {
    endDate = addDays(d.startDate, d.nights);
    const filt = (l: FlightOption[]) => (d.directOnly ? l.filter((f) => f.stops === 0) : l);
    outOptions = filt(getFlights(d.origin, d.destId, d.startDate, 'out'));
    backOptions = filt(getFlights(d.origin, d.destId, endDate, 'back'));
    // Fall back to the cheapest flight so totals are always filled in once dates are picked.
    outbound = outOptions.find((f) => f.id === d.outboundId) ?? outOptions[0];
    inbound = backOptions.find((f) => f.id === d.inboundId) ?? backOptions[0];
    if (d.stayId) {
      const l = listingById(d.destId, d.stayId);
      if (l) stay = quoteStay(l, d.startDate, d.nights, people);
    }
  }
  const costs = computeCosts({ dest, travellers: d.travellers, nights: d.nights, outbound, inbound, stay, extras: d.extras, picks: d.picks });
  return { outbound, inbound, outOptions, backOptions, endDate, stay, costs };
}

export function defaultTripName(destId: string, start: ISODate): string {
  const dest = destById(destId);
  return `${dest.name.replace(/\s*\(.*\)/, '')} ${MONTHS_SHORT[monthOf(start)]} ${start.slice(0, 4)}`;
}

/** Recalculate a saved trip's totals (e.g. after real prices were pasted in). */
export function recalcTrip(t: Trip): Trip {
  const costs = computeCosts({ dest: destById(t.destId), travellers: t.travellers, nights: t.nights, outbound: t.outbound, inbound: t.inbound, stay: t.stay, extras: t.extras, picks: t.picks });
  return { ...t, costs, updatedAt: new Date().toISOString() };
}

const hasPicks = (p?: RealPicks) => !!p && Object.values(p).some((v) => v !== undefined && v !== '');

export function packageToTrip(p: TripPackage, picks?: RealPicks): Trip {
  const now = new Date().toISOString();
  const trip: Trip = {
    id: uid(),
    name: defaultTripName(p.destId, p.startDate),
    createdAt: now,
    updatedAt: now,
    destId: p.destId,
    origin: p.origin,
    travellers: p.travellers,
    startDate: p.startDate,
    endDate: p.endDate,
    nights: p.nights,
    outbound: p.outbound,
    inbound: p.inbound,
    stay: p.stay,
    extras: p.extras,
    costs: p.costs,
    notes: '',
    booked: { flights: false, stay: false, transfers: false, insurance: false },
    label: p.label,
    picks: hasPicks(picks) ? picks : undefined,
  };
  return trip.picks ? recalcTrip(trip) : trip;
}

export function packageToDraft(p: TripPackage): PlannerDraft {
  return {
    destId: p.destId,
    origin: p.origin,
    travellers: p.travellers,
    nights: p.nights,
    startDate: p.startDate,
    outboundId: p.outbound.id,
    inboundId: p.inbound.id,
    directOnly: false,
    filters: { ...DEFAULT_FILTERS },
    stayId: p.stay.listing.id,
    extras: p.extras,
    viewMonth: p.startDate.slice(0, 7),
  };
}

export function tripToDraft(t: Trip): PlannerDraft {
  return {
    destId: t.destId,
    origin: t.origin,
    travellers: t.travellers,
    nights: t.nights,
    startDate: t.startDate >= todayISO() ? t.startDate : undefined,
    outboundId: t.outbound?.id,
    inboundId: t.inbound?.id,
    directOnly: false,
    filters: { ...DEFAULT_FILTERS },
    stayId: t.stay?.listing.id,
    extras: t.extras,
    name: t.name,
    editingTripId: t.id,
    picks: t.picks,
    viewMonth: t.startDate.slice(0, 7),
  };
}

export function draftToTrip(d: PlannerDraft, r: ResolvedDraft, existing?: Trip): Trip | null {
  if (!d.startDate || !r.endDate) return null;
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? uid(),
    name: d.name?.trim() || existing?.name || defaultTripName(d.destId, d.startDate),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    destId: d.destId,
    origin: d.origin,
    travellers: d.travellers,
    startDate: d.startDate,
    endDate: r.endDate,
    nights: d.nights,
    outbound: r.outbound,
    inbound: r.inbound,
    stay: r.stay ?? undefined,
    extras: d.extras,
    costs: r.costs,
    notes: existing?.notes ?? '',
    booked: existing?.booked ?? { flights: false, stay: false, transfers: false, insurance: false },
    label: existing?.label,
    picks: hasPicks(d.picks) ? d.picks : undefined,
  };
}

export function tripSummaryText(t: Trip): string {
  const dest = destById(t.destId);
  const lines = [
    `✈️ ${t.name} — ${dest.name}, ${dest.country}`,
    `${formatDate(t.startDate, { year: true })} → ${formatDate(t.endDate, { year: true })} (${t.nights} nights), ${t.travellers.adults + t.travellers.children} people`,
  ];
  if (t.outbound) lines.push(`Out: ${t.outbound.airline} ${t.outbound.flightNo} ${t.outbound.from} ${t.outbound.depart} → ${t.outbound.to} ${t.outbound.arrive}`);
  if (t.inbound) lines.push(`Back: ${t.inbound.airline} ${t.inbound.flightNo} ${t.inbound.from} ${t.inbound.depart} → ${t.inbound.to} ${t.inbound.arrive}`);
  if (t.stay) lines.push(`Stay: ${t.picks?.stayName ?? `${stayTitle(t.stay.listing)} (estimate, search on ${t.stay.listing.source})`}`);
  if (t.picks?.outUrl) lines.push(`Flight out link: ${t.picks.outUrl}`);
  if (t.picks?.backUrl) lines.push(`Flight back link: ${t.picks.backUrl}`);
  if (t.picks?.stayUrl) lines.push(`Stay link: ${t.picks.stayUrl}`);
  lines.push(`Total to book: £${t.costs.bookableTotal.toLocaleString('en-GB')} (£${t.costs.perPersonBookable.toLocaleString('en-GB')} each)`);
  if (t.costs.spending) lines.push(`Whole trip incl. spending: £${t.costs.grandTotal.toLocaleString('en-GB')} (£${t.costs.perPerson.toLocaleString('en-GB')} each)`);
  return lines.join('\n');
}

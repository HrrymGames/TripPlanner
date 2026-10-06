import type { Destination, FlightOption, ISODate, StayListing, StayQuote, Travellers } from '../types';
import { originByCode } from '../data/airports';

/** Deep links into real booking sites with the search pre-filled. */

const yymmdd = (iso: ISODate) => iso.slice(2).replace(/-/g, '');

export function skyscannerLink(originCode: string, dest: Destination, out: ISODate, back: ISODate, t: Travellers, directOnly = false): string {
  const origin = originByCode(originCode);
  const params = new URLSearchParams({
    adultsv2: String(t.adults),
    cabinclass: 'economy',
    rtn: '1',
    preferdirects: String(directOnly),
  });
  if (t.children) params.set('childrenv2', Array.from({ length: t.children }, () => '8').join('|'));
  return `https://www.skyscanner.net/transport/flights/${origin.skyscanner}/${dest.airport.toLowerCase()}/${yymmdd(out)}/${yymmdd(back)}/?${params}`;
}

export function googleFlightsLink(originCode: string, dest: Destination, out: ISODate, back: ISODate, t: Travellers): string {
  const origin = originByCode(originCode);
  const who = [`${t.adults} adult${t.adults === 1 ? '' : 's'}`];
  if (t.children) who.push(`${t.children} child${t.children === 1 ? '' : 'ren'}`);
  const q = `Flights from ${origin.code} to ${dest.airport} on ${out} through ${back} for ${who.join(' and ')}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=GBP&hl=en-GB`;
}

export function kayakLink(originCode: string, dest: Destination, out: ISODate, back: ISODate, t: Travellers): string {
  const origin = originByCode(originCode);
  const kids = t.children ? `/children-${Array.from({ length: t.children }, () => '11').join('-')}` : '';
  return `https://www.kayak.co.uk/flights/${origin.code}-${dest.airport}/${out}/${back}/${t.adults}adults${kids}?sort=price_a`;
}

/** Link straight to the airline's site for a specific flight (best effort: their homepage / search). */
export function airlineLink(f: FlightOption): string {
  const sites: Record<string, string> = {
    Ryanair: 'https://www.ryanair.com/gb/en',
    easyJet: 'https://www.easyjet.com/en',
    Jet2: 'https://www.jet2.com/',
    'Wizz Air': 'https://wizzair.com/en-gb',
    TUI: 'https://www.tui.co.uk/flight/',
    'British Airways': 'https://www.britishairways.com/',
    'Aer Lingus': 'https://www.aerlingus.com/',
    'TAP Air Portugal': 'https://www.flytap.com/en-gb/',
    Vueling: 'https://www.vueling.com/en',
    KLM: 'https://www.klm.co.uk/',
    'Virgin Atlantic': 'https://www.virginatlantic.com/',
    Emirates: 'https://www.emirates.com/uk/english/',
    'Qatar Airways': 'https://www.qatarairways.com/en-gb/',
    Icelandair: 'https://www.icelandair.com/en-gb/',
    Pegasus: 'https://www.flypgs.com/en',
    'Turkish Airlines': 'https://www.turkishairlines.com/en-gb/',
    SWISS: 'https://www.swiss.com/gb/en',
    'Croatia Airlines': 'https://www.croatiaairlines.com/',
    'KM Malta Airlines': 'https://www.kmmaltairlines.com/',
  };
  return sites[f.airline] ?? `https://www.google.com/search?q=${encodeURIComponent(`${f.airline} ${f.flightNo}`)}`;
}

const AIRBNB_AMENITY: Partial<Record<string, number>> = {
  pool: 7,
  wifi: 4,
  kitchen: 8,
  aircon: 5,
  parking: 9,
  'hot-tub': 25,
  bbq: 99,
  gym: 15,
  'washing-machine': 33,
};

export interface StaySearchOpts {
  checkIn: ISODate;
  checkOut: ISODate;
  travellers: Travellers;
  minBedrooms?: number;
  minBeds?: number;
  pool?: boolean;
  amenities?: string[];
  area?: string;
  maxPerNight?: number;
  kind?: StayListing['kind'];
}

export function airbnbLink(dest: Destination, o: StaySearchOpts): string {
  const place = [o.area, dest.name.replace(/\s*\(.*\)/, '').replace(/ & .*/, ''), dest.country].filter(Boolean).join(', ');
  const params = new URLSearchParams({
    checkin: o.checkIn,
    checkout: o.checkOut,
    adults: String(o.travellers.adults),
    children: String(o.travellers.children),
    currency: 'GBP',
  });
  if (o.minBedrooms) params.set('min_bedrooms', String(o.minBedrooms));
  if (o.minBeds) params.set('min_beds', String(o.minBeds));
  if (o.maxPerNight) params.set('price_max', String(Math.round(o.maxPerNight)));
  if (o.kind === 'villa' || o.kind === 'apartment' || !o.kind) params.append('room_types[]', 'Entire home/apt');
  const amenityIds = new Set<number>();
  if (o.pool) amenityIds.add(7);
  for (const a of o.amenities ?? []) {
    const id = AIRBNB_AMENITY[a];
    if (id) amenityIds.add(id);
  }
  amenityIds.forEach((id) => params.append('amenities[]', String(id)));
  return `https://www.airbnb.co.uk/s/${encodeURIComponent(place)}/homes?${params}`;
}

const BOOKING_TYPE: Record<StayListing['kind'], string> = { villa: '213', apartment: '201', hotel: '204', hostel: '203' };

export function bookingLink(dest: Destination, o: StaySearchOpts & { rooms?: number }): string {
  const place = [o.area, dest.name.replace(/\s*\(.*\)/, '').replace(/ & .*/, ''), dest.country].filter(Boolean).join(', ');
  const params = new URLSearchParams({
    ss: place,
    checkin: o.checkIn,
    checkout: o.checkOut,
    group_adults: String(o.travellers.adults),
    group_children: String(o.travellers.children),
    no_rooms: String(o.rooms ?? Math.max(1, Math.ceil((o.travellers.adults + o.travellers.children) / 2))),
    selected_currency: 'GBP',
  });
  const nflt: string[] = [];
  if (o.kind) nflt.push(`ht_id=${BOOKING_TYPE[o.kind]}`);
  if (o.pool) nflt.push('hotelfacility=433');
  if (o.minBedrooms && (o.kind === 'villa' || o.kind === 'apartment')) nflt.push(`entire_place_bedroom_count=${o.minBedrooms}`);
  if (nflt.length) params.set('nflt', nflt.join(';'));
  return `https://www.booking.com/searchresults.en-gb.html?${params}`;
}

export function vrboLink(dest: Destination, o: StaySearchOpts): string {
  const place = [dest.name.replace(/\s*\(.*\)/, '').replace(/ & .*/, ''), dest.country].join(', ');
  const params = new URLSearchParams({
    destination: place,
    startDate: o.checkIn,
    endDate: o.checkOut,
    adults: String(o.travellers.adults),
    children: String(o.travellers.children),
  });
  if (o.minBedrooms) params.set('bedroom_count_gt', String(Math.max(0, o.minBedrooms - 1)));
  if (o.pool) params.set('amenities', 'POOL');
  return `https://www.vrbo.com/en-gb/search?${params}`;
}

export function hotelsComLink(dest: Destination, o: StaySearchOpts & { rooms?: number }): string {
  const place = [o.area, dest.name.replace(/\s*\(.*\)/, '').replace(/ & .*/, ''), dest.country].filter(Boolean).join(', ');
  const params = new URLSearchParams({
    destination: place,
    startDate: o.checkIn,
    endDate: o.checkOut,
    adults: String(Math.max(1, Math.ceil(o.travellers.adults / (o.rooms ?? 1)))),
    rooms: String(o.rooms ?? 1),
  });
  return `https://uk.hotels.com/Hotel-Search?${params}`;
}

/** Link to search for something like this specific stay on the platform it's modelled on. */
export function stayLink(dest: Destination, q: StayQuote, checkIn: ISODate, checkOut: ISODate, travellers: Travellers): string {
  const l = q.listing;
  const opts: StaySearchOpts & { rooms?: number } = {
    checkIn,
    checkOut,
    travellers,
    area: l.area,
    kind: l.kind,
    pool: l.pool !== 'none',
    minBedrooms: l.kind === 'villa' || l.kind === 'apartment' ? l.bedrooms : undefined,
    rooms: l.kind === 'hotel' ? q.units : undefined,
  };
  switch (l.source) {
    case 'Airbnb':
      return airbnbLink(dest, opts);
    case 'Vrbo':
      return vrboLink(dest, opts);
    case 'Hotels.com':
      return hotelsComLink(dest, opts);
    default:
      return bookingLink(dest, opts);
  }
}

export function carHireLink(dest: Destination, from: ISODate, to: ISODate): string {
  return `https://www.skyscanner.net/carhire/results/${dest.airport}/${dest.airport}/${from}T12:00/${to}T10:00/30`;
}

export function transferLink(dest: Destination): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${dest.airportName} airport transfer to ${dest.name}`)}`;
}

export function insuranceLink(): string {
  return 'https://www.moneysavingexpert.com/travel/cheap-travel-insurance/';
}

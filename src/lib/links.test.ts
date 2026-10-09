import { describe, expect, it } from 'vitest';
import { describeLink, flightDayGoogleLink, flightDaySkyscannerLink, safeUrl, stayLink } from './links';
import { getFlights } from './flights';
import { listingsFor, quoteStay } from './stays';
import { destById } from '../data/destinations';
import { parseRequest } from './parse';
import { planTrips } from './planner';
import { packageToTrip } from './trips';

const T = { adults: 10, children: 0 };

describe('links', () => {
  it('only keeps real web links', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,hi')).toBeUndefined();
    expect(safeUrl('www.airbnb.co.uk/rooms/123')).toBe('https://www.airbnb.co.uk/rooms/123');
    expect(safeUrl(' https://www.booking.com/hotel/pt/sol.html ')).toBe('https://www.booking.com/hotel/pt/sol.html');
  });

  it('names pasted booking links', () => {
    expect(describeLink('https://www.airbnb.co.uk/rooms/53412345?adults=10')).toBe('Airbnb listing 53412345');
    expect(describeLink('https://www.booking.com/hotel/pt/vila-gale-cerro-alagoa.en-gb.html')).toBe('Booking.com · Vila Gale Cerro Alagoa');
    expect(describeLink('https://www.ryanair.com/gb/en')).toBe('Ryanair');
  });

  it('links a flight to its exact day, airports and airline', () => {
    const f = getFlights('LON', 'albufeira', '2027-06-22', 'out')[0];
    const g = decodeURIComponent(flightDayGoogleLink(f, T));
    expect(g).toContain(`from ${f.from} to ${f.to} on 2027-06-22 on ${f.airline}`);
    expect(g).toContain('10 adults');
    expect(flightDaySkyscannerLink(f, T)).toContain(`/${f.from.toLowerCase()}/fao/270622/`);
  });

  it('matches stay searches to the listing and a price band', () => {
    const l = listingsFor('albufeira').find((x) => x.kind === 'villa' && x.source === 'Airbnb' && x.sleeps >= 10)!;
    const q = quoteStay(l, '2027-06-22', 7, 10)!;
    const url = new URL(stayLink(destById('albufeira'), q, '2027-06-22', '2027-06-29', T));
    expect(url.hostname).toBe('www.airbnb.co.uk');
    expect(url.searchParams.get('min_bedrooms')).toBe(String(l.bedrooms));
    expect(Number(url.searchParams.get('price_max'))).toBeGreaterThan(Number(url.searchParams.get('price_min')));
  });
});

describe('real picks', () => {
  it('replace the estimates in a saved trip', () => {
    const pkg = planTrips(parseRequest('ten people albufeira next summer a week ish', '2026-10-06')).plans[0].headline[0];
    const trip = packageToTrip(pkg, { stayUrl: 'https://www.airbnb.co.uk/rooms/1', stayPrice: 4000, outPrice: 50, backPrice: 60 });
    expect(trip.costs.stay).toBe(4000);
    expect(trip.costs.flights).toBe(1100);
    expect(trip.picks?.stayUrl).toBe('https://www.airbnb.co.uk/rooms/1');
    expect(packageToTrip(pkg).costs.stay).toBe(pkg.stay.total);
  });
});

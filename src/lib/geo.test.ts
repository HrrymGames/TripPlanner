import { beforeAll, describe, expect, it } from 'vitest';
import { parseRequest } from './parse';
import { planTrips } from './planner';
import { getFlights, setPricingToday } from './flights';
import { destById } from '../data/destinations';
import { findPlaces, searchPlaces } from './geo';
import { transferQuote } from './costs';

const TODAY = '2026-10-09';
beforeAll(() => setPricingToday(TODAY));

describe('any place in the world', () => {
  it('finds US states and flies to the nearest big airport', () => {
    const de = parseRequest('ten people delaware next summer a week', TODAY);
    expect(de.destIds).toEqual(['geo-region:US:DE']);
    expect(destById('geo-region:US:DE').airport).toBe('PHL');
    const nj = parseRequest('new jersey in july for 4', TODAY);
    expect(nj.destIds).toEqual(['geo-region:US:NJ']);
    expect(destById(nj.destIds[0]).airport).toBe('EWR');
  });

  it('finds towns, with a region to disambiguate', () => {
    expect(searchPlaces('wilmington delaware')[0].label).toBe('Wilmington, Delaware, USA');
    expect(searchPlaces('rehoboth beach')[0].label).toBe('Rehoboth Beach, Delaware, USA');
    expect(findPlaces('wilmington').length).toBeGreaterThan(1);
  });

  it('does not mistake everyday words for towns', () => {
    for (const q of ['8 lads villa private pool hot tub cheap flights direct', 'romantic getaway near the beach with sea view and breakfast', 'long weekend somewhere warm with good food']) {
      expect(searchPlaces(q)).toEqual([]);
    }
    const p = parseRequest('ten people next summer a week ish villa with a pool £600 each from leeds', TODAY);
    expect(p.origin).toBe('LBA');
    expect(p.destIds.some((id) => id.startsWith('geo'))).toBe(false);
  });

  it('still prefers the hand-picked destinations and fixes typos', () => {
    expect(parseRequest('ten people albufiera next summer a week ish', TODAY).destIds).toEqual(['albufeira']);
    expect(parseRequest('lisbon in may', TODAY).destIds).toEqual(['lisbon']);
  });

  it('plans a full trip with transfers priced by distance', () => {
    const res = planTrips(parseRequest('4 adults wilmington delaware in may 5 nights', TODAY));
    const pkg = res.plans[0].headline[0];
    expect(pkg.outbound.to).toBe('PHL');
    expect(pkg.inbound.from).toBe('PHL');
    const t = transferQuote(destById(pkg.destId), 4, pkg.stay.listing.area);
    expect(t.km).toBeGreaterThan(5);
    expect(t.total).toBe(t.perWay * 2);
    expect(pkg.costs.transfers).toBe(t.total);
  });

  it('only shows nonstop long-haul flights that really exist', () => {
    const tokyo = parseRequest('tokyo in april', TODAY).destIds[0];
    const flights = getFlights('LON', tokyo, '2027-04-14', 'out');
    expect(flights.length).toBeGreaterThan(0);
    for (const f of flights.filter((x) => x.stops === 0)) expect(['British Airways', 'Virgin Atlantic'].includes(f.airline) && f.airline === 'British Airways').toBe(true);
    // Small airports outside Europe connect through the nearest hub.
    const small = destById('geo:US:DE:dover');
    if (small.geo?.connectVia) expect(getFlights('LON', small.id, '2027-05-12', 'out').every((f) => f.stops === 1)).toBe(true);
  });
});

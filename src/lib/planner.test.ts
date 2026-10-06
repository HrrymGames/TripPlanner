import { beforeAll, describe, expect, it } from 'vitest';
import { parseRequest } from './parse';
import { planTrips } from './planner';
import { setPricingToday, getFlights } from './flights';
import { listingsFor, unitsNeeded } from './stays';

const TODAY = '2026-10-06';
beforeAll(() => setPricingToday(TODAY));

describe('flights', () => {
  it('is deterministic and sorted by price', () => {
    const a = getFlights('LON', 'albufeira', '2027-06-12', 'out');
    const b = getFlights('LON', 'albufeira', '2027-06-12', 'out');
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    for (let i = 1; i < a.length; i++) expect(a[i].price).toBeGreaterThanOrEqual(a[i - 1].price);
  });

  it('has flights from regional airports and to long-haul', () => {
    expect(getFlights('LBA', 'albufeira', '2027-06-12', 'out').length).toBeGreaterThan(0);
    expect(getFlights('MAN', 'bali', '2027-06-12', 'out').every((f) => f.stops > 0)).toBe(true);
    expect(getFlights('LHR', 'new-york', '2027-06-12', 'out').length).toBeGreaterThan(0);
  });
});

describe('planTrips', () => {
  it('produces cheap / average / expensive options for a big group', () => {
    const res = planTrips(parseRequest('ten people albufeira next summer a week ish', TODAY));
    expect(res.plans).toHaveLength(1);
    const plan = res.plans[0];
    expect(plan.headline.map((h) => h.label)).toEqual(['Cheap option', 'Average option', 'Expensive option']);
    const [cheap, , lux] = plan.headline;
    expect(cheap.costs.bookableTotal).toBeLessThanOrEqual(lux.costs.bookableTotal);
    for (const h of plan.headline) {
      expect(h.startDate >= '2027-06-01' && h.startDate <= '2027-08-31').toBe(true);
      expect(h.nights).toBeGreaterThanOrEqual(6);
      expect(h.nights).toBeLessThanOrEqual(8);
      expect(h.costs.people).toBe(10);
      expect(unitsNeeded(h.stay.listing, 10)).not.toBeNull();
    }
    expect(plan.more.length).toBeGreaterThan(2);
  });

  it('respects a per-person budget', () => {
    const res = planTrips(parseRequest('4 people benidorm in may 5 nights £450 each', TODAY));
    const plan = res.plans[0];
    expect(plan.headline.length).toBeGreaterThan(0);
    for (const h of plan.headline) expect(h.costs.bookableTotal).toBeLessThanOrEqual(1800);
  });

  it('honours a pool request', () => {
    const res = planTrips(parseRequest('6 people mallorca july villa with private pool', TODAY));
    for (const h of [...res.plans[0].headline, ...res.plans[0].more]) expect(h.stay.listing.pool).toBe('private');
  });

  it('suggests destinations for vague prompts', () => {
    const res = planTrips(parseRequest('somewhere hot with a beach in april for 4, cheap', TODAY));
    expect(res.plans.length).toBeGreaterThan(1);
    for (const pl of res.plans) expect(pl.dest.temps[3]).toBeGreaterThanOrEqual(20);
  });

  it('every destination has listings that fit a group of 10', () => {
    for (const id of ['albufeira', 'paris', 'bali', 'alps', 'reykjavik']) {
      expect(listingsFor(id).some((l) => unitsNeeded(l, 10))).toBe(true);
    }
  });
});

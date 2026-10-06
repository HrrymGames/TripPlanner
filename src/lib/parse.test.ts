import { describe, expect, it } from 'vitest';
import { parseRequest } from './parse';

const TODAY = '2026-10-06';

describe('parseRequest', () => {
  it('reads the classic casual prompt', () => {
    const p = parseRequest('ten people albufeira next summer a week ish', TODAY);
    expect(p.travellers).toEqual({ adults: 10, children: 0 });
    expect(p.destIds).toEqual(['albufeira']);
    expect(p.window.start).toBe('2027-06-01');
    expect(p.window.end).toBe('2027-08-31');
    expect(p.nights).toMatchObject({ min: 6, max: 8, ideal: 7 });
  });

  it('understands budgets per person and in total', () => {
    expect(parseRequest('4 of us benidorm in may £400 each', TODAY).budget).toEqual({ amount: 400, per: 'person', explicitPer: true });
    expect(parseRequest('6 people ibiza budget 3k total', TODAY).budget).toEqual({ amount: 3000, per: 'total', explicitPer: true });
    expect(parseRequest('max 4 bedrooms under £500 for 8 people', TODAY).budget?.amount).toBe(500);
  });

  it('picks up stay requirements', () => {
    const p = parseRequest('8 lads villa with private pool and hot tub in marbella 5 nights, 4 bedrooms', TODAY);
    expect(p.stay.kinds).toContain('villa');
    expect(p.stay.pool).toBe('private');
    expect(p.stay.amenities).toContain('hot-tub');
    expect(p.stay.minBedrooms).toBe(4);
    expect(p.nights.ideal).toBe(5);
    expect(p.vibeTags).toContain('party');
  });

  it('handles families, kids and origins', () => {
    const p = parseRequest('2 adults and 2 kids from leeds to tenerife february half term', TODAY);
    expect(p.travellers).toEqual({ adults: 2, children: 2 });
    expect(p.origin).toBe('LBA');
    expect(p.destIds).toEqual(['tenerife']);
    expect(p.window.label).toMatch(/February half term 2027/);
  });

  it('does not treat "for a week" as one person or "nice" as the city', () => {
    const p = parseRequest('somewhere nice and hot for a week in july with a pool', TODAY);
    expect(p.travellersFound).toBe(false);
    expect(p.destIds).toEqual([]);
    expect(p.wantsHot).toBe(true);
    expect(p.stay.pool).toBe('pool');
    expect(p.window.start).toBe('2027-07-01');
  });

  it('expands countries to several destinations', () => {
    const p = parseRequest('couple greece september', TODAY);
    expect(p.travellers.adults).toBe(2);
    expect(p.destIds.length).toBeGreaterThan(3);
  });

  it('reads explicit date ranges', () => {
    const p = parseRequest('6 people prague 12-15 march', TODAY);
    expect(p.fixedStart).toBe('2027-03-12');
    expect(p.nights.ideal).toBe(3);
  });

  it('long weekend and days', () => {
    expect(parseRequest('long weekend in rome', TODAY).nights).toMatchObject({ min: 3, max: 4 });
    expect(parseRequest('10 days in crete', TODAY).nights.ideal).toBe(9);
  });
});

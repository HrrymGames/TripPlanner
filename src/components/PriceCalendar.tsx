import { useMemo } from 'react';
import type { ISODate } from '../types';
import { addDays, dayOfWeek, daysInMonth, makeISO, MONTHS, schoolHolidayOn, todayISO } from '../lib/dates';
import { cheapestPair } from '../lib/flights';

interface Props {
  origin: string;
  destId: string;
  nights: number;
  bagsPerPerson: number;
  directOnly: boolean;
  month: string; // YYYY-MM
  onMonth: (m: string) => void;
  selected?: ISODate;
  onSelect: (d: ISODate) => void;
}

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Month grid with the cheapest return-flight price per person under each departure date. */
export function PriceCalendar({ origin, destId, nights, bagsPerPerson, directOnly, month, onMonth, selected, onSelect }: Props) {
  const [y, m] = month.split('-').map(Number);
  const m0 = m - 1;
  const today = todayISO();
  const earliest = addDays(today, 1);
  const maxDate = addDays(today, 360);

  const cells = useMemo(() => {
    const out: { iso: ISODate; price: number; holiday?: string; disabled: boolean }[] = [];
    for (let d = 1; d <= daysInMonth(y, m0); d++) {
      const iso = makeISO(y, m0, d);
      const disabled = iso < earliest || iso > maxDate;
      const price = disabled ? Infinity : cheapestPair(origin, destId, iso, nights, { directOnly, bagsPerPerson }).perPerson;
      out.push({ iso, price, holiday: schoolHolidayOn(iso), disabled: disabled || !Number.isFinite(price) });
    }
    return out;
  }, [y, m0, origin, destId, nights, bagsPerPerson, directOnly, earliest, maxDate]);

  const prices = cells.filter((c) => !c.disabled).map((c) => c.price).sort((a, b) => a - b);
  const lowCut = prices[Math.floor(prices.length / 3)] ?? 0;
  const highCut = prices[Math.floor((prices.length * 2) / 3)] ?? 0;
  const best = prices[0];
  const lead = (dayOfWeek(makeISO(y, m0, 1)) + 6) % 7; // Monday-first
  const returnDate = selected ? addDays(selected, nights) : undefined;

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m0 + delta, 1));
    onMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const canBack = makeISO(y, m0, 1) > today;
  const canNext = makeISO(y, m0 + 1, 1) <= maxDate;

  const cheapestThisMonth = cells.find((c) => !c.disabled && c.price === best);

  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="btn small" type="button" onClick={() => shift(-1)} disabled={!canBack} aria-label="Previous month">
          ‹
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="strong">
            {MONTHS[m0]} {y}
          </div>
          {cheapestThisMonth && (
            <button className="link-btn tiny" type="button" onClick={() => onSelect(cheapestThisMonth.iso)}>
              Jump to cheapest (£{Math.round(best)})
            </button>
          )}
        </div>
        <button className="btn small" type="button" onClick={() => shift(1)} disabled={!canNext} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="cal-grid">
        {DOW.map((d, i) => (
          <div key={i} className="cal-dow">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`pad${i}`} />
        ))}
        {cells.map((c) => {
          const tier = c.disabled ? '' : c.price <= lowCut ? 'cheap' : c.price <= highCut ? 'mid' : 'dear';
          const isSel = c.iso === selected;
          const inRange = selected && returnDate && c.iso > selected && c.iso < returnDate;
          const isRet = c.iso === returnDate;
          return (
            <button
              key={c.iso}
              type="button"
              className={`cal-day ${tier} ${isSel ? 'selected' : ''} ${inRange ? 'in-range' : ''} ${isRet ? 'return' : ''} ${!c.disabled && c.price === best ? 'best' : ''}`}
              disabled={c.disabled}
              onClick={() => onSelect(c.iso)}
              aria-label={`${c.iso}${c.disabled ? '' : `, return flights from £${Math.round(c.price)} per person`}`}
              aria-pressed={isSel}
            >
              {c.holiday && <span className="hol" title={c.holiday} />}
              <span className="d">{Number(c.iso.slice(8))}</span>
              <span className="p">{c.disabled ? '–' : `£${Math.round(c.price)}`}</span>
            </button>
          );
        })}
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--cheap)' }} />
          Cheaper
        </span>
        <span>
          <i style={{ background: 'var(--mid)' }} />
          Average
        </span>
        <span>
          <i style={{ background: 'var(--dear)' }} />
          Pricier
        </span>
        <span>
          <i style={{ background: 'var(--warn)', borderRadius: '50%' }} />
          School holidays
        </span>
        <span>Price = return flights per person, {nights} nights</span>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import type { Destination, FlightOption, ISODate, RealPicks, StayQuote, Travellers } from '../types';
import { formatDate } from '../lib/dates';
import { moneyExact, money } from '../lib/format';
import { airlineLink, airbnbLink, bookingLink, describeLink, flightDayGoogleLink, flightDaySkyscannerLink, safeUrl, stayLink, vrboLink } from '../lib/links';
import { unitLabel } from '../lib/stays';
import { Ext, FlightLine } from './ui';

interface Props {
  dest: Destination;
  travellers: Travellers;
  checkIn: ISODate;
  checkOut: ISODate;
  outbound?: FlightOption;
  inbound?: FlightOption;
  stay?: StayQuote | null;
  picks: RealPicks;
  onChange: (p: RealPicks) => void;
  /** Hide the "find it" search buttons (e.g. when the trip is already booked). */
  compact?: boolean;
}

const num = (v: string) => {
  const n = Number(v.replace(/[£,\s]/g, ''));
  return v.trim() === '' || Number.isNaN(n) ? undefined : n;
};

/**
 * For each part of a trip: buttons that open the real search for exactly that day/stay,
 * then fields to paste back the real link and price you found. Real prices replace the estimates.
 */
export function RealPicksEditor({ dest, travellers, checkIn, checkOut, outbound, inbound, stay, picks, onChange, compact }: Props) {
  const set = (patch: Partial<RealPicks>) => onChange({ ...picks, ...patch });
  const people = travellers.adults + travellers.children;
  const l = stay?.listing;
  const matchOpts = l
    ? {
        checkIn,
        checkOut,
        travellers,
        area: l.area,
        pool: l.pool !== 'none',
        minBedrooms: l.kind === 'villa' || l.kind === 'apartment' ? l.bedrooms : undefined,
        kind: l.kind,
      }
    : { checkIn, checkOut, travellers };

  return (
    <div className="stack" style={{ gap: 12 }}>
      {outbound && (
        <PickBlock
          icon="🛫"
          title={`Flight out · ${formatDate(outbound.date)}`}
          estimate={<FlightLine f={outbound} compact />}
          find={
            !compact && (
              <>
                <Ext href={flightDayGoogleLink(outbound, travellers)}>This day on Google Flights</Ext>
                <Ext href={flightDaySkyscannerLink(outbound, travellers)}>Skyscanner</Ext>
                <Ext href={airlineLink(outbound)}>{outbound.airline}</Ext>
              </>
            )
          }
          url={picks.outUrl}
          price={picks.outPrice}
          priceLabel="Price per person (£)"
          placeholderPrice={outbound.price}
          onUrl={(v) => set({ outUrl: v })}
          onPrice={(v) => set({ outPrice: v })}
          idBase="out"
        />
      )}
      {inbound && (
        <PickBlock
          icon="🛬"
          title={`Flight back · ${formatDate(inbound.date)}`}
          estimate={<FlightLine f={inbound} compact />}
          find={
            !compact && (
              <>
                <Ext href={flightDayGoogleLink(inbound, travellers)}>This day on Google Flights</Ext>
                <Ext href={flightDaySkyscannerLink(inbound, travellers)}>Skyscanner</Ext>
                <Ext href={airlineLink(inbound)}>{inbound.airline}</Ext>
              </>
            )
          }
          url={picks.backUrl}
          price={picks.backPrice}
          priceLabel="Price per person (£)"
          placeholderPrice={inbound.price}
          onUrl={(v) => set({ backUrl: v })}
          onPrice={(v) => set({ backPrice: v })}
          idBase="back"
        />
      )}
      <PickBlock
        icon="🏠"
        title={l ? `Stay like ${l.name}` : 'Your stay'}
        estimate={
          stay ? (
            <div className="small">
              {unitLabel(stay)} in {stay.listing.area} · estimate <strong>{money(stay.total)}</strong> ({money(stay.total / people)} pp)
            </div>
          ) : (
            <div className="small muted">No stay chosen yet.</div>
          )
        }
        find={
          !compact && (
            <>
              {stay && <Ext href={stayLink(dest, stay, checkIn, checkOut, travellers)}>Matching on {stay.listing.source}</Ext>}
              {stay?.listing.source !== 'Airbnb' && <Ext href={airbnbLink(dest, matchOpts)}>Airbnb</Ext>}
              {stay?.listing.source !== 'Booking.com' && <Ext href={bookingLink(dest, matchOpts)}>Booking.com</Ext>}
              {stay?.listing.source !== 'Vrbo' && l?.kind !== 'hotel' && <Ext href={vrboLink(dest, matchOpts)}>Vrbo</Ext>}
            </>
          )
        }
        url={picks.stayUrl}
        price={picks.stayPrice}
        priceLabel="Total for the stay (£)"
        placeholderPrice={stay?.total}
        onUrl={(v) => set({ stayUrl: v, stayName: v ? describeLink(v) : undefined })}
        onPrice={(v) => set({ stayPrice: v })}
        idBase="stay"
      />
    </div>
  );
}

function PickBlock({
  icon,
  title,
  estimate,
  find,
  url,
  price,
  priceLabel,
  placeholderPrice,
  onUrl,
  onPrice,
  idBase,
}: {
  icon: string;
  title: string;
  estimate: ReactNode;
  find: ReactNode;
  url?: string;
  price?: number;
  priceLabel: string;
  placeholderPrice?: number;
  onUrl: (v: string | undefined) => void;
  onPrice: (v: number | undefined) => void;
  idBase: string;
}) {
  const safe = safeUrl(url);
  const has = !!safe || price !== undefined;
  return (
    <section className={`pick ${has ? 'has' : ''}`}>
      <div className="row between">
        <strong>
          {icon} {title}
        </strong>
        {has && <span className="badge good">✓ Your pick</span>}
      </div>
      {estimate}
      {find && (
        <div>
          <div className="tiny muted strong" style={{ marginBottom: 6 }}>
            1 · Open the real options for these dates
          </div>
          <div className="links">{find}</div>
        </div>
      )}
      <div className="tiny muted strong">{find ? '2 · ' : ''}Found one? Paste its link and price</div>
      <div className="pick-fields">
        <label className="field" htmlFor={`${idBase}-url`}>
          <span>Link</span>
          <input
            id={`${idBase}-url`}
            className="input"
            type="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://www.airbnb.co.uk/rooms/…"
            value={url ?? ''}
            onChange={(e) => onUrl(e.target.value.trim() ? e.target.value : undefined)}
          />
        </label>
        <label className="field" htmlFor={`${idBase}-price`}>
          <span>{priceLabel}</span>
          <input
            id={`${idBase}-price`}
            className="input"
            type="text"
            inputMode="decimal"
            placeholder={placeholderPrice !== undefined ? `Estimate ${moneyExact(placeholderPrice)}` : 'e.g. 1450'}
            value={price ?? ''}
            onChange={(e) => onPrice(num(e.target.value))}
          />
        </label>
      </div>
      {url && !safe && <div className="tiny" style={{ color: 'var(--bad)' }}>That doesn’t look like a web link — copy the address from the browser bar.</div>}
      {safe && (
        <div className="row">
          <Ext href={safe} className="btn small primary">
            Open {describeLink(safe)}
          </Ext>
          <button className="link-btn small" type="button" onClick={() => onUrl(undefined)}>
            Remove link
          </button>
        </div>
      )}
    </section>
  );
}

/** Big buttons to the exact pages someone saved. */
export function PickLinks({ picks }: { picks?: RealPicks }) {
  if (!picks) return null;
  const items = [
    { url: safeUrl(picks.outUrl), label: '🛫 My flight out' },
    { url: safeUrl(picks.backUrl), label: '🛬 My flight back' },
    { url: safeUrl(picks.stayUrl), label: `🏠 ${picks.stayName ?? 'My stay'}` },
  ].filter((i): i is { url: string; label: string } => !!i.url);
  if (!items.length) return null;
  return (
    <div className="links">
      {items.map((i) => (
        <Ext key={i.label} href={i.url} className="btn small primary">
          {i.label}
        </Ext>
      ))}
    </div>
  );
}

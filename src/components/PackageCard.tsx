import type { TripPackage } from '../lib/planner';
import { formatDate } from '../lib/dates';
import { money } from '../lib/format';
import { listingImage } from '../lib/images';
import { KIND_LABEL, stayKindArea } from '../lib/stays';
import { SmartImage } from './ui';

/** Short summary of a stay: "Villa · 5 bed · private pool". */
export function stayShort(pkg: TripPackage, withKind = true): string {
  const l = pkg.stay.listing;
  const bits = withKind ? [KIND_LABEL[l.kind]] : [];
  if (l.kind === 'villa' || l.kind === 'apartment') bits.push(pkg.stay.units > 1 ? `${pkg.stay.units} × ${l.bedrooms} bed` : `${l.bedrooms} bed`);
  if (l.kind === 'hotel') bits.push(`${pkg.stay.units} room${pkg.stay.units > 1 ? 's' : ''}`);
  if (l.pool === 'private') bits.push('private pool');
  else if (l.pool === 'shared') bits.push('pool');
  if (l.boardBasis === 'all-inclusive') bits.push('all-inclusive');
  return bits.join(' · ');
}

const flightShort = (pkg: TripPackage) => {
  const direct = pkg.outbound.stops === 0 && pkg.inbound.stops === 0;
  const airline = pkg.outbound.airline === pkg.inbound.airline ? pkg.outbound.airline : `${pkg.outbound.airline} + ${pkg.inbound.airline}`;
  return `${airline} · ${direct ? 'direct' : '1 stop'}`;
};

/** The three headline options: just the essentials. Everything else lives in the trip view. */
export function PackageCard({ pkg, onOpen, onSave, saved }: { pkg: TripPackage; onOpen: () => void; onSave: () => void; saved: boolean }) {
  const l = pkg.stay.listing;
  return (
    <article className="card pkg">
      <button type="button" className="open-combo" onClick={onOpen} aria-label={`View ${pkg.label}: ${stayKindArea(l)}`}>
        <div className="media">
          <SmartImage src={listingImage(l)} alt={`${KIND_LABEL[l.kind]} in ${l.area}`} kind={l.kind} />
          <span className={`tag ${pkg.tone}`}>{pkg.label}</span>
        </div>
        <div className="body">
          <div className="pkg-price">
            <strong>{money(pkg.costs.perPersonBookable)}</strong> <span className="muted small">per person</span>
            {pkg.withinBudget === false && <span className="badge warn">Over budget</span>}
          </div>
          <div className="pkg-lines">
            <div>
              <span aria-hidden>📅</span> {formatDate(pkg.startDate)} – {formatDate(pkg.endDate)} · {pkg.nights} nights
            </div>
            <div>
              <span aria-hidden>🏠</span> {stayKindArea(l)} · {stayShort(pkg, false)}
            </div>
            <div>
              <span aria-hidden>✈️</span> {flightShort(pkg)}
            </div>
          </div>
        </div>
      </button>
      <div className="pkg-actions">
        <button className="btn primary" type="button" onClick={onOpen}>
          View trip
        </button>
        <button className="btn" type="button" onClick={onSave} disabled={saved} aria-label={saved ? 'Saved' : 'Save trip'}>
          {saved ? '✓' : '♡'}
        </button>
      </div>
    </article>
  );
}

/** One-line idea in the "more combinations" list. */
export function ComboRow({ pkg, onOpen }: { pkg: TripPackage; onOpen: () => void }) {
  const l = pkg.stay.listing;
  return (
    <button type="button" className="combo-row" onClick={onOpen}>
      <span className="thumb">
        <SmartImage src={listingImage(l, 160, 160)} alt="" kind={l.kind} />
      </span>
      <span className="text">
        <strong>{pkg.label}</strong>
        <span className="muted small">
          {stayKindArea(l)} · {formatDate(pkg.startDate, { weekday: false })}
        </span>
      </span>
      <span className="price">
        <strong>{money(pkg.costs.perPersonBookable)}</strong>
        <span className="tiny muted">pp</span>
      </span>
      <span className="chev" aria-hidden>
        ›
      </span>
    </button>
  );
}

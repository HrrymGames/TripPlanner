import type { TripPackage } from '../lib/planner';
import { destById } from '../data/destinations';
import { formatRange } from '../lib/dates';
import { money } from '../lib/format';
import { listingImage } from '../lib/images';
import { googleFlightsLink, skyscannerLink, stayLink } from '../lib/links';
import { KIND_LABEL, unitLabel } from '../lib/stays';
import { CostTable, Ext, FlightLine, SmartImage } from './ui';

export function PackageCard({ pkg, onSave, onCustomise, saved }: { pkg: TripPackage; onSave: () => void; onCustomise: () => void; saved: boolean }) {
  const dest = destById(pkg.destId);
  const l = pkg.stay.listing;
  return (
    <article className="card pkg">
      <div className="media">
        <SmartImage src={listingImage(l)} alt={`${KIND_LABEL[l.kind]} in ${l.area}`} kind={l.kind} />
        <span className={`tag ${pkg.tone}`}>{pkg.label}</span>
        <div className="price-tag">
          <strong>{money(pkg.costs.perPersonBookable)}</strong>
          <span className="tiny">per person · {money(pkg.costs.bookableTotal)} total</span>
        </div>
      </div>
      <div className="body">
        <div>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <h3 style={{ fontSize: '1.05rem' }}>{l.name}</h3>
            {pkg.withinBudget === true && <span className="badge good">In budget</span>}
            {pkg.withinBudget === false && <span className="badge warn">Over budget</span>}
          </div>
          <div className="muted small">
            {KIND_LABEL[l.kind]} in {l.area} · ⭐ {l.rating.toFixed(2)} ({l.reviews})
            {l.stars ? ` · ${'★'.repeat(l.stars)}` : ''}
          </div>
        </div>
        <div className="row">
          <span className="badge primary">📅 {formatRange(pkg.startDate, pkg.endDate)}</span>
          <span className="badge">🌙 {pkg.nights} nights</span>
          <span className="badge">☀️ ~{pkg.temp}°C</span>
          {pkg.holiday && <span className="badge warn">🏫 {pkg.holiday}</span>}
        </div>
        {pkg.blurb && <p className="small muted" style={{ margin: 0 }}>{pkg.blurb}</p>}
        <div className="row small">
          <span className="badge">{unitLabel(pkg.stay)}</span>
          {l.pool === 'private' && <span className="badge good">🏊 Private pool</span>}
          {l.pool === 'shared' && <span className="badge primary">🏊 Pool</span>}
          {l.boardBasis === 'all-inclusive' && <span className="badge accent">🍹 All-inclusive</span>}
          {l.boardBasis === 'breakfast' && <span className="badge">🥐 Breakfast</span>}
          {dest.tags.includes('beach') && <span className="badge">🏖️ {l.beachKm} km</span>}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <FlightLine f={pkg.outbound} />
          <FlightLine f={pkg.inbound} />
        </div>
        <details>
          <summary>See full price breakdown</summary>
          <CostTable c={pkg.costs} />
          <p className="tiny muted" style={{ margin: '6px 0 0' }}>
            Hand luggage only{pkg.extras.bagsPerPerson ? ' + hold bags' : ''}. Taxi transfers both ways. Tap Customise to change anything.
          </p>
        </details>
        <div className="links">
          <Ext href={skyscannerLink(pkg.origin, dest, pkg.startDate, pkg.endDate, pkg.travellers)}>Flights · Skyscanner</Ext>
          <Ext href={googleFlightsLink(pkg.origin, dest, pkg.startDate, pkg.endDate, pkg.travellers)}>Google Flights</Ext>
          <Ext href={stayLink(dest, pkg.stay, pkg.startDate, pkg.endDate, pkg.travellers)}>Stay · {l.source}</Ext>
        </div>
        <div className="row" style={{ marginTop: 'auto' }}>
          <button className="btn primary" style={{ flex: 1 }} type="button" onClick={onSave} disabled={saved}>
            {saved ? '✓ Saved' : '♡ Save trip'}
          </button>
          <button className="btn" style={{ flex: 1 }} type="button" onClick={onCustomise}>
            ✏️ Customise
          </button>
        </div>
      </div>
    </article>
  );
}

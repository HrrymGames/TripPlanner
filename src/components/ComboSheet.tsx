import { useMemo, useState } from 'react';
import type { RealPicks } from '../types';
import type { TripPackage } from '../lib/planner';
import { destById } from '../data/destinations';
import { formatRange } from '../lib/dates';
import { computeCosts } from '../lib/costs';
import { money, plural } from '../lib/format';
import { listingImage } from '../lib/images';
import { AMENITY_LABEL, KIND_LABEL, unitLabel } from '../lib/stays';
import { RealPicksEditor } from './RealPicks';
import { CostTable, Sheet, SmartImage } from './ui';

/** Full-screen view of one trip combo: every piece links to the real thing, and real picks can be added before saving. */
export function ComboSheet({ pkg, onClose, onSave, onCustomise, saved }: { pkg: TripPackage; onClose: () => void; onSave: (picks: RealPicks) => void; onCustomise: () => void; saved: boolean }) {
  const dest = destById(pkg.destId);
  const l = pkg.stay.listing;
  const [picks, setPicks] = useState<RealPicks>({});
  const people = pkg.travellers.adults + pkg.travellers.children;
  const costs = useMemo(
    () => computeCosts({ dest, travellers: pkg.travellers, nights: pkg.nights, outbound: pkg.outbound, inbound: pkg.inbound, stay: pkg.stay, extras: pkg.extras, picks }),
    [dest, pkg, picks],
  );
  const usingReal = picks.outPrice !== undefined || picks.backPrice !== undefined || picks.stayPrice !== undefined;

  return (
    <Sheet title={`${pkg.label} · ${dest.name.split(' (')[0]}`} onClose={onClose}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ aspectRatio: '16 / 8', maxWidth: '100%' }}>
          <SmartImage src={listingImage(l, 800, 400)} alt={l.name} kind={l.kind} />
        </div>
        <div className="pad stack" style={{ gap: 6 }}>
          <h3 style={{ fontSize: '1.15rem' }}>{l.name}</h3>
          <div className="small muted">
            {KIND_LABEL[l.kind]} in {l.area} · ⭐ {l.rating.toFixed(2)} · {unitLabel(pkg.stay)}
          </div>
          <div className="row">
            <span className="badge primary">📅 {formatRange(pkg.startDate, pkg.endDate)}</span>
            <span className="badge">🌙 {plural(pkg.nights, 'night')}</span>
            <span className="badge">👥 {plural(people, 'person', 'people')}</span>
            {l.pool !== 'none' && <span className="badge good">🏊 {l.pool === 'private' ? 'Private pool' : 'Pool'}</span>}
          </div>
          <div className="tiny muted">{l.amenities.map((a) => AMENITY_LABEL[a]).join(' · ')}</div>
        </div>
      </div>

      <div className="notice info">
        These are estimates. Tap the buttons to see the real flights for that exact day and real places to stay that match. When you find the one you want,
        paste its link and price below. The total updates and your links are saved with the trip.
      </div>

      <RealPicksEditor
        dest={dest}
        travellers={pkg.travellers}
        checkIn={pkg.startDate}
        checkOut={pkg.endDate}
        outbound={pkg.outbound}
        inbound={pkg.inbound}
        stay={pkg.stay}
        picks={picks}
        onChange={setPicks}
      />

      <section className="card pad">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h3 style={{ fontSize: '1rem' }}>💷 Total</h3>
          {usingReal && <span className="badge good">Using your real prices</span>}
        </div>
        <CostTable c={costs} />
      </section>

      <div className="grid two">
        <button className="btn primary" type="button" onClick={() => onSave(picks)} disabled={saved && !Object.keys(picks).length}>
          {saved && !Object.keys(picks).length ? '✓ Saved' : `♡ Save trip · ${money(costs.perPerson)} pp`}
        </button>
        <button className="btn" type="button" onClick={onCustomise}>
          ✏️ Change dates, flights or stay
        </button>
      </div>
    </Sheet>
  );
}

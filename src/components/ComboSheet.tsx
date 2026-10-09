import { useMemo, useState } from 'react';
import type { FlightOption, RealPicks } from '../types';
import type { TripPackage } from '../lib/planner';
import { destById } from '../data/destinations';
import { formatDate } from '../lib/dates';
import { computeCosts, transferQuote } from '../lib/costs';
import { duration, money, moneyExact, plural } from '../lib/format';
import { listingImage } from '../lib/images';
import { carHireLink, flightDayGoogleLink, safeUrl, stayLink } from '../lib/links';
import { unitLabel } from '../lib/stays';
import { stayShort } from './PackageCard';
import { RealPicksEditor } from './RealPicks';
import { CostTable, Sheet, SmartImage } from './ui';

/** One trip combo, simplified: total up top, one row per thing to book, details folded away. */
export function ComboSheet({ pkg, onClose, onSave, onCustomise, saved }: { pkg: TripPackage; onClose: () => void; onSave: (picks: RealPicks) => void; onCustomise: () => void; saved: boolean }) {
  const dest = destById(pkg.destId);
  const l = pkg.stay.listing;
  const [picks, setPicks] = useState<RealPicks>({});
  const people = pkg.travellers.adults + pkg.travellers.children;
  const costs = useMemo(
    () => computeCosts({ dest, travellers: pkg.travellers, nights: pkg.nights, outbound: pkg.outbound, inbound: pkg.inbound, stay: pkg.stay, extras: pkg.extras, picks }),
    [dest, pkg, picks],
  );
  const transfer = transferQuote(dest, people, l.area);
  const hasPicks = Object.values(picks).some((v) => v !== undefined);
  const stayLinkUrl = safeUrl(picks.stayUrl) ?? stayLink(dest, pkg.stay, pkg.startDate, pkg.endDate, pkg.travellers);

  return (
    <Sheet title={`${pkg.label} · ${dest.name.split(' (')[0]}`} onClose={onClose}>
      <div className="combo-head">
        <div className="combo-img">
          <SmartImage src={listingImage(l, 800, 400)} alt={l.name} kind={l.kind} />
        </div>
        <div>
          <div className="combo-total">
            <strong>{money(costs.perPersonBookable)}</strong> <span className="muted">per person</span>
          </div>
          <div className="muted small">
            {money(costs.bookableTotal)} total for {plural(people, 'person', 'people')} · {formatDate(pkg.startDate)} – {formatDate(pkg.endDate)} · {pkg.nights} nights
            {hasPicks && <span className="badge good" style={{ marginLeft: 6 }}>your prices</span>}
          </div>
        </div>
      </div>

      <div className="card trip-rows">
        <FlightRow f={pkg.outbound} label="Out" price={picks.outPrice} link={safeUrl(picks.outUrl) ?? flightDayGoogleLink(pkg.outbound, pkg.travellers)} />
        <FlightRow f={pkg.inbound} label="Back" price={picks.backPrice} link={safeUrl(picks.backUrl) ?? flightDayGoogleLink(pkg.inbound, pkg.travellers)} />
        {pkg.extras.transfer === 'car-hire' ? (
          <Row
            icon="🚗"
            title={`Car hire · ${plural(pkg.nights, 'day')}`}
            sub={`${dest.airportName} airport → ${l.area}${transfer.km ? ` · ${transfer.km} km` : ''}`}
            price={money(costs.transfers)}
            href={carHireLink(dest, pkg.startDate, pkg.endDate)}
            linkLabel="Compare"
          />
        ) : (
          <Row
            icon="🚕"
            title={`Transfer · ${transfer.vehicleLabel}`}
            sub={`${dest.airportName} airport ⇄ ${l.area}${transfer.km ? ` · ${transfer.km} km, ~${duration(transfer.mins!)}` : ''} · ${money(transfer.perWay)} each way`}
            price={money(transfer.total)}
          />
        )}
        <Row
          icon="🏠"
          title={picks.stayName ?? l.name}
          sub={`${stayShort(pkg)} · ${l.area} · ⭐ ${l.rating.toFixed(1)}`}
          price={money(picks.stayPrice ?? pkg.stay.total)}
          href={stayLinkUrl}
          linkLabel={picks.stayUrl ? 'Open' : l.source}
        />
      </div>

      <details className="fold">
        <summary>Price breakdown</summary>
        <CostTable c={costs} />
        <p className="tiny muted" style={{ margin: '6px 0 0' }}>
          {unitLabel(pkg.stay)}. {pkg.extras.bagsPerPerson ? 'Includes hold bags.' : 'Hand luggage only.'} Estimates — tap the links for live prices.
        </p>
      </details>

      <details className="fold" open={hasPicks}>
        <summary>Found the real ones? Add their links & prices</summary>
        <div style={{ marginTop: 10 }}>
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
        </div>
      </details>

      <div className="sheet-actions">
        <button className="btn primary" type="button" onClick={() => onSave(picks)} disabled={saved && !hasPicks}>
          {saved && !hasPicks ? '✓ Saved' : '♡ Save trip'}
        </button>
        <button className="btn" type="button" onClick={onCustomise}>
          Change things
        </button>
      </div>
    </Sheet>
  );
}

function Row({ icon, title, sub, price, href, linkLabel }: { icon: string; title: string; sub: string; price: string; href?: string; linkLabel?: string }) {
  return (
    <div className="trip-row">
      <span className="ico" aria-hidden>
        {icon}
      </span>
      <div className="text">
        <strong>{title}</strong>
        <span className="muted small">{sub}</span>
      </div>
      <div className="end">
        <strong>{price}</strong>
        {href && (
          <a className="tiny" href={href} target="_blank" rel="noopener noreferrer">
            {linkLabel} ↗
          </a>
        )}
      </div>
    </div>
  );
}

function FlightRow({ f, label, price, link }: { f: FlightOption; label: string; price?: number; link: string }) {
  return (
    <Row
      icon={label === 'Out' ? '🛫' : '🛬'}
      title={`${label} · ${formatDate(f.date)} · ${f.depart} → ${f.arrive}${f.arriveNextDay ? '⁺¹' : ''}`}
      sub={`${f.from} → ${f.to} · ${f.airline} · ${f.stops ? `via ${f.via}` : 'direct'}`}
      price={`${moneyExact(price ?? f.price)} pp`}
      href={link}
      linkLabel="Flights"
    />
  );
}

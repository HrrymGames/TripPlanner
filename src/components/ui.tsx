import { useState, type ReactNode } from 'react';
import type { CostBreakdown, FlightOption, StayKind } from '../types';
import { duration, money, moneyExact } from '../lib/format';
import { formatDate } from '../lib/dates';

export function Stepper({ value, onChange, min = 0, max = 99, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label}`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
        +
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={!!on} onClick={onClick}>
      {children}
    </button>
  );
}

const KIND_EMOJI: Record<StayKind, string> = { villa: '🏡', apartment: '🏢', hotel: '🏨', hostel: '🛏️' };

/** Image that falls back to a soft gradient + emoji when offline or blocked. */
export function SmartImage({ src, alt, kind, emoji }: { src?: string | null; alt: string; kind?: StayKind; emoji?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="media-fallback" role="img" aria-label={alt}>
        {emoji ?? (kind ? KIND_EMOJI[kind] : '🌍')}
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function Ext({ href, children, className = 'btn small' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span aria-hidden>↗</span>
    </a>
  );
}

export function FlightLine({ f, compact }: { f: FlightOption; compact?: boolean }) {
  return (
    <div className="flight-line">
      <span className="dir" aria-hidden>
        {f.direction === 'out' ? '🛫' : '🛬'}
      </span>
      <div>
        <div className="strong">
          {f.depart} {f.from} → {f.arrive}
          {f.arriveNextDay ? '⁺¹' : ''} {f.to}
        </div>
        <div className="muted small">
          {!compact && `${formatDate(f.date)} · `}
          {f.airline} · {duration(f.durationMins)} · {f.stops ? `1 stop (${f.via})` : 'Direct'}
        </div>
      </div>
      <div className="strong">{moneyExact(f.price)}</div>
    </div>
  );
}

export function CostTable({ c, bagsLabel }: { c: CostBreakdown; bagsLabel?: string }) {
  return (
    <table className="breakdown">
      <tbody>
        <tr>
          <td>✈️ Flights ({c.people} × return)</td>
          <td>{money(c.flights)}</td>
        </tr>
        {c.bags > 0 && (
          <tr>
            <td>🧳 Hold bags{bagsLabel ? ` (${bagsLabel})` : ''}</td>
            <td>{money(c.bags)}</td>
          </tr>
        )}
        <tr>
          <td>🏠 Accommodation</td>
          <td>{money(c.stay)}</td>
        </tr>
        {c.transfers > 0 && (
          <tr>
            <td>🚕 Transfers / car</td>
            <td>{money(c.transfers)}</td>
          </tr>
        )}
        {c.insurance > 0 && (
          <tr>
            <td>🛡️ Travel insurance</td>
            <td>{money(c.insurance)}</td>
          </tr>
        )}
        <tr className="total">
          <td>To book</td>
          <td>
            {money(c.bookableTotal)}
            <div className="muted tiny">{money(c.perPersonBookable)} pp</div>
          </td>
        </tr>
        {c.spending > 0 && (
          <>
            <tr className="sub">
              <td>🍽️ Food, drinks & fun (estimate)</td>
              <td>{money(c.spending)}</td>
            </tr>
            <tr className="total">
              <td>Whole trip</td>
              <td>
                {money(c.grandTotal)}
                <div className="muted tiny">{money(c.perPerson)} pp</div>
              </td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  );
}

export function Sheet({ title, onClose, children, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3 style={{ fontSize: '1.05rem' }}>{title}</h3>
          <div className="row">
            {actions}
            <button className="btn small" type="button" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

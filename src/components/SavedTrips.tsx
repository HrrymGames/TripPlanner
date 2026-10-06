import { useRef, useState } from 'react';
import type { Trip } from '../types';
import { destById } from '../data/destinations';
import { originByCode } from '../data/airports';
import { addDays, diffDays, formatDate, formatRange, todayISO } from '../lib/dates';
import { duration, money, plural } from '../lib/format';
import { listingImage, useDestinationImage } from '../lib/images';
import { carHireLink, googleFlightsLink, insuranceLink, skyscannerLink, stayLink, transferLink, airlineLink } from '../lib/links';
import { unitLabel, KIND_LABEL } from '../lib/stays';
import { downloadFile, tripToICS } from '../lib/ics';
import { tripSummaryText } from '../lib/trips';
import { CostTable, Ext, Sheet, SmartImage } from './ui';

interface Props {
  trips: Trip[];
  onUpdate: (t: Trip) => void;
  onDelete: (id: string) => void;
  onEdit: (t: Trip) => void;
  onDuplicate: (t: Trip) => void;
  onImport: (trips: Trip[]) => void;
  toast: (msg: string) => void;
  goPlan: () => void;
}

export function SavedTrips({ trips, onUpdate, onDelete, onEdit, onDuplicate, onImport, toast, goPlan }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const open = trips.find((t) => t.id === openId);
  const today = todayISO();
  const sorted = [...trips].sort((a, b) => {
    const pa = a.endDate < today ? 1 : 0;
    const pb = b.endDate < today ? 1 : 0;
    return pa - pb || a.startDate.localeCompare(b.startDate);
  });

  const exportAll = () => {
    downloadFile(`trip-booker-backup-${today}.json`, JSON.stringify(trips, null, 2), 'application/json');
    toast('Backup downloaded');
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('bad');
      const valid = data.filter((t) => t && t.id && t.destId && t.startDate);
      onImport(valid);
      toast(`Imported ${plural(valid.length, 'trip')}`);
    } catch {
      toast('That file isn’t a Trip Booker backup');
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row between">
        <div>
          <h1 className="section-title" style={{ fontSize: '1.5rem' }}>
            Saved trips
          </h1>
          <div className="muted small">Saved on this device. Use backup to move them to your phone or iPad.</div>
        </div>
        <div className="row">
          <button className="btn small" type="button" onClick={exportAll} disabled={!trips.length}>
            ⬇️ Backup
          </button>
          <button className="btn small" type="button" onClick={() => fileRef.current?.click()}>
            ⬆️ Restore
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {trips.length === 0 && (
        <div className="card empty">
          <div className="big">🧳</div>
          <p>No saved trips yet. Plan one and tap “Save trip” — flights, stay, links and costs are all kept together here.</p>
          <button className="btn primary" type="button" onClick={goPlan}>
            ✨ Plan a trip
          </button>
        </div>
      )}

      <div className="grid two">
        {sorted.map((t) => (
          <TripCard key={t.id} trip={t} onOpen={() => setOpenId(t.id)} />
        ))}
      </div>

      {open && (
        <TripDetail
          trip={open}
          onClose={() => setOpenId(null)}
          onUpdate={onUpdate}
          onDelete={() => {
            if (confirm(`Delete “${open.name}”?`)) {
              onDelete(open.id);
              setOpenId(null);
            }
          }}
          onEdit={() => {
            setOpenId(null);
            onEdit(open);
          }}
          onDuplicate={() => {
            onDuplicate(open);
            setOpenId(null);
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

function bookedCount(t: Trip) {
  const items = [!!t.outbound || !!t.inbound, !!t.stay, t.extras.transfer !== 'none', t.extras.insurance];
  const keys: (keyof Trip['booked'])[] = ['flights', 'stay', 'transfers', 'insurance'];
  const relevant = keys.filter((_, i) => items[i]);
  return { done: relevant.filter((k) => t.booked[k]).length, total: relevant.length };
}

function TripCard({ trip, onOpen }: { trip: Trip; onOpen: () => void }) {
  const dest = destById(trip.destId);
  const img = useDestinationImage(dest);
  const { done, total } = bookedCount(trip);
  const daysTo = diffDays(todayISO(), trip.startDate);
  const past = trip.endDate < todayISO();
  return (
    <button type="button" className="card trip-card" onClick={onOpen}>
      <div className="thumb">
        <SmartImage src={img} alt={dest.name} emoji="🌴" />
      </div>
      <div className="stack" style={{ gap: 4, minWidth: 0 }}>
        <div className="row between">
          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trip.name}</strong>
          {past ? <span className="badge">Past</span> : daysTo >= 0 ? <span className="badge accent">{daysTo === 0 ? 'Today!' : `${daysTo} days to go`}</span> : <span className="badge good">On now</span>}
        </div>
        <div className="small muted">
          {formatRange(trip.startDate, trip.endDate)} · {plural(trip.travellers.adults + trip.travellers.children, 'person', 'people')}
        </div>
        <div className="small">
          <strong>{money(trip.costs.perPerson)}</strong> pp · {money(trip.costs.grandTotal)} total
        </div>
        <div className="row" style={{ gap: 6 }}>
          <div className="progress" style={{ flex: 1 }}>
            <div style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <span className="tiny muted">
            {done}/{total} booked
          </span>
        </div>
      </div>
    </button>
  );
}

function TripDetail({
  trip,
  onClose,
  onUpdate,
  onDelete,
  onEdit,
  onDuplicate,
  toast,
}: {
  trip: Trip;
  onClose: () => void;
  onUpdate: (t: Trip) => void;
  onDelete: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  toast: (m: string) => void;
}) {
  const dest = destById(trip.destId);
  const img = useDestinationImage(dest);
  const people = trip.travellers.adults + trip.travellers.children;
  const setBooked = (k: keyof Trip['booked'], v: boolean) => onUpdate({ ...trip, booked: { ...trip.booked, [k]: v }, updatedAt: new Date().toISOString() });

  const share = async () => {
    const text = tripSummaryText(trip);
    try {
      if (navigator.share) {
        await navigator.share({ title: trip.name, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast('Trip details copied — paste them into the group chat');
    } catch {
      /* user cancelled share sheet */
    }
  };

  const o = trip.outbound;
  const b = trip.inbound;
  const s = trip.stay;
  return (
    <Sheet
      title={trip.name}
      onClose={onClose}
      actions={
        <button className="btn small no-print" type="button" onClick={share}>
          📤 Share
        </button>
      }
    >
      <div className="dest-hero" style={{ minHeight: 150 }}>
        {img && <img src={img} alt={dest.name} />}
        <div className="content">
          <h2 style={{ fontSize: '1.4rem' }}>{dest.name}</h2>
          <div className="small">
            {formatRange(trip.startDate, trip.endDate)} · {plural(trip.nights, 'night')} · {plural(people, 'person', 'people')}
          </div>
        </div>
      </div>

      <label className="field">
        <span>Trip name</span>
        <input className="input" value={trip.name} onChange={(e) => onUpdate({ ...trip, name: e.target.value })} />
      </label>

      <section className="card pad">
        <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>🗺️ Itinerary</h3>
        <ol className="timeline">
          {o && (
            <li>
              <span className="dot">🛫</span>
              <div>
                <div className="strong">
                  {formatDate(o.date, { year: true })} · Fly {originByCode(trip.origin).city === 'London' ? o.from : originByCode(trip.origin).city} → {dest.airportName}
                </div>
                <div className="small muted">
                  {o.airline} {o.flightNo} · {o.depart} → {o.arrive}
                  {o.arriveNextDay ? ' (+1)' : ''} · {duration(o.durationMins)} · {o.stops ? `via ${o.via}` : 'direct'}
                </div>
              </div>
            </li>
          )}
          {trip.extras.transfer !== 'none' && (
            <li>
              <span className="dot">{trip.extras.transfer === 'taxi' ? '🚕' : '🚗'}</span>
              <div>
                <div className="strong">{trip.extras.transfer === 'taxi' ? 'Transfer to your stay' : 'Pick up hire car'}</div>
                <div className="small muted">{s ? `${s.listing.area}` : dest.name}</div>
              </div>
            </li>
          )}
          {s && (
            <li>
              <span className="dot">🏠</span>
              <div>
                <div className="strong">Check in · {s.listing.name}</div>
                <div className="small muted">
                  {KIND_LABEL[s.listing.kind]} in {s.listing.area} · {unitLabel(s)}
                </div>
              </div>
            </li>
          )}
          <li>
            <span className="dot">☀️</span>
            <div>
              <div className="strong">
                {plural(trip.nights, 'night')} in {dest.name}
              </div>
              <div className="small muted">{dest.blurb}</div>
            </div>
          </li>
          {s && (
            <li>
              <span className="dot">🔑</span>
              <div>
                <div className="strong">{formatDate(trip.endDate, { year: true })} · Check out</div>
              </div>
            </li>
          )}
          {b && (
            <li>
              <span className="dot">🛬</span>
              <div>
                <div className="strong">Fly home · {b.from} → {b.to}</div>
                <div className="small muted">
                  {b.airline} {b.flightNo} · {b.depart} → {b.arrive}
                  {b.arriveNextDay ? ' (+1)' : ''} · {duration(b.durationMins)}
                </div>
              </div>
            </li>
          )}
        </ol>
      </section>

      <section className="card pad">
        <h3 style={{ fontSize: '1rem', marginBottom: 4 }}>✅ Booking checklist</h3>
        <p className="tiny muted" style={{ margin: '0 0 6px' }}>
          Tick things off as you book them.
        </p>
        {(o || b) && (
          <div className="check-row">
            <input type="checkbox" checked={trip.booked.flights} onChange={(e) => setBooked('flights', e.target.checked)} aria-label="Flights booked" />
            <div>
              <div className="strong">Flights · {money(trip.costs.flights + trip.costs.bags)}</div>
              <div className="tiny muted">
                {o?.airline}
                {b && b.airline !== o?.airline ? ` + ${b.airline}` : ''} for {plural(people, 'person', 'people')}
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Ext href={skyscannerLink(trip.origin, dest, trip.startDate, trip.endDate, trip.travellers)}>Skyscanner</Ext>
              {o && <Ext href={airlineLink(o)}>{o.airline}</Ext>}
            </div>
          </div>
        )}
        {s && (
          <div className="check-row">
            <input type="checkbox" checked={trip.booked.stay} onChange={(e) => setBooked('stay', e.target.checked)} aria-label="Stay booked" />
            <div>
              <div className="strong">Stay · {money(s.total)}</div>
              <div className="tiny muted">{s.listing.name}</div>
            </div>
            <Ext href={stayLink(dest, s, trip.startDate, trip.endDate, trip.travellers)}>{s.listing.source}</Ext>
          </div>
        )}
        {trip.extras.transfer !== 'none' && (
          <div className="check-row">
            <input type="checkbox" checked={trip.booked.transfers} onChange={(e) => setBooked('transfers', e.target.checked)} aria-label="Transfers booked" />
            <div>
              <div className="strong">
                {trip.extras.transfer === 'taxi' ? 'Transfers' : 'Car hire'} · {money(trip.costs.transfers)}
              </div>
            </div>
            <Ext href={trip.extras.transfer === 'taxi' ? transferLink(dest) : carHireLink(dest, trip.startDate, trip.endDate)}>Find</Ext>
          </div>
        )}
        {trip.extras.insurance && (
          <div className="check-row">
            <input type="checkbox" checked={trip.booked.insurance} onChange={(e) => setBooked('insurance', e.target.checked)} aria-label="Insurance booked" />
            <div>
              <div className="strong">Travel insurance · {money(trip.costs.insurance)}</div>
            </div>
            <Ext href={insuranceLink()}>Compare</Ext>
          </div>
        )}
      </section>

      {s && (
        <section className="card" style={{ overflow: 'hidden' }}>
          <div style={{ aspectRatio: '16 / 8' }}>
            <SmartImage src={listingImage(s.listing, 800, 400)} alt={s.listing.name} kind={s.listing.kind} />
          </div>
          <div className="pad small">
            <strong>{s.listing.name}</strong> · ⭐ {s.listing.rating.toFixed(2)} · {s.listing.pool !== 'none' ? `🏊 ${s.listing.pool} pool · ` : ''}
            {s.listing.bedrooms * (s.listing.kind === 'hotel' ? s.units : 1)} {s.listing.kind === 'hotel' ? 'rooms' : 'bedrooms'}
          </div>
        </section>
      )}

      <section className="card pad">
        <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>💷 Costs</h3>
        <CostTable c={trip.costs} />
        <p className="tiny muted" style={{ margin: '8px 0 0' }}>
          Estimated when saved on {formatDate(trip.updatedAt.slice(0, 10), { year: true })}. Re-check live prices before booking.
        </p>
      </section>

      <label className="field">
        <span>Notes</span>
        <textarea className="textarea" rows={3} placeholder="Who's paid, room plans, things to do…" value={trip.notes} onChange={(e) => onUpdate({ ...trip, notes: e.target.value })} />
      </label>

      <div className="grid two no-print">
        <button className="btn" type="button" onClick={onEdit}>
          ✏️ Edit in planner
        </button>
        <button className="btn" type="button" onClick={() => downloadFile(`${trip.name}.ics`, tripToICS(trip), 'text/calendar')}>
          📅 Add to calendar
        </button>
        <button className="btn" type="button" onClick={onDuplicate}>
          ⧉ Duplicate
        </button>
        <button className="btn" type="button" onClick={() => window.print()}>
          🖨️ Print / PDF
        </button>
        <Ext href={googleFlightsLink(trip.origin, dest, trip.startDate, addDays(trip.startDate, trip.nights), trip.travellers)} className="btn">
          Re-check flights
        </Ext>
        <button className="btn" type="button" style={{ color: 'var(--bad)' }} onClick={onDelete}>
          🗑️ Delete
        </button>
      </div>
    </Sheet>
  );
}

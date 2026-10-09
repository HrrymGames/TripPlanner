import { useMemo, useState } from 'react';
import type { Amenity, FlightOption, StayFilters, StayKind, StaySource } from '../types';
import { DESTINATIONS, destById } from '../data/destinations';
import { ORIGINS, originByCode } from '../data/airports';
import { formatDate, formatRange, todayISO, addDays, schoolHolidayOn } from '../lib/dates';
import { duration, money, moneyExact, plural } from '../lib/format';
import { listingImage, useDestinationImage } from '../lib/images';
import { airbnbLink, bookingLink, carHireLink, googleFlightsLink, kayakLink, skyscannerLink, stayLink, vrboLink, flightDayGoogleLink, insuranceLink, transferLink } from '../lib/links';
import { AMENITY_LABEL, DEFAULT_FILTERS, KIND_LABEL, searchStays, stayKindArea, stayTitle, unitLabel } from '../lib/stays';
import { insuranceCost, transferCost, transferQuote } from '../lib/costs';
import { avgTemp } from '../lib/season';
import type { PlannerDraft, ResolvedDraft } from '../lib/trips';
import { PriceCalendar } from './PriceCalendar';
import { findPlaces } from '../lib/geo';
import { RealPicksEditor } from './RealPicks';
import { Chip, CostTable, Ext, Segmented, SmartImage, Stepper } from './ui';

interface Props {
  draft: PlannerDraft;
  setDraft: (fn: (d: PlannerDraft) => PlannerDraft) => void;
  resolved: ResolvedDraft;
  onSave: () => void;
  onReset: () => void;
}

const BAG_OPTIONS = [
  { value: 0, label: 'Hand luggage' },
  { value: 0.5, label: 'Share bags' },
  { value: 1, label: '1 bag each' },
  { value: 2, label: '2 each' },
];

const FILTER_AMENITIES: Amenity[] = ['aircon', 'hot-tub', 'sea-view', 'parking', 'bbq', 'kitchen', 'garden', 'games-room', 'gym', 'spa', 'pet-friendly', 'washing-machine'];

export function StepPlanner({ draft, setDraft, resolved, onSave, onReset }: Props) {
  const dest = destById(draft.destId);
  const people = draft.travellers.adults + draft.travellers.children;
  const img = useDestinationImage(dest);
  const [showAllStays, setShowAllStays] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const month = draft.viewMonth ?? (draft.startDate ?? addDays(todayISO(), 30)).slice(0, 7);
  const { outbound, inbound, outOptions, backOptions, endDate, stay, costs } = resolved;

  const update = (patch: Partial<PlannerDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setFilters = (patch: Partial<StayFilters>) => setDraft((d) => ({ ...d, filters: { ...d.filters, ...patch } }));

  const transfer = transferQuote(dest, people, stay?.listing.area);

  const stays = useMemo(
    () => (draft.startDate ? searchStays(draft.destId, draft.startDate, draft.nights, people, draft.filters) : []),
    [draft.destId, draft.startDate, draft.nights, people, draft.filters],
  );
  const visibleStays = showAllStays ? stays : stays.slice(0, 8);

  const stepsDone = [true, !!(draft.startDate && outbound && inbound), !!stay, true, false];
  const countries = useMemo(() => Array.from(new Set(DESTINATIONS.map((d) => d.country))), []);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const searchOpts = draft.startDate && endDate
    ? {
        checkIn: draft.startDate,
        checkOut: endDate,
        travellers: draft.travellers,
        minBedrooms: draft.filters.minBedrooms || undefined,
        minBeds: draft.filters.minBeds || undefined,
        pool: draft.filters.pool !== 'any',
        amenities: draft.filters.amenities,
        area: draft.filters.area,
        maxPerNight: draft.filters.maxPerNight,
        kind: draft.filters.kinds.length === 1 ? draft.filters.kinds[0] : undefined,
      }
    : undefined;

  // New dates make any pasted real links/prices stale.
  const pickDate = (iso: string) => update({ startDate: iso, outboundId: undefined, inboundId: undefined, viewMonth: iso.slice(0, 7), picks: undefined });

  return (
    <div className="planner">
      <div className="stack" style={{ gap: 16 }}>
        <div className="step-progress" aria-hidden>
          {['where', 'dates', 'stay', 'extras', 'summary'].map((s, i) => (
            <a key={s} href={`#step-${s}`} className={stepsDone[i] ? 'done' : ''} />
          ))}
        </div>

        {/* Step 1 */}
        <section id="step-where" className="card pad step">
          <div className="step-head">
            <span className="step-num done">1</span>
            <h2 className="section-title">Where & who</h2>
            <button className="btn small ghost" style={{ marginLeft: 'auto' }} type="button" onClick={onReset}>
              Start over
            </button>
          </div>
          <div className="grid two">
            <PlaceSearch
              current={dest.geo?.label}
              onPick={(id) => update({ destId: id, stayId: undefined, outboundId: undefined, inboundId: undefined, picks: undefined, filters: { ...draft.filters, area: undefined } })}
            />
            <label className="field">
              <span>Or pick a popular one</span>
              <select
                className="select"
                value={dest.geo ? '' : draft.destId}
                onChange={(e) => e.target.value && update({ destId: e.target.value, stayId: undefined, outboundId: undefined, inboundId: undefined, filters: { ...draft.filters, area: undefined } })}
              >
                {dest.geo && <option value="">{dest.geo.label}</option>}
                {countries.map((c) => (
                  <optgroup key={c} label={c}>
                    {DESTINATIONS.filter((d) => d.country === c).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Flying from</span>
              <select className="select" value={draft.origin} onChange={(e) => update({ origin: e.target.value, outboundId: undefined, inboundId: undefined })}>
                {ORIGINS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Adults</span>
              <Stepper label="adults" value={draft.travellers.adults} min={1} max={30} onChange={(v) => update({ travellers: { ...draft.travellers, adults: v } })} />
            </div>
            <div className="field">
              <span>Children</span>
              <Stepper label="children" value={draft.travellers.children} min={0} max={20} onChange={(v) => update({ travellers: { ...draft.travellers, children: v } })} />
            </div>
            <div className="field">
              <span>How many nights?</span>
              <div className="row">
                <Stepper
                  label="nights"
                  value={draft.nights}
                  min={1}
                  max={30}
                  onChange={(v) => {
                    setDraft((d) => ({ ...d, nights: v, inboundId: undefined }));
                  }}
                />
                <div className="scroll-x" style={{ margin: 0, padding: 0 }}>
                  {[3, 4, 7, 10, 14].map((n) => (
                    <Chip key={n} on={draft.nights === n} onClick={() => setDraft((d) => ({ ...d, nights: n, inboundId: undefined }))}>
                      {n === 7 ? '1 week' : n === 14 ? '2 weeks' : `${n}`}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="dest-hero" style={{ marginTop: 14, minHeight: 140 }}>
            {img && <img src={img} alt={dest.name} />}
            <div className="content">
              <h2 style={{ fontSize: '1.3rem' }}>{dest.name}</h2>
              <div className="small" style={{ opacity: 0.9 }}>
                {dest.blurb} · ✈️ {dest.flightHours}h
              </div>
            </div>
          </div>
        </section>

        {/* Step 2 */}
        <section id="step-dates" className="card pad step">
          <div className="step-head">
            <span className={`step-num ${stepsDone[1] ? 'done' : ''}`}>2</span>
            <div>
              <h2 className="section-title">Pick your dates & flights</h2>
              <div className="muted small">Prices under each date are return flights per person for {plural(draft.nights, 'night')}.</div>
            </div>
          </div>
          <div className="stack">
            <div className="row">
              <Segmented options={BAG_OPTIONS} value={draft.extras.bagsPerPerson} onChange={(v) => update({ extras: { ...draft.extras, bagsPerPerson: v } })} />
              <Chip on={draft.directOnly} onClick={() => update({ directOnly: !draft.directOnly, outboundId: undefined, inboundId: undefined })}>
                Direct only
              </Chip>
            </div>
            <PriceCalendar
              origin={draft.origin}
              destId={draft.destId}
              nights={draft.nights}
              bagsPerPerson={draft.extras.bagsPerPerson}
              directOnly={draft.directOnly}
              month={month}
              onMonth={(m) => update({ viewMonth: m })}
              selected={draft.startDate}
              onSelect={pickDate}
            />
            {draft.startDate && endDate && (
              <>
                <div className="notice info">
                  {formatRange(draft.startDate, endDate)} · ~{avgTemp(dest, draft.startDate)}°C
                  {schoolHolidayOn(draft.startDate) ? ` · ${schoolHolidayOn(draft.startDate)} (busier & pricier)` : ''}
                </div>
                <FlightChooser
                  title={`🛫 Out · ${formatDate(draft.startDate)}`}
                  options={outOptions}
                  selectedId={draft.outboundId}
                  bags={draft.extras.bagsPerPerson}
                  people={people}
                  travellers={draft.travellers}
                  onPick={(id) => update({ outboundId: id })}
                />
                <FlightChooser
                  title={`🛬 Back · ${formatDate(endDate)}`}
                  options={backOptions}
                  selectedId={draft.inboundId}
                  bags={draft.extras.bagsPerPerson}
                  people={people}
                  travellers={draft.travellers}
                  onPick={(id) => update({ inboundId: id })}
                />
                <div className="links">
                  <Ext href={skyscannerLink(draft.origin, dest, draft.startDate, endDate, draft.travellers, draft.directOnly)}>Check live on Skyscanner</Ext>
                  <Ext href={googleFlightsLink(draft.origin, dest, draft.startDate, endDate, draft.travellers)}>Google Flights</Ext>
                  <Ext href={kayakLink(draft.origin, dest, draft.startDate, endDate, draft.travellers)}>Kayak</Ext>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Step 3 */}
        <section id="step-stay" className="card pad step">
          <div className="step-head">
            <span className={`step-num ${stepsDone[2] ? 'done' : ''}`}>3</span>
            <div>
              <h2 className="section-title">Where to stay</h2>
              <div className="muted small">Types of stay that fit {plural(people, 'person', 'people')}, with estimated prices. Each “Search” link opens Airbnb, Booking.com or Vrbo with matching filters so you can pick a real place.</div>
            </div>
          </div>
          {!draft.startDate ? (
            <p className="muted">Pick your dates first so we can price the stays.</p>
          ) : (
            <div className="stack">
              <button className="btn small" style={{ alignSelf: 'flex-start' }} type="button" onClick={() => setShowFilters((s) => !s)}>
                {showFilters ? 'Hide filters' : 'Show filters'} ⚙️
              </button>
              {showFilters && (
                <div className="filters">
                  <div className="field">
                    <span>Type</span>
                    <div className="row">
                      {(['villa', 'apartment', 'hotel', 'hostel'] as StayKind[]).map((k) => (
                        <Chip key={k} on={draft.filters.kinds.includes(k)} onClick={() => setFilters({ kinds: toggle(draft.filters.kinds, k) })}>
                          {KIND_LABEL[k]}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <span>Pool</span>
                    <Segmented
                      options={[
                        { value: 'any', label: 'Don’t mind' },
                        { value: 'pool', label: '🏊 Pool' },
                        { value: 'private', label: 'Private pool' },
                      ]}
                      value={draft.filters.pool}
                      onChange={(v) => setFilters({ pool: v as StayFilters['pool'] })}
                    />
                  </div>
                  <div className="grid two">
                    <div className="field">
                      <span>Bedrooms (total)</span>
                      <Stepper label="bedrooms" value={draft.filters.minBedrooms} min={0} max={15} onChange={(v) => setFilters({ minBedrooms: v })} />
                    </div>
                    <div className="field">
                      <span>Beds (total)</span>
                      <Stepper label="beds" value={draft.filters.minBeds} min={0} max={30} onChange={(v) => setFilters({ minBeds: v })} />
                    </div>
                    <label className="field">
                      <span>Max per night (whole group)</span>
                      <input
                        className="input"
                        type="number"
                        inputMode="numeric"
                        placeholder="No limit"
                        value={draft.filters.maxPerNight ?? ''}
                        onChange={(e) => setFilters({ maxPerNight: e.target.value ? Number(e.target.value) : undefined })}
                      />
                    </label>
                    <label className="field">
                      <span>Area</span>
                      <select className="select" value={draft.filters.area ?? ''} onChange={(e) => setFilters({ area: e.target.value || undefined })}>
                        <option value="">Anywhere in {dest.name}</option>
                        {dest.areas.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="field">
                    <span>Must have</span>
                    <div className="row">
                      {FILTER_AMENITIES.map((a) => (
                        <Chip key={a} on={draft.filters.amenities.includes(a)} onClick={() => setFilters({ amenities: toggle(draft.filters.amenities, a) })}>
                          {AMENITY_LABEL[a]}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <span>Booking site</span>
                    <div className="row">
                      {(['Airbnb', 'Booking.com', 'Vrbo', 'Hotels.com'] as StaySource[]).map((s) => (
                        <Chip key={s} on={draft.filters.sources.includes(s)} onClick={() => setFilters({ sources: toggle(draft.filters.sources, s) })}>
                          {s}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div className="row between">
                    <label className="row small">
                      <span className="muted strong">Sort</span>
                      <select className="select" style={{ width: 'auto', minHeight: 40 }} value={draft.filters.sort} onChange={(e) => setFilters({ sort: e.target.value as StayFilters['sort'] })}>
                        <option value="value">Best value</option>
                        <option value="price">Cheapest</option>
                        <option value="rating">Best quality</option>
                        <option value="beach">Nearest beach</option>
                        <option value="centre">Nearest centre</option>
                      </select>
                    </label>
                    <button className="link-btn small" type="button" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
                      Clear filters
                    </button>
                  </div>
                </div>
              )}

              {searchOpts && (
                <div className="links">
                  <Ext href={airbnbLink(dest, searchOpts)}>Search Airbnb</Ext>
                  <Ext href={bookingLink(dest, { ...searchOpts, kind: searchOpts.kind })}>Search Booking.com</Ext>
                  <Ext href={vrboLink(dest, searchOpts)}>Search Vrbo</Ext>
                </div>
              )}

              <div className="muted small">{plural(stays.length, 'type', 'types')} of stay for your group · prices are estimates</div>
              {stays.length === 0 && <div className="notice">Nothing fits those filters for {plural(people, 'person', 'people')} — try removing one.</div>}
              {visibleStays.map((q) => {
                const l = q.listing;
                const selected = draft.stayId === l.id;
                return (
                  <article key={l.id} className="card stay-card" data-selected={selected}>
                    <div className="media">
                      <SmartImage src={listingImage(l)} alt={stayKindArea(l)} kind={l.kind} />
                      <span className={`source ${l.source}`}>{l.source}</span>
                    </div>
                    <div className="body">
                      <div className="stay-head">
                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ fontSize: '1.05rem' }}>{stayKindArea(l)}</h3>
                          <div className="muted small">
                            {unitLabel(q)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="strong" style={{ fontSize: '1.15rem' }}>
                            ≈ {money(q.total)}
                          </div>
                          <div className="tiny muted">
                            {money(q.avgNightly)}/night · {money(q.total / people)} pp
                          </div>
                        </div>
                      </div>
                      <div className="row small">
                        {l.kind !== 'hotel' && l.kind !== 'hostel' && <span className="badge">🛏️ {l.beds * q.units} beds · 🛁 {l.bathrooms * q.units}</span>}
                        {l.pool === 'private' && <span className="badge good">🏊 Private pool</span>}
                        {l.pool === 'shared' && <span className="badge primary">🏊 Shared pool</span>}
                        {l.boardBasis === 'all-inclusive' && <span className="badge accent">🍹 All-inclusive</span>}
                        {l.boardBasis === 'breakfast' && <span className="badge">🥐 Breakfast</span>}
                        <span className="badge">🏖️ {l.beachKm} km · 📍 {l.centreKm} km</span>
                      </div>
                      <div className="tiny muted amen">{l.amenities.map((a) => AMENITY_LABEL[a]).join(' · ')}</div>
                      {q.fees > 0 && <div className="tiny muted">Includes {money(q.fees)} cleaning/service fees</div>}
                      <div className="row">
                        <button className={`btn ${selected ? 'primary' : ''}`} style={{ flex: 1 }} type="button" onClick={() => update({ stayId: selected ? undefined : l.id, picks: draft.picks ? { ...draft.picks, stayUrl: undefined, stayName: undefined, stayPrice: undefined } : undefined })}>
                          {selected ? '✓ Chosen' : 'Choose this'}
                        </button>
                        <Ext href={stayLink(dest, q, draft.startDate!, endDate!, draft.travellers)}>Search {l.source}</Ext>
                      </div>
                    </div>
                  </article>
                );
              })}
              {stays.length > 8 && (
                <button className="btn block" type="button" onClick={() => setShowAllStays((s) => !s)}>
                  {showAllStays ? 'Show fewer' : `Show all ${stays.length}`}
                </button>
              )}
            </div>
          )}
        </section>

        {/* Step 4 */}
        <section id="step-extras" className="card pad step">
          <div className="step-head">
            <span className="step-num done">4</span>
            <h2 className="section-title">Getting around & extras</h2>
          </div>
          <div className="stack">
            <div className="field">
              <span>Airport transfers</span>
              <Segmented
                options={[
                  { value: 'none', label: 'Sort myself' },
                  { value: 'taxi', label: `🚕 ${transfer.vehicleLabel} ${money(transfer.total)}` },
                  { value: 'car-hire', label: `🚗 Car hire ${money(transferCost(dest, people, draft.nights, 'car-hire', stay?.listing.area))}` },
                ]}
                value={draft.extras.transfer}
                onChange={(v) => update({ extras: { ...draft.extras, transfer: v } })}
              />
              <div className="muted small">
                {dest.airportName} airport ⇄ {stay?.listing.area ?? dest.name}
                {transfer.km ? ` · ${transfer.km} km, about ${duration(transfer.mins!)}` : ''} · taxi {money(transfer.perWay)} each way
              </div>
              <div className="links">
                {draft.extras.transfer === 'car-hire' && draft.startDate && endDate && <Ext href={carHireLink(dest, draft.startDate, endDate)}>Compare car hire</Ext>}
                {draft.extras.transfer === 'taxi' && <Ext href={transferLink(dest)}>Find transfers</Ext>}
              </div>
            </div>
            <label className="toggle">
              <span>
                🛡️ Travel insurance <span className="muted small">(~{money(insuranceCost(dest, people, draft.nights))} for the group)</span>
              </span>
              <input type="checkbox" checked={draft.extras.insurance} onChange={(e) => update({ extras: { ...draft.extras, insurance: e.target.checked } })} />
            </label>
            {draft.extras.insurance && <Ext href={insuranceLink()}>Compare insurance</Ext>}
            <label className="toggle">
              <span>
                🍽️ Include spending money estimate <span className="muted small">(~{money(dest.dailySpend)} pp/day for food & drink)</span>
              </span>
              <input type="checkbox" checked={draft.extras.includeSpending} onChange={(e) => update({ extras: { ...draft.extras, includeSpending: e.target.checked } })} />
            </label>
          </div>
        </section>

        {/* Step 5 */}
        <section id="step-summary" className="card pad step">
          <div className="step-head">
            <span className="step-num">5</span>
            <h2 className="section-title">Your trip</h2>
          </div>
          <SummaryBody draft={draft} resolved={resolved} />
          {draft.startDate && endDate && (
            <details style={{ marginTop: 12 }} open={!!draft.picks}>
              <summary>🔗 Found the real ones? Add their links & prices</summary>
              <div style={{ marginTop: 10 }}>
                <RealPicksEditor
                  dest={dest}
                  travellers={draft.travellers}
                  checkIn={draft.startDate}
                  checkOut={endDate}
                  outbound={outbound}
                  inbound={inbound}
                  stay={stay}
                  picks={draft.picks ?? {}}
                  onChange={(picks) => update({ picks: Object.values(picks).some((v) => v !== undefined) ? picks : undefined })}
                />
              </div>
            </details>
          )}
          <label className="field" style={{ marginTop: 12 }}>
            <span>Trip name</span>
            <input className="input" value={draft.name ?? ''} placeholder={`${dest.name.replace(/\s*\(.*\)/, '')} with the gang`} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <button className="btn primary block" style={{ marginTop: 12 }} type="button" onClick={onSave} disabled={!draft.startDate}>
            {draft.editingTripId ? '💾 Update saved trip' : '♡ Save full itinerary'}
          </button>
        </section>
        <div className="planner-spacer" />
      </div>

      <aside className="side">
        <div className="card pad stack">
          <h3 style={{ fontSize: '1.05rem' }}>Running total</h3>
          <SummaryBody draft={draft} resolved={resolved} compact />
          <button className="btn primary block" type="button" onClick={onSave} disabled={!draft.startDate}>
            {draft.editingTripId ? '💾 Update saved trip' : '♡ Save trip'}
          </button>
        </div>
      </aside>

      <div className="mobile-summary">
        <div>
          <div className="tiny" style={{ opacity: 0.8 }}>
            {draft.startDate ? `${dest.name.split(' ')[0]} · ${plural(draft.nights, 'night')}` : 'Pick dates to see the total'}
          </div>
          {draft.startDate && (
            <div className="strong" style={{ fontSize: '1.1rem' }}>
              {money(costs.perPerson)} pp <span className="tiny" style={{ opacity: 0.8 }}>· {money(costs.grandTotal)} total</span>
            </div>
          )}
        </div>
        <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <a className="btn small ghost" style={{ color: 'inherit', borderColor: 'rgba(127,127,127,.4)', background: 'transparent' }} href="#step-summary">
            Summary
          </a>
          {draft.startDate && (
            <button className="btn small" type="button" onClick={onSave}>
              {draft.editingTripId ? 'Update' : '♡ Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FlightChooser({ title, options, selectedId, bags, people, travellers, onPick }: { title: string; options: FlightOption[]; selectedId?: string; bags: number; people: number; travellers: PlannerDraft['travellers']; onPick: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? options : options.slice(0, 4);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="strong">{title}</div>
      {options.length === 0 && <div className="notice">No flights that day — try another date.</div>}
      {shown.map((f) => {
        const pp = f.price + f.bagPrice * bags;
        return (
          <button key={f.id} type="button" className="option" aria-pressed={f.id === selectedId} onClick={() => onPick(f.id)}>
            <div>
              <div className="times">
                {f.depart} → {f.arrive}
                {f.arriveNextDay ? '⁺¹' : ''}
              </div>
              <div className="small muted">
                {f.from} → {f.to} · {duration(f.durationMins)} · {f.stops ? `1 stop via ${f.via}` : 'Direct'}
              </div>
              <div className="small">
                {f.airline} {f.flightNo}
                {f.bagPrice ? ` · bag ${moneyExact(f.bagPrice)}` : ' · bag included'}
              </div>
            </div>
            <div>
              <div className="price">{moneyExact(pp)}</div>
              <div className="tiny muted" style={{ textAlign: 'right' }}>
                {money(pp * people)} group
              </div>
              <a className="tiny" href={flightDayGoogleLink(f, travellers)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                See this day ↗
              </a>
            </div>
          </button>
        );
      })}
      {options.length > 4 && (
        <button className="link-btn small" type="button" onClick={() => setAll((a) => !a)}>
          {all ? 'Fewer flights' : `All ${options.length} flights`}
        </button>
      )}
    </div>
  );
}

function SummaryBody({ draft, resolved, compact }: { draft: PlannerDraft; resolved: ResolvedDraft; compact?: boolean }) {
  const dest = destById(draft.destId);
  const { outbound, inbound, stay, endDate, costs } = resolved;
  const people = draft.travellers.adults + draft.travellers.children;
  const bagsLabel = draft.extras.bagsPerPerson === 0.5 ? '1 per 2 people' : draft.extras.bagsPerPerson ? `${draft.extras.bagsPerPerson} per person` : undefined;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="small">
        <strong>{dest.name}</strong> · {plural(people, 'person', 'people')} · from {originByCode(draft.origin).city}
        <br />
        {draft.startDate && endDate ? formatRange(draft.startDate, endDate) : <span className="muted">No dates yet</span>} · {plural(draft.nights, 'night')}
      </div>
      {!compact && outbound && <div className="small">🛫 {outbound.airline} {outbound.flightNo} · {formatDate(outbound.date)} {outbound.depart} {outbound.from} → {outbound.arrive} {outbound.to}</div>}
      {!compact && inbound && <div className="small">🛬 {inbound.airline} {inbound.flightNo} · {formatDate(inbound.date)} {inbound.depart} {inbound.from} → {inbound.arrive} {inbound.to}</div>}
      {stay ? (
        <div className="small">
          🏠 {stayTitle(stay.listing)} · {unitLabel(stay)}
        </div>
      ) : (
        <div className="small muted">🏠 No stay chosen yet</div>
      )}
      <CostTable c={costs} bagsLabel={bagsLabel} />
    </div>
  );
}

function PlaceSearch({ current, onPick }: { current?: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => findPlaces(q), [q]);
  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <label htmlFor="place-search">
        <span className="muted small strong">Search any town, region or country</span>
      </label>
      <input
        id="place-search"
        className="input"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder={current ?? 'e.g. Wilmington, Delaware, Rehoboth Beach, Tokyo'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {results.length > 0 && (
        <div className="combo-list" role="listbox">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="combo-row"
              style={{ gridTemplateColumns: 'minmax(0, 1fr) 14px', minHeight: 48 }}
              onClick={() => {
                onPick(r.id);
                setQ('');
              }}
            >
              <span className="text">
                <strong>{r.label}</strong>
                <span className="muted tiny">{r.kind === 'city' ? 'Town' : r.kind === 'region' ? 'Region' : 'Country'}</span>
              </span>
              <span className="chev" aria-hidden>
                ›
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

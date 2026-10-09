import { useEffect, useMemo, useState } from 'react';
import type { ParsedRequest } from '../types';
import { ORIGINS, originByCode } from '../data/airports';
import { parseRequest } from '../lib/parse';
import { cheaperAlternatives, planTrips, type DestinationPlan, type PlanResult, type TripPackage } from '../lib/planner';
import { addDays, formatDate, formatRange } from '../lib/dates';
import { money, plural } from '../lib/format';
import { useDestinationImage } from '../lib/images';
import { KIND_LABEL, AMENITY_LABEL } from '../lib/stays';
import { safeGet, safeSet } from '../lib/storage';
import { PackageCard } from './PackageCard';
import { ComboSheet } from './ComboSheet';
import type { RealPicks } from '../types';

const EXAMPLES = [
  'ten people albufeira next summer a week ish',
  '8 lads magaluf july villa with private pool £600 each',
  'family of 4 somewhere hot february half term with a pool',
  'couple city break in march 3 nights under £400 each',
  '6 girls ibiza 5 nights august all inclusive',
  'ski trip for 6 in january chalet with hot tub from manchester',
];

const QUERY_KEY = 'tripbooker.quick.query';
const ORIGIN_KEY = 'tripbooker.origin';

interface Props {
  onSave: (p: TripPackage, picks?: RealPicks) => void;
  onCustomise: (p: TripPackage) => void;
  savedPackageIds: Set<string>;
}

export function QuickPlan({ onSave, onCustomise, savedPackageIds }: Props) {
  const [query, setQuery] = useState(() => safeGet(QUERY_KEY) ?? '');
  const [homeOrigin, setHomeOrigin] = useState(() => safeGet(ORIGIN_KEY) ?? 'LON');
  const [parsed, setParsed] = useState<ParsedRequest | null>(null);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [alternatives, setAlternatives] = useState<DestinationPlan[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [openPkg, setOpenPkg] = useState<TripPackage | null>(null);

  const run = (p: ParsedRequest) => {
    setBusy(true);
    setAlternatives(null);
    // Let the spinner paint before the (synchronous) search runs.
    setTimeout(() => {
      setParsed(p);
      setResult(planTrips(p));
      setBusy(false);
      // On phones, jump down to the answer instead of leaving it below the fold.
      if (window.innerWidth < 768) requestAnimationFrame(() => document.getElementById('qp-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }, 30);
  };

  const submit = (text = query) => {
    const t = text.trim();
    if (!t) return;
    safeSet(QUERY_KEY, t);
    const p = parseRequest(t);
    if (!p.originFound) p.origin = homeOrigin;
    run(p);
    if (typeof window !== 'undefined') (document.activeElement as HTMLElement | null)?.blur?.();
  };

  // Re-run the last search when coming back to the app.
  useEffect(() => {
    if (query.trim()) submit(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeOrigin = (code: string) => {
    setHomeOrigin(code);
    safeSet(ORIGIN_KEY, code);
    if (parsed) run({ ...parsed, origin: code, originFound: true });
  };

  const toggleBudgetMode = () => {
    if (!parsed?.budget) return;
    run({ ...parsed, budget: { ...parsed.budget, per: parsed.budget.per === 'person' ? 'total' : 'person', explicitPer: true }, notes: parsed.notes.filter((n) => !n.startsWith('Read your budget')) });
  };

  const showAlternatives = () => {
    if (!parsed || !result) return;
    setAlternatives(cheaperAlternatives(parsed, result.plans.map((p) => p.dest.id)));
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className={`hero-prompt ${result ? 'compact' : ''}`}>
        <h1>Where are we going?</h1>
        <p>Type it how you'd say it — who, where, when, budget, must-haves. We'll sort flights, places to stay and the total.</p>
        <form
          className="prompt-box"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. ten people albufeira next summer a week ish, villa with a pool, £700 each"
            aria-label="Describe your trip"
            enterKeyHint="search"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button className="btn primary" type="submit" disabled={busy || !query.trim()}>
            {busy ? 'Planning…' : '✨ Plan it'}
          </button>
        </form>
        <div className="scroll-x examples" style={{ marginTop: 12 }}>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="chip"
              onClick={() => {
                setQuery(ex);
                submit(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      {busy && (
        <div className="row" style={{ justifyContent: 'center', padding: 24 }}>
          <div className="spinner" />
          <span className="muted">Checking dates, flights and stays…</span>
        </div>
      )}

      {!busy && parsed && result && (
        <>
          <div id="qp-results" style={{ scrollMarginTop: 72 }} />
          <Understood p={parsed} onToggleBudget={toggleBudgetMode} origin={parsed.origin} onOrigin={changeOrigin} />
          {result.budgetNote && (
            <div className="notice">
              {result.budgetNote}{' '}
              {!alternatives && (
                <button className="link-btn" type="button" onClick={showAlternatives}>
                  Show cheaper places
                </button>
              )}
            </div>
          )}
          {result.plans.length === 0 && (
            <div className="card empty">
              <div className="big">🤔</div>
              <p>Couldn't find flights for that. Try another airport or different dates.</p>
            </div>
          )}
          {result.plans.map((plan) => (
            <PlanSection key={plan.dest.id} plan={plan} onSave={onSave} onCustomise={onCustomise} onOpen={setOpenPkg} savedIds={savedPackageIds} multi={result.plans.length > 1} />
          ))}
          {alternatives?.map((plan) => (
            <PlanSection key={`alt-${plan.dest.id}`} plan={plan} onSave={onSave} onCustomise={onCustomise} onOpen={setOpenPkg} savedIds={savedPackageIds} multi altTitle="Cheaper idea" />
          ))}
          {openPkg && (
            <ComboSheet
              pkg={openPkg}
              saved={savedPackageIds.has(openPkg.id)}
              onClose={() => setOpenPkg(null)}
              onSave={(picks) => {
                onSave(openPkg, picks);
                setOpenPkg(null);
              }}
              onCustomise={() => {
                setOpenPkg(null);
                onCustomise(openPkg);
              }}
            />
          )}
          <p className="disclaimer">
            Prices are smart estimates built from typical fares and rental prices for your dates, group size and season — tap the links to see live prices and book on
            Skyscanner, Google Flights, Airbnb, Booking.com and Vrbo.
          </p>
        </>
      )}

      {!busy && !result && (
        <div className="grid three">
          {[
            ['💬', 'Say it casually', '“10 of us, Albufeira, next summer, a week ish” is all it needs.'],
            ['🧮', 'Everything totted up', 'Flights, bags, villa or hotel, transfers and spending money — per person and total.'],
            ['♡', 'Save the full trip', 'Keep itineraries with flights, stay and booking links, and tick things off as you book.'],
          ].map(([icon, title, text]) => (
            <div key={title} className="card pad">
              <div style={{ fontSize: '1.6rem' }}>{icon}</div>
              <h3 style={{ fontSize: '1rem', margin: '6px 0 4px' }}>{title}</h3>
              <p className="muted small" style={{ margin: 0 }}>
                {text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Understood({ p, onToggleBudget, origin, onOrigin }: { p: ParsedRequest; onToggleBudget: () => void; origin: string; onOrigin: (c: string) => void }) {
  const people = p.travellers.adults + p.travellers.children;
  const chips: string[] = [];
  chips.push(`👥 ${plural(people, 'person', 'people')}${p.travellers.children ? ` (${plural(p.travellers.children, 'child', 'children')})` : ''}`);
  chips.push(`📅 ${p.fixedStart ? formatDate(p.fixedStart, { year: true }) : p.window.label}`);
  chips.push(`🌙 ${p.nights.label}`);
  if (p.stay.kinds.length) chips.push(`🏠 ${p.stay.kinds.map((k) => KIND_LABEL[k]).join(' / ')}`);
  if (p.stay.pool !== 'any') chips.push(p.stay.pool === 'private' ? '🏊 Private pool' : '🏊 Pool');
  if (p.stay.minBedrooms) chips.push(`🛏️ ${p.stay.minBedrooms}+ bedrooms`);
  if (p.stay.allInclusive) chips.push('🍹 All-inclusive');
  if (p.stay.nearBeach) chips.push('🏖️ Near the beach');
  if (p.stay.central) chips.push('📍 Central');
  for (const a of p.stay.amenities) chips.push(`✓ ${AMENITY_LABEL[a]}`);
  if (p.directOnly) chips.push('✈️ Direct only');
  if (p.bagsPerPerson) chips.push('🧳 Hold bags');
  if (p.priority === 'cheap') chips.push('💸 Cheapest first');
  if (p.priority === 'luxury') chips.push('💎 Luxury');
  if (p.vibeTags.length) chips.push(`✨ ${p.vibeTags.join(', ')}`);
  return (
    <section className="card pad stack" style={{ gap: 10 }}>
      <div className="row between">
        <h2 style={{ fontSize: '1rem' }}>Here's what I understood</h2>
        <label className="row small" style={{ gap: 6 }}>
          <span className="muted">Flying from</span>
          <select className="select" style={{ minHeight: 36, padding: '4px 30px 4px 10px', width: 'auto' }} value={origin} onChange={(e) => onOrigin(e.target.value)}>
            {ORIGINS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="understood">
        {chips.map((c) => (
          <span key={c} className="chip static">
            {c}
          </span>
        ))}
        {p.budget && (
          <button type="button" className="chip" aria-pressed onClick={onToggleBudget} title="Tap to switch between per person and total">
            💷 {money(p.budget.amount)} {p.budget.per === 'person' ? 'per person' : 'total'} ⇄
          </button>
        )}
      </div>
      {p.notes.length > 0 && (
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
          {p.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <p className="tiny muted" style={{ margin: 0 }}>
        Flying from {originByCode(origin).name}. Not quite right? Just add it to your message, e.g. “from Leeds”, “4 adults 2 kids”, “£500 each”, “5 nights”.
      </p>
    </section>
  );
}

function PlanSection({
  plan,
  onSave,
  onCustomise,
  onOpen,
  savedIds,
  multi,
  altTitle,
}: {
  plan: DestinationPlan;
  onSave: (p: TripPackage) => void;
  onCustomise: (p: TripPackage) => void;
  onOpen: (p: TripPackage) => void;
  savedIds: Set<string>;
  multi: boolean;
  altTitle?: string;
}) {
  const img = useDestinationImage(plan.dest);
  const [showAll, setShowAll] = useState(false);
  const more = useMemo(() => (showAll ? plan.more : plan.more.slice(0, 3)), [plan.more, showAll]);
  return (
    <section className="stack" style={{ gap: 14 }}>
      <div className="dest-hero">
        {img && <img src={img} alt={plan.dest.name} />}
        <div className="content">
          {(multi || altTitle) && <span className="badge accent">{altTitle ?? plan.matchReason ?? 'Good match'}</span>}
          <h2>{plan.dest.name}</h2>
          <div className="small" style={{ opacity: 0.92 }}>
            {plan.dest.country} · ✈️ {plan.dest.flightHours}h to {plan.dest.airportName} · from {money(plan.cheapestPerPerson)} pp
          </div>
          <div className="small" style={{ opacity: 0.85, marginTop: 4 }}>
            {plan.dest.blurb}
          </div>
        </div>
      </div>

      {plan.bestDates.length > 0 && (
        <div>
          <div className="small strong" style={{ marginBottom: 6 }}>
            🗓️ Best dates (cheapest return flights per person)
          </div>
          <div className="scroll-x">
            {plan.bestDates.map((d, i) => (
              <div key={d.start} className="date-idea">
                <div className="strong small">{formatRange(d.start, addDays(d.start, d.nights))}</div>
                <div className="tiny muted">
                  {d.nights} nights {i === 0 ? '· ★ best' : ''}
                </div>
                <div className="strong" style={{ color: 'var(--cheap)' }}>
                  {money(d.flightsPerPerson)} pp
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan.relaxed.length > 0 && <div className="notice">Nothing matched every filter, so I loosened: {plan.relaxed.join(', ')}.</div>}

      <div className="cards-swipe">
        {plan.headline.map((pkg) => (
          <PackageCard key={pkg.id + pkg.label} pkg={pkg} onSave={() => onSave(pkg)} onCustomise={() => onCustomise(pkg)} onOpen={() => onOpen(pkg)} saved={savedIds.has(pkg.id)} />
        ))}
      </div>

      {plan.more.length > 0 && (
        <>
          <h3 className="section-title" style={{ fontSize: '1.05rem' }}>
            More combinations for {plan.dest.name.split(' ')[0]}
          </h3>
          <div className="grid three">
            {more.map((pkg) => (
              <PackageCard key={pkg.id + pkg.label} pkg={pkg} onSave={() => onSave(pkg)} onCustomise={() => onCustomise(pkg)} onOpen={() => onOpen(pkg)} saved={savedIds.has(pkg.id)} />
            ))}
          </div>
          {plan.more.length > 3 && (
            <button className="btn block" type="button" onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Show fewer' : `Show ${plan.more.length - 3} more combinations`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

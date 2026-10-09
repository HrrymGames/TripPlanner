import { useEffect, useState } from 'react';
import type { ParsedRequest } from '../types';
import { ORIGINS } from '../data/airports';
import { parseRequest } from '../lib/parse';
import { cheaperAlternatives, planTrips, type DestinationPlan, type PlanResult, type TripPackage } from '../lib/planner';
import { formatDate } from '../lib/dates';
import { money } from '../lib/format';
import { useDestinationImage } from '../lib/images';
import { KIND_LABEL, AMENITY_LABEL } from '../lib/stays';
import { safeGet, safeSet } from '../lib/storage';
import { ComboRow, PackageCard } from './PackageCard';
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
        <p>Who, where, when, budget, must-haves. Any town, region or country works.</p>
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
            placeholder="e.g. 10 of us, Delaware, next summer, a week ish, villa with a pool, £700 each"
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
            <PlanSection key={plan.dest.id} plan={plan} onSave={onSave} onOpen={setOpenPkg} savedIds={savedPackageIds} multi={result.plans.length > 1} />
          ))}
          {alternatives?.map((plan) => (
            <PlanSection key={`alt-${plan.dest.id}`} plan={plan} onSave={onSave} onOpen={setOpenPkg} savedIds={savedPackageIds} multi altTitle="Cheaper idea" />
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
  chips.push(`👥 ${people}${p.travellers.children ? ` (${p.travellers.children} kids)` : ''}`);
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
    <section className="stack" style={{ gap: 6 }} aria-label="What I understood">
      <div className="scroll-x understood">
        <label className="chip origin-chip">
          <span aria-hidden>✈️</span>
          <select aria-label="Flying from" value={origin} onChange={(e) => onOrigin(e.target.value)}>
            {ORIGINS.map((o) => (
              <option key={o.code} value={o.code}>
                From {o.name}
              </option>
            ))}
          </select>
        </label>
        {chips.map((c) => (
          <span key={c} className="chip static">
            {c}
          </span>
        ))}
        {p.budget && (
          <button type="button" className="chip" aria-pressed onClick={onToggleBudget} title="Switch between per person and total">
            💷 {money(p.budget.amount)} {p.budget.per === 'person' ? 'pp' : 'total'} ⇄
          </button>
        )}
      </div>
      {p.notes.length > 0 && <p className="tiny muted" style={{ margin: 0 }}>{p.notes.join(' ')}</p>}
    </section>
  );
}

function PlanSection({
  plan,
  onSave,
  onOpen,
  savedIds,
  multi,
  altTitle,
}: {
  plan: DestinationPlan;
  onSave: (p: TripPackage) => void;
  onOpen: (p: TripPackage) => void;
  savedIds: Set<string>;
  multi: boolean;
  altTitle?: string;
}) {
  const img = useDestinationImage(plan.dest);
  return (
    <section className="stack" style={{ gap: 12 }}>
      <div className="dest-hero">
        {img && <img src={img} alt={plan.dest.name} />}
        <div className="content">
          {(multi || altTitle) && <span className="badge accent">{altTitle ?? plan.matchReason ?? 'Good match'}</span>}
          <h2>{plan.dest.name}</h2>
          <div className="small" style={{ opacity: 0.92 }}>
            {plan.dest.geo ? plan.dest.geo.label.split(', ').slice(1).join(', ') || plan.dest.country : plan.dest.country} · ✈️ {plan.dest.airportName} ({plan.dest.airport})
            {plan.dest.geo ? `, ${plan.dest.geo.airportKm} km away` : ''}
          </div>
        </div>
      </div>

      {plan.bestDates.length > 0 && (
        <div className="scroll-x" aria-label="Cheapest flight dates">
          <span className="date-label">Cheapest flights</span>
          {plan.bestDates.map((d, i) => (
            <span key={d.start} className="date-chip">
              {i === 0 && <span aria-hidden>★ </span>}
              {formatDate(d.start, { weekday: false })} · {d.nights}n · <strong>{money(d.flightsPerPerson)}</strong> pp
            </span>
          ))}
        </div>
      )}

      {plan.relaxed.length > 0 && <div className="notice small">Loosened to find matches: {plan.relaxed.join(', ')}.</div>}

      <div className="cards-swipe">
        {plan.headline.map((pkg) => (
          <PackageCard key={pkg.id + pkg.label} pkg={pkg} onSave={() => onSave(pkg)} onOpen={() => onOpen(pkg)} saved={savedIds.has(pkg.id)} />
        ))}
      </div>

      {plan.more.length > 0 && (
        <details className="more-ideas">
          <summary>
            {plan.more.length} more ideas for {plan.dest.name.split(/[ (,]/)[0]}
          </summary>
          <div className="combo-list">
            {plan.more.map((pkg) => (
              <ComboRow key={pkg.id + pkg.label} pkg={pkg} onOpen={() => onOpen(pkg)} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

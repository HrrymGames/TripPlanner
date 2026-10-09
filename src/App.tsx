import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RealPicks, Trip } from './types';
import { QuickPlan } from './components/QuickPlan';
import { StepPlanner } from './components/StepPlanner';
import { SavedTrips } from './components/SavedTrips';
import type { TripPackage } from './lib/planner';
import { loadJSON, loadTrips, safeGet, safeSet, saveJSON, saveTrips } from './lib/storage';
import { DEFAULT_DRAFT, draftToTrip, packageToDraft, packageToTrip, resolveDraft, tripToDraft, type PlannerDraft } from './lib/trips';
import { uid } from './lib/format';

type Tab = 'quick' | 'steps' | 'saved';
const TAB_KEY = 'tripbooker.tab';
const DRAFT_KEY = 'tripbooker.draft.v1';

const TABS: { id: Tab; label: string; short: string; icon: string }[] = [
  { id: 'quick', label: 'Quick plan', short: 'Quick plan', icon: '✨' },
  { id: 'steps', label: 'Step by step', short: 'Step by step', icon: '🗓️' },
  { id: 'saved', label: 'Saved trips', short: 'Saved', icon: '♡' },
];

export default function App() {
  const [tab, setTabState] = useState<Tab>(() => (safeGet(TAB_KEY) as Tab) || 'quick');
  const [trips, setTrips] = useState<Trip[]>(() => loadTrips());
  const [draft, setDraftState] = useState<PlannerDraft>(() => {
    const d = loadJSON(DRAFT_KEY, DEFAULT_DRAFT);
    return { ...d, filters: { ...DEFAULT_DRAFT.filters, ...d.filters }, extras: { ...DEFAULT_DRAFT.extras, ...d.extras } };
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [savedPkgIds, setSavedPkgIds] = useState<Set<string>>(new Set());

  const setTab = (t: Tab) => {
    setTabState(t);
    safeSet(TAB_KEY, t);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => saveTrips(trips), [trips]);
  useEffect(() => saveJSON(DRAFT_KEY, draft), [draft]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2600);
  }, []);

  const setDraft = useCallback((fn: (d: PlannerDraft) => PlannerDraft) => setDraftState((d) => fn(d)), []);
  const resolved = useMemo(() => resolveDraft(draft), [draft]);

  const savePackage = (p: TripPackage, picks?: RealPicks) => {
    setTrips((ts) => [packageToTrip(p, picks), ...ts]);
    setSavedPkgIds((s) => new Set(s).add(p.id));
    toast(picks && Object.keys(picks).length ? 'Saved with your links ♡' : 'Saved to your trips ♡');
  };

  const customise = (p: TripPackage) => {
    setDraftState(packageToDraft(p));
    setTab('steps');
    toast('Loaded into the step-by-step planner');
  };

  const saveDraft = () => {
    const existing = draft.editingTripId ? trips.find((t) => t.id === draft.editingTripId) : undefined;
    const trip = draftToTrip(draft, resolved, existing);
    if (!trip) {
      toast('Pick your dates first');
      return;
    }
    setTrips((ts) => (existing ? ts.map((t) => (t.id === trip.id ? trip : t)) : [trip, ...ts]));
    setDraftState((d) => ({ ...d, editingTripId: trip.id, name: trip.name }));
    toast(existing ? 'Trip updated' : 'Saved to your trips ♡');
  };

  const updateTrip = (t: Trip) => setTrips((ts) => ts.map((x) => (x.id === t.id ? t : x)));
  const deleteTrip = (id: string) => {
    setTrips((ts) => ts.filter((t) => t.id !== id));
    if (draft.editingTripId === id) setDraftState((d) => ({ ...d, editingTripId: undefined }));
    toast('Trip deleted');
  };
  const editTrip = (t: Trip) => {
    setDraftState({ ...DEFAULT_DRAFT, ...tripToDraft(t) });
    setTab('steps');
  };
  const duplicateTrip = (t: Trip) => {
    const now = new Date().toISOString();
    setTrips((ts) => [{ ...t, id: uid(), name: `${t.name} (copy)`, createdAt: now, updatedAt: now, booked: { flights: false, stay: false, transfers: false, insurance: false } }, ...ts]);
    toast('Duplicated');
  };
  const importTrips = (incoming: Trip[]) =>
    setTrips((ts) => {
      const ids = new Set(ts.map((t) => t.id));
      return [...incoming.filter((t) => !ids.has(t.id)), ...ts];
    });

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-logo" aria-hidden>
              ✈
            </span>
            Trip Booker
          </div>
          <nav className="top-tabs" role="tablist" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} role="tab" className="tab-pill" aria-selected={tab === t.id} onClick={() => setTab(t.id)} type="button">
                {t.icon} {t.label}
                {t.id === 'saved' && trips.length > 0 && <span className="count-badge">{trips.length}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main">
        {tab === 'quick' && <QuickPlan onSave={savePackage} onCustomise={customise} savedPackageIds={savedPkgIds} />}
        {tab === 'steps' && <StepPlanner draft={draft} setDraft={setDraft} resolved={resolved} onSave={saveDraft} onReset={() => setDraftState({ ...DEFAULT_DRAFT, origin: draft.origin })} />}
        {tab === 'saved' && (
          <SavedTrips trips={trips} onUpdate={updateTrip} onDelete={deleteTrip} onEdit={editTrip} onDuplicate={duplicateTrip} onImport={importTrips} toast={toast} goPlan={() => setTab('quick')} />
        )}
      </main>

      <nav className="tabbar" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} type="button">
            <span className="ico" aria-hidden>
              {t.icon}
            </span>
            {t.short}
            {t.id === 'saved' && trips.length > 0 && <span className="count-badge">{trips.length}</span>}
          </button>
        ))}
      </nav>

      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

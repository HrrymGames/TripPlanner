import type { Amenity, ISODate, ParsedRequest, StayKind, StaySource, Tag } from '../types';
import { DESTINATIONS, REGION_ALIASES, destById } from '../data/destinations';
import { ORIGINS, originByCode } from '../data/airports';
import { norm, searchPlaces } from './geo';
import { addDays, easterSunday, lastDayOfMonth, makeISO, MONTHS, monthOf, todayISO, yearOf, dayOfWeek, maxISO, schoolHolidays } from './dates';

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, couple: 2, pair: 2, few: 3, several: 4, dozen: 12, half: 0.5,
};

const NUM = '(\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|couple|few|several|dozen)';

/** Like NUM but without "a"/"an"/"couple", so "for a week" or "for a couple of days" isn't read as a group size. */
const GROUP_NUM = '(\\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty)';

function toNum(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const v = Number(s);
  if (!Number.isNaN(v)) return v;
  return NUMBER_WORDS[s.toLowerCase()];
}

const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

function monthIndex(s: string): number {
  return MONTHS.findIndex((m) => m.toLowerCase().startsWith(s.toLowerCase().slice(0, 3)));
}

/** Next occurrence of a month (this year if it hasn't finished, otherwise next year). */
function upcomingMonthYear(month0: number, today: ISODate, forceNext = false): number {
  const y = yearOf(today);
  const m = monthOf(today);
  if (forceNext) return month0 > m ? y : y + 1;
  if (month0 > m) return y;
  if (month0 === m && Number(today.slice(8, 10)) <= 20) return y;
  return y + 1;
}

const SEASONS: Record<string, [number, number]> = {
  spring: [2, 4],
  summer: [5, 7],
  autumn: [8, 10],
  fall: [8, 10],
  winter: [11, 1],
};

interface Window {
  start: ISODate;
  end: ISODate;
  label: string;
  fixedStart?: ISODate;
  fixedEnd?: ISODate;
}

function clampWindow(w: Window, today: ISODate): Window {
  const earliest = addDays(today, 3);
  const start = maxISO(w.start, earliest);
  const end = w.end < start ? addDays(start, 30) : w.end;
  return { ...w, start, end };
}

function parseWindow(text: string, today: ISODate): Window | undefined {
  const y = yearOf(today);
  const yearMatch = text.match(/\b(20[2-4]\d)\b/);
  const explicitYear = yearMatch ? Number(yearMatch[1]) : undefined;

  // Explicit date ranges: "12-19 june", "12th june to 19th june", "june 12 - june 19"
  const dayMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_RE}\\b`, 'g');
  const monthDay = new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?:people|persons|adults|of us|kids|children|nights?|days?|weeks?|friends|mates|guests|bed))`, 'g');
  const found: ISODate[] = [];
  for (const m of text.matchAll(dayMonth)) {
    const mi = monthIndex(m[2]);
    const yr = explicitYear ?? upcomingMonthYear(mi, today);
    found.push(makeISO(yr, mi, Number(m[1])));
  }
  if (!found.length) {
    for (const m of text.matchAll(monthDay)) {
      const mi = monthIndex(m[1]);
      const yr = explicitYear ?? upcomingMonthYear(mi, today);
      found.push(makeISO(yr, mi, Number(m[2])));
    }
  }
  const rangeShort = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|to|until|till)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b`));
  if (rangeShort) {
    const mi = monthIndex(rangeShort[3]);
    const yr = explicitYear ?? upcomingMonthYear(mi, today);
    const s = makeISO(yr, mi, Number(rangeShort[1]));
    const e = makeISO(yr, mi, Number(rangeShort[2]));
    return { start: s, end: s, label: 'your dates', fixedStart: s, fixedEnd: e };
  }
  const numeric = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)].map((m) => {
    const mi = Number(m[2]) - 1;
    const yr = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : upcomingMonthYear(mi, today);
    return makeISO(yr, mi, Number(m[1]));
  });
  found.push(...numeric.filter((d) => !Number.isNaN(Date.parse(d))));
  if (found.length) {
    found.sort();
    const s = found[0] < today ? addDays(found[0], 365) : found[0];
    const e = found.length > 1 ? found[found.length - 1] : undefined;
    return { start: s, end: s, label: 'your dates', fixedStart: s, fixedEnd: e && e > s ? e : undefined };
  }

  const next = /\bnext\b/;
  // Holidays
  if (/\beaster\b/.test(text)) {
    let e = easterSunday(explicitYear ?? y);
    if (e < today) e = easterSunday((explicitYear ?? y) + 1);
    return { start: addDays(e, -10), end: addDays(e, 7), label: `Easter ${yearOf(e)}` };
  }
  if (/\b(christmas|xmas)\b/.test(text)) {
    const yr = explicitYear ?? (monthOf(today) === 11 && Number(today.slice(8)) > 20 ? y + 1 : y);
    return { start: makeISO(yr, 11, 18), end: makeISO(yr, 11, 27), label: `Christmas ${yr}` };
  }
  if (/\b(new years?|nye|new year'?s eve)\b/.test(text)) {
    const yr = explicitYear ? explicitYear - 1 : y;
    return { start: makeISO(yr, 11, 27), end: makeISO(yr, 11, 31), label: `New Year ${yr + 1}` };
  }
  const halfTerm = text.match(/\b(feb(?:ruary)?|may|oct(?:ober)?)?\s*half[ -]?term\b/);
  if (halfTerm) {
    const all = [...schoolHolidays(y), ...schoolHolidays(y + 1)].filter((h) => h.name.includes('half term') && h.start > today);
    const wanted = halfTerm[1] ? all.find((h) => h.name.toLowerCase().startsWith(halfTerm[1].slice(0, 3))) : all[0];
    if (wanted) return { start: wanted.start, end: addDays(wanted.end, -2), label: `${wanted.name} ${yearOf(wanted.start)}` };
  }
  if (/\b(summer holidays|school holidays|summer hols)\b/.test(text)) {
    const yr = explicitYear ?? (makeISO(y, 7, 25) < today ? y + 1 : y);
    return { start: makeISO(yr, 6, 19), end: makeISO(yr, 7, 28), label: `Summer holidays ${yr}` };
  }

  // Relative
  if (/\b(this|next) weekend\b/.test(text)) {
    let fri = addDays(today, 1);
    while (dayOfWeek(fri) !== 5) fri = addDays(fri, 1);
    if (/next weekend/.test(text)) fri = addDays(fri, 7);
    return { start: fri, end: fri, label: 'the weekend', fixedStart: fri };
  }
  if (/\bnext week\b/.test(text)) {
    let mon = addDays(today, 1);
    while (dayOfWeek(mon) !== 1) mon = addDays(mon, 1);
    return { start: mon, end: addDays(mon, 6), label: 'next week' };
  }
  const inWeeks = text.match(new RegExp(`\\bin\\s+${NUM}\\s+weeks?\\b`));
  if (inWeeks) {
    const s = addDays(today, Math.round((toNum(inWeeks[1]) ?? 2) * 7));
    return { start: addDays(s, -3), end: addDays(s, 4), label: `in ${inWeeks[1]} weeks` };
  }
  if (/\bnext month\b/.test(text)) {
    const m = (monthOf(today) + 1) % 12;
    const yr = m === 0 ? y + 1 : y;
    return { start: makeISO(yr, m, 1), end: lastDayOfMonth(yr, m), label: MONTHS[m] + ` ${yr}` };
  }
  if (/\b(this month|asap|soon|last minute|last-minute)\b/.test(text)) {
    return { start: addDays(today, 3), end: addDays(today, 35), label: 'the next few weeks' };
  }

  // Seasons: "next summer", "this winter", "summer 2027"
  for (const [name, [m1, m2]] of Object.entries(SEASONS)) {
    if (!new RegExp(`\\b${name}\\b`).test(text)) continue;
    const wantNext = new RegExp(`\\bnext\\s+${name}\\b`).test(text);
    let yr = explicitYear ?? y;
    const endMonth = m2;
    const crossesYear = m2 < m1;
    const endOf = (yy: number) => lastDayOfMonth(crossesYear ? yy + 1 : yy, endMonth);
    if (!explicitYear) {
      // Skip a season that's over (or mostly over).
      if (endOf(yr) < addDays(today, 20)) yr += 1;
      // "next summer" when we're currently in summer → the following one.
      if (wantNext && makeISO(yr, m1, 1) <= today) yr += 1;
    }
    const label = `${name[0].toUpperCase()}${name.slice(1)} ${crossesYear ? `${yr}/${String(yr + 1).slice(2)}` : yr}`;
    return { start: makeISO(yr, m1, 1), end: endOf(yr), label };
  }

  // A month: "in june", "next august", "june 2027"
  const monthOnly = text.match(new RegExp(`\\b${MONTH_RE}\\b`));
  if (monthOnly && !/\bmay\s+(be|want|need|go|have|like)\b/.test(text)) {
    const mi = monthIndex(monthOnly[1]);
    const yr = explicitYear ?? upcomingMonthYear(mi, today, next.test(text) && mi === monthOf(today));
    return { start: makeISO(yr, mi, 1), end: lastDayOfMonth(yr, mi), label: `${MONTHS[mi]} ${yr}` };
  }
  if (/\bnext year\b/.test(text) || explicitYear) {
    const yr = explicitYear ?? y + 1;
    return { start: makeISO(yr, 0, 1), end: makeISO(yr, 11, 31), label: String(yr) };
  }
  return undefined;
}

function parseNights(text: string): ParsedRequest['nights'] | undefined {
  const flexible = /\b(ish|about|around|roughly|approx|or so|give or take|flexible)\b/.test(text);
  const flex = (ideal: number, label: string, spread = 1): ParsedRequest['nights'] =>
    flexible ? { min: Math.max(1, ideal - spread), max: ideal + spread, ideal, label: `${label} (flexible)` } : { min: ideal, max: ideal, ideal, label };

  const range = text.match(/\b(\d{1,2})\s*(?:-|–|to|or)\s*(\d{1,2})\s*(nights?|days?|weeks?)\b/);
  if (range) {
    const unit = range[3];
    const mul = unit.startsWith('week') ? 7 : 1;
    let a = Number(range[1]) * mul;
    let b = Number(range[2]) * mul;
    if (unit.startsWith('day')) {
      a = Math.max(1, a - 1);
      b = Math.max(1, b - 1);
    }
    const [min, max] = a <= b ? [a, b] : [b, a];
    return { min, max, ideal: Math.round((min + max) / 2), label: `${min}–${max} nights` };
  }
  if (/\blong weekend\b/.test(text)) return { min: 3, max: 4, ideal: 3, label: 'long weekend (3–4 nights)' };
  if (/\bfortnight\b/.test(text)) return flex(14, '2 weeks', 2);
  if (/\bweekend\b/.test(text) && !/\bweekends?\s+in\b/.test(text)) return { min: 2, max: 3, ideal: 2, label: 'weekend (2–3 nights)' };
  const nights = text.match(new RegExp(`\\b${NUM}\\s*(?:-\\s*)?nights?\\b`));
  if (nights) {
    const v = toNum(nights[1]) ?? 7;
    return flex(Math.max(1, Math.round(v)), `${Math.round(v)} nights`);
  }
  const weeks = text.match(new RegExp(`(?<!\\bin )\\b${NUM}\\s*(?:and a half\\s*)?(?:-\\s*)?weeks?\\b`));
  if (weeks) {
    let v = toNum(weeks[1]) ?? 1;
    if (/and a half/.test(weeks[0])) v += 0.5;
    const n = Math.round(v * 7);
    return flex(n, v === 1 ? 'a week' : `${v} weeks`, n >= 10 ? 2 : 1);
  }
  const days = text.match(new RegExp(`\\b${NUM}\\s*(?:-\\s*)?days?\\b`));
  if (days) {
    const v = Math.round(toNum(days[1]) ?? 4);
    const n = Math.max(1, v - 1);
    return flex(n, `${v} days (${n} nights)`);
  }
  return undefined;
}

function parseTravellers(text: string): { adults: number; children: number; found: boolean } {
  let adults: number | undefined;
  let children = 0;
  const kids = text.match(new RegExp(`\\b${NUM}\\s+(?:kids?|children|child|little ones|teenagers|teens|toddlers?|babies|baby)\\b`));
  if (kids) children = Math.round(toNum(kids[1]) ?? 0);
  const ad = text.match(new RegExp(`\\b${NUM}\\s+(?:adults?|grown[- ]?ups)\\b`));
  if (ad) adults = Math.round(toNum(ad[1]) ?? 2);

  if (adults === undefined) {
    const patterns = [
      new RegExp(`\\b${NUM}\\s+(?:people|persons|pax|guests|travell?ers|friends|mates|lads|girls|boys|of us|adults)\\b`),
      new RegExp(`\\b(?:group|party|family) of\\s+${NUM}\\b`),
      new RegExp(`\\bfor\\s+${GROUP_NUM}\\b(?!\\s*(?:nights?|days?|weeks?|months?|hours?|£|\\$|€|pounds|quid|k\\b|grand))`),
      new RegExp(`\\b${NUM}\\s+(?:couples)\\b`),
    ];
    for (const [i, p] of patterns.entries()) {
      const m = text.match(p);
      if (m) {
        const v = toNum(m[1]);
        if (v && v >= 1 && v < 60) {
          const total = i === 3 ? v * 2 : v;
          adults = Math.max(1, Math.round(total) - (kids && i !== 3 ? children : 0));
          if (i === 1 && /family of/.test(m[0]) && !kids) {
            adults = Math.min(2, Math.round(total));
            children = Math.max(0, Math.round(total) - adults);
          }
          break;
        }
      }
    }
  }
  if (adults === undefined) {
    if (/\b(solo|just me|by myself|on my own|alone)\b/.test(text)) adults = 1;
    else if (/\b(couple|me and my (?:partner|girlfriend|boyfriend|wife|husband|missus|mrs|fiance|fiancée|fiancee|mate|friend|mum|dad|bf|gf)|two of us|honeymoon|romantic|anniversary)\b/.test(text)) adults = 2;
    else if (/\bfamily\b/.test(text)) {
      adults = 2;
      if (!kids) children = 2;
    }
  }
  return { adults: adults ?? 2, children, found: adults !== undefined || children > 0 };
}

function parseBudget(text: string, people: number): ParsedRequest['budget'] | undefined {
  const re = /(?:£|\$|€|gbp\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*(k|grand)?|(\d[\d,]*(?:\.\d+)?)\s*(k|grand)?\s*(?:pounds|quid|gbp|euros?|dollars|budget)\b|\b(?:budget|max|maximum|under|below|less than|up to|no more than|spend|around)\s*(?:of|is|around|about|:)?\s*(?:£|\$|€)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|grand)?\b(?!\s*(?:nights?|days?|weeks?|people|persons|adults|kids|children|bed|stars?|hours?|km|miles|mins?|minutes))/g;
  for (const m of text.matchAll(re)) {
    const numStr = m[1] ?? m[3] ?? m[5];
    const k = m[2] ?? m[4] ?? m[6];
    let amount = Number(numStr.replace(/,/g, ''));
    if (k) amount *= 1000;
    if (!amount || amount < 50) continue;
    const idx = m.index ?? 0;
    const after = text.slice(idx + m[0].length, idx + m[0].length + 30);
    const before = text.slice(Math.max(0, idx - 25), idx);
    const perPerson = /^\s*(?:pp|p\/p|per person|per head|a head|each|a person|per pers|\/person|a pop)\b/.test(after) || /\b(each|per person|pp)\s*$/.test(before);
    const total = /^\s*(?:total|in total|altogether|overall|between us|for (?:all|everyone|the group|us all|the lot))\b/.test(after) || /\b(total|overall|altogether|whole group|group budget)\b/.test(before + after);
    if (perPerson) return { amount, per: 'person', explicitPer: true };
    if (total) return { amount, per: 'total', explicitPer: true };
    // No qualifier: small numbers for groups are almost always per person.
    return { amount, per: people > 1 && amount < 1500 ? 'person' : 'total', explicitPer: false };
  }
  return undefined;
}

const VIBES: { re: RegExp; tags: Tag[]; hot?: boolean }[] = [
  { re: /\b(beach|seaside|by the sea|coast|sand)\b/, tags: ['beach'] },
  { re: /\b(city break|city|culture|sightseeing|museums|history)\b/, tags: ['city'] },
  { re: /\b(party|parties|nightlife|clubbing|clubs|lads|stag|hen|bachelor|bachelorette|piss up|sesh|lads holiday|girls holiday)\b/, tags: ['party'] },
  { re: /\b(family|kids|children|toddler|waterpark)\b/, tags: ['family'] },
  { re: /\b(ski|skiing|snowboard|snow|slopes|chalet)\b/, tags: ['ski'] },
  { re: /\b(hiking|nature|walking|mountains|scenery|adventure)\b/, tags: ['nature'] },
  { re: /\b(romantic|honeymoon|anniversary|couples)\b/, tags: ['romantic'] },
  { re: /\b(food|foodie|eating|restaurants|wine)\b/, tags: ['food'] },
  { re: /\b(golf|golfing)\b/, tags: ['golf'] },
  { re: /\b(island|islands)\b/, tags: ['island'] },
  { re: /\b(long[- ]haul|far away|exotic|tropical)\b/, tags: ['long-haul'] },
  { re: /\b(hot|warm|sunny|sun|scorching|winter sun|guaranteed sun|heat)\b/, tags: [], hot: true },
];

/** Aliases that are also common English words only count with a place-like cue. */
const AMBIGUOUS: Record<string, RegExp> = {
  nice: /\b(?:to|in|visit|near|around|from|fly to|go to)\s+nice\b(?!\s+(?:place|places|hotel|villa|apartment|weather|and|food|beach|trip|holiday|time))|\bnice,?\s+france\b/,
  split: /\b(?:to|in|visit|near|around|fly to|go to)\s+split\b|\bsplit,?\s+croatia\b/,
  ski: /\bski\b/,
};

/** One typo allowed in longer place names ("albufiera" → Albufeira). */
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 6) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const rest = (x: string, n: number) => x.slice(i + n);
  return (
    rest(a, 1) === rest(b, 1) || // substitution
    rest(a, 1) === rest(b, 0) || // extra letter
    rest(a, 0) === rest(b, 1) || // missing letter
    (a[i] === b[i + 1] && a[i + 1] === b[i] && rest(a, 2) === rest(b, 2)) // swapped letters
  );
}

/** Curated countries with hand-picked destinations: better than a generic country lookup. */
const CURATED_COUNTRIES: Record<string, string> = { PT: 'portugal', ES: 'spain', GR: 'greece', IT: 'italy', FR: 'france', TR: 'turkey', US: 'usa' };

function parseDestinations(text: string, excludeOrigin: string[] = []): { ids: string[]; regionUsed?: string; labels: string[] } {
  const ids: string[] = [];
  const labels: string[] = [];
  let regionUsed: string | undefined;
  const tokens = text.split(/[^a-zà-ÿ']+/).filter((w) => w.length >= 6);
  for (const d of DESTINATIONS) {
    for (const alias of d.aliases) {
      const re = AMBIGUOUS[alias] ?? new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\']/g, (c) => (c === "'" ? "'?" : `\\${c}`))}\\b`);
      const typo = !alias.includes(' ') && alias.length >= 6 && tokens.some((t) => nearlyEqual(t, alias));
      if (re.test(text) || typo) {
        if (alias === 'ski' && d.id !== 'alps') continue;
        if (!ids.includes(d.id)) ids.push(d.id);
        break;
      }
    }
  }
  // Remove "alps" if it only matched the generic ski vibe but a specific place was named too.
  if (ids.length > 1 && ids.includes('alps') && !/\b(alps|chamonix|morzine|meribel|méribel|val thorens|geneva)\b/.test(text)) {
    ids.splice(ids.indexOf('alps'), 1);
  }

  // Anywhere else in the world: towns, US states, regions and countries from the gazetteer.
  const curatedWords = new Set(DESTINATIONS.flatMap((d) => [norm(d.name), ...d.aliases.map(norm)]));
  for (const m of searchPlaces(text, { exclude: excludeOrigin })) {
    const phrase = norm(m.label.split(',')[0]);
    if (curatedWords.has(phrase) || ids.some((id) => norm(destById(id).name).includes(phrase))) continue;
    if (m.kind === 'country') {
      const cc = m.id.split(':')[1];
      if (CURATED_COUNTRIES[cc] && !ids.length) {
        regionUsed = CURATED_COUNTRIES[cc];
        ids.push(...REGION_ALIASES[CURATED_COUNTRIES[cc]].filter((id) => !ids.includes(id)));
        continue;
      }
      if (CURATED_COUNTRIES[cc]) continue;
    }
    if (ids.length >= 6) break;
    ids.push(m.id);
    labels.push(m.label);
  }

  // "lake tahoe ski trip": the generic ski word picked the Alps, but a real place was named.
  const skiOnly = !/\b(alps|chamonix|morzine|meribel|méribel|val thorens|geneva)\b/.test(text);
  if (ids.includes('alps') && skiOnly && ids.some((id) => id.startsWith('geo'))) ids.splice(ids.indexOf('alps'), 1);

  if (!ids.length) {
    for (const [region, list] of Object.entries(REGION_ALIASES)) {
      if (new RegExp(`\\b${region}\\b`).test(text)) {
        regionUsed = region;
        ids.push(...list.filter((id) => !ids.includes(id)));
        break;
      }
    }
  }
  return { ids, regionUsed, labels };
}

function parseOrigin(text: string): string | undefined {
  // Prefer explicit "from X" phrases.
  const fromPhrase = text.match(/\b(?:from|out of|leaving|departing|flying from|fly from|flights from)\s+([a-z ]{3,30})/);
  const candidates = fromPhrase ? [fromPhrase[1]] : [];
  for (const c of candidates) {
    for (const o of ORIGINS) {
      if (o.aliases.some((a) => new RegExp(`^${a}\\b`).test(c.trim()))) return o.code;
    }
  }
  for (const o of ORIGINS) {
    if (o.code === 'LON') continue;
    if (o.aliases.some((a) => a.length === 3 && new RegExp(`\\b${a}\\b`).test(text) && a !== 'man')) return o.code;
  }
  // A UK city mentioned without "from" ("leeds to albufeira") is almost certainly where they're flying from,
  // unless it's clearly the destination ("weekend in edinburgh").
  for (const o of ORIGINS) {
    if (o.aliases.some((a) => a.length > 3 && !['wales', 'ireland', 'yorkshire'].includes(a) && new RegExp(`\\b${a}\\b`).test(text) && !new RegExp(`\\b(?:to|in|visit|visiting|around)\\s+${a}\\b`).test(text))) return o.code;
  }
  return undefined;
}

export const STAY_WORDS: { re: RegExp; kind: StayKind }[] = [
  { re: /\b(villas?|house|houses|home|chalets?|cottage|riad|whole place)\b/, kind: 'villa' },
  { re: /\b(apartments?|flats?|apartos?|condos?|aparthotel)\b/, kind: 'apartment' },
  { re: /\b(hotels?|resorts?|all[- ]inclusive|spa hotel|b&b)\b/, kind: 'hotel' },
  { re: /\b(hostels?|dorms?|backpack(?:er|ing))\b/, kind: 'hostel' },
];

const AMENITY_WORDS: { re: RegExp; amenity: Amenity }[] = [
  { re: /\b(hot ?tub|jacuzzi|whirlpool)\b/, amenity: 'hot-tub' },
  { re: /\b(sea ?view|ocean ?view|sea-facing|views? of the sea)\b/, amenity: 'sea-view' },
  { re: /\b(wifi|wi-fi|internet)\b/, amenity: 'wifi' },
  { re: /\b(air ?con|aircon|air conditioning|a\/c)\b/, amenity: 'aircon' },
  { re: /\b(parking|car park)\b/, amenity: 'parking' },
  { re: /\b(kitchen|self[- ]catering|cook)\b/, amenity: 'kitchen' },
  { re: /\b(bbq|barbecue|barbeque|grill)\b/, amenity: 'bbq' },
  { re: /\b(gym|fitness)\b/, amenity: 'gym' },
  { re: /\b(garden|outdoor space)\b/, amenity: 'garden' },
  { re: /\b(games room|pool table|table tennis)\b/, amenity: 'games-room' },
  { re: /\b(dog|pet)[- ]?friendly|\bbring (?:the|our) dog\b/, amenity: 'pet-friendly' },
  { re: /\b(washing machine|laundry)\b/, amenity: 'washing-machine' },
  { re: /\bspa\b/, amenity: 'spa' },
];

export function parseRequest(raw: string, now: ISODate = todayISO()): ParsedRequest {
  const text = ` ${raw.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ')} `;
  const notes: string[] = [];

  const t = parseTravellers(text);
  const travellers = { adults: t.adults, children: t.children };
  const people = travellers.adults + travellers.children;

  const originEarly = parseOrigin(text);
  const dests = parseDestinations(text, originEarly ? originByCode(originEarly).aliases : []);
  const vibeTags: Tag[] = [];
  let wantsHot = false;
  for (const v of VIBES) {
    if (v.re.test(text)) {
      vibeTags.push(...v.tags.filter((x) => !vibeTags.includes(x)));
      if (v.hot) wantsHot = true;
    }
  }

  const w = parseWindow(text, now);
  const nights = parseNights(text) ?? (w?.fixedStart && w.fixedEnd
    ? (() => {
        const n = Math.max(1, Math.round((Date.parse(w.fixedEnd!) - Date.parse(w.fixedStart!)) / 86_400_000));
        return { min: n, max: n, ideal: n, label: `${n} nights` };
      })()
    : { min: 6, max: 8, ideal: 7, label: 'about a week (guessed)' });
  if (!parseNights(text) && !w?.fixedEnd) notes.push('No trip length given — assumed about a week.');

  let window: ParsedRequest['window'];
  let fixedStart: ISODate | undefined;
  if (w) {
    const c = clampWindow(w, now);
    window = { start: c.start, end: c.end, label: c.label };
    fixedStart = c.fixedStart && c.fixedStart >= now ? c.fixedStart : undefined;
  } else {
    window = { start: addDays(now, 14), end: addDays(now, 120), label: 'the next 4 months' };
    notes.push('No dates given — searched the next few months for the best prices.');
  }

  const budget = parseBudget(text, people);
  let priority: ParsedRequest['priority'] = 'balanced';
  if (/\b(cheap|cheapest|budget|skint|low cost|affordable|bargain|on a shoestring)\b/.test(text)) priority = 'cheap';
  if (/\b(luxury|luxurious|posh|fancy|5 star|five star|high end|splash out|treat ourselves|premium|boujee|bougie)\b/.test(text)) priority = 'luxury';

  const kinds: StayKind[] = [];
  for (const s of STAY_WORDS) if (s.re.test(text) && !kinds.includes(s.kind)) kinds.push(s.kind);
  const sources: StaySource[] = [];
  if (/\bairbnb\b/.test(text)) {
    sources.push('Airbnb');
    if (!kinds.length) kinds.push('villa', 'apartment');
  }
  if (/\bvrbo\b/.test(text)) sources.push('Vrbo');
  if (/\bbooking(?:\.com)?\b/.test(text)) sources.push('Booking.com');

  const swim = /\b(pool|pools|swimming|infinity pool|plunge pool)\b(?!\s+table)/.test(text);
  const pool: ParsedRequest['stay']['pool'] = /\b(private|own|our own|heated private)\s+(?:swimming\s+)?pool\b/.test(text) ? 'private' : swim ? 'pool' : 'any';
  const bedroomMatch = text.match(new RegExp(`\\b${NUM}\\s*(?:-\\s*)?(?:bed(?:room)?s?|br)\\b`));
  const minBedrooms = bedroomMatch ? Math.round(toNum(bedroomMatch[1]) ?? 0) : 0;
  const amenities: Amenity[] = [];
  for (const a of AMENITY_WORDS) if (a.re.test(text) && !amenities.includes(a.amenity)) amenities.push(a.amenity);

  const originCode = originEarly;
  const directOnly = /\b(direct|non[- ]?stop|no (?:stops|layovers|connections))\b/.test(text);
  let bagsPerPerson = 0;
  if (/\b(hold luggage|checked bags?|hold bags?|suitcases?|luggage|check[- ]in bags?|big bags?)\b/.test(text) && !/\b(hand luggage only|carry[- ]on only|no luggage|no bags)\b/.test(text)) bagsPerPerson = 1;
  if (/\bshare (?:a |the )?(?:bag|suitcase|case)s?\b/.test(text)) bagsPerPerson = 0.5;

  if (!dests.ids.length) notes.push(vibeTags.length || wantsHot ? 'No place named — picked destinations that match what you asked for.' : 'No place named — showing popular picks with the best prices.');
  if (dests.regionUsed) notes.push(`"${dests.regionUsed}" covers several places — comparing the best of them.`);
  for (const label of dests.labels) notes.push(`Found ${label} — flying to the nearest airport with good connections.`);
  if (budget && !budget.explicitPer) notes.push(`Read your budget as ${budget.per === 'person' ? 'per person' : 'for the whole group'} — tap it to switch.`);

  return {
    raw,
    travellers,
    travellersFound: t.found,
    destIds: dests.ids,
    destinationFound: dests.ids.length > 0,
    vibeTags,
    wantsHot,
    window,
    fixedStart,
    nights,
    budget,
    priority,
    stay: {
      kinds,
      pool,
      minBedrooms,
      amenities,
      nearBeach: /\b(beachfront|on the beach|near (?:the )?beach|close to (?:the )?beach|walk to (?:the )?beach|by the beach|beach side|beachside)\b/.test(text),
      central: /\b(central|centre|center|near (?:the )?(?:town|strip|bars|old town|nightlife)|walking distance|in town|close to (?:the )?(?:strip|town|bars))\b/.test(text),
      allInclusive: /\ball[- ]inclusive\b/.test(text),
      breakfast: /\bbreakfast\b/.test(text),
      sources,
    },
    origin: originCode ?? 'LON',
    originFound: !!originCode,
    directOnly,
    bagsPerPerson,
    notes,
  };
}

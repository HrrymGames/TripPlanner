import type { ISODate } from '../types';

const DAY = 86_400_000;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function parseISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function makeISO(year: number, month0: number, day: number): ISODate {
  return toISO(new Date(Date.UTC(year, month0, day)));
}

export function todayISO(now: Date = new Date()): ISODate {
  return makeISO(now.getFullYear(), now.getMonth(), now.getDate());
}

export function addDays(iso: ISODate, days: number): ISODate {
  return toISO(new Date(parseISO(iso).getTime() + days * DAY));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY);
}

export function dayOfWeek(iso: ISODate): number {
  return parseISO(iso).getUTCDay();
}

export function monthOf(iso: ISODate): number {
  return parseISO(iso).getUTCMonth();
}

export function yearOf(iso: ISODate): number {
  return parseISO(iso).getUTCFullYear();
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export function lastDayOfMonth(year: number, month0: number): ISODate {
  return makeISO(year, month0, daysInMonth(year, month0));
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** "Sat 12 Jun 2027" */
export function formatDate(iso: ISODate, opts: { year?: boolean; weekday?: boolean } = {}): string {
  const d = parseISO(iso);
  const parts = [] as string[];
  if (opts.weekday !== false) parts.push(WEEKDAYS_SHORT[d.getUTCDay()]);
  parts.push(String(d.getUTCDate()), MONTHS_SHORT[d.getUTCMonth()]);
  if (opts.year) parts.push(String(d.getUTCFullYear()));
  return parts.join(' ');
}

export function formatRange(start: ISODate, end: ISODate): string {
  const sameYear = yearOf(start) === yearOf(end);
  return `${formatDate(start, { year: !sameYear })} – ${formatDate(end, { year: true })}`;
}

/** Western (Gregorian) Easter Sunday. */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeISO(year, month - 1, day);
}

/** Approximate England & Wales school holiday windows (when flights and villas get pricier). */
export function schoolHolidays(year: number): { start: ISODate; end: ISODate; name: string }[] {
  const easter = easterSunday(year);
  // Last Monday of May for the May half term.
  let mayBank = makeISO(year, 4, 31);
  while (dayOfWeek(mayBank) !== 1) mayBank = addDays(mayBank, -1);
  // Week containing the third Monday of February.
  let feb = makeISO(year, 1, 15);
  while (dayOfWeek(feb) !== 1) feb = addDays(feb, 1);
  // Last full week of October.
  let oct = makeISO(year, 9, 31);
  while (dayOfWeek(oct) !== 1) oct = addDays(oct, -1);
  if (diffDays(oct, makeISO(year, 9, 31)) < 4) oct = addDays(oct, -7);
  return [
    { name: 'Christmas', start: makeISO(year, 0, 1), end: makeISO(year, 0, 4) },
    { name: 'February half term', start: addDays(feb, -2), end: addDays(feb, 6) },
    { name: 'Easter holidays', start: addDays(easter, -9), end: addDays(easter, 8) },
    { name: 'May half term', start: addDays(mayBank, -2), end: addDays(mayBank, 6) },
    { name: 'Summer holidays', start: makeISO(year, 6, 19), end: makeISO(year, 8, 2) },
    { name: 'October half term', start: addDays(oct, -2), end: addDays(oct, 6) },
    { name: 'Christmas', start: makeISO(year, 11, 18), end: makeISO(year, 11, 31) },
  ];
}

const holidayCache = new Map<number, ReturnType<typeof schoolHolidays>>();

export function schoolHolidayOn(iso: ISODate): string | undefined {
  const y = yearOf(iso);
  let list = holidayCache.get(y);
  if (!list) {
    list = schoolHolidays(y);
    holidayCache.set(y, list);
  }
  return list.find((h) => iso >= h.start && iso <= h.end)?.name;
}

export function* eachDay(start: ISODate, end: ISODate): Generator<ISODate> {
  for (let d = start; d <= end; d = addDays(d, 1)) yield d;
}

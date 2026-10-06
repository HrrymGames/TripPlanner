import type { Destination, ISODate, SeasonProfile } from '../types';
import { monthOf, schoolHolidayOn } from './dates';

/** Demand multipliers per month (Jan..Dec). 1.0 ≈ a normal shoulder-season month. */
export const SEASON_CURVES: Record<SeasonProfile, number[]> = {
  'med-beach': [0.55, 0.55, 0.65, 0.82, 0.92, 1.15, 1.45, 1.5, 1.05, 0.82, 0.55, 0.65],
  canary: [1.12, 1.08, 1.02, 1.0, 0.82, 0.86, 1.02, 1.1, 0.9, 1.0, 1.05, 1.22],
  city: [0.75, 0.75, 0.9, 1.0, 1.05, 1.05, 1.1, 1.05, 1.05, 1.0, 0.85, 1.2],
  ski: [1.3, 1.45, 1.2, 0.9, 0.6, 0.65, 0.75, 0.75, 0.6, 0.6, 0.8, 1.4],
  'winter-sun': [1.2, 1.15, 1.1, 1.0, 0.8, 0.72, 0.85, 0.85, 0.78, 0.92, 1.0, 1.35],
  usa: [0.8, 0.85, 1.0, 1.05, 1.0, 1.15, 1.3, 1.25, 0.95, 0.95, 1.0, 1.25],
  tropical: [0.9, 0.85, 0.9, 0.95, 1.0, 1.15, 1.35, 1.35, 1.05, 0.9, 0.85, 1.2],
};

export function seasonFactor(dest: Destination, iso: ISODate): number {
  return SEASON_CURVES[dest.season][monthOf(iso)];
}

/** Accommodation swings less than flights across the year. */
export function staySeasonFactor(dest: Destination, iso: ISODate): number {
  const holiday = schoolHolidayOn(iso) ? 1.08 : 1;
  return Math.pow(seasonFactor(dest, iso), 0.8) * holiday;
}

export function avgTemp(dest: Destination, iso: ISODate): number {
  return dest.temps[monthOf(iso)];
}

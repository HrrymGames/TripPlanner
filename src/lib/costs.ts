import type { CostBreakdown, Destination, Extras, FlightOption, StayQuote, Travellers } from '../types';
import { flightCost } from './flights';

export const DEFAULT_EXTRAS: Extras = { bagsPerPerson: 0, transfer: 'taxi', insurance: false, includeSpending: true };

export const totalPeople = (t: Travellers) => t.adults + t.children;

/** Airport transfers both ways: taxis for small groups, minibuses for 7+. */
export function transferCost(dest: Destination, people: number, nights: number, choice: Extras['transfer']): number {
  if (choice === 'none' || people === 0) return 0;
  if (choice === 'car-hire') {
    const cars = Math.ceil(people / 5);
    const days = Math.max(1, nights);
    // Big groups often hire a 9-seater instead of several cars.
    if (people >= 7 && people <= 9) return Math.round(dest.carHireDay * 2.2 * days);
    return Math.round(dest.carHireDay * cars * days);
  }
  if (people >= 7) {
    const minibuses = Math.ceil(people / 8);
    return Math.round(dest.transferTaxi * 1.7 * minibuses * 2);
  }
  return Math.round(dest.transferTaxi * Math.ceil(people / 4) * 2);
}

export function insuranceCost(dest: Destination, people: number, nights: number): number {
  const longHaul = dest.flightHours > 6;
  const perPerson = (longHaul ? 22 : 9) + nights * (longHaul ? 1.2 : 0.6);
  return Math.round(perPerson * people);
}

export function computeCosts(args: {
  dest: Destination;
  travellers: Travellers;
  nights: number;
  outbound?: FlightOption;
  inbound?: FlightOption;
  stay?: StayQuote | null;
  extras: Extras;
}): CostBreakdown {
  const { dest, travellers, nights, outbound, inbound, stay, extras } = args;
  const people = totalPeople(travellers);
  const flightsBase = ((outbound?.price ?? 0) + (inbound?.price ?? 0)) * people;
  const bags = Math.round((flightCost(outbound, extras.bagsPerPerson) - (outbound?.price ?? 0) + flightCost(inbound, extras.bagsPerPerson) - (inbound?.price ?? 0)) * people);
  const stayTotal = stay?.total ?? 0;
  const transfers = transferCost(dest, people, nights, extras.transfer);
  const insurance = extras.insurance ? insuranceCost(dest, people, nights) : 0;
  const flights = Math.round(flightsBase);
  const bookableTotal = flights + bags + stayTotal + transfers + insurance;
  const allInclusive = stay?.listing.boardBasis === 'all-inclusive';
  const spending = extras.includeSpending ? Math.round(dest.dailySpend * (allInclusive ? 0.35 : 1) * people * nights) : 0;
  const grandTotal = bookableTotal + spending;
  return {
    flights,
    bags,
    stay: stayTotal,
    transfers,
    insurance,
    bookableTotal,
    spending,
    grandTotal,
    perPerson: people ? Math.round(grandTotal / people) : 0,
    perPersonBookable: people ? Math.round(bookableTotal / people) : 0,
    people,
  };
}

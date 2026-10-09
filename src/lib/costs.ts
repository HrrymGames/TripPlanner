import type { CostBreakdown, Destination, Extras, FlightOption, RealPicks, StayQuote, Travellers } from '../types';
import { flightCost } from './flights';
import { km, taxiFare } from './geo';

export const DEFAULT_EXTRAS: Extras = { bagsPerPerson: 0, transfer: 'taxi', insurance: false, includeSpending: true };

export const totalPeople = (t: Travellers) => t.adults + t.children;

export interface TransferQuote {
  /** Road distance airport → stay, when we know where both are. */
  km?: number;
  mins?: number;
  vehicles: number;
  vehicleLabel: string;
  /** One way, all vehicles. */
  perWay: number;
  /** There and back. */
  total: number;
  from: string;
  to: string;
}

/** Taxi / minibus from the airport to the stay and back again, sized for the group. */
export function transferQuote(dest: Destination, people: number, area?: string): TransferQuote {
  const minibus = people >= 7;
  const vehicles = minibus ? Math.ceil(people / 8) : Math.max(1, Math.ceil(people / 4));
  let perVehicle = dest.transferTaxi;
  let roadKm: number | undefined;
  const g = dest.geo;
  if (g) {
    const [lat, lon] = (area && g.areaCoords[area]) || [g.lat, g.lon];
    roadKm = Math.round(km(g.airportLat, g.airportLon, lat, lon) * 1.25);
    perVehicle = taxiFare(g.cc, roadKm / 1.25);
  }
  const each = Math.round(perVehicle * (minibus ? 1.7 : 1));
  const perWay = each * vehicles;
  return {
    km: roadKm,
    mins: roadKm !== undefined ? Math.round(10 + roadKm / 0.75) : undefined,
    vehicles,
    vehicleLabel: `${vehicles} ${minibus ? 'minibus' : 'taxi'}${vehicles > 1 ? (minibus ? 'es' : 's') : ''}`,
    perWay,
    total: perWay * 2,
    from: `${dest.airportName} airport`,
    to: area ?? dest.name,
  };
}

/** Airport transfers both ways (taxis, minibuses for 7+), or car hire for the whole trip. */
export function transferCost(dest: Destination, people: number, nights: number, choice: Extras['transfer'], area?: string): number {
  if (choice === 'none' || people === 0) return 0;
  if (choice === 'car-hire') {
    const cars = Math.ceil(people / 5);
    const days = Math.max(1, nights);
    // Big groups often hire a 9-seater instead of several cars.
    if (people >= 7 && people <= 9) return Math.round(dest.carHireDay * 2.2 * days);
    return Math.round(dest.carHireDay * cars * days);
  }
  return transferQuote(dest, people, area).total;
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
  picks?: RealPicks;
}): CostBreakdown {
  const { dest, travellers, nights, outbound, inbound, stay, extras, picks } = args;
  const people = totalPeople(travellers);
  // A real price someone pasted in wins over our estimate.
  const outPP = picks?.outPrice ?? outbound?.price ?? 0;
  const backPP = picks?.backPrice ?? inbound?.price ?? 0;
  const flightsBase = (outPP + backPP) * people;
  const bags = Math.round((flightCost(outbound, extras.bagsPerPerson) - (outbound?.price ?? 0) + flightCost(inbound, extras.bagsPerPerson) - (inbound?.price ?? 0)) * people);
  const stayTotal = picks?.stayPrice ?? stay?.total ?? 0;
  const transfers = transferCost(dest, people, nights, extras.transfer, stay?.listing.area);
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

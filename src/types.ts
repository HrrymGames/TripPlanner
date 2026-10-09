/** ISO calendar date, e.g. "2027-06-12". All date maths is done in UTC to avoid timezone drift. */
export type ISODate = string;

export type SeasonProfile = 'med-beach' | 'canary' | 'city' | 'ski' | 'winter-sun' | 'usa' | 'tropical';

export type Tag =
  | 'beach'
  | 'city'
  | 'party'
  | 'family'
  | 'ski'
  | 'nature'
  | 'culture'
  | 'island'
  | 'long-haul'
  | 'romantic'
  | 'food'
  | 'golf';

export interface Destination {
  id: string;
  name: string;
  country: string;
  /** Main arrival airport IATA code. */
  airport: string;
  airportName: string;
  /** Wikipedia article title used to fetch a hero image. */
  wiki: string;
  aliases: string[];
  tags: Tag[];
  season: SeasonProfile;
  /** Typical cheapest one-way fare from London in an off-peak month, GBP per person. */
  flightGBP: number;
  flightHours: number;
  /** Local time minus UK time, in hours. */
  tzDiff: number;
  /** Average daily high °C, Jan..Dec. */
  temps: number[];
  /** Typical food, drink and activities spend per person per day, GBP. */
  dailySpend: number;
  /** Baseline nightly prices (GBP) in a mid-season month. */
  nightly: {
    hostelBed: number;
    apartment1br: number;
    villaPerBedroom: number;
    hotel3: number;
  };
  /** One-way airport taxi per car (up to 4 people), GBP. */
  transferTaxi: number;
  carHireDay: number;
  areas: string[];
  airlines: string[];
  lang: 'pt' | 'es' | 'it' | 'gr' | 'hr' | 'tr' | 'fr' | 'en' | 'de' | 'nl' | 'cz' | 'pl' | 'hu' | 'ar' | 'id' | 'is' | 'mt';
  blurb: string;
}

export interface OriginAirport {
  code: string;
  /** Code understood by Skyscanner (e.g. "lond" for all London airports). */
  skyscanner: string;
  name: string;
  city: string;
  aliases: string[];
  priceFactor: number;
  /** Airport codes actually used when generating flights (London = several). */
  airports: string[];
}

export type Direction = 'out' | 'back';

export interface FlightOption {
  id: string;
  direction: Direction;
  date: ISODate;
  airline: string;
  flightNo: string;
  from: string;
  to: string;
  depart: string; // "HH:MM" local
  arrive: string; // "HH:MM" local
  arriveNextDay: boolean;
  durationMins: number;
  stops: number;
  via?: string;
  /** Price per person, GBP, hand luggage only. */
  price: number;
  /** Price for one 20-23kg hold bag on this flight, 0 if included. */
  bagPrice: number;
  lowCost: boolean;
}

export type StayKind = 'villa' | 'apartment' | 'hotel' | 'hostel';
export type StaySource = 'Airbnb' | 'Booking.com' | 'Vrbo' | 'Hotels.com';

export interface StayListing {
  id: string;
  destId: string;
  kind: StayKind;
  source: StaySource;
  name: string;
  area: string;
  /** Per unit (a whole villa / apartment, one hotel room, one hostel bed). */
  sleeps: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  unitsAvailable: number;
  pool: 'private' | 'shared' | 'none';
  stars?: number;
  rating: number;
  reviews: number;
  /** Baseline nightly price per unit in a mid-season month, GBP. */
  baseNightly: number;
  cleaningFee: number;
  beachKm: number;
  centreKm: number;
  amenities: Amenity[];
  boardBasis?: 'room-only' | 'breakfast' | 'all-inclusive';
  imageKeywords: string;
  imageSeed: number;
}

export type Amenity =
  | 'wifi'
  | 'aircon'
  | 'kitchen'
  | 'parking'
  | 'bbq'
  | 'hot-tub'
  | 'sea-view'
  | 'gym'
  | 'garden'
  | 'games-room'
  | 'pet-friendly'
  | 'washing-machine'
  | 'terrace'
  | 'spa';

export interface StayQuote {
  listing: StayListing;
  units: number;
  nights: number;
  /** Sum of nightly rates for all units. */
  accommodation: number;
  fees: number;
  total: number;
  avgNightly: number;
}

export interface StayFilters {
  kinds: StayKind[]; // empty = any
  pool: 'any' | 'pool' | 'private';
  minBedrooms: number;
  minBeds: number;
  maxPerNight?: number; // total for the group, per night
  area?: string;
  amenities: Amenity[];
  sort: 'price' | 'rating' | 'value' | 'beach' | 'centre';
  sources: StaySource[]; // empty = any
}

export interface Travellers {
  adults: number;
  children: number;
}

export type TransferChoice = 'none' | 'taxi' | 'car-hire';

export interface Extras {
  /** Hold bags per person, per direction. 0, 0.5 (shared), 1 or 2. */
  bagsPerPerson: number;
  transfer: TransferChoice;
  insurance: boolean;
  includeSpending: boolean;
}

export interface CostBreakdown {
  flights: number;
  bags: number;
  stay: number;
  transfers: number;
  insurance: number;
  bookableTotal: number;
  spending: number;
  grandTotal: number;
  perPerson: number;
  perPersonBookable: number;
  people: number;
}

/** The real flights/stay someone found via the links, overriding the estimates. */
export interface RealPicks {
  outUrl?: string;
  /** Per person, GBP. */
  outPrice?: number;
  backUrl?: string;
  backPrice?: number;
  stayUrl?: string;
  stayName?: string;
  /** Whole stay for the group, GBP. */
  stayPrice?: number;
}

export interface Trip {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  destId: string;
  origin: string;
  travellers: Travellers;
  startDate: ISODate;
  endDate: ISODate;
  nights: number;
  outbound?: FlightOption;
  inbound?: FlightOption;
  stay?: StayQuote;
  extras: Extras;
  costs: CostBreakdown;
  notes: string;
  booked: { flights: boolean; stay: boolean; transfers: boolean; insurance: boolean };
  label?: string;
  picks?: RealPicks;
}

export interface ParsedRequest {
  raw: string;
  travellers: Travellers;
  travellersFound: boolean;
  destIds: string[];
  destinationFound: boolean;
  vibeTags: Tag[];
  wantsHot: boolean;
  window: { start: ISODate; end: ISODate; label: string };
  fixedStart?: ISODate;
  nights: { min: number; max: number; ideal: number; label: string };
  budget?: { amount: number; per: 'person' | 'total'; explicitPer: boolean };
  priority: 'balanced' | 'cheap' | 'luxury';
  stay: {
    kinds: StayKind[];
    pool: 'any' | 'pool' | 'private';
    minBedrooms: number;
    amenities: Amenity[];
    nearBeach: boolean;
    central: boolean;
    allInclusive: boolean;
    breakfast: boolean;
    sources: StaySource[];
  };
  origin: string;
  originFound: boolean;
  directOnly: boolean;
  bagsPerPerson: number;
  notes: string[];
}

import type { OriginAirport } from '../types';

export const ORIGINS: OriginAirport[] = [
  { code: 'LON', skyscanner: 'lond', name: 'London (all airports)', city: 'London', aliases: ['london'], priceFactor: 1, airports: ['LGW', 'STN', 'LTN', 'LHR'] },
  { code: 'LHR', skyscanner: 'lhr', name: 'London Heathrow', city: 'London', aliases: ['heathrow', 'lhr'], priceFactor: 1.12, airports: ['LHR'] },
  { code: 'LGW', skyscanner: 'lgw', name: 'London Gatwick', city: 'London', aliases: ['gatwick', 'lgw'], priceFactor: 1.02, airports: ['LGW'] },
  { code: 'STN', skyscanner: 'stn', name: 'London Stansted', city: 'London', aliases: ['stansted', 'stn'], priceFactor: 0.96, airports: ['STN'] },
  { code: 'LTN', skyscanner: 'ltn', name: 'London Luton', city: 'London', aliases: ['luton', 'ltn'], priceFactor: 0.98, airports: ['LTN'] },
  { code: 'MAN', skyscanner: 'man', name: 'Manchester', city: 'Manchester', aliases: ['manchester', 'man'], priceFactor: 1.03, airports: ['MAN'] },
  { code: 'LBA', skyscanner: 'lba', name: 'Leeds Bradford', city: 'Leeds', aliases: ['leeds bradford', 'leeds', 'bradford', 'lba', 'yorkshire'], priceFactor: 1.1, airports: ['LBA'] },
  { code: 'BHX', skyscanner: 'bhx', name: 'Birmingham', city: 'Birmingham', aliases: ['birmingham', 'bhx', 'brum'], priceFactor: 1.06, airports: ['BHX'] },
  { code: 'BRS', skyscanner: 'brs', name: 'Bristol', city: 'Bristol', aliases: ['bristol', 'brs'], priceFactor: 1.06, airports: ['BRS'] },
  { code: 'EMA', skyscanner: 'ema', name: 'East Midlands', city: 'Nottingham', aliases: ['east midlands', 'nottingham', 'derby', 'ema'], priceFactor: 1.05, airports: ['EMA'] },
  { code: 'NCL', skyscanner: 'ncl', name: 'Newcastle', city: 'Newcastle', aliases: ['newcastle', 'ncl'], priceFactor: 1.1, airports: ['NCL'] },
  { code: 'LPL', skyscanner: 'lpl', name: 'Liverpool', city: 'Liverpool', aliases: ['liverpool', 'lpl'], priceFactor: 1.04, airports: ['LPL'] },
  { code: 'EDI', skyscanner: 'edi', name: 'Edinburgh', city: 'Edinburgh', aliases: ['edinburgh', 'edi'], priceFactor: 1.08, airports: ['EDI'] },
  { code: 'GLA', skyscanner: 'gla', name: 'Glasgow', city: 'Glasgow', aliases: ['glasgow', 'gla'], priceFactor: 1.09, airports: ['GLA'] },
  { code: 'BFS', skyscanner: 'bfs', name: 'Belfast International', city: 'Belfast', aliases: ['belfast', 'bfs'], priceFactor: 1.1, airports: ['BFS'] },
  { code: 'CWL', skyscanner: 'cwl', name: 'Cardiff', city: 'Cardiff', aliases: ['cardiff', 'cwl', 'wales'], priceFactor: 1.15, airports: ['CWL'] },
  { code: 'DUB', skyscanner: 'dub', name: 'Dublin', city: 'Dublin', aliases: ['dublin', 'dub', 'ireland'], priceFactor: 1.02, airports: ['DUB'] },
];

export const originByCode = (code: string): OriginAirport => ORIGINS.find((o) => o.code === code) ?? ORIGINS[0];

export interface AirlineInfo {
  name: string;
  code: string;
  lowCost: boolean;
  /** Price multiplier vs the cheapest carrier on a route. */
  factor: number;
  bag: number;
  longHaul?: boolean;
}

export const AIRLINES: Record<string, AirlineInfo> = {
  ryanair: { name: 'Ryanair', code: 'FR', lowCost: true, factor: 0.92, bag: 38 },
  easyjet: { name: 'easyJet', code: 'U2', lowCost: true, factor: 1.0, bag: 34 },
  jet2: { name: 'Jet2', code: 'LS', lowCost: true, factor: 1.12, bag: 32 },
  wizz: { name: 'Wizz Air', code: 'W6', lowCost: true, factor: 0.9, bag: 36 },
  tui: { name: 'TUI', code: 'BY', lowCost: false, factor: 1.18, bag: 0 },
  ba: { name: 'British Airways', code: 'BA', lowCost: false, factor: 1.35, bag: 0 },
  aerlingus: { name: 'Aer Lingus', code: 'EI', lowCost: false, factor: 1.2, bag: 30 },
  tap: { name: 'TAP Air Portugal', code: 'TP', lowCost: false, factor: 1.25, bag: 0 },
  vueling: { name: 'Vueling', code: 'VY', lowCost: true, factor: 1.05, bag: 30 },
  klm: { name: 'KLM', code: 'KL', lowCost: false, factor: 1.4, bag: 0 },
  virgin: { name: 'Virgin Atlantic', code: 'VS', lowCost: false, factor: 1.15, bag: 0, longHaul: true },
  emirates: { name: 'Emirates', code: 'EK', lowCost: false, factor: 1.2, bag: 0, longHaul: true },
  qatar: { name: 'Qatar Airways', code: 'QR', lowCost: false, factor: 1.1, bag: 0, longHaul: true },
  icelandair: { name: 'Icelandair', code: 'FI', lowCost: false, factor: 1.25, bag: 0 },
  pegasus: { name: 'Pegasus', code: 'PC', lowCost: true, factor: 0.95, bag: 30 },
  turkish: { name: 'Turkish Airlines', code: 'TK', lowCost: false, factor: 1.25, bag: 0 },
  swiss: { name: 'SWISS', code: 'LX', lowCost: false, factor: 1.45, bag: 0 },
  croatia: { name: 'Croatia Airlines', code: 'OU', lowCost: false, factor: 1.3, bag: 0 },
  airmalta: { name: 'KM Malta Airlines', code: 'KM', lowCost: false, factor: 1.2, bag: 0 },
};

/** Which airlines fly from each UK/IE origin (approximate, used to keep generated options plausible). */
export const ORIGIN_AIRLINES: Record<string, string[]> = {
  LHR: ['ba', 'aerlingus', 'tap', 'klm', 'virgin', 'emirates', 'qatar', 'icelandair', 'turkish', 'swiss', 'croatia', 'airmalta', 'vueling'],
  LGW: ['easyjet', 'ba', 'tui', 'wizz', 'vueling', 'tap', 'emirates', 'qatar', 'turkish', 'icelandair', 'jet2', 'airmalta', 'virgin'],
  STN: ['ryanair', 'jet2', 'easyjet', 'pegasus'],
  LTN: ['easyjet', 'wizz', 'ryanair', 'tui', 'jet2'],
  MAN: ['jet2', 'ryanair', 'easyjet', 'tui', 'ba', 'emirates', 'qatar', 'virgin', 'klm', 'aerlingus', 'turkish', 'pegasus', 'icelandair'],
  LBA: ['jet2', 'ryanair', 'tui', 'klm', 'aerlingus'],
  BHX: ['jet2', 'ryanair', 'easyjet', 'tui', 'emirates', 'klm', 'turkish', 'aerlingus', 'vueling'],
  BRS: ['easyjet', 'ryanair', 'tui', 'jet2', 'klm', 'aerlingus'],
  EMA: ['jet2', 'ryanair', 'tui'],
  NCL: ['jet2', 'easyjet', 'ryanair', 'tui', 'emirates', 'klm', 'aerlingus'],
  LPL: ['easyjet', 'ryanair', 'jet2', 'wizz'],
  EDI: ['easyjet', 'ryanair', 'jet2', 'tui', 'ba', 'klm', 'emirates', 'qatar', 'turkish', 'icelandair', 'aerlingus'],
  GLA: ['jet2', 'easyjet', 'ryanair', 'tui', 'ba', 'emirates', 'klm', 'icelandair'],
  BFS: ['easyjet', 'jet2', 'ryanair', 'tui'],
  CWL: ['tui', 'ryanair', 'klm', 'vueling', 'qatar'],
  DUB: ['ryanair', 'aerlingus', 'emirates', 'qatar', 'tui', 'klm', 'turkish', 'icelandair'],
};

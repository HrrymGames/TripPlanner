// Regenerates src/data/geo-places.txt and src/data/geo-airports.txt.
//
//   curl -LO https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv
//   node scripts/build-geo.mjs airports.csv
//
// Places come from GeoNames via the `all-the-cities` package (towns of 10k+ people plus smaller
// beach/lake/island resorts). Airports come from OurAirports (large + medium with scheduled flights).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const cities = require('all-the-cities');
const airportsCsv = process.argv[2];
if (!airportsCsv) throw new Error('Usage: node scripts/build-geo.mjs path/to/airports.csv');

const clean = (s) => s.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();

const RESORT = /\b(beach|playa|praia|plage|spiaggia|bay|sands|shores|key|keys|island|islands|isla|ilha|lake|springs|resort|ocean|marina|cove|coast|costa|lido|mar)\b/i;
const places = cities
  .filter((c) => c.population >= 10000 || (c.population >= 1000 && RESORT.test(c.name)))
  .sort((a, b) => b.population - a.population)
  .map((c) => [clean(c.name), c.country, clean(c.adminCode || ''), c.loc.coordinates[1].toFixed(2), c.loc.coordinates[0].toFixed(2), Math.max(1, Math.round(c.population / 1000))].join('|'));
writeFileSync('src/data/geo-places.txt', places.join('\n') + '\n');

// Minimal CSV parser (quoted fields, no embedded newlines in this file).
function parseLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
const lines = readFileSync(airportsCsv, 'utf8').split(/\r?\n/).filter(Boolean);
const head = parseLine(lines[0]);
const col = (name) => head.indexOf(name);
const airports = [];
for (const line of lines.slice(1)) {
  const f = parseLine(line);
  const type = f[col('type')];
  const iata = f[col('iata_code')];
  if (!iata || f[col('scheduled_service')] !== 'yes' || (type !== 'large_airport' && type !== 'medium_airport')) continue;
  const name = clean(f[col('name')]).replace(/\s+(International\s+)?Airport$/i, '').replace(/^(.{60}).*$/, '$1');
  const region = (f[col('iso_region')] || '').split('-')[1] || '';
  airports.push([iata, name, clean(f[col('municipality')] || ''), f[col('iso_country')], region, Number(f[col('latitude_deg')]).toFixed(3), Number(f[col('longitude_deg')]).toFixed(3), type === 'large_airport' ? 'L' : 'M'].join('|'));
}
writeFileSync('src/data/geo-airports.txt', airports.join('\n') + '\n');
console.log(`${places.length} places, ${airports.length} airports`);

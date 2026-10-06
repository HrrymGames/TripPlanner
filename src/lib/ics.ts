import type { Trip } from '../types';
import { destById } from '../data/destinations';
import { addDays } from './dates';

const stamp = (date: string, time?: string) => (time ? `${date.replace(/-/g, '')}T${time.replace(':', '')}00` : date.replace(/-/g, ''));
const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

/** Calendar file with the flights and the stay, so the trip lands in Apple/Google Calendar. */
export function tripToICS(trip: Trip): string {
  const dest = destById(trip.destId);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Trip Booker//EN', 'CALSCALE:GREGORIAN'];
  const event = (uid: string, summary: string, start: string, end: string, allDay: boolean, desc: string) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@tripbooker`, `DTSTAMP:${stamp(new Date().toISOString().slice(0, 10), '00:00')}`);
    lines.push(allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`, allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`);
    lines.push(`SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(desc)}`, 'END:VEVENT');
  };
  event(`${trip.id}-trip`, `✈️ ${trip.name}`, stamp(trip.startDate), stamp(addDays(trip.endDate, 1)), true, `${dest.name}, ${dest.country}`);
  if (trip.outbound) {
    const f = trip.outbound;
    event(`${trip.id}-out`, `Flight ${f.flightNo} ${f.from}→${f.to}`, stamp(f.date, f.depart), stamp(f.arriveNextDay ? addDays(f.date, 1) : f.date, f.arrive), false, `${f.airline} ${f.flightNo}. Times are local.`);
  }
  if (trip.inbound) {
    const f = trip.inbound;
    event(`${trip.id}-back`, `Flight ${f.flightNo} ${f.from}→${f.to}`, stamp(f.date, f.depart), stamp(f.arriveNextDay ? addDays(f.date, 1) : f.date, f.arrive), false, `${f.airline} ${f.flightNo}. Times are local.`);
  }
  if (trip.stay) {
    event(`${trip.id}-stay`, `🏠 ${trip.stay.listing.name}`, stamp(trip.startDate), stamp(trip.endDate), true, `${trip.stay.listing.area}, ${dest.name}`);
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

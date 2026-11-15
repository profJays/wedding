import { WeddingScheduleEvent } from '../types';

export function buildMapSearchUrl(venueQuery: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueQuery)}`;
}

export function buildDirectionsUrl(venueQuery: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(venueQuery)}`;
}

function toIcsLocalTimestamp(dateISO: string, time24: string): string {
  const [y, m, d] = dateISO.split('-');
  const [hh, mm] = time24.split(':');
  return `${y}${m}${d}T${hh}${mm}00`;
}

function addHours24(time24: string, hoursToAdd: number): string {
  const [hh, mm] = time24.split(':').map(Number);
  const total = Math.min(23, hh + hoursToAdd);
  return `${String(total).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function buildGoogleCalendarUrl(event: WeddingScheduleEvent, coupleNames: string): string {
  const startLocal = toIcsLocalTimestamp(event.dateISO, event.startTime24);
  const endTime = event.endTime24 || addHours24(event.startTime24, 3);
  const endLocal = toIcsLocalTimestamp(event.dateISO, endTime);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${coupleNames} — ${event.title}`,
    dates: `${startLocal}/${endLocal}`,
    ctz: 'Africa/Lagos',
    location: event.venueName,
    details: event.description
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcsFile(event: WeddingScheduleEvent, coupleNames: string): void {
  const startLocal = toIcsLocalTimestamp(event.dateISO, event.startTime24);
  const endTime = event.endTime24 || addHours24(event.startTime24, 3);
  const endLocal = toIcsLocalTimestamp(event.dateISO, endTime);
  const escapeIcs = (val: string) =>
    val.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mary and Joseph Wedding//mjay2026//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE',
    'TZID:Africa/Lagos',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0100',
    'TZNAME:WAT',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${event.id}@mjay2026`,
    `DTSTAMP:${startLocal}Z`,
    `DTSTART;TZID=Africa/Lagos:${startLocal}`,
    `DTEND;TZID=Africa/Lagos:${endLocal}`,
    `SUMMARY:${escapeIcs(`${coupleNames} — ${event.title}`)}`,
    `LOCATION:${escapeIcs(event.venueName)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.id}-mjay2026.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

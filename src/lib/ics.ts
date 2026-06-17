// Build a calendar (.ics) event with an alarm. Importing it into Google/Apple
// Calendar gives cross-device notifications, email reminders, and an alarm even
// when Liftoff is closed — without any backend.

const pad = (n: number) => String(n).padStart(2, '0');

function toICSDate(d: Date): string {
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

const escapeICS = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)) + '@liftoff';

export function buildICS({
  title,
  start,
  durationMins = 30,
  description,
}: {
  title: string;
  start: string | Date;
  durationMins?: number;
  description?: string;
}): string {
  const dtStart = new Date(start);
  const dtEnd = new Date(dtStart.getTime() + durationMins * 60000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Liftoff//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid()}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(dtStart)}`,
    `DTEND:${toICSDate(dtEnd)}`,
    `SUMMARY:${escapeICS(title)}`,
    description ? `DESCRIPTION:${escapeICS(description)}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICS(title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

export function downloadICS(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function googleCalendarUrl({
  title,
  start,
  durationMins = 30,
  description,
}: {
  title: string;
  start: string | Date;
  durationMins?: number;
  description?: string;
}): string {
  const dtStart = new Date(start);
  const dtEnd = new Date(dtStart.getTime() + durationMins * 60000);
  
  // Google wants YYYYMMDDTHHMMSSZ format
  const format = (d: Date) => toICSDate(d).replace(/[-:]/g, ''); 

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${format(dtStart)}/${format(dtEnd)}`,
  });
  
  if (description) {
    params.append('details', description);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

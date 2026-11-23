function escapeText(value) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|[\r\n]/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}

function foldLine(line) {
  const lines = [];
  let segment = '';
  let bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character);
    if (bytes + size > 75) {
      lines.push(segment);
      segment = ' ';
      bytes = 1;
    }
    segment += character;
    bytes += size;
  }
  lines.push(segment);
  return lines.join('\r\n');
}

function calendarTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

// Даты выгружаемой учебной недели используют московское время (UTC+03:00).
function timedEvent(date, time) {
  return calendarTimestamp(new Date(`${date}T${time}:00+03:00`));
}

export function exportCalendar(events, now) {
  const stamp = calendarTimestamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Digital Deanery//Student Calendar//RU',
    'CALSCALE:GREGORIAN',
  ];
  for (const event of events) {
    lines.push('BEGIN:VEVENT', `UID:${escapeText(event.id)}@deanery.local`, `DTSTAMP:${stamp}`);
    if (event.start) {
      lines.push(`DTSTART:${timedEvent(event.date, event.start)}`);
      if (event.end) lines.push(`DTEND:${timedEvent(event.date, event.end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`);
    }
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.place) lines.push(`LOCATION:${escapeText(event.place)}`);
    if (event.details) lines.push(`DESCRIPTION:${escapeText(event.details)}`);
    lines.push('END:VEVENT');
  }
  return lines.concat('END:VCALENDAR', '').map(foldLine).join('\r\n');
}

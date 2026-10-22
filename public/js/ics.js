// iCalendar (.ics) export: one all-day event per training day.

const escapeText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
export function foldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curLen + len > limit) {
      parts.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const compact = (ymd) => ymd.replace(/-/g, '');

function nextDay(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildIcs(plan, planId, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hyrox Plan Builder//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Hyrox plan'];
  for (const week of plan.weeks) {
    for (const day of week.days) {
      if (day.effort === 'rest') continue;
      const wod = day.wod ? ['', `Then: CrossFit WOD · ${day.wod.title}`, ...day.wod.lines, day.wod.note] : [];
      const desc = [day.note, ...day.lines, ...wod].filter((l) => l != null).join('\n').trim();
      lines.push(
        'BEGIN:VEVENT',
        `UID:${planId}-${day.key}@hyrox-plan-builder`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${compact(day.ymd)}`,
        `DTEND;VALUE=DATE:${compact(nextDay(day.ymd))}`,
        `SUMMARY:${escapeText(`Hyrox W${week.n} · ${day.label}`)}`,
        `DESCRIPTION:${escapeText(desc)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

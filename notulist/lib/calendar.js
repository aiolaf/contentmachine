// Agenda: on the Mac app straight from macOS Calendar (all your accounts), on the
// iPhone through a tiny Google Apps Script that only you can call.
import { nameFromEmail } from './util.js';

export function appsScriptCode(key) {
  return `// Notulist agenda-koppeling. Plak dit in script.google.com, Implementeren > Nieuwe implementatie > Web-app.
// Uitvoeren als: Ikzelf. Toegang: Iedereen. Kopieer de web-app-URL naar Notulist.
const KEY = '${key}';

function doGet(e) {
  if (!e || !e.parameter || e.parameter.key !== KEY) return out_({ error: 'unauthorized' });
  const days = Math.min(Number(e.parameter.days) || 7, 31);
  const from = new Date(Date.now() - 24 * 3600 * 1000);
  const to = new Date(Date.now() + days * 24 * 3600 * 1000);
  const me = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const events = CalendarApp.getDefaultCalendar().getEvents(from, to)
    .filter(function (ev) { return !ev.isAllDayEvent() && ev.getMyStatus() !== CalendarApp.GuestStatus.NO; })
    .map(function (ev) {
      const text = (ev.getLocation() || '') + ' ' + (ev.getDescription() || '');
      const link = (text.match(/https:\\/\\/[^\\s"<>]*(zoom\\.us|teams\\.microsoft\\.com|teams\\.live\\.com|meet\\.google\\.com|whereby\\.com|webex\\.com)[^\\s"<>]*/i) || [''])[0];
      return {
        id: ev.getId() + '@' + ev.getStartTime().getTime(),
        title: ev.getTitle(),
        start: ev.getStartTime().toISOString(),
        end: ev.getEndTime().toISOString(),
        location: ev.getLocation() || '',
        link: link,
        attendees: ev.getGuestList(true).map(function (g) {
          return { name: g.getName() || '', email: g.getEmail() || '', self: (g.getEmail() || '').toLowerCase() === me };
        })
      };
    });
  return out_({ events: events });
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
`;
}

export function normalizeEvents(list = []) {
  return list
    .filter((e) => e && e.start && e.end)
    .map((e) => ({
      id: String(e.id || `${e.title}@${e.start}`),
      title: String(e.title || 'Afspraak').trim(),
      start: new Date(e.start).toISOString(),
      end: new Date(e.end).toISOString(),
      location: e.location || '',
      link: e.link || '',
      attendees: (e.attendees || [])
        .filter((a) => a && (a.name || a.email))
        .filter((a) => !/resource\.calendar\.google\.com$/i.test(a.email || ''))
        .map((a) => ({ name: String(a.name || '').trim() || nameFromEmail(a.email), email: String(a.email || '').toLowerCase(), self: !!a.self })),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function fetchAppsScript(url, key, days = 7) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !/(^|\.)script\.google(usercontent)?\.com$/.test(u.hostname)) {
    throw new Error('Dit is geen Google Apps Script-adres. Het moet beginnen met https://script.google.com/macros/s/');
  }
  u.searchParams.set('key', key);
  u.searchParams.set('days', String(days));
  const res = await fetch(u, { cache: 'no-store', credentials: 'omit', redirect: 'follow' });
  if (!res.ok) throw new Error(`Agenda niet bereikbaar (${res.status}).`);
  const json = await res.json().catch(() => { throw new Error('De agenda gaf geen geldige gegevens. Staat de toegang op "Iedereen"?'); });
  if (json.error) throw new Error(json.error === 'unauthorized' ? 'De sleutel in het script klopt niet. Kopieer het script opnieuw.' : json.error);
  return normalizeEvents(json.events);
}

// The meeting you are in now, or the next one within the hour.
export function relevantEvents(events, now = Date.now()) {
  const soon = 60 * 60 * 1000;
  return events.filter((e) => {
    const s = Date.parse(e.start);
    const end = Date.parse(e.end);
    return end > now - 10 * 60 * 1000 && s < now + soon;
  });
}

export function eventAt(events, time = Date.now()) {
  const hits = events.filter((e) => Date.parse(e.start) - 10 * 60 * 1000 <= time && Date.parse(e.end) >= time);
  hits.sort((a, b) => Math.abs(Date.parse(a.start) - time) - Math.abs(Date.parse(b.start) - time));
  return hits[0] || null;
}

export function otherAttendees(event) {
  return (event?.attendees || []).filter((a) => !a.self);
}

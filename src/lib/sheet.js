// Build-time data layer for the Kinder Sefarim Bibliography.
//
// The catalog lives in a Google Sheet. At build time we pull the sheet as CSV
// (the public "gviz" export endpoint), parse it, and map each row into a book
// record. The mapping is ported verbatim from the Claude Design prototype so the
// column conventions match the sheet the design was built against.
//
// Publishing an update = a rebuild. A Netlify build hook (fired by a Google
// Apps Script edit trigger — see apps-script/) reruns this on every sheet edit.

import { SAMPLE } from './sample.js';

// Defaults baked into the repo; override via env (Netlify env vars / .env).
export const SHEET_ID = process.env.SHEET_ID || '';
export const SHEET_GID = process.env.SHEET_GID || '0';

// ---------- CSV ----------
export function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export function mapRows(rows) {
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const ix = (n) => head.indexOf(n);
  const splitList = (s) => (s || '').split(';').map((x) => x.trim()).filter(Boolean);
  const uniq = (a) => [...new Set(a)];
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const g = (n) => { const i = ix(n); return i >= 0 && row[i] != null ? String(row[i]).trim() : ''; };
    const title = g('title');
    if (!title) continue;

    // byline
    let byline = g('responsibility-transcribed');
    if (!byline) {
      const cr = [];
      for (let k = 1; k <= 5; k++) { const nm = g('creator' + k); if (nm) cr.push(nm); }
      byline = cr.join('; ') || g('corp1');
    }

    // year (most recent 4-digit in dates)
    const ys = (g('dates').match(/\d{4}/g) || []).map(Number);
    const year = ys.length ? String(Math.max(...ys)) : '—';
    const decade = ys.length ? Math.floor(Math.max(...ys) / 10) * 10 + 's' : '—';

    // form / genre
    const formRaw = splitList(g('form'));
    const type = /^0/.test(formRaw[0] || '') ? 'Nonfiction' : 'Fiction';
    const forms = uniq(
      formRaw
        .map((f) => f.replace(/^[01]\s*\([^)]*\)/, '').trim())
        .filter((f) => f && !/^fiction$/i.test(f) && !/^nonfiction$/i.test(f)),
    );

    // audience
    const audRaw = g('aud');
    const audM = audRaw.match(/\(([^)]+)\)/);
    const audience = audRaw ? (audM ? audM[1] : audRaw).replace(/^\w/, (c) => c.toUpperCase()) : '';

    // language
    const langRaw = (g('lang').split(';')[0] || '').trim().toLowerCase();
    const langMap = { eng: 'English', heb: 'Hebrew', yid: 'Yiddish', ara: 'Aramaic' };
    const lang = langMap[langRaw] || (langRaw ? langRaw : '—');

    const topics = splitList(g('subjtopic'));
    const subjects = uniq(
      [].concat(
        splitList(g('subjtopic')), splitList(g('subjname')), splitList(g('subjcorp')),
        splitList(g('subjtitle')), splitList(g('subjloc')), splitList(g('subjtime')),
      ),
    );

    const summary = g('summary').split(';')[0].replace(/\s*--.*$/, '').trim();
    const isbn = (splitList(g('isbn'))[0] || '—').replace(/\s*\(.*\)/, '');
    const oclc = g('oclc').split(';')[0] || '—';
    const series = g('series1') ? g('series1') + (g('volume1') ? ', ' + g('volume1') : '') : '—';

    const coverH = forms.some((f) => /picture|comic|graphic/i.test(f)) ? '58px' : '82px';

    out.push({
      id: 'b' + r, title, byline: byline || '—',
      publisher: g('publisher1') || '—', year, pages: g('pages') || '—',
      size: g('size') || '—', isbn, oclc, lccn: g('lcnum') || '—',
      callnum: g('callnum') || '—', lang, series, edition: g('edition') || '—',
      summary, subjects,
      f_type: type, f_forms: forms.length ? forms : ['Unspecified'],
      f_aud: audience || 'Unspecified', f_topics: topics, f_lang: lang,
      f_decade: decade, f_publisher: g('publisher1') || 'Unknown', coverH,
    });
  }
  return out;
}

// ---------- facets ----------
export const FACET_DEFS = [
  { id: 'f_type', name: 'Type', arr: false },
  { id: 'f_forms', name: 'Form / genre', arr: true },
  { id: 'f_aud', name: 'Audience', arr: false },
  { id: 'f_topics', name: 'Subject', arr: true },
  { id: 'f_lang', name: 'Language', arr: false },
  { id: 'f_decade', name: 'Decade', arr: false },
  { id: 'f_publisher', name: 'Publisher', arr: false },
];

// Precompute facet groups + option counts from the full catalog. The browse page
// renders these server-side; the client only toggles selection state.
export function buildFacets(books) {
  return FACET_DEFS.map((def) => {
    const counts = {};
    books.forEach((b) => {
      const vals = def.arr ? b[def.id] || [] : [b[def.id]];
      vals.forEach((v) => { if (v) counts[v] = (counts[v] || 0) + 1; });
    });
    let keys = Object.keys(counts);
    if (def.id === 'f_decade') keys.sort().reverse();
    else keys.sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    const cap = def.id === 'f_topics' || def.id === 'f_publisher' ? 12 : 99;
    const opts = keys.slice(0, cap).map((v) => ({ value: v, count: counts[v] }));
    return { id: def.id, name: def.name, arr: def.arr, opts };
  });
}

// Chips shown on a browse row: type + first form (matches the design).
export function rowChips(b) {
  return [b.f_type].concat((b.f_forms || []).slice(0, 1)).filter((x) => x && x !== 'Unspecified');
}

// "Type / form" line on the record page.
export function typeForm(b) {
  return (
    [b.f_type].concat(b.f_forms || []).filter((x) => x && x !== 'Unspecified').join(' · ') || '—'
  );
}

// ---------- build-time load ----------
// Returns { books, source }. source: 'sheet' | 'sample' | 'error'.
export async function getBooks() {
  if (!SHEET_ID) {
    console.warn('[sheet] No SHEET_ID set — building with sample data.');
    return { books: SAMPLE, source: 'sample' };
  }
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    const books = mapRows(parseCSV(txt));
    if (!books.length) throw new Error('no rows mapped from sheet');
    console.log(`[sheet] Loaded ${books.length} records from Google Sheets.`);
    return { books, source: 'sheet' };
  } catch (err) {
    console.error(`[sheet] Failed to load sheet (${err.message}). Falling back to sample data.`);
    return { books: SAMPLE, source: 'error' };
  }
}

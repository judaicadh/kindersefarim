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

// Live data source: a Google Sheet "Publish to web" CSV endpoint
// (File → Share → Publish to web → whole sheet or tab → CSV). Every build
// fetches it, and because the sheet is set to auto-republish on edit, catalog
// changes flow into the next rebuild (the Apps Script build hook triggers that
// rebuild — see apps-script/). Override with the SHEET_CSV_URL env var; the
// default below is this project's own published Phase 1 sheet.
export const SHEET_CSV_URL = process.env.SHEET_CSV_URL ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ60BYKnPuLBXVYUEF-O_0cR_Rhdkt3iqIQpGjrq2hFFre5htSOcTow6Si0ghNMQ1jqFv1i1ZkRxrad/pub?gid=664826615&single=true&output=csv';

// Alternative source: a plain spreadsheet id + tab gid, used to build the gviz
// CSV export URL when SHEET_CSV_URL is not set. Requires the sheet be shared
// "Anyone with the link". Override via env.
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

    // structured contributors (creator1..creator5 + role columns)
    const creators = [];
    for (let k = 1; k <= 5; k++) {
      const nm = g('creator' + k);
      if (!nm) continue;
      // Note: the sheet header has "creator4role1" (a typo) rather than
      // "creator4role" — accept either so nothing is dropped.
      const roleRaw = g('creator' + k + 'role') || g('creator' + k + 'role1');
      const roles = splitList(roleRaw).map(capitalize);
      creators.push({
        name: normalizePersonName(nm),
        sortKey: sortKeyName(nm),
        roles: roles.length ? roles : ['Contributor'],
      });
    }

    // byline: prefer the transcribed statement of responsibility, else build
    // one from the structured contributors, else the corporate author.
    let byline = g('responsibility-transcribed');
    if (!byline) byline = creators.map((c) => c.name).join('; ') || g('corp1');

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
    // subjloc holds "CODE (Place);Place" — keep the readable place name, drop
    // the MARC geographic code so it never surfaces as a chip or facet value.
    const places = uniq(
      splitList(g('subjloc')).map((v) => { const m = v.match(/\(([^)]+)\)/); return (m ? m[1] : v).trim(); }),
    );
    const periods = splitList(g('subjtime'));
    const subjects = uniq(
      [].concat(
        splitList(g('subjtopic')), splitList(g('subjname')), splitList(g('subjcorp')),
        splitList(g('subjtitle')), places, periods,
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
      summary, subjects, creators, thumbnail: g('thumbnail'),
      f_type: type, f_forms: forms.length ? forms : ['Unspecified'],
      f_aud: audience || 'Unspecified', f_topics: topics, f_lang: lang,
      f_place: places, f_period: periods,
      f_decade: decade, f_publisher: g('publisher1') || 'Unknown', coverH,
    });
  }
  return out;
}

// ---------- Phase 1 CSV ----------
// The "Kinder Sefarim Phase 1" export has its own column layout (KS#, book-title,
// creator-N / creator-N-role, startyear/endyear for the historical setting,
// copyright-date for publication, geographic + MARC subject columns). This maps
// a parsed row into the same book record shape the pages consume, plus numeric
// year fields (pubYear, setStart, setEnd) that drive the two timesliders.

// "168 BCE" -> -168, "63 CE" -> 63, "1939" -> 1939, "70-1789" -> 70. null if none.
function parseYear(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/\d{1,4}/);
  if (!m) return null;
  let y = parseInt(m[0], 10);
  if (/\bb\.?c\.?(e)?\b/i.test(s)) y = -y;
  return y;
}

export function mapPhase1Rows(rows) {
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const ix = (n) => head.indexOf(n);
  const splitList = (s) => (s || '').split(';').map((x) => x.trim()).filter(Boolean);
  const uniq = (a) => [...new Set(a)];
  const out = [];
  const seenKeys = new Set(); // id+title, to drop exact duplicate rows
  const seenIds = new Set(); // enforce unique ids for static routes
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const g = (n) => { const i = ix(n); return i >= 0 && row[i] != null ? String(row[i]).trim() : ''; };
    const title = g('book-title');
    if (!title) continue;
    const rawId = g('ks#') || 'b' + r;
    const dupKey = rawId + '\u0000' + title;
    if (seenKeys.has(dupKey)) continue; // identical row already emitted
    seenKeys.add(dupKey);
    let id = rawId, n = 2;
    while (seenIds.has(id)) id = rawId + '-' + n++;
    seenIds.add(id);

    // contributors: creator-1..5 with matching role columns (creator-5 has none).
    const creators = [];
    for (let k = 1; k <= 5; k++) {
      const nm = g('creator-' + k);
      if (!nm) continue;
      const roles = splitList(g('creator-' + k + '-role')).map(capitalize);
      const flat = normalizePersonName(nm);
      creators.push({
        name: flat,
        // natural-order names ("Avraham Ohayon") have no comma, so key on surname.
        sortKey: nm.includes(',') ? sortKeyName(nm) : lastName(flat),
        roles: roles.length ? roles : ['Contributor'],
      });
    }
    const byline = creators.map((c) => c.name).join('; ') || '—';

    // publication year (copyright-date) and historical-setting range (start/end).
    const pubYear = parseYear(g('copyright-date'));
    const sStart = parseYear(g('startyear'));
    const sEnd = parseYear(g('endyear'));
    const setStart = sStart != null ? sStart : sEnd;
    const setEnd = sEnd != null ? sEnd : sStart;

    // "Translated from Hebrew" -> ["Hebrew"]
    const translated = uniq(
      splitList(g('language'))
        .map((seg) => { const m = seg.match(/translated from\s+([a-zÀ-ɏ]+)/i); return m ? capitalize(m[1]) : ''; })
        .filter(Boolean),
    );

    // place: prefer named countries (country-1..8), else continents.
    const countries = uniq([1, 2, 3, 4, 5, 6, 7, 8].map((n) => g('country-' + n)).filter(Boolean));
    const continents = uniq([1, 2, 3, 4, 5, 6, 7, 8].map((n) => g('continent-' + n)).filter(Boolean));
    const places = countries.length ? countries : continents;

    const topics = splitList(g('subjects'));
    const forms = splitList(g('form'));
    const genres = splitList(g('genres'));
    const events = splitList(g('events'));
    const periods = splitList(g('centuryspan'));

    // named subject access points (personal / corporate / title) for the record.
    const names600 = uniq([1, 2, 3, 4, 5, 6, 7].map((n) => g('600-' + n)).filter(Boolean).map(normalizePersonName));
    const corp610 = uniq([1, 2, 3].map((n) => g('610-' + n)).filter(Boolean));
    const title630 = splitList(g('630'));
    const subjects = uniq([].concat(topics, names600, corp610, title630, events, places));

    const type = /nonfiction/i.test(g('ficnon')) ? 'Nonfiction' : /fiction/i.test(g('ficnon')) ? 'Fiction' : 'Unspecified';
    const series = g('series') ? g('series') + (g('volume') ? ', ' + g('volume') : '') : '—';
    const setLabel = (setStart != null ? fmtYear(setStart) + (setEnd !== setStart ? '–' + fmtYear(setEnd) : '') : '')
      || periods[0] || events[0];
    const coverH = /picture|comic|graphic|board/i.test(forms.join(' ')) ? '58px' : '82px';

    out.push({
      id, title, byline,
      publisher: g('publisher') || '—',
      year: pubYear != null ? String(pubYear) : '—',
      pages: '—', size: '—', isbn: '—', oclc: '—', lccn: '—', callnum: '—',
      lang: '—', series, edition: '—', summary: '', subjects, creators, thumbnail: '',
      distributor: g('distributor') || '—',
      f_type: type,
      f_forms: forms.length ? forms : ['Unspecified'],
      f_genres: genres,
      f_aud: '',
      f_topics: topics,
      f_place: places,
      f_period: periods,
      f_events: events,
      f_translated: translated,
      f_lang: '',
      f_publisher: g('publisher') || 'Unknown',
      f_decade: pubYear != null ? Math.floor(pubYear / 10) * 10 + 's' : '',
      pubYear, setStart, setEnd, setLabel,
      coverH,
    });
  }
  return out;
}

// Format a signed year for display: -168 -> "168 BCE", 1939 -> "1939".
export function fmtYear(y) {
  if (y == null || Number.isNaN(y)) return '—';
  return y < 0 ? `${-y} BCE` : String(y);
}

// ---------- facets ----------
// Order here is the order facets render in the browse rail. Any facet with no
// values on a given build is hidden automatically (see index.astro), so the
// same list serves the Phase 1 CSV, a live sheet, and the sample data.
export const FACET_DEFS = [
  { id: 'f_type', name: 'Type', arr: false },
  { id: 'f_forms', name: 'Format', arr: true },
  { id: 'f_genres', name: 'Genre', arr: true },
  { id: 'f_topics', name: 'Subject', arr: true },
  { id: 'f_place', name: 'Place', arr: true },
  { id: 'f_events', name: 'Historical events', arr: true },
  { id: 'f_translated', name: 'Translated from', arr: true },
  { id: 'f_aud', name: 'Audience', arr: false },
  { id: 'f_lang', name: 'Language', arr: false },
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
    // Searchable, scrollable facet groups can expose the complete vocabulary.
    const opts = keys.map((v) => ({ value: v, count: counts[v] }));
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

// ---------- people / series / publishers ----------
// URL-safe slug from an arbitrary label.
export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function capitalize(s) {
  return String(s || '').trim().replace(/^\w/, (c) => c.toUpperCase());
}

// Strip a trailing life-date qualifier like ", 1938-" or ", 1916-2000".
function stripDates(s) {
  return String(s).replace(/,\s*\d{3,4}\??-?(?:\d{3,4})?\.?\s*$/, '').trim();
}

// Catalog name ("Firestone, Beth, 1950-") -> display name ("Beth Firestone").
export function normalizePersonName(raw) {
  const s = stripDates(raw);
  const parts = s.split(',');
  const flipped = parts.length === 2 ? `${parts[1].trim()} ${parts[0].trim()}` : s;
  return flipped.replace(/\s+/g, ' ').trim();
}

// Surname-first key for alphabetizing ("firestone, beth").
function sortKeyName(raw) {
  return stripDates(raw).toLowerCase();
}

// Contributors for a book: structured creators when present, else parsed byline.
function bookCreators(b) {
  return b.creators && b.creators.length ? b.creators : parseCreators(b.byline);
}

// Role prefixes we strip off a byline segment, longest/most-specific first.
const ROLE_PATTERNS = [
  { re: /^illustrat(?:ed|ions?|or)?\s*(?:by)?\s*[:]?\s*/i, role: 'Illustrator' },
  { re: /^(?:photograph(?:s|y|ed)?|photos?)\s*(?:by)?\s*[:]?\s*/i, role: 'Photographer' },
  { re: /^translat(?:ed|ion|or)?\s*(?:by)?\s*[:]?\s*/i, role: 'Translator' },
  { re: /^edit(?:ed|or)?\s*(?:by)?\s*[:]?\s*/i, role: 'Editor' },
  { re: /^adapt(?:ed|ation)?\s*(?:by)?\s*[:]?\s*/i, role: 'Adapter' },
  { re: /^(?:written|text|story)\s*(?:by)?\s*[:]?\s*/i, role: 'Author' },
  { re: /^by\s+/i, role: 'Author' },
];

// Split a byline into { name, role } contributors. Names within one segment may
// be joined by "&" or "and"; segments are separated by ";".
export function parseCreators(byline) {
  if (!byline || byline === '—') return [];
  const out = [];
  for (let seg of String(byline).split(';')) {
    seg = seg.trim();
    if (!seg) continue;
    let role = 'Author';
    for (const p of ROLE_PATTERNS) {
      if (p.re.test(seg)) { role = p.role; seg = seg.replace(p.re, ''); break; }
    }
    for (const raw of seg.split(/\s*&\s*|\s+and\s+/i)) {
      const name = raw.replace(/^[\s,.;:]+|[\s,;:]+$/g, '').trim();
      if (name && /[a-zÀ-ɏ]/i.test(name)) out.push({ name, role });
    }
  }
  return out;
}

// Split a subject heading into its hierarchy levels on " : ".
// "Emotions : Fear" -> ["Emotions", "Fear"]; "Sabbath" -> ["Sabbath"].
export function subjectLevels(s) {
  return String(s || '').split(/\s*:\s*/).map((x) => x.trim()).filter(Boolean);
}

// Every ancestor path of a heading, for facet matching.
// "War : Israeli wars : Six-Day War" -> ["War", "War : Israeli wars", "War : Israeli wars : Six-Day War"].
export function subjectPaths(raw) {
  const levels = subjectLevels(raw);
  return levels.map((_, i) => levels.slice(0, i + 1).join(' : '));
}

// Nested subject facet from the books' raw subject topics. Headings with no
// " : " come back as primaries with an empty children list, so a flat
// vocabulary renders identically to a nested one.
// -> [{ primary, count, children: [{ value, label, count }] }]
export function buildSubjectTree(books) {
  const prim = new Map();
  for (const b of books) {
    for (const raw of b.f_topics || []) {
      const levels = subjectLevels(raw);
      const p0 = levels[0];
      if (!p0) continue;
      let p = prim.get(p0);
      if (!p) { p = { primary: p0, books: new Set(), children: new Map() }; prim.set(p0, p); }
      p.books.add(b);
      if (levels.length > 1) {
        const full = levels.join(' : ');
        let c = p.children.get(full);
        if (!c) { c = { value: full, label: levels.slice(1).join(' : '), books: new Set() }; p.children.set(full, c); }
        c.books.add(b);
      }
    }
  }
  return [...prim.values()]
    .map((p) => ({
      primary: p.primary,
      count: p.books.size,
      children: [...p.children.values()]
        .map((c) => ({ value: c.value, label: c.label, count: c.books.size }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.count - a.count || a.primary.localeCompare(b.primary));
}

// Group key for a series (drop the trailing "vol." / "volume" designation).
export function seriesKey(s) {
  if (!s || s === '—') return '';
  return s.replace(/,?\s*(?:vol\.?|volume|no\.?|book)\s.*$/i, '').trim();
}

function lastName(n) {
  const p = String(n).trim().split(/\s+/);
  return (p[p.length - 1] || '').toLowerCase();
}

// [{ name, slug, roles:[], sortKey, books:[] }] across all contributors,
// sorted by surname.
export function buildCreators(books) {
  const map = new Map();
  for (const b of books) {
    for (const c of bookCreators(b)) {
      const slug = slugify(c.name);
      if (!slug) continue;
      let e = map.get(slug);
      if (!e) {
        e = { name: c.name, slug, sortKey: c.sortKey || lastName(c.name), roles: new Set(), books: [] };
        map.set(slug, e);
      }
      for (const r of (Array.isArray(c.roles) ? c.roles : [c.role])) if (r) e.roles.add(r);
      if (!e.books.includes(b)) e.books.push(b);
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, roles: [...e.roles] }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.name.localeCompare(b.name));
}

// [{ name, slug, books:[] }] of series, sorted alphabetically.
export function buildSeries(books) {
  const map = new Map();
  for (const b of books) {
    const name = seriesKey(b.series);
    if (!name) continue;
    const slug = slugify(name);
    let e = map.get(slug);
    if (!e) { e = { name, slug, books: [] }; map.set(slug, e); }
    e.books.push(b);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// [{ name, slug, books:[] }] of publishers, sorted alphabetically.
export function buildPublishers(books) {
  const map = new Map();
  for (const b of books) {
    const name = (b.publisher || '').trim();
    if (!name || name === '—') continue;
    const slug = slugify(name);
    let e = map.get(slug);
    if (!e) { e = { name, slug, books: [] }; map.set(slug, e); }
    e.books.push(b);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Render a byline as HTML, linking each known contributor name to its page.
// `creators` is the book's contributor list — only those names get linked, so a
// link never points at a page that wasn't generated.
export function linkifyByline(byline, creators) {
  if (!byline || byline === '—') return escapeHtml(byline || '—');
  let html = escapeHtml(byline);
  const list = creators && creators.length ? creators : parseCreators(byline);
  const names = [...new Set(list.map((c) => c.name))]
    .sort((a, b) => b.length - a.length); // longest first, avoids partial hits
  for (const name of names) {
    const esc = escapeHtml(name);
    const anchor = `<a href="/authors/${slugify(name)}/" style="color:#8a5a12">${esc}</a>`;
    html = html.split(esc).join(anchor);
  }
  return html;
}

// Read the committed Phase 1 CSV as text at build time. Primary path is Vite's
// `?raw` import, which inlines the file during `astro dev` and `astro build`
// regardless of where the bundle ends up; the fs read is a plain-Node fallback
// (e.g. unit tests importing this module directly). Returns '' if unavailable.
async function loadPhase1CSV() {
  try {
    const mod = await import('../data/kinder-sefarim-phase-1.csv?raw');
    if (mod?.default) return mod.default;
  } catch { /* not running under Vite — try fs below */ }
  try {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const here = fileURLToPath(new URL('../data/kinder-sefarim-phase-1.csv', import.meta.url));
    return readFileSync(here, 'utf8');
  } catch {
    try {
      const { readFileSync } = await import('node:fs');
      return readFileSync(process.cwd() + '/src/data/kinder-sefarim-phase-1.csv', 'utf8');
    } catch (err) {
      console.warn(`[data] No local Phase 1 CSV (${err.message}).`);
      return '';
    }
  }
}

// The live CSV URL to fetch: the published-to-web endpoint, else a gviz export
// built from a spreadsheet id, else '' (no live source — use the committed CSV).
export function sheetCsvUrl() {
  if (SHEET_CSV_URL) return SHEET_CSV_URL;
  if (SHEET_ID) return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
  return '';
}

// ---------- build-time load ----------
// Returns { books, source }. source: 'sheet' | 'local' | 'sample' | 'error'.
// Preference order: the live published sheet, then the committed Phase 1 CSV
// (offline fallback / local dev), then the baked-in sample. The sheet and the
// CSV share the Phase 1 column layout, so one mapper handles both.
//
// Memoized: a build generates thousands of pages across several entry modules,
// and this guarantees every page sees one consistent fetch rather than a dozen
// round-trips (or, worse, different snapshots if the sheet changes mid-build).
let _booksPromise = null;
export function getBooks() {
  if (!_booksPromise) _booksPromise = loadBooks();
  return _booksPromise;
}

async function loadBooks() {
  const url = sheetCsvUrl();
  if (url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const books = mapPhase1Rows(parseCSV(await res.text()));
      if (!books.length) throw new Error('no rows mapped from sheet');
      console.log(`[sheet] Loaded ${books.length} records from the live published sheet.`);
      return { books, source: 'sheet' };
    } catch (err) {
      console.error(`[sheet] Failed to load live sheet (${err.message}). Falling back to the committed CSV.`);
    }
  }

  const csv = await loadPhase1CSV();
  if (csv) {
    const books = mapPhase1Rows(parseCSV(csv));
    if (books.length) {
      console.log(`[data] Loaded ${books.length} records from the committed Phase 1 CSV.`);
      return { books, source: url ? 'error' : 'local' };
    }
  }

  console.warn('[sheet] No sheet and no CSV — building with sample data.');
  return { books: SAMPLE, source: 'sample' };
}

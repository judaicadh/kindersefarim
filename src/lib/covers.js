import catalogCovers from '../data/cover-sources.json';
import archive from '../data/cover-archive.json';
import { COVER_SOURCES } from './isbn-covers.js';
export { COVER_SOURCES } from './isbn-covers.js';

// ISBN-verified publisher/retailer artwork. Sheet thumbnails take priority.
// Preserved local artwork takes priority; source credits remain attached.
export function coverFor(book) {
  const match = COVER_SOURCES[String(book.isbn || '').replace(/[^0-9X]/gi, '')];
  // The uploaded CSV has stable KS IDs but no ISBNs. Guard against a future
  // ID being reused for a different title before applying its researched cover.
  const catalogMatch = catalogCovers[book.id];
  const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase();
  const researched = catalogMatch && normalize(catalogMatch.title) === normalize(book.title) ? catalogMatch : undefined;
  const cover = book.thumbnail ? { image: book.thumbnail } : (match || researched);
  const saved = cover && archive.assets[cover.image];
  return saved ? { ...cover, image: saved.web.path, originalImage: cover.image, preserved: true, width: saved.web.width, height: saved.web.height } : cover;
}

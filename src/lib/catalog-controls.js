import { bookCreators, slugify } from './sheet.js';
// Keep formats with capitalization differences together without changing source records.
export const formatsFor = (book) => [...new Set((book.f_forms || [])
  .filter(value => value && value !== 'Unspecified')
  .map(value => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()))];
export const formatsAcross = (books) => [...new Set(books.flatMap(formatsFor))].sort((a, b) => a.localeCompare(b));
export function datesAcross(books) {
  const years = books.map(book => book.pubYear).filter(year => year != null && Number.isFinite(Number(year))).map(Number);
  return { oldest: years.length ? Math.min(...years) : '', newest: years.length ? Math.max(...years) : '' };
}

export function rolesForCreator(book, creatorSlug) {
  return [...new Set(bookCreators(book)
    .filter(person => slugify(person.name) === creatorSlug)
    .flatMap(person => Array.isArray(person.roles) ? person.roles : [person.role || 'Contributor']))];
}

// Sort numbered catalog records numerically, independently of spreadsheet order.
// Records without a KS number stay after the numbered records in source order.
export function compareCatalogOrder(a, b) {
  const left = /^KS(\d+)(?:-(\d+))?$/i.exec(a.id || '');
  const right = /^KS(\d+)(?:-(\d+))?$/i.exec(b.id || '');
  if (!left || !right) return Number(!left) - Number(!right);
  return Number(left[1]) - Number(right[1]) || Number(left[2] || 0) - Number(right[2] || 0);
}

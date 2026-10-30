import { coverFor } from './covers.js';
// Keep the catalog order; skip books without artwork rather than showing an
// empty image when another volume has a preserved cover.
export const seriesImageBook = series => series.books.find(book => coverFor(book)) || series.books[0];

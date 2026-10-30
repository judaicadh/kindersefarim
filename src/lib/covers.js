// ISBN-verified publisher/retailer artwork. Sheet thumbnails take priority.
// Images remain hosted by their respective owners; sources are credited on records.
export const COVER_SOURCES = {
  '9781600915017': {
    image: 'https://israelbookshoppublications.com/cdn/shop/files/c449_1817_detail_medium.gif?v=1708017227',
    source: 'https://israelbookshoppublications.com/products/i-cant-wait-for-shabbos',
    credit: 'Israel Bookshop Publications',
  },
  '9781607632412': {
    image: 'https://www.yaelanddovy.com/wp-content/uploads/2022/09/Dovy-Learns-to-Share-Book.jpg',
    source: 'https://www.yaelanddovy.com/product/dovy-learns-to-share-book/',
    credit: 'Lite Child',
  },
  '9781929628384': {
    image: 'https://www.hachai.com/wp-content/uploads/2012/08/9781929628384-Fit-for-a-Princess-.jpg',
    source: 'https://www.hachai.com/dd-product/fit-for-a-princess/',
    credit: 'Hachai Publishing',
  },
  '9781600912948': {
    image: 'https://israelbookshoppublications.com/cdn/shop/files/c356_2019_detail_medium.gif?v=1708017569',
    source: 'https://israelbookshoppublications.com/products/chanie-goes-to-the-dentist',
    credit: 'Israel Bookshop Publications',
  },
  '9781578190713': {
    image: 'https://moznaim.com/cdn/shop/products/d1_44267b01-55cb-4627-bdc0-989fce8fe6f1_244x300.jpg?v=1547412512',
    source: 'https://moznaim.com/products/kosher-by-design-kids-in-the-kitchen',
    credit: 'Moznaim / ArtScroll',
  },
};
export function coverFor(book) {
  const match = COVER_SOURCES[String(book.isbn || '').replace(/[^0-9X]/gi, '')];
  return book.thumbnail ? { image: book.thumbnail } : match;
}

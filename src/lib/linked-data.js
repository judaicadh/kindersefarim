import { slugify, seriesKey, parseCreators } from './sheet.js';
import { coverFor } from './covers.js';

export const PROJECT_CREATOR = {
  name: 'Dr. Dainy Bernstein',
  profile: 'https://www.library.upenn.edu/staff/dainy-bernstein',
};

const present = value => value && value !== '—' && value !== 'Unspecified';

export function linkedData({ path = '/', origin, title, description, book, entries, collection, collectionType }) {
  // Root-relative identifiers resolve against the deployed site when no domain
  // is configured. Never bake a development hostname into published metadata.
  const url = path => origin ? new URL(path, origin).href : path;
  const creatorId = url('/#creator');
  const siteId = url('/#website');
  const datasetId = url('/#bibliography');
  const pageId = url(path + '#webpage');
  const ref = id => ({ '@id': id });
  const bookRef = b => ({ '@type': 'Book', '@id': url(`/book/${b.id}/#book`), name: b.title, url: url(`/book/${b.id}/`) });
  const graph = [
    { '@type': 'Person', '@id': creatorId, name: PROJECT_CREATOR.name, url: PROJECT_CREATOR.profile, sameAs: PROJECT_CREATOR.profile },
    { '@type': 'WebSite', '@id': siteId, name: 'Kinder Sefarim Bibliography', url: url('/'), description: "A bibliography of Orthodox children's literature", creator: ref(creatorId), author: ref(creatorId) },
    { '@type': 'Dataset', '@id': datasetId, name: 'Kinder Sefarim Bibliography', description: "Bibliographic records for Orthodox children's literature, researched and curated by Dr. Dainy Bernstein.", url: url('/'), creator: ref(creatorId), isPartOf: ref(siteId) },
  ];
  const page = { '@type': entries ? 'CollectionPage' : path === '/about/' ? 'AboutPage' : 'WebPage', '@id': pageId, url: url(path), name: title, description, inLanguage: 'en', isPartOf: ref(siteId), author: ref(creatorId), creator: ref(creatorId), about: ref(datasetId) };
  if (book) {
    const entity = bookRef(book);
    entity.mainEntityOfPage = ref(pageId);
    entity.identifier = book.id;
    if (present(book.summary)) entity.description = book.summary;
    if (present(book.isbn)) entity.isbn = book.isbn;
    if (/^\d{4}$/.test(book.year || '')) entity.datePublished = book.year;
    if (present(book.lang)) entity.inLanguage = book.lang;
    if (present(book.edition)) entity.bookEdition = book.edition;
    const pages = String(book.pages || '').match(/^(\d+)\s*(?:pp?\.?)?$/);
    if (pages) entity.numberOfPages = Number(pages[1]);
    if (book.subjects?.length) entity.keywords = book.subjects;
    const cover = coverFor(book);
    if (cover) entity.image = { '@type': 'ImageObject', contentUrl: url(cover.image), ...(cover.credit ? { creditText: cover.credit } : {}), ...(cover.source ? { isBasedOn: cover.source } : {}) };
    const creators = book.creators?.length ? book.creators : parseCreators(book.byline);
    for (const person of creators) {
      const id = url(`/authors/${slugify(person.name)}/#person`);
      graph.push({ '@type': 'Person', '@id': id, name: person.name, url: url(`/authors/${slugify(person.name)}/`) });
      const roles = person.roles || [person.role];
      const properties = new Set(roles.map(role => /author/i.test(role) ? 'author' : /illustrat/i.test(role) ? 'illustrator' : /translat/i.test(role) ? 'translator' : /editor/i.test(role) ? 'editor' : 'contributor'));
      for (const property of properties) (entity[property] ||= []).push(ref(id));
    }
    if (present(book.publisher)) {
      const id = url(`/publishers/${slugify(book.publisher)}/#organization`);
      entity.publisher = ref(id);
      graph.push({ '@type': 'Organization', '@id': id, name: book.publisher, url: url(`/publishers/${slugify(book.publisher)}/`) });
    }
    const series = seriesKey(book.series);
    if (series) {
      const id = url(`/series/${slugify(series)}/#series`);
      entity.isPartOf = ref(id);
      graph.push({ '@type': 'CreativeWorkSeries', '@id': id, name: series, url: url(`/series/${slugify(series)}/`) });
    }
    graph.push(entity);
    page.mainEntity = ref(entity['@id']);
  } else if (entries) {
    const listId = url(path + '#list');
    graph.push({ '@type': 'ItemList', '@id': listId, numberOfItems: entries.length,
      itemListElement: entries.map((entry, index) => ({ '@type': 'ListItem', position: index + 1,
        item: collectionType === 'authors' ? { '@type': 'Person', '@id': url(`/authors/${entry.slug}/#person`), name: entry.name, url: url(`/authors/${entry.slug}/`) }
          : collectionType === 'publishers' ? { '@type': 'Organization', '@id': url(`/publishers/${entry.slug}/#organization`), name: entry.name, url: url(`/publishers/${entry.slug}/`) }
          : collectionType === 'series' ? { '@type': 'CreativeWorkSeries', '@id': url(`/series/${entry.slug}/#series`), name: entry.name, url: url(`/series/${entry.slug}/`) }
          : bookRef(entry) })) });
    page.mainEntity = ref(listId);
    if (collection) {
      const type = collectionType === 'author-books' ? 'Person' : collectionType === 'publisher-books' ? 'Organization' : 'CreativeWorkSeries';
      const suffix = type === 'Person' ? 'person' : type === 'Organization' ? 'organization' : 'series';
      const id = url(path + '#' + suffix);
      graph.push({ '@type': type, '@id': id, name: collection.name, url: url(path) });
      page.about = ref(id);
    }
  } else if (path === '/about/') page.mainEntity = ref(creatorId);
  graph.push(page);
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function serializeLinkedData(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

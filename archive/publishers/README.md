# Publisher logos

`originals/` holds exact copies of publisher logo assets. The website uses separate local WebP copies in `public/publisher-logos/`. Sources, retrieval times, source credits, and SHA-256 checksums are recorded in `src/data/publisher-logos.json`; the reviewed source list is `src/data/publisher-logo-sources.json`.

Run `npm run logos:preserve` after adding a verified official logo to the source list. Run `npm run logos:verify` to check saved files without downloading anything. `npm run covers:backup -- /absolute/path/backup.tar.gz` includes publisher logos and their inventory with the book cover archive.

The official ArtScroll header is its current 50th anniversary logo. Tfutza's official white logo is displayed on a dark background. The Kinder Shpiel logo appears in the official Chazak storefront; it is assigned to Kinder Shpiel, not to the Chazak publisher entries. Publisher name variants and imprints are not automatically assigned a parent company's logo.

Entries without a verified logo display a styled initials placeholder. These initials are not presented as official artwork. This includes general categories such as Self-published and [publisher not identified]. Logo artwork retains its publisher's attribution; the website and bibliography are created and curated by Dr. Dainy Bernstein.

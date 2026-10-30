# Kinder Sefarim cover preservation

Kinder Sefarim is created and curated by Dr. Dainy Bernstein. Cover artwork retains the source publisher/artist attribution recorded in the inventory; project credit does not imply authorship of the artwork.

## What is preserved

- `archive/covers/originals/`: exact downloaded image bytes, never cropped or recompressed. Filenames combine a source URL identifier and content checksum so they do not depend on titles changing.
- `public/covers/`: separate WebP access copies for the website, cropped with the existing checked coordinates when source proportions match (coordinates scale to the original resolution). Run `npm run covers:preserve -- --refresh-web` to regenerate these from the saved originals.
- `src/data/cover-archive.json`: full inventory, original URLs, source pages, book IDs/titles or ISBNs, source credits, retrieval timestamps, image sizes, crop coordinates, SHA-256 checksums, and download failures.
- `archive/covers/inventory.csv`: spreadsheet-friendly inventory generated when creating a backup.

Keep original JPEG, GIF, PNG, WebP, or other downloaded formats unchanged. Converting a small source image to TIFF does not add detail. For future scans made from physical covers, retain a high-quality master separately from the website copy.

## Maintenance

Run `npm run covers:preserve` after adding cover sources or sheet thumbnails. Existing files are checked and reused without re-downloading. Missing downloads are recorded and retried on the next run; a failed preservation attempt does not replace a valid original. The website continues to use its external source for any image not yet preserved.

Run `npm run covers:verify` after moving/restoring the collection and periodically (for example, annually). It checks both the original and website files against the stored SHA-256 values and exits with an error if a file is missing or damaged. Restore damaged files from a verified backup.

Run `npm run covers:backup -- /absolute/path/kinder-sefarim-covers.tar.gz` to create a portable backup containing all original files, website copies, inventories, source credits, crop metadata, and preservation scripts. The backup does not contain the whole website; keep the site repository backed up too.

## Independent backups

The files in this repository and a backup on the same computer share the same failure risk. Copy the backup package to an external drive and a separate off-site location (such as institutional or cloud storage), giving three copies across at least two storage media with one off-site. Confirm you can extract a backup and run verification. Replace aging storage and repeat after adding images.

No independent external-drive or off-site backup is created automatically by these scripts. Keep source credits and any permission agreements with the collection; downloading an image does not establish a license.

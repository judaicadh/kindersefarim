import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'src/data/cover-archive.json'), 'utf8'));
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error('Provide an absolute output path ending in .tar.gz');
// Include a spreadsheet-friendly inventory alongside the full machine-readable manifest.
const columns = ['book_id','isbn','title','credit','source_page','source_image','retrieved_at','original_file','original_sha256','website_file'];
const quote = value => '"' + String(value ?? '').replaceAll('"','""') + '"';
const rows = Object.values(manifest.assets).flatMap(asset => asset.records.map(record => [record.id,record.isbn,record.title,record.credit,record.sourcePage,asset.sourceImage,asset.retrievedAt,asset.original.path,asset.original.sha256,'public'+asset.web.path]));
await writeFile(path.join(root, 'archive/covers/inventory.csv'), [columns,...rows].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n');
await mkdir(path.dirname(output), {recursive:true});
execFileSync('tar', ['-czf',output,'-C',root,'archive/covers','archive/publishers','public/covers','public/publisher-logos','src/data/publisher-logos.json','src/data/publisher-logo-sources.json','scripts/preserve-publisher-logos.mjs','src/data/cover-archive.json','src/data/cover-sources.json','src/data/cover-crops.json','src/lib/isbn-covers.js','scripts/preserve-covers.mjs','scripts/backup-covers.mjs']);
console.log(`Created ${output} with ${Object.keys(manifest.assets).length} original cover files, website copies, checksums, credits, and inventory.`);

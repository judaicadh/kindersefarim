import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { getBooks } from '../src/lib/sheet.js';
import { COVER_SOURCES } from '../src/lib/isbn-covers.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJSON = async name => JSON.parse(await readFile(path.join(root, name), 'utf8'));
let saving = Promise.resolve();
const save = (name, value) => {
  const snapshot = JSON.stringify(value, null, 2) + '\n';
  saving = saving.then(async () => {
    await writeFile(path.join(root, name + '.tmp'), snapshot);
    await rename(path.join(root, name + '.tmp'), path.join(root, name));
  });
  return saving;
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = 'src/data/cover-archive.json';
const manifest = await readJSON(manifestPath);
const verifyOnly = process.argv.includes('--verify');
if (verifyOnly) {
  let checked = 0;
  for (const asset of Object.values(manifest.assets)) {
    for (const file of [asset.original, asset.web]) {
      const location = file === asset.web ? 'public' + file.path : file.path;
      if (sha(await readFile(path.join(root, location))) !== file.sha256) throw new Error(`Checksum mismatch: ${location}`);
      checked++;
    }
  }
  console.log(`Verified ${checked} files for ${Object.keys(manifest.assets).length} preserved cover assets.`);
  process.exit(0);
}
const catalog = await readJSON('src/data/cover-sources.json');
const crops = await readJSON('src/data/cover-crops.json');
async function accessCopy(bytes, metadata, url) {
  const crop = crops[url];
  // Earlier measurements may use a downscaled copy; scale coordinates only
  // when the original has the same proportions, leaving the original untouched.
  const compatible = crop && Math.abs(metadata.width / metadata.height - crop.sourceWidth / crop.sourceHeight) < 0.005;
  let appliedCrop = null;
  let pipeline = sharp(bytes);
  if (compatible) {
    const sx = metadata.width / crop.sourceWidth, sy = metadata.height / crop.sourceHeight;
    const left = Math.round(crop.x * sx), top = Math.round(crop.y * sy);
    appliedCrop = { left, top, width: Math.min(metadata.width - left, Math.round(crop.width * sx)), height: Math.min(metadata.height - top, Math.round(crop.height * sy)) };
    pipeline = pipeline.extract(appliedCrop);
  }
  const { data, info } = await pipeline.resize({ width: 1000, height: 1400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
  return { data, info, appliedCrop };
}
const requested = new Map();
function add(cover, record) {
  if (!cover?.image || !/^https?:\/\//.test(cover.image)) return;
  if (!requested.has(cover.image)) requested.set(cover.image, []);
  requested.get(cover.image).push({ ...record, sourcePage: cover.source || null, credit: cover.credit || null });
}
for (const [id, cover] of Object.entries(catalog)) add(cover, { id, title: cover.title });
for (const [isbn, cover] of Object.entries(COVER_SOURCES)) add(cover, { isbn });
const { books } = await getBooks();
for (const book of books) if (book.thumbnail) add({ image: book.thumbnail }, { id: book.id, title: book.title });
await mkdir(path.join(root, 'archive/covers/originals'), { recursive: true });
await mkdir(path.join(root, 'public/covers'), { recursive: true });
manifest.failures = [];
const queue = [...requested];
let done = 0;
async function worker() {
  while (queue.length) {
    const [url, records] = queue.shift();
    try {
      const existing = manifest.assets[url];
      if (existing) {
        for (const file of [existing.original, existing.web]) {
          if (file === existing.web && process.argv.includes('--refresh-web')) continue;
          const name = file === existing.web ? 'public' + file.path : file.path;
          if (sha(await readFile(path.join(root, name))) !== file.sha256) throw new Error(`Checksum mismatch: ${name}`);
        }
        existing.records = records;
        if (process.argv.includes('--refresh-web')) {
          const bytes = await readFile(path.join(root, existing.original.path));
          const metadata = await sharp(bytes).metadata();
          const { data, info, appliedCrop } = await accessCopy(bytes, metadata, url);
          await writeFile(path.join(root, 'public' + existing.web.path), data);
          existing.web = { ...existing.web, sha256: sha(data), bytes: data.length, width: info.width, height: info.height, crop: appliedCrop };
        }
      } else {
        let response;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'KinderSefarim-CoverPreservation/1.0' } });
            if (response.ok) break;
            throw new Error(`HTTP ${response.status}`);
          } catch (error) { if (attempt === 2) throw error; }
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 30 * 1024 * 1024) throw new Error('Image exceeds 30 MB');
        const metadata = await sharp(bytes).metadata();
        if (!metadata.width || !metadata.height || !['jpeg','png','webp','gif','avif','tiff'].includes(metadata.format)) throw new Error('Unsupported or invalid image');
        const hash = sha(bytes);
        const stem = sha(url).slice(0, 16) + '-' + hash.slice(0, 12);
        const originalPath = `archive/covers/originals/${stem}.${metadata.format === 'jpeg' ? 'jpg' : metadata.format}`;
        const webPath = `/covers/${stem}.webp`;
        const { data, info, appliedCrop } = await accessCopy(bytes, metadata, url);
        try { await writeFile(path.join(root, originalPath), bytes, { flag: 'wx' }); }
        catch (error) {
          if (error.code !== 'EEXIST' || sha(await readFile(path.join(root, originalPath))) !== hash) throw error;
        }
        await writeFile(path.join(root, 'public' + webPath), data);
        manifest.assets[url] = {
          sourceImage: url, retrievedAt: new Date().toISOString(), records,
          original: { path: originalPath, sha256: hash, bytes: bytes.length, format: metadata.format, width: metadata.width, height: metadata.height },
          web: { path: webPath, sha256: sha(data), bytes: data.length, width: info.width, height: info.height, crop: appliedCrop },
          rights: 'No license or permission inferred; retain publisher/source attribution.',
        };
      }
    } catch (error) {
      manifest.failures.push({ sourceImage: url, records, error: error.message, attemptedAt: new Date().toISOString() });
    }
    done++;
    if (done % 50 === 0) { await save(manifestPath, manifest); console.log(`${done}/${requested.size} processed; ${manifest.failures.length} unavailable`); }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
await save(manifestPath, manifest);
console.log(`Preserved ${Object.keys(manifest.assets).length} assets; ${manifest.failures.length} unavailable. Originals are unchanged; website copies are separate.`);

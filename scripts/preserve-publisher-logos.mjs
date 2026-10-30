import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../',import.meta.url));
const sources=JSON.parse(await readFile(path.join(root,'src/data/publisher-logo-sources.json'),'utf8'));
const manifest=JSON.parse(await readFile(path.join(root,'src/data/publisher-logos.json'),'utf8'));
const hash=data=>createHash('sha256').update(data).digest('hex');
await mkdir(path.join(root,'public/publisher-logos'),{recursive:true});
await mkdir(path.join(root,'archive/publishers/originals'),{recursive:true});
if(process.argv.includes('--verify')) {
  for(const logo of Object.values(manifest)) {
    if(hash(await readFile(path.join(root,logo.original)))!==logo.originalSha256 || hash(await readFile(path.join(root,'public'+logo.localImage)))!==logo.webSha256)throw new Error('Saved logo failed checksum verification');
  }
  console.log(`Verified ${Object.keys(manifest).length} original logos and website copies.`);
  process.exit(0);
}
let failures=0;
for(const [slug,source] of Object.entries(sources)) {
 try {
  if(manifest[slug]) {
   const m=manifest[slug];
   if(hash(await readFile(path.join(root,m.original)))!==m.originalSha256 || hash(await readFile(path.join(root,'public'+m.localImage)))!==m.webSha256)throw new Error('Saved file failed checksum verification');
   continue;
  }
  const response=await fetch(source.image,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  const meta=await sharp(bytes).metadata();
  const {data,info}=await sharp(bytes).resize({width:500,height:250,fit:'inside',withoutEnlargement:true}).webp({quality:92}).toBuffer({resolveWithObject:true});
  const original=`archive/publishers/originals/${slug}.${meta.format==='jpeg'?'jpg':meta.format}`;
  const localImage=`/publisher-logos/${slug}.webp`;
  await writeFile(path.join(root,original),bytes);
  await writeFile(path.join(root,'public'+localImage),data);
  manifest[slug]={...source,original,localImage,width:info.width,height:info.height,originalSha256:hash(bytes),webSha256:hash(data),retrievedAt:new Date().toISOString()};
  console.log(`Saved ${slug}`);
 }catch(e){failures++;console.error(`Unavailable ${slug}: ${e.message}`);}
}
await writeFile(path.join(root,'src/data/publisher-logos.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`${Object.keys(manifest).length} publisher logos saved and verified.`);
if(failures)process.exitCode=1;

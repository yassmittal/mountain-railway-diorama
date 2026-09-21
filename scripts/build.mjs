import { readdir, readFile, writeFile, mkdir, copyFile, rm, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist');
const files=(await readdir(root)).filter(f=>/\.(js|html|css)$/.test(f)).sort();
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const file of files)await copyFile(path.join(root,file),path.join(dist,file));
await cp(path.join(root,'vendor'),path.join(dist,'vendor'),{recursive:true});
async function walk(dir,prefix=''){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const relative=path.posix.join(prefix,entry.name);if(entry.isDirectory())out.push(...await walk(path.join(dir,entry.name),relative));else out.push(relative);}return out.sort();}
const hashes={};for(const file of await walk(dist))hashes[file]=createHash('sha256').update(await readFile(path.join(dist,file))).digest('hex');
const buildId=createHash('sha256').update(JSON.stringify(hashes)).digest('hex').slice(0,16);
const manifest={buildId,three:'0.185.0',files:hashes};
await writeFile(path.join(dist,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(root,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Built ${Object.keys(hashes).length} static files. Build ${buildId}.`);

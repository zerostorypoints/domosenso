/** Raster assets use Sharp from this site's locked Next.js installation. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'..');
const config=JSON.parse(fs.readFileSync(path.join(dir,'config.json'),'utf8'));
const load=createRequire(path.join(root,config.domain==='org'?'website/package.json':'package.json'));
const sharp=load('sharp');
const favicon=path.join(dir,'assets/favicon.svg');
for(const size of [32,180,512]) await sharp(favicon).resize(size,size).png().toFile(path.join(dir,'assets',`icon-${size}.png`));
await sharp(path.join(dir,'assets/social.svg')).png().toFile(path.join(root,config.social));
const apple=config.domain==='com'?'src/app/apple-icon.png':'website/public/apple-icon.png';
fs.copyFileSync(path.join(dir,'assets/icon-180.png'),path.join(root,apple));
console.log(`Rendered .${config.domain} social card and app icons.`);

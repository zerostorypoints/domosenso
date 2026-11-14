// Small deterministic module bundle: fixed trusted source modules, no dependencies at runtime.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),src=resolve(root,'packages/frame-studio'),read=n=>readFileSync(resolve(src,n),'utf8');
const registry='// Generated from registry.json and templates.json by tools/build_frame_studio.mjs.\nexport const REGISTRY='+JSON.stringify(JSON.parse(read('registry.json')))+';\nexport const BUILTINS='+JSON.stringify(JSON.parse(read('templates.json')))+';\n';writeFileSync(resolve(src,'registry.js'),registry);
const modules=[['registry.js',['REGISTRY','BUILTINS']],['contract.js',['REGISTRY','BUILTINS','UI_VERSION','STATES','intersects','positions','validRect','validateConfig','place','migrate']],['renderer-style.js',['CSS']],['renderer-i18n.js',['translate']],['hifisync-drawings.js',['mountHiFiDrawing']],['frame-ui.js',['FrameUI','validateSnapshot','UI_VERSION']]];
const symbol=n=>'__'+n.replaceAll(/[^a-z]/g,'_');
let bundle='// Generated portable Frame UI. Source lives in packages/frame-studio.\n';
for(const [file,exports] of modules){let code=read(file);code=code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"];?/g,(_,names,name)=>`const {${names}}=${symbol(name)};`).replace(/export\s*\{[^}]+\};?/g,'').replace(/export (const|function|class) /g,'$1 ');if(/^import /m.test(code)||/^export /m.test(code))throw Error('Unsupported source export '+file);bundle+=`const ${symbol(file)}=(()=>{\n${code}\nreturn {${exports.join(',')}};})();\n`;}
bundle+='export const {FrameUI,validateSnapshot,UI_VERSION}=__frame_ui_js;\n';
const files={'frame-ui.js':bundle,'ha-card.js':read('ha-card.js'),'schema.json':read('schema.json')},sha=x=>createHash('sha256').update(x).digest('hex');
const manifest={name:'@domosenso/frame-ui',version:'0.2.2',contract:2,sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),files:Object.fromEntries(Object.entries(files).map(([n,v])=>[n,sha(v)]))};manifest.contentHash=sha(JSON.stringify(manifest.files));manifest.sourceDirty=!!execFileSync('git',['status','--porcelain','--','packages/frame-studio','tools/build_frame_studio.mjs','tools/build_hifisync_drawings.mjs','tools/hifisync_drawings.tsx'],{cwd:root,encoding:'utf8'}).trim();
const out=process.argv[2]?resolve(process.argv[2]):resolve(root,'integrations/domosenso_frame/custom_components/domosenso_frame/ui/0.2.2');mkdirSync(out,{recursive:true});
for(const [n,v]of Object.entries(files))writeFileSync(resolve(out,n),v);
for(const n of ['registry.json','templates.json','registry.js','contract.js','studio-model.js','studio.js'])writeFileSync(resolve(out,n),read(n));
writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Frame UI 0.2.2 '+manifest.contentHash);

import { sanitizeSvg } from '/Users/glenandrewbrown/Development/EasySchematic/src/svgSanitizer.ts';
import fs from 'node:fs';
import path from 'node:path';
const root='/Users/glenandrewbrown/Development/EasySchematic/Design_Handoff/svg-library';
const cats=['generic','audio','network','furniture'];
let total=0,nulled=[],lostCc=[];
for(const c of cats){
  for(const f of fs.readdirSync(path.join(root,c))){
    if(!f.endsWith('.svg'))continue;
    total++;
    const raw=fs.readFileSync(path.join(root,c,f),'utf8');
    const out=sanitizeSvg(raw);
    if(out===null){nulled.push(`${c}/${f}`);continue;}
    if(raw.includes('currentColor') && !out.includes('currentColor')) lostCc.push(`${c}/${f}`);
  }
}
console.log('total',total,'nulled',nulled.length,'lostCurrentColor',lostCc.length);
nulled.slice(0,20).forEach(x=>console.log('  NULL',x));
lostCc.slice(0,20).forEach(x=>console.log('  LOSTCC',x));

import fs from 'node:fs';
import path from 'node:path';
import {installCommands} from './install';

// The README, get-started and llms.txt must give one set of commands; the README is the one people copy from GitHub.
test('README Start in 10 minutes block equals installCommands',()=>{
 const readme=fs.readFileSync(path.resolve(__dirname,'../../../README.md'),'utf8');
 const section=readme.slice(readme.indexOf('## Start in 10 minutes'));
 const block=section.match(/```bash\n([\s\S]*?)```/)?.[1]??'';
 expect(block.trim()).toBe(installCommands);
});
test('install commands never pin a commit',()=>{
 expect(installCommands).not.toMatch(/checkout/);
});

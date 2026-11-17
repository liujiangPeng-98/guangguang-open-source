const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const skip = new Set(['node_modules','dist','.git','coverage','output']);
const issues = [];
let count = 0;
const walk = dir => {
 for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
  if (skip.has(entry.name)) continue;
  const full=path.join(dir,entry.name), relative=path.relative(root,full).replaceAll('\\','/');
  if(entry.isSymbolicLink()) { issues.push(relative+': symbolic link needs review'); continue; }
  if(entry.isDirectory()) { walk(full); continue; }
  count++;
  if ((entry.name.startsWith('.env') && entry.name!=='.env.example') || /\.local(?:\.json)?$/.test(entry.name) ||
      ['cloudbaserc.json','.mcp.json','mcp.json','.opencode.json'].includes(entry.name)) issues.push(relative+': private configuration file');
  if(!/\.(?:tsx?|mts|cjs|mjs|js|json|md|sql|txt|html|css|ya?ml)$/.test(entry.name) && !['LICENSE','.env.example'].includes(entry.name))continue;
  const text=fs.readFileSync(full,'utf8');
  const rules=[
   ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
   ['cloud access key',/\b(?:AKIA[0-9A-Z]{16}|AKID[0-9A-Za-z]{28,})\b/],
   ['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
   ['JWT literal',/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
   ['Windows absolute path',/[A-Z]:[\\/](?:Users|web-cloudbase|逛逛开发资料)/]
  ];
  for(const [name,pattern] of rules)if(pattern.test(text))issues.push(relative+': '+name);
 }
};
walk(root);
console.log(JSON.stringify({filesChecked:count,issues},null,2));
if(issues.length)process.exitCode=1;

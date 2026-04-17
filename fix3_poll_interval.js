const fs = require('fs');
const { execSync } = require('child_process');
const filePath = 'd:\\Projet pagani\\frontend\\js\\notifications.js';
let content = fs.readFileSync(filePath, 'utf8');

const oldCond = 'if (user.role !== \'admin\' && window.PaganiAPI && _pollTickCount % 2 === 0) {';
const newCond = 'if (user.role !== \'admin\' && window.PaganiAPI) {';

if (!content.includes(oldCond)) { console.error('NOT FOUND'); process.exit(1); }

content = content.replace(oldCond, newCond);
fs.writeFileSync(filePath, content, 'utf8');

try {
  execSync('node --check "' + filePath + '"', { stdio: 'pipe' });
  console.log('PATCH 3 OK — getMe appele a chaque tick (30s)');
} catch(e) {
  console.error('SYNTAX ERROR:', e.stdout.toString());
}

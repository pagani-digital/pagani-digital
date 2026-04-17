const fs = require('fs');
const filePath = 'd:\\Projet pagani\\server\\index.js';
let content = fs.readFileSync(filePath, 'utf8');

const before = (content.match(/Approuve(?!')/g) || []).length;
console.log('Occurrences "Approuve" avant:', before);

content = content.replace(/statut === 'Approuve'/g, "statut === 'Approuv\u00e9'");
content = content.replace(/statut = 'Approuve'/g, "statut = 'Approuv\u00e9'");

const after = (content.match(/Approuve(?!')/g) || []).length;
console.log('Occurrences "Approuve" après:', after);

fs.writeFileSync(filePath, content, 'utf8');
console.log('PATCH OK — Approuve → Approuvé corrigé dans index.js');

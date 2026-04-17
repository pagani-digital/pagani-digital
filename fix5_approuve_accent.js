const fs = require('fs');
const filePath = 'd:\\Projet pagani\\server\\database.js';
let content = fs.readFileSync(filePath, 'utf8');

// Compter les occurrences avant
const before = (content.match(/Approuve(?!')/g) || []).length;
console.log('Occurrences "Approuve" (sans accent) avant:', before);

// Remplacer toutes les occurrences de 'Approuve' (sans accent) par 'Approuvé'
// Attention : ne pas toucher 'Approuvé' qui est déjà correct
content = content.replace(/statut === 'Approuve'/g, "statut === 'Approuv\u00e9'");
content = content.replace(/statut = 'Approuve'/g, "statut = 'Approuv\u00e9'");

const after = (content.match(/Approuve(?!')/g) || []).length;
console.log('Occurrences "Approuve" (sans accent) après:', after);

fs.writeFileSync(filePath, content, 'utf8');
console.log('PATCH OK — Approuve → Approuvé corrigé dans database.js');

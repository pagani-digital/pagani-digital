const fs = require('fs');
const content = fs.readFileSync('d:/Projet pagani/frontend/js/app.js', 'utf8');

// The duplicate pattern (with \r\n as confirmed by byte analysis):
// "    if (fresh.length >= _postsCache.length) {\r\n    // Supprimer les posts retires..."
// followed by another "    if (fresh.length >= _postsCache.length) {"
// We want to keep only the comment + second if

const dup = "    if (fresh.length >= _postsCache.length) {\r\n    // Supprimer les posts retires - seulement si le serveur retourne au moins autant de posts que le cache\r\n    if (fresh.length >= _postsCache.length) {";
const keep = "    // Supprimer les posts retires - seulement si le serveur retourne au moins autant de posts que le cache\r\n    if (fresh.length >= _postsCache.length) {";

if (content.includes(dup)) {
  const fixed = content.replace(dup, keep);
  fs.writeFileSync('d:/Projet pagani/frontend/js/app.js', fixed, 'utf8');
  fs.writeFileSync('d:/Projet pagani/fix_result.txt', 'FIXED');
} else {
  fs.writeFileSync('d:/Projet pagani/fix_result.txt', 'PATTERN NOT FOUND');
}

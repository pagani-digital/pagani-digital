require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const indexPath  = path.join(__dirname, 'index.js');
const routesPath = path.join(__dirname, 'groups_routes.txt');

const src    = fs.readFileSync(indexPath,  'utf8');
const routes = fs.readFileSync(routesPath, 'utf8');

const ANCHOR = "app.get('*', (req, res) => {";

if (!src.includes(ANCHOR)) {
  console.error('Ancre introuvable'); process.exit(1);
}
if (src.includes('_isGroupMember')) {
  console.log('Routes groupes deja presentes'); process.exit(0);
}

const result = src.replace(ANCHOR, routes + '\n' + ANCHOR);
fs.writeFileSync(indexPath, result, 'utf8');
console.log('Routes groupes injectees avec succes');

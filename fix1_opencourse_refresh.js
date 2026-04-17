const fs = require('fs');
const { execSync } = require('child_process');
const filePath = 'd:\\Projet pagani\\frontend\\js\\app.js';
let content = fs.readFileSync(filePath, 'utf8');

// Trouver le bloc par position
const startMarker = "// Utilisateur Starter : proposer achat unitaire ou upgrade selon le type d'acc";
const startIdx = content.indexOf(startMarker, 129000);
if (startIdx === -1) { console.error('START NOT FOUND'); process.exit(1); }

// Trouver la fin du bloc : le } qui ferme le if (!hasUnlocked) puis le if Starter
// On cherche "return;\n    }\n  }" apres startIdx
const endMarker = 'return;\n    }\n  }';
const endMarkerCRLF = 'return;\r\n    }\r\n  }';

let endIdx = content.indexOf(endMarkerCRLF, startIdx);
let endLen = endMarkerCRLF.length;
if (endIdx === -1) {
  endIdx = content.indexOf(endMarker, startIdx);
  endLen = endMarker.length;
}
if (endIdx === -1) { console.error('END NOT FOUND'); process.exit(1); }

const blockEnd = endIdx + endLen;
console.log('Block:', startIdx, '->', blockEnd);
console.log('Old block:\n' + content.substring(startIdx, blockEnd));

const newBlock = `// Utilisateur Starter : proposer achat unitaire ou upgrade selon le type d'acc\u00e8s
  if (!course.free && user && user.plan === 'Starter') {
    // Rafra\u00eechir le user depuis le serveur pour avoir unlockedCourses \u00e0 jour
    if (window.PaganiAPI) {
      try {
        const fresh = await PaganiAPI.getMe();
        if (fresh) { user = fresh; window._currentUser = fresh; }
      } catch(e) {}
    }
    const isUnit      = course.accessType === 'unit' || course.unitPrice;
    const hasUnlocked = (user.unlockedCourses || []).includes(course.id);
    if (!hasUnlocked) {
      if (isUnit) {
        _showBuyVideoModal(user, course);
      } else {
        _showUpgradeModal(user, course.title);
      }
      return;
    }
  }`;

content = content.substring(0, startIdx) + newBlock + content.substring(blockEnd);
fs.writeFileSync(filePath, content, 'utf8');

try {
  execSync('node --check "' + filePath + '"', { stdio: 'pipe' });
  console.log('PATCH 1 OK — openCourse rafraichit le user avant verification acces');
} catch(e) {
  console.error('SYNTAX ERROR:', e.stdout.toString());
}

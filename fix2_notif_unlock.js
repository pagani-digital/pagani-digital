const fs = require('fs');
const { execSync } = require('child_process');
const filePath = 'd:\\Projet pagani\\frontend\\js\\notifications.js';
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = 'if (planChanged || unlockedChanged) {';
const startIdx = content.indexOf(startMarker);
if (startIdx === -1) { console.error('START NOT FOUND'); process.exit(1); }

// Trouver la fermeture du bloc (le } qui ferme ce if)
let braceCount = 0, blockEnd = -1;
for (let i = startIdx; i < content.length; i++) {
  if (content[i] === '{') braceCount++;
  else if (content[i] === '}') { braceCount--; if (braceCount === 0) { blockEnd = i + 1; break; } }
}
if (blockEnd === -1) { console.error('END NOT FOUND'); process.exit(1); }
console.log('Block:', startIdx, '->', blockEnd);
console.log('Old:\n' + content.substring(startIdx, blockEnd));

const newBlock = `if (planChanged || unlockedChanged) {
          window._currentUser = fresh;
          if (planChanged) {
            const planBadge = document.getElementById('userPlan');
            if (planBadge) planBadge.textContent = 'Plan ' + fresh.plan;
            const profileBadge = document.getElementById('profilePlanBadge');
            if (profileBadge) profileBadge.textContent = 'Plan ' + fresh.plan;
            const subTabBtn = document.getElementById('subTabBtn');
            if (subTabBtn) subTabBtn.style.display = 'flex';
          }
          if (unlockedChanged) {
            // Forcer le refresh du badge et du panel de notifications immediatement
            const freshCount = await countUnread(userId);
            const badge = document.getElementById('notifBadge');
            if (badge) {
              if (freshCount > 0) { badge.textContent = freshCount > 99 ? '99+' : freshCount; badge.style.display = 'flex'; }
              else badge.style.display = 'none';
            }
            // Rafraichir le panel si ouvert
            if (typeof PaganiNotif !== 'undefined' && typeof PaganiNotif.refresh === 'function') {
              PaganiNotif.refresh();
            }
            // Rafraichir la liste "Mes Videos" si visible
            if (typeof renderUserVideoPurchases === 'function') {
              const myVideosTab = document.getElementById('tab-myvideos');
              if (myVideosTab && myVideosTab.style.display !== 'none') renderUserVideoPurchases();
            }
          }
          if (typeof renderCourses === 'function') renderCourses();
          if (typeof _applyFiltersAndSearch === 'function') _applyFiltersAndSearch();
        }`;

content = content.substring(0, startIdx) + newBlock + content.substring(blockEnd);
fs.writeFileSync(filePath, content, 'utf8');

try {
  execSync('node --check "' + filePath + '"', { stdio: 'pipe' });
  console.log('PATCH 2 OK — notifications.js : refresh immediat apres deblocage');
} catch(e) {
  console.error('SYNTAX ERROR:', e.stdout.toString());
}

const fs = require('fs');
const { execSync } = require('child_process');
const filePath = 'd:\\Projet pagani\\frontend\\js\\notifications.js';
let content = fs.readFileSync(filePath, 'utf8');

// Ajouter refresh à l'objet PaganiNotif
const oldExport = `window.PaganiNotif = {
  create:        createNotification,
  getAll:        getNotifications,
  countUnread,
  markAllAsRead,
  clearAll:      clearNotifications,
  refreshBadge:  refreshNotifBadge,
  renderPanel:   renderNotifPanel,
  togglePanel:   toggleNotifPanel,
  startPolling:  startNotifPolling,
  stopPolling:   stopNotifPolling,
  newUser:       _H.newUser,
  ..._H,
};`;

const newExport = `window.PaganiNotif = {
  create:        createNotification,
  getAll:        getNotifications,
  countUnread,
  markAllAsRead,
  clearAll:      clearNotifications,
  refreshBadge:  refreshNotifBadge,
  renderPanel:   renderNotifPanel,
  togglePanel:   toggleNotifPanel,
  startPolling:  startNotifPolling,
  stopPolling:   stopNotifPolling,
  newUser:       _H.newUser,
  refresh:       async function() {
    const user = await _getCurrentUser();
    if (!user) return;
    const userId = user.role === 'admin' ? ADMIN_USER_ID : user.id;
    await refreshNotifBadge(userId);
    const panel = document.getElementById('notifPanel');
    if (panel && panel.classList.contains('open')) renderNotifPanel(userId);
  },
  ..._H,
};`;

if (!content.includes(oldExport)) { console.error('EXPORT NOT FOUND'); process.exit(1); }

content = content.replace(oldExport, newExport);
fs.writeFileSync(filePath, content, 'utf8');

try {
  execSync('node --check "' + filePath + '"', { stdio: 'pipe' });
  console.log('PATCH OK — PaganiNotif.refresh ajouté');
} catch(e) {
  console.error('SYNTAX ERROR:', e.stdout.toString());
}

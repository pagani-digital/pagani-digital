
// ── IN-APP TOAST ──────────────────────────────────────────────────────────────
(function() {
  const s = document.createElement('style');
  s.textContent = `
    #paganiToastWrap { position:fixed;top:70px;right:16px;z-index:9998;display:flex;flex-direction:column;gap:8px;pointer-events:none }
    .pagani-toast { background:var(--bg2,#1e1e2e);border:1px solid var(--accent,#6c63ff);border-radius:14px;padding:0.75rem 1rem;display:flex;align-items:center;gap:0.75rem;box-shadow:0 4px 24px rgba(0,0,0,0.35);min-width:260px;max-width:340px;pointer-events:all;cursor:pointer;animation:toastIn 0.3s ease;transition:opacity 0.3s }
    .pagani-toast.hiding { opacity:0 }
    .pagani-toast-icon { font-size:1.2rem;flex-shrink:0 }
    .pagani-toast-body { flex:1;min-width:0 }
    .pagani-toast-title { font-weight:700;font-size:0.85rem;color:var(--text,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
    .pagani-toast-msg { font-size:0.75rem;color:var(--text2,#aaa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:0.1rem }
    .pagani-toast-close { background:none;border:none;color:var(--text2,#aaa);cursor:pointer;font-size:0.9rem;flex-shrink:0;padding:0 }
    @keyframes toastIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
    @media(max-width:600px){ #paganiToastWrap{right:8px;left:8px} .pagani-toast{min-width:0;max-width:100%} }
  `;
  document.head.appendChild(s);
  const wrap = document.createElement('div');
  wrap.id = 'paganiToastWrap';
  document.body.appendChild(wrap);
})();

function _showToast(title, message, icon, url) {
  const wrap = document.getElementById('paganiToastWrap');
  if (!wrap) return;
  const toast = document.createElement('div');
  toast.className = 'pagani-toast';
  toast.innerHTML =
    '<div class="pagani-toast-icon">' + (icon || '🔔') + '</div>' +
    '<div class="pagani-toast-body">' +
      '<div class="pagani-toast-title">' + (title || '') + '</div>' +
      '<div class="pagani-toast-msg">' + (message || '') + '</div>' +
    '</div>' +
    '<button class="pagani-toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>';
  if (url) toast.onclick = function(e) {
    if (e.target.closest('.pagani-toast-close')) return;
    const pm = url.match(/(?:index\.html)?#post-(\d+)/);
    window.location.href = pm ? 'post.html?id=' + pm[1] : url;
  };
  wrap.appendChild(toast);
  setTimeout(function() {
    toast.classList.add('hiding');
    setTimeout(function() { toast.remove(); }, 300);
  }, 5000);
}

function _notifToToast(notif) {
  const icons = { PRIVATE_MESSAGE:'💬', REACTION:'❤️', COMMENT:'💬', NEW_FOLLOWER:'👤', NEW_POST:'📢', WITHDRAW_REQUEST:'💰', NEW_SUBSCRIPTION:'🎉', NEW_FORMATION:'🎓', SUB_CONFIRMED:'✅' };
  const icon = icons[notif.type] || '🔔';
  const url = notif.link ? notif.link : null;
  _showToast(notif.type === 'PRIVATE_MESSAGE' ? 'Nouveau message' : 'Notification', notif.message || '', icon, url);
}

/**
 * ============================================================
 *  PAGANI DIGITAL — Système de Notifications v5 (API-first)
 * ============================================================
 */

const NOTIF_TYPES = {
  NEW_USER:           { icon: "fas fa-user-plus",       color: "#6c63ff", title: "Nouvel inscrit"              },
  NEW_SUBSCRIPTION:   { icon: "fas fa-id-card",         color: "#00d4aa", title: "Nouvel abonnement"           },
  CANCEL_SUB:         { icon: "fas fa-times-circle",    color: "#ff4d6d", title: "Annulation abonnement"       },
  NEW_FORMATION:      { icon: "fas fa-play-circle",     color: "#f59e0b", title: "Formation achetée"           },
  WITHDRAW_REQUEST:   { icon: "fas fa-money-bill-wave", color: "#f59e0b", title: "Demande de retrait"          },
  NEW_COMMENT_ADMIN:  { icon: "fas fa-comment",         color: "#6c63ff", title: "Nouveau commentaire"         },
  NEW_REACTION_ADMIN: { icon: "fas fa-heart",           color: "#ff4d6d", title: "Nouvelle réaction"           },
  NEW_POST:           { icon: "fas fa-newspaper",       color: "#6c63ff", title: "Nouvelle publication"        },
  REACTION_ON_POST:   { icon: "fas fa-heart",           color: "#ff4d6d", title: "Réaction sur votre post"     },
  COMMENT_REPLY:      { icon: "fas fa-reply",           color: "#6c63ff", title: "Réponse à votre commentaire" },
  NEW_COMMENT_POST:   { icon: "fas fa-comment",         color: "#00d4aa", title: "Commentaire sur votre post"  },
  WITHDRAW_APPROVED:  { icon: "fas fa-check-circle",    color: "#00d4aa", title: "Retrait approuvé"            },
  WITHDRAW_REJECTED:  { icon: "fas fa-times-circle",    color: "#ff4d6d", title: "Retrait rejeté"              },
  SUB_CONFIRMED:      { icon: "fas fa-crown",           color: "#00d4aa", title: "Abonnement confirmé"         },
  SUB_CANCELLED:      { icon: "fas fa-ban",             color: "#ff4d6d", title: "Abonnement annulé"           },
  FORMATION_UNLOCKED: { icon: "fas fa-unlock",          color: "#f59e0b", title: "Formation débloquée"         },
  COMMENT:            { icon: "fas fa-comment",         color: "#6c63ff", title: "Nouveau commentaire"         },
  REACTION:           { icon: "fas fa-heart",           color: "#ff4d6d", title: "Nouvelle réaction"           },
  NEW_FOLLOWER:       { icon: "fas fa-user-plus",       color: "#00d4aa", title: "Nouveau follower"            },
  TRAINER_REQUEST:    { icon: "fas fa-chalkboard-teacher", color: "#6c63ff", title: "Demande formateur"           },
  TRAINER_SUBMISSION: { icon: "fas fa-file-upload",        color: "#f59e0b", title: "Contenu soumis"              },
};

const ADMIN_USER_ID = 0;

// ———— Récupérer l'utilisateur courant ————————————————————————————————————————————————————
async function _getCurrentUser() {
  if (window._currentUser) return window._currentUser;
  if (window.PaganiAPI) {
    try {
      const u = await PaganiAPI.getMe();
      window._currentUser = u;
      return u;
    } catch(e) {}
  }
  return null;
}

// ———— API notifications ——————————————————————————————————————————————————————————————————————————————————
async function getNotifications(userId, limit = 40) {
  if (window.PaganiAPI) {
    try {
      const notifs = await PaganiAPI.getNotifications();
      return notifs
        .filter(n => n.type !== 'PRIVATE_MESSAGE') // messages privés gérés séparément
        .map(n => {
          // Remapper les anciens liens serveur vers les bons onglets
          let link = n.link || '';
          if (n.type === 'SUB_CONFIRMED' && (!link || link === 'formations.html')) {
            link = 'dashboard.html?tab=subscription';
          }
          if (n.type === 'SUB_CANCELLED' && (!link || link === 'dashboard.html')) {
            link = 'dashboard.html?tab=subscription';
          }
          if (n.type === 'NEW_USER') {
            link = 'dashboard.html?tab=admin&section=users';
          }
          if (n.type === 'NEW_FORMATION' && (!link || link === 'dashboard.html')) {
            link = 'dashboard.html?tab=admin&section=videopurchases';
          }
          if ((n.type === 'NEW_SUBSCRIPTION' || n.type === 'CANCEL_SUB') && (!link || link === 'dashboard.html')) {
            link = 'dashboard.html?tab=admin&section=subscriptions';
          }
          return {
            ...n,
            link,
            icon:  (NOTIF_TYPES[n.type] || NOTIF_TYPES.NEW_POST).icon,
            color: (NOTIF_TYPES[n.type] || NOTIF_TYPES.NEW_POST).color,
            title: (NOTIF_TYPES[n.type] || NOTIF_TYPES.NEW_POST).title,
          };
        }).slice(0, limit);
    } catch(e) {}
  }
  return [];
}

async function countUnread(userId) {
  if (window.PaganiAPI) {
    try {
      // Exclure les notifications de type PRIVATE_MESSAGE du badge cloche
      const notifs = await PaganiAPI.getNotifications();
      return notifs.filter(n => !n.read && n.type !== 'PRIVATE_MESSAGE').length;
    } catch(e) {}
  }
  return 0;
}

async function markAllAsRead(userId) {
  if (window.PaganiAPI) {
    try { await PaganiAPI.markAllRead(); } catch(e) {}
  }
  refreshNotifBadge();
  renderNotifPanel(userId);
}

async function clearNotifications(userId) {
  refreshNotifBadge();
  renderNotifPanel(userId);
}

// ———— BADGE ——————————————————————————————————————————————————————————————————————————————————————————————————————————
async function refreshNotifBadge() {
  const user = await _getCurrentUser();
  if (!user) return;
  const userId = user.role === "admin" ? ADMIN_USER_ID : user.id;
  const count  = await countUnread(userId);
  const badge  = document.getElementById("notifBadge");
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

// ———— PANNEAU UI ————————————————————————————————————————————————————————————————————————————————————————————————
async function renderNotifPanel(userId) {
  const panel = document.getElementById("notifPanel");
  if (!panel) return;
  const notifs = await getNotifications(userId);
  const unread = notifs.filter(n => !n.read).length;

  panel.innerHTML = `
    <div class="notif-panel-header">
      <span class="notif-panel-title">
        <i class="fas fa-bell"></i> Notifications
        ${unread > 0 ? `<span class="notif-count-badge">${unread}</span>` : ""}
      </span>
      <div class="notif-panel-actions">
        ${unread > 0 ? `<button id="notifMarkAll" title="Tout marquer comme lu"><i class="fas fa-check-double"></i></button>` : ""}
        <button id="notifClearAll" title="Effacer tout"><i class="fas fa-trash"></i></button>
      </div>
    </div>
    <div class="notif-list" id="notifList">
      ${notifs.length === 0
        ? `<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>Aucune notification</p></div>`
        : notifs.map(n => `
          <div class="notif-item ${n.read ? "" : "notif-unread"}"
               data-id="${n.id}"
               data-link="${encodeURIComponent(n.link || "")}"
               data-userid="${userId}">
            <div class="notif-icon" style="background:${n.color}22;color:${n.color}">
              <i class="${n.icon}"></i>
            </div>
            <div class="notif-content">
              <strong>${n.title}</strong>
              <p>${n.message}</p>
              <span class="notif-time">${typeof timeAgo === "function" ? timeAgo(n.createdAt) : n.createdAt.slice(0,10)}</span>
            </div>
            ${!n.read ? '<span class="notif-dot"></span>' : ""}
            ${n.link ? '<span class="notif-arrow"><i class="fas fa-chevron-right"></i></span>' : ""}
          </div>`).join("")
      }
    </div>
    <a href="notifications.html" class="notif-see-all"><i class="fas fa-list"></i> Voir toutes les notifications <i class="fas fa-arrow-right"></i></a>`;


  const markAllBtn = document.getElementById("notifMarkAll");
  if (markAllBtn) markAllBtn.addEventListener("click", () => markAllAsRead(userId));
  const clearBtn = document.getElementById("notifClearAll");
  if (clearBtn) clearBtn.addEventListener("click", () => clearNotifications(userId));

  const list = document.getElementById("notifList");
  if (list) {
    list.addEventListener("click", async (e) => {
      const item = e.target.closest(".notif-item");
      if (!item) return;
      const link = decodeURIComponent(item.dataset.link || "");
      if (window.PaganiAPI) { try { await PaganiAPI.markAllRead(); } catch(e) {} }
      item.classList.remove("notif-unread");
      const dot = item.querySelector(".notif-dot");
      if (dot) dot.remove();
      refreshNotifBadge();
      if (link && link !== 'undefined' && link !== '') {
        const panelEl = document.getElementById('notifPanel');
        const overlay = document.getElementById('notifOverlay');
        if (panelEl) panelEl.classList.remove('open');
        if (overlay) overlay.style.display = 'none';

        // Convertir tout lien post en post.html?id=X
        const postMatch = link.match(/(?:index\.html)?#post-(\d+)/) || link.match(/post\.html\?id=(\d+)/);
        if (postMatch) {
          setTimeout(() => { window.location.href = 'post.html?id=' + postMatch[1]; }, 120);
          return;
        }

        const currentPage  = window.location.pathname.split('/').pop() || 'index.html';
        const linkBase     = link.split('?')[0].split('#')[0] || 'index.html';
        const targetPage   = linkBase;

        // Même page : gérer les paramètres ?tab= et ?section= sans rechargement
        if (currentPage === targetPage || (currentPage === '' && targetPage === 'index.html')) {
          const linkUrl      = new URL(link, window.location.href);
          const tabParam     = linkUrl.searchParams.get('tab');
          const sectionParam = linkUrl.searchParams.get('section');

          if (tabParam && typeof switchTab === 'function') {
            const tabBtn = document.querySelector(`[onclick*="switchTab('${tabParam}'"]`);
            if (tabBtn && tabBtn.style.display !== 'none') {
              switchTab(tabParam, tabBtn);
              if (sectionParam && typeof switchAdminSection === 'function') {
                setTimeout(() => {
                  const subBtn = document.querySelector(`[onclick*="switchAdminSection('${sectionParam}'"]`);
                  if (subBtn) switchAdminSection(sectionParam, subBtn);
                  const subId = linkUrl.searchParams.get('sub');
                  if (subId) setTimeout(() => _scrollToSubCard(subId), 800);
                  const purchaseId = linkUrl.searchParams.get('purchase');
                  if (purchaseId && sectionParam === 'videopurchases') setTimeout(() => _scrollToVideoPurchaseCard(purchaseId), 800);
                }, 150);
              } else {
                const subId = linkUrl.searchParams.get('sub');
                if (subId) setTimeout(() => _scrollToSubCard(subId), 400);
                else {
                  const tabEl = document.getElementById('tab-' + tabParam);
                  if (tabEl) setTimeout(() => tabEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                }
              }
            }
          }
          if (typeof _silentRefreshFeed === 'function') _silentRefreshFeed();
        } else {
          // Page différente : naviguer
          setTimeout(() => { window.location.href = link; }, 120);
        }
      }
    });
  }
}

async function toggleNotifPanel() {
  const panel   = document.getElementById("notifPanel");
  const overlay = document.getElementById("notifOverlay");
  if (!panel) return;
  const isOpen = panel.classList.contains("open");
  if (isOpen) {
    panel.classList.remove("open");
    if (overlay) overlay.style.display = "none";
  } else {
    panel.classList.add("open");
    if (overlay) overlay.style.display = "block";
    const user = await _getCurrentUser();
    if (user) renderNotifPanel(user.role === "admin" ? ADMIN_USER_ID : user.id);
    else panel.innerHTML = `<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>Connectez-vous pour voir vos notifications</p></div>`;
  }
}

// ———— POLLING ——————————————————————————————————————————————————————————————————————————————————————————————————————
let _pollTimer = null;
let _lastUnreadCount = -1;
let _pollTickCount   = 0;
let _sseSource       = null;

// Met à jour le badge DOM sans appel réseau
function _setBadgeCount(n) {
  const prev = _lastUnreadCount;
  _lastUnreadCount = n;
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (n > 0) {
    badge.textContent = n > 99 ? '99+' : n;
    badge.style.display = 'flex';
    if (prev >= 0 && n > prev) {
      badge.classList.remove('flip');
      void badge.offsetWidth;
      badge.classList.add('flip');
      badge.addEventListener('animationend', () => badge.classList.remove('flip'), { once: true });
    }
  } else {
    badge.style.display = 'none';
  }
}

function _connectSSE(userId) {
  if (_sseSource) return; // déjà connecté
  const token = localStorage.getItem('pd_jwt') || '';
  if (!token) return;
  const _sseBase = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || 'https://pagani-digital.onrender.com/api';
  _sseSource = new EventSource(`${_sseBase}/notifications/stream?token=${encodeURIComponent(token)}`);
  _sseSource.onmessage = async (e) => {
    if (!e.data || e.data.startsWith(':')) return;
    let isPrivateMsg = false;
    try {
      const notif = JSON.parse(e.data);
      if (notif.type === 'PRIVATE_MESSAGE') isPrivateMsg = true;
      if (notif.type === 'REACTION') {
        if (typeof _onRxSSE === 'function') _onRxSSE(notif);
        _notifToToast(notif);
        return;
      }
    } catch(e) {}
    if (isPrivateMsg) {
      // Mettre à jour le badge messages navbar instantanément
      if (typeof _updateMsgBadge === 'function') _updateMsgBadge();
      try { const _n = JSON.parse(e.data); _notifToToast(_n); } catch(ee) {}
      return;
    }
    // Récupérer le vrai compte depuis le serveur pour éviter les sauts dus au buffering SSE
    try {
      const { count } = await PaganiAPI.getUnreadCount();
      _setBadgeCount(count);
    } catch(e) {
      _setBadgeCount(_lastUnreadCount < 0 ? 1 : _lastUnreadCount + 1);
    }
    // Animation cloche + badge
    const bell  = document.getElementById('notifBell');
    const badge = document.getElementById('notifBadge');
    if (bell) {
      bell.classList.remove('ringing');
      void bell.offsetWidth;
      bell.classList.add('ringing');
      bell.addEventListener('animationend', () => bell.classList.remove('ringing'), { once: true });
    }
    if (badge && badge.style.display !== 'none') {
      badge.classList.remove('pulsing');
      void badge.offsetWidth;
      badge.classList.add('pulsing');
      badge.addEventListener('animationend', () => badge.classList.remove('pulsing'), { once: true });
    }
    // Rafraîchir panel si ouvert
    const panel = document.getElementById('notifPanel');
    if (panel && panel.classList.contains('open')) renderNotifPanel(userId);
    // Toast in-app
    try { const notif = JSON.parse(e.data); _notifToToast(notif); } catch(ee) {}
  };
  _sseSource.onerror = () => {
    _sseSource.close();
    _sseSource = null;
    // Reconnexion dans 5s
    setTimeout(async () => {
      const user = await _getCurrentUser();
      if (user) _connectSSE(user.role === 'admin' ? 0 : user.id);
    }, 5000);
  };
}

async function _pollTick() {
  const user = await _getCurrentUser();
  if (!user) return;
  const userId = user.role === 'admin' ? ADMIN_USER_ID : user.id;
  _pollTickCount++;

  // 1. Badge notifications — resync serveur toutes les 30s
  const count = await countUnread(userId);
  _setBadgeCount(count);

  // Badge messages privés
  if (typeof _updateMsgBadge === 'function') _updateMsgBadge();

  // 2. Détection changement de plan / vidéos débloquées
  // getMe() toutes les 2 ticks (60s) pour réduire la charge serveur
  if (user.role !== 'admin' && window.PaganiAPI) {
    try {
      const fresh = await PaganiAPI.getMe();
      if (fresh) {
        const planChanged     = fresh.plan !== user.plan;
        const prevUnlocked    = JSON.stringify((user.unlockedCourses || []).sort());
        const freshUnlocked   = JSON.stringify((fresh.unlockedCourses || []).sort());
        const unlockedChanged = prevUnlocked !== freshUnlocked;

        if (planChanged || unlockedChanged) {
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
            const freshCount = await countUnread(userId);
            _setBadgeCount(freshCount);
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
        }
      }
    } catch(e) {}
  }

  // 3. Rafraîchissement du feed uniquement si nouvelles notifications
  if (typeof _silentRefreshFeed === 'function') {
    if (_lastUnreadCount !== -1 && count > _lastUnreadCount) {
      _silentRefreshFeed();
    }
  }
  _lastUnreadCount = count;
}

let _feedPollTimer = null;

// Intervalles en millisecondes
const NOTIF_POLL_INTERVAL = 30000; // 30s — badge notifications
const FEED_POLL_INTERVAL  = 60000; // 60s — rafraîchissement feed

function startNotifPolling() {
  if (_pollTimer) return;
  _pollTimer     = setInterval(_pollTick, NOTIF_POLL_INTERVAL);
  _feedPollTimer = setInterval(() => {
    if (typeof _silentRefreshFeed === 'function') _silentRefreshFeed();
  }, FEED_POLL_INTERVAL);

  // Initialiser le compteur local + connexion SSE
  _getCurrentUser().then(async user => {
    if (!user) return;
    const userId = user.role === 'admin' ? ADMIN_USER_ID : user.id;
    // Charger le vrai compteur une seule fois au démarrage
    const count = await countUnread(userId);
    _setBadgeCount(count);
    _connectSSE(userId);
  });

  if (!_visibilityListenerAdded) {
    document.addEventListener('visibilitychange', _onVisibilityChange);
    _visibilityListenerAdded = true;
  }
}

function stopNotifPolling() {
  if (_pollTimer)     { clearInterval(_pollTimer);     _pollTimer = null; }
  if (_feedPollTimer) { clearInterval(_feedPollTimer); _feedPollTimer = null; }
  if (_sseSource)     { _sseSource.close();            _sseSource = null; }
}

let _visibilityListenerAdded = false;

function _onVisibilityChange() {
  if (document.hidden) {
    // Onglet en arrière-plan : suspendre le polling
    stopNotifPolling();
  } else {
    // Onglet de retour au premier plan : reprendre + tick immédiat
    startNotifPolling();
    _pollTick();
    if (typeof _silentRefreshFeed === 'function') _silentRefreshFeed();
  }
}

//  HELPERS (fallback client-side) ——————————————————————————————————————————————————————
async function createNotification({ userId, type, message, link = "" }) {
  // Notifications gérées côté serveur — ce helper est conservé pour compatibilité
}

const _H = {
  newUser:              (name)             => createNotification({ userId: ADMIN_USER_ID, type: "NEW_USER",           message: `${name} vient de s'inscrire.`,                        link: "dashboard.html" }),
  newSubscription:      (name, plan, subId)=> createNotification({ userId: ADMIN_USER_ID, type: "NEW_SUBSCRIPTION",   message: `${name} a souscrit au plan ${plan}.`,                 link: subId ? `dashboard.html?tab=admin&section=subscriptions&sub=${subId}` : "dashboard.html?tab=admin&section=subscriptions" }),
  cancelSubscription:   (name, plan, subId)=> createNotification({ userId: ADMIN_USER_ID, type: "CANCEL_SUB",         message: `${name} a annulé son abonnement ${plan}.`,            link: subId ? `dashboard.html?tab=admin&section=subscriptions&sub=${subId}` : "dashboard.html?tab=admin&section=subscriptions" }),
  newFormationPurchase: (name, titre, purchaseId) => createNotification({ userId: ADMIN_USER_ID, type: "NEW_FORMATION", message: `${name} a acheté "${titre}".`, link: purchaseId ? `dashboard.html?tab=admin&section=videopurchases&purchase=${purchaseId}` : 'dashboard.html?tab=admin&section=videopurchases' }),
  withdrawRequest:      (name, amount)     => createNotification({ userId: ADMIN_USER_ID, type: "WITHDRAW_REQUEST",   message: `${name} demande un retrait de ${amount}.`,            link: "dashboard.html" }),
  withdrawApproved:     (uid, amount)      => createNotification({ userId: uid,           type: "WITHDRAW_APPROVED",  message: `Votre retrait de ${amount} a été approuvé.`,         link: "affiliation.html" }),
  withdrawRejected:     (uid, amount, r)   => createNotification({ userId: uid,           type: "WITHDRAW_REJECTED",  message: `Votre retrait de ${amount} a été rejeté. ${r||""}`, link: "affiliation.html" }),
  subConfirmed:         (uid, plan, subId) => createNotification({ userId: uid,           type: "SUB_CONFIRMED",      message: `Votre abonnement ${plan} est actif !`,               link: subId ? `dashboard.html?tab=subscription&sub=${subId}` : "dashboard.html?tab=subscription" }),
  subCancelled:         (uid, plan, subId) => createNotification({ userId: uid,           type: "SUB_CANCELLED",      message: `Votre abonnement ${plan} a été annulé.`,             link: subId ? `dashboard.html?tab=subscription&sub=${subId}` : "dashboard.html?tab=subscription" }),
  formationUnlocked:    (uid, titre, courseId) => createNotification({ userId: uid, type: "FORMATION_UNLOCKED", message: `La formation "${titre}" est maintenant accessible.`, link: courseId ? `formations.html?unlock=${courseId}` : "formations.html" }),
};

// ———— EXPORT ————————————————————————————————————————————————————————————————————————————————————————————————————————
window.PaganiNotif = {
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
};

// ===== STORIES =====
const STORY_COLORS = ['#6c63ff','#00d4aa','#ff4d6d','#f59e0b','#8b5cf6','#1877f2','#25d366','#e91e8c'];
const STORY_DURATION = 5000;
let _storiesData = [];
let _storyViewerGroup = null;
let _storyViewerIdx = 0;
let _storyTimer = null;

async function loadStories() {
  const bar = document.getElementById('storiesBar');
  if (!bar) return;
  const user = getUser();
  if (!user) { bar.style.display = 'none'; return; }
  try {
    const API = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
    const token = localStorage.getItem('pd_jwt');
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    _storiesData = await fetch(API + '/stories', { headers }).then(r => r.json());
  } catch(e) { _storiesData = []; }
  let html = '';

  // Bouton ajouter story (si connecté)
  if (user) {
    html += `<div class="story-bubble" onclick="openCreateStory()">
      <div class="story-add-wrap"><div class="story-add-icon">+</div></div>
      <span class="story-name">Ma story</span>
    </div>`;
  }

  // Stories (toutes, y compris les siennes)
  _storiesData.forEach((group, gi) => {
    const isOwn = user && group.userId === user.id;
    const av = group.avatarPhoto
      ? `<img src="${group.avatarPhoto}" />`
      : `<div class="avatar-circle" style="background:${group.avatarColor||'#6c63ff'}">${group.userName.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}</div>`;
    const viewCount = group.viewCount || 0;
    html += `<div class="story-bubble" onclick="openStoryViewer(${gi})">
      <div class="story-ring${group.allViewed?' viewed':''}">
        <div class="story-ring-inner">${av}</div>
      </div>
      <span class="story-name">${isOwn ? 'Ma story' : group.userName.split(' ')[0]}</span>
      ${isOwn && viewCount > 0 ? `<span class="story-view-count"><i class="fas fa-eye"></i> ${viewCount}</span>` : ''}
    </div>`;
  });

  bar.innerHTML = html;
  bar.style.display = (_storiesData.length > 0 || user) ? 'flex' : 'none';
}

function openStoryViewer(groupIdx) {
  _storyViewerGroup = groupIdx;
  _storyViewerIdx = 0;
  _renderStoryViewer();
}

function _renderStoryViewer() {
  document.getElementById('storyViewerOverlay')?.remove();
  const group = _storiesData[_storyViewerGroup];
  if (!group) return;
  const story = group.stories[_storyViewerIdx];
  const user = getUser();
  const isOwn = user && group.userId === user.id;
  const API = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');

  // Marquer comme vue (seulement si pas le créateur et pas déjà vue)
  if (user && !isOwn && !story.viewed) {
    fetch(API + '/stories/' + story.id + '/view', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('pd_jwt')
      }
    }).then(r => r.json()).then(d => {
      if (d.ok) {
        story.viewed = true;
        group.allViewed = group.stories.every(s => s.viewed);
      }
    }).catch(() => {});
  }

  const avInner = group.avatarPhoto
    ? `<img src="${group.avatarPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`
    : `<span style="font-size:0.85rem;font-weight:700;color:#fff">${group.userName.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}</span>`;

  const timeAgoStr = _storyTimeAgo(story.createdAt);
  const content = story.image
    ? `<img src="${story.image}" />`
    : `<div class="story-viewer-text">${story.content}</div>`;

  const segs = group.stories.map((s, i) => {
    const fill = i < _storyViewerIdx ? 'width:100%' : (i === _storyViewerIdx ? 'width:0%;transition:width '+STORY_DURATION+'ms linear' : 'width:0%');
    return `<div class="story-progress-seg"><div class="story-progress-fill" id="spf-${i}" style="${fill}"></div></div>`;
  }).join('');

  const viewCount = story.viewCount || 0;

  const overlay = document.createElement('div');
  overlay.id = 'storyViewerOverlay';
  overlay.className = 'story-viewer-overlay';
  overlay.innerHTML = `
    <div class="story-viewer" style="background:${story.image ? '#000' : story.bgColor}">
      <div class="story-progress-bar">${segs}</div>
      <div class="story-viewer-header">
        ${isOwn ? `<div class="story-viewer-avatar">${avInner}</div><span class="story-viewer-name">${group.userName}</span>` : `<a href="profil.html?id=${group.userId}" class="story-viewer-profile-link" onclick="closeStoryViewer()"><div class="story-viewer-avatar">${avInner}</div><span class="story-viewer-name">${group.userName}</span></a>`}
        <span class="story-viewer-time">${timeAgoStr}</span>
        <button class="story-viewer-close" onclick="closeStoryViewer()"><i class="fas fa-times"></i></button>
      </div>
      <div class="story-viewer-content">${content}</div>
      ${_storyViewerIdx > 0 ? '<button class="story-nav-btn story-nav-prev" onclick="_storyNav(-1)"><i class="fas fa-chevron-left"></i></button>' : ''}
      ${_storyViewerIdx < group.stories.length - 1 ? '<button class="story-nav-btn story-nav-next" onclick="_storyNav(1)"><i class="fas fa-chevron-right"></i></button>' : ''}
      ${isOwn ? `<div class="story-owner-bar"><span id="storyViewCountLabel" onclick="openStoryViewers()" style="cursor:pointer"><i class="fas fa-eye"></i> ${viewCount} vue${viewCount>1?'s':''}</span><span id="storyReactCountLabel"></span><button class="story-owner-del" onclick="deleteStory(${story.id})"><i class="fas fa-trash"></i> Supprimer</button></div>` : `<div class="story-react-bar" id="storyReactBar"></div>`}
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeStoryViewer(); });
  document.body.appendChild(overlay);

  // Polling du compteur de vues pour le créateur
  if (isOwn) _pollStoryViewCount(story.id);

  // Charger les reactions
  _loadStoryReactions(story.id);

  // Barre de progression
  clearTimeout(_storyTimer);
  setTimeout(() => {
    const fill = document.getElementById('spf-' + _storyViewerIdx);
    if (fill) fill.style.width = '100%';
  }, 50);
  _storyTimer = setTimeout(() => _storyNav(1), STORY_DURATION);
}

function _storyNav(dir) {
  clearTimeout(_storyTimer);
  const group = _storiesData[_storyViewerGroup];
  if (!group) return;
  const next = _storyViewerIdx + dir;
  if (next >= 0 && next < group.stories.length) {
    _storyViewerIdx = next;
    _renderStoryViewer();
  } else if (dir > 0 && _storyViewerGroup < _storiesData.length - 1) {
    _storyViewerGroup++;
    _storyViewerIdx = 0;
    _renderStoryViewer();
  } else {
    closeStoryViewer();
  }
}

let _storyViewCountTimer = null;
function _pauseStoryTimer() {
  clearTimeout(_storyTimer);
  _storyTimer = null;
  // Figer la barre de progression en cours
  var fill = document.getElementById('spf-' + _storyViewerIdx);
  if (fill) {
    var computed = window.getComputedStyle(fill).width;
    fill.style.transition = 'none';
    fill.style.width = computed;
  }
}

function _resumeStoryTimer() {
  // Ne reprendre que si le viewer est ouvert et aucun picker actif
  if (!document.getElementById('storyViewerOverlay')) return;
  if (document.getElementById('storyEmojiPicker')) return;
  clearTimeout(_storyTimer);
  // Relancer la progression depuis 0 pour la story courante
  var fill = document.getElementById('spf-' + _storyViewerIdx);
  if (fill) {
    fill.style.transition = 'width ' + STORY_DURATION + 'ms linear';
    fill.style.width = '100%';
  }
  _storyTimer = setTimeout(function() { _storyNav(1); }, STORY_DURATION);
}

function closeStoryViewer() {
  clearTimeout(_storyTimer);
  clearInterval(_storyViewCountTimer);
  _storyViewCountTimer = null;
  document.getElementById('storyViewerOverlay')?.remove();
}

async function deleteStory(storyId) {
  if (!confirm('Supprimer cette story ?')) return;
  const API = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  const token = localStorage.getItem('pd_jwt');
  try {
    const r = await fetch(API + '/stories/' + storyId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!r.ok) { alert('Erreur lors de la suppression.'); return; }
    closeStoryViewer();
    await loadStories();
  } catch(e) { alert('Erreur serveur.'); }
}

function _pollStoryViewCount(storyId) {
  clearInterval(_storyViewCountTimer);
  const API = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  const token = localStorage.getItem('pd_jwt');
  const update = () => {
    const label = document.getElementById('storyViewCountLabel');
    if (!label) { clearInterval(_storyViewCountTimer); return; }
    fetch(API + '/stories/' + storyId + '/views-count', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.json()).then(d => {
      const n = d.count || 0;
      _storyViewers = d.viewers || [];
      label.innerHTML = '<i class="fas fa-eye"></i> ' + n + ' vue' + (n > 1 ? 's' : '');
    }).catch(() => {});
  };
  update();
  _storyViewCountTimer = setInterval(update, 5000);
}

let _storyViewers = [];
function closeStoryViewers() {
  const modal = document.getElementById('storyViewersModal');
  if (modal) modal.remove();
  _resumeStoryTimer();
}

function openStoryViewers() {
  _pauseStoryTimer();
  document.getElementById('storyViewersModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'storyViewersModal';
  modal.className = 'story-viewers-modal';
  const total = _storyViewers.length;
  const followers = _storyViewers.filter(v => v.name);
  const anonCount = total - followers.length;

  const followerItems = followers.map(v => {
    const initials = v.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const av = v.avatar_photo
      ? `<img src="${v.avatar_photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`
      : `<span style="font-size:0.75rem;font-weight:700;color:#fff">${initials}</span>`;
    const reactionBadge = v.emoji ? `<span class="story-viewer-reaction">${v.emoji}</span>` : '';
    return `<a href="profil.html?id=${v.user_id}" class="story-viewer-item" onclick="closeStoryViewers()"><div class="story-viewer-av" style="background:${v.avatar_color||'#6c63ff'}">${av}</div><span class="story-viewer-name">${v.name}</span>${reactionBadge}</a>`;
  }).join('');

  const emptyMsg = total === 0
    ? '<p style="color:var(--text2);text-align:center;padding:1.5rem;font-size:0.85rem">Aucune vue pour l\'instant.</p>'
    : '';

  const anonFooter = anonCount > 0
    ? `<div class="story-viewers-anon"><i class="fas fa-eye-slash"></i> ${anonCount} autre${anonCount>1?'s':''} personne${anonCount>1?'s':''} ${anonCount>1?'ont':'a'} vu cette story</div>`
    : '';

  modal.innerHTML = `<div class="story-viewers-box"><div class="story-viewers-header"><span><i class="fas fa-eye"></i> ${total} vue${total>1?'s':''}</span><button onclick="closeStoryViewers()" style="background:none;border:none;color:var(--text2);font-size:1.1rem;cursor:pointer">&times;</button></div><div class="story-viewers-list">${followerItems}${emptyMsg}</div>${anonFooter}</div>`;
  modal.addEventListener('click', e => { if (e.target === modal) closeStoryViewers(); });
  document.body.appendChild(modal);
}
function openCreateStory() {
  document.getElementById('storyCreateModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'storyCreateModal';
  modal.className = 'story-create-modal';
  let selectedColor = STORY_COLORS[0];
  let imageBase64 = '';

  modal.innerHTML = `
    <div class="story-create-box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <h3 style="margin:0;font-size:1rem"><i class="fas fa-plus-circle" style="color:var(--accent)"></i> Nouvelle story</h3>
        <button onclick="document.getElementById('storyCreateModal').remove()" style="background:none;border:none;color:var(--text2);font-size:1.2rem;cursor:pointer">&times;</button>
      </div>
      <div class="story-create-preview" id="storyPreview" style="background:${selectedColor}">
        <span id="storyPreviewText" style="color:#fff;font-size:1rem;opacity:0.5">Aperçu...</span>
      </div>
      <div class="story-colors" id="storyColors">
        ${STORY_COLORS.map((c,i) => `<button class="story-color-btn${i===0?' active':''}" style="background:${c}" onclick="_selectStoryColor('${c}',this)"></button>`).join('')}
      </div>
      <textarea id="storyText" placeholder="Écrivez votre statut..." rows="3"
        style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:10px;color:var(--text);padding:0.7rem;font-size:0.9rem;font-family:inherit;resize:none;margin-bottom:0.8rem"
        oninput="_updateStoryPreview()"></textarea>
      <div style="display:flex;gap:0.6rem;margin-bottom:0.8rem">
        <label class="admin-media-btn" for="storyImageInput" style="flex:1;justify-content:center">
          <i class="fas fa-image"></i> Photo
        </label>
        <input type="file" id="storyImageInput" accept="image/*" style="display:none" onchange="_previewStoryImage(this)" />
      </div>
      <div style="display:flex;gap:0.6rem">
        <button onclick="document.getElementById('storyCreateModal').remove()" class="btn-outline" style="flex:1;padding:0.6rem">Annuler</button>
        <button onclick="submitStory()" class="btn-primary" style="flex:1;padding:0.6rem"><i class="fas fa-paper-plane"></i> Publier</button>
      </div>
      <p id="storyCreateMsg" style="font-size:0.8rem;min-height:1rem;margin-top:0.5rem;text-align:center"></p>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

function _selectStoryColor(color, btn) {
  document.querySelectorAll('.story-color-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const preview = document.getElementById('storyPreview');
  if (preview && !preview.querySelector('img')) preview.style.background = color;
  window._storySelectedColor = color;
}

function _updateStoryPreview() {
  const text = document.getElementById('storyText')?.value || '';
  const preview = document.getElementById('storyPreview');
  if (!preview) return;
  const img = preview.querySelector('img');
  if (!img) {
    const span = document.getElementById('storyPreviewText');
    if (span) { span.textContent = text || 'Aperçu...'; span.style.opacity = text ? '1' : '0.5'; }
  }
}

function _previewStoryImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Image trop grande (max 5 Mo).'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    window._storyImageBase64 = e.target.result;
    const preview = document.getElementById('storyPreview');
    if (preview) preview.innerHTML = `<img src="${e.target.result}" />`;
  };
  reader.readAsDataURL(file);
}

async function submitStory() {
  const content = document.getElementById('storyText')?.value.trim() || '';
  const image = window._storyImageBase64 || '';
  const bgColor = window._storySelectedColor || STORY_COLORS[0];
  const msg = document.getElementById('storyCreateMsg');
  if (!content && !image) { msg.style.color='var(--red)'; msg.textContent='Ajoutez du texte ou une image.'; return; }
  const API = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  try {
    await fetch(API + '/stories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('pd_jwt') },
      body: JSON.stringify({ content, image, bgColor })
    });
    window._storyImageBase64 = '';
    document.getElementById('storyCreateModal')?.remove();
    await loadStories();
  } catch(e) { msg.style.color='var(--red)'; msg.textContent='Erreur lors de la publication.'; }
}

function _storyTimeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 3600) return Math.floor(diff/60) + ' min';
  return Math.floor(diff/3600) + 'h';
}

// ===== STORY REACTIONS =====
var STORY_EMOJIS = ['\u2764\uFE0F','\uD83D\uDD25','\uD83D\uDE0D','\uD83D\uDC4F','\uD83D\uDE2E','\uD83D\uDE02'];
var _myStoryReaction = null;

async function _loadStoryReactions(storyId) {
  var bar = document.getElementById('storyReactBar');
  var ownerLabel = document.getElementById('storyReactCountLabel');
  var API = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  var counts = [];
  try { var r = await fetch(API + '/stories/' + storyId + '/reactions'); counts = await r.json(); } catch(e) {}
  if (ownerLabel) {
    var total = counts.reduce(function(s,r){return s+parseInt(r.count);},0);
    var top = counts.slice(0,3).map(function(r){return r.emoji+' '+r.count;}).join('  ');
    ownerLabel.innerHTML = total > 0 ? '<i class="fas fa-heart" style="color:#ff4d6d"></i> ' + top : '';
    return;
  }
  if (!bar) return;
  _myStoryReaction = null;
  if (token) {
    try {
      var mr = await fetch(API + '/stories/' + storyId + '/my-reaction', { headers: { 'Authorization': 'Bearer ' + token } });
      var md = await mr.json();
      _myStoryReaction = md.emoji || null;
    } catch(e) {}
  }
  _renderStoryReactBar(bar, storyId);
}

function _renderStoryReactBar(bar, storyId) {
  bar.innerHTML = '<button class="story-react-btn' + (_myStoryReaction ? ' reacted' : '') + '" onclick="toggleStoryEmojiPicker(' + storyId + ', this)">' + (_myStoryReaction || '\u2764\uFE0F') + '</button>';
}

function toggleStoryEmojiPicker(storyId, btn) {
  var existing = document.getElementById('storyEmojiPicker');
  if (existing) { existing.remove(); _resumeStoryTimer(); return; }
  if (!getUser()) { window.location.href = 'dashboard.html'; return; }
  var picker = document.createElement('div');
  picker.id = 'storyEmojiPicker';
  picker.className = 'story-emoji-picker';
  picker.innerHTML = STORY_EMOJIS.map(function(e) {
    return '<button class="story-emoji-opt' + (_myStoryReaction === e ? ' active' : '') + '" onclick="reactToStory(' + storyId + ', \'' + e + '\', this)">' + e + '</button>';
  }).join('');
  btn.parentElement.appendChild(picker);
  _pauseStoryTimer();
  setTimeout(function() {
    document.addEventListener('click', function _close(ev) {
      if (!picker.contains(ev.target) && ev.target !== btn) {
        picker.remove();
        _resumeStoryTimer();
        document.removeEventListener('click', _close);
      }
    });
  }, 50);
}

async function reactToStory(storyId, emoji, btn) {
  var ep = document.getElementById('storyEmojiPicker'); if (ep) ep.remove();
  _resumeStoryTimer();
  var API = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  if (!token) { window.location.href = 'dashboard.html'; return; }
  try {
    var r = await fetch(API + '/stories/' + storyId + '/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ emoji: emoji })
    });
    var d = await r.json();
    _myStoryReaction = d.action === 'removed' ? null : emoji;
    if (d.action !== 'removed') _launchStoryEmojiAnim(emoji);
    await _loadStoryReactions(storyId);
    var bar = document.getElementById('storyReactBar');
    if (bar) _renderStoryReactBar(bar, storyId);
  } catch(e) {}
}

function _launchStoryEmojiAnim(emoji) {
  var viewer = document.querySelector('.story-viewer');
  if (!viewer) return;
  for (var i = 0; i < 8; i++) {
    (function(idx) {
      setTimeout(function() {
        var el = document.createElement('div');
        el.className = 'story-emoji-fly';
        el.textContent = emoji;
        el.style.left = (20 + Math.random() * 60) + '%';
        el.style.animationDuration = (0.8 + Math.random() * 0.6) + 's';
        el.style.fontSize = (1.2 + Math.random() * 1) + 'rem';
        viewer.appendChild(el);
        el.addEventListener('animationend', function() { el.remove(); });
      }, idx * 80);
    })(i);
  }
}

// ===== BADGES =====
function _buildBadgesHTML(badges) {
  if (!badges || !badges.length) return '';
  return '<div class="user-badges">' + badges.map(b =>
    `<span class="user-badge" style="background:${b.color}18;color:${b.color};border-color:${b.color}44" title="${b.label}">${b.icon} ${b.label}</span>`
  ).join('') + '</div>';
}
function _buildBadgesInline(badges) {
  if (!badges || !badges.length) return '';
  return '<span class="post-author-badges">' + badges.slice(0,2).map(b =>
    `<span class="user-badge" style="background:${b.color}18;color:${b.color};border-color:${b.color}44" title="${b.label}">${b.icon}</span>`
  ).join('') + '</span>';
}

// ===== DONNES COURS =====
// IMPORTANT : videoId est volontairement absent ici pour les videos payantes.
// Les IDs sont stockes separment dans _getSecureVideoId() et ne sont jamais
// injectes dans le DOM. Seules les videos gratuites ont leur videoId ici.
const COURSES = [];
// ===== CHIFFREMENT LGER DES IDS PRIVS =====
const _ENC_KEY = 'pagani2025secure';
function _encode(str) {
  if (!str) return '';
  try {
    // Prefixe pour detecter un ID deja chiffre
    const prefixed = 'ENC:' + str;
    return btoa(prefixed.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ _ENC_KEY.charCodeAt(i % _ENC_KEY.length))
    ).join(''));
  } catch { return str; }
}
function _decode(str) {
  if (!str) return '';
  try {
    const decoded = atob(str).split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ _ENC_KEY.charCodeAt(i % _ENC_KEY.length))
    ).join('');
    // Verifier le prefixe
    if (decoded.startsWith('ENC:')) return decoded.slice(4);
    // Pas de prefixe = ID en clair (ancien format), retourner tel quel
    return str;
  } catch {
    // echec du dechiffrement = ID en clair (ancien format)
    return str;
  }
}
/**
 * Verifie l'acces et retourne { source, id } pour lire la video.
 * source : 'youtube' | 'drive'
 * id     : l'identifiant dechiffre en memoire — JAMAIS expose dans le DOM.
 * Retourne null si acces refus.
 */
function _getSecureVideo(course, user) {
  const stored = getVideos().find(v => v.id === course.id) || course;
  // Video gratuite : accessible a tous
  if (course.free) {
    const src = stored.videoSource || 'youtube';
    const id  = src === 'drive' ? _decode(stored.driveId) : stored.videoId;
    return id ? { source: src, id } : null;
  }
  // Video payante : Pro, Elite, ou achat unitaire valide
  if (!user) return null;
  const hasPlan     = user.plan === 'Pro' || user.plan === 'Elite';
  const hasUnlocked = (user.unlockedCourses || []).includes(course.id);
  if (!hasPlan && !hasUnlocked) return null;
  // Acces valide : dechiffrer l\'ID en memoire uniquement
  const src = stored.videoSource || 'youtube';
  const id  = src === 'drive' ? _decode(stored.driveId) : stored.videoId;
  return id ? { source: src, id } : null;
}
// Taux de commission par plan (abonnement et formation unitaire)
const COMMISSION_RATES = {
  Starter: { abonnement: 0.20, formation: 0.15 },
  Pro:     { abonnement: 0.35, formation: 0.25 },
  Elite:   { abonnement: 0.50, formation: 0.40 },
};
// Prix de reference en AR
const PRICES_AR = {
  pro:       30000,
  elite:     90000,
  formation: 10000,
};
// Donnes de dmo supprimes — credentials grs via config.js

// ===== UTILITAIRES =====
function getUser() {
  // Compatibilit sync pour les fonctions non-async (feed, etc.)
  return window._currentUser || null;
}
// ===== PRESENCE PING =====
var _presencePingTimer = null;
function _startPresencePing() {
  if (_presencePingTimer) return;
  if (window.PaganiAPI) PaganiAPI.presencePing().catch(function(){});
  _presencePingTimer = setInterval(function() {
    if (window.PaganiAPI) PaganiAPI.presencePing().catch(function(){});
  }, 30000);
}
function _stopPresencePing() {
  if (_presencePingTimer) { clearInterval(_presencePingTimer); _presencePingTimer = null; }
}
async function refreshCurrentUser() {
  let user = null;
  const jwt = localStorage.getItem('pd_jwt');
  if (jwt) {
    try { user = await PaganiAPI.getMe(); } catch(e) { user = null; }
  }
  window._currentUser = user;
  // Mettre a jour le badge messages navbar si l'utilisateur est connect
  if (user) setTimeout(_updateMsgBadge, 500);
  if (user) _startPresencePing(); else _stopPresencePing();
  return user;
}
function getInitials(name) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}
function getAvatarColor(user) {
  return (user && user.avatarColor) ? user.avatarColor : "#6c63ff";
}
// Convertit le texte brut en HTML avec paragraphes et sauts de ligne respects
function formatPostContent(text) {
  if (!text) return "";
  const markdownLink = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
  const markdownBold = /\*\*([^*]+)\*\*/g;
  const markdownItal = /(?<!\w)_([^_]+)_(?!\w)/g;
  const urlRegex     = /(https?:\/\/[^\s<>"'\)]+)/g;
  return text
    .split(/\n{2,}/)
    .map(para => {
      if (para.trim() === '---') return '<hr style="border:none;border-top:1px solid var(--border);margin:0.4rem 0">';
      let line = para
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
      // 1. Liens Markdown [texte](url) en premier
      line = line.replace(markdownLink, (_, label, url) =>
        `<a href="${url}" target="_blank" rel="noopener" class="post-auto-link">${label}</a>`);
      // 2. Gras et italique
      line = line.replace(markdownBold, (_, t) => `<strong>${t}</strong>`);
      line = line.replace(markdownItal, (_, t) => `<em>${t}</em>`);
      // 3. URLs brutes — uniquement celles PAS deja dans un attribut href
      // On dcoupe la ligne en segments texte/balise et on ne traite que le texte
      line = line.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, txt) => {
        if (tag) return tag; // laisser les balises intactes
        return txt.replace(urlRegex, url => {
          const display = url.length > 50 ? url.slice(0, 47) + '...' : url;
          return `<a href="${url}" target="_blank" rel="noopener" class="post-auto-link">${display}</a>`;
        }).replace(/@([A-Z\u00C0-\u024F][\w\u00C0-\u024F]*(?:\s[A-Z\u00C0-\u024F][\w\u00C0-\u024F]*)?)/g, (_, name) =>
          `<a href="javascript:void(0)" class="post-mention" onclick="_openMentionProfile('${name.replace(/'/g, "\\\'")}')">@${name}</a>`
        ).replace(/#([\w\u00C0-\u024F]+)/g, (_, tag) =>
          `<a href="javascript:void(0)" class="post-hashtag" onclick="filterByHashtag('${tag}')">#${tag}</a>`
        );
      });
      return `<p>${line}</p>`;
    })
    .join("");
}
function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return "a l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  return new Date(dateStr).toLocaleDateString("fr-FR");
}
function _presenceTimeAgo(ts) {
  if (!ts) return '';
  var t = Number(ts);
  if (!t || isNaN(t)) return '';
  var diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 0) diff = 0;
  if (diff < 60)    return 'Vu à l\'instant';
  if (diff < 3600)  return 'Il y a ' + Math.floor(diff / 60) + ' min';
  if (diff < 86400) return 'Il y a ' + Math.floor(diff / 3600) + 'h';
  var days = Math.floor(diff / 86400);
  if (days < 7)     return 'Il y a ' + days + 'j';
  if (days < 30)    return 'Il y a ' + Math.floor(days / 7) + ' sem';
  return 'Il y a ' + Math.floor(days / 30) + ' mois';
}
// Met a jour le compteur de stats d'un post dans le DOM
function _updatePostStats(postId, post) {
  const el = document.getElementById('post-' + postId);
  if (!el) return;
  _updateReactionCount(postId, _reactionsCache[postId] || {});
}
// ===== EMOJI PICKER COMMENTAIRES =====
const COMMENT_EMOJIS = ['😂','❤️','😍','👍','🔥','😊','🎉','😭','🙏','💪','😎','🤔','😅','👏','🥰','✅','⭐','🚀','💡','🎯'];
function toggleCommentEmoji(inputId, btn) {
  // Fermer tout picker deja ouvert
  document.querySelectorAll('.comment-emoji-picker').forEach(p => {
    if (p.dataset.for !== inputId) p.remove();
  });
  const existing = document.querySelector(`.comment-emoji-picker[data-for="${inputId}"]`);
  if (existing) { existing.remove(); return; }
  const picker = document.createElement('div');
  picker.className = 'comment-emoji-picker';
  picker.dataset.for = inputId;
  picker.innerHTML = COMMENT_EMOJIS.map(e =>
    `<button type="button" onclick="_insertCommentEmoji('${inputId}','${e}')">${e}</button>`
  ).join('');
  // Positionner au-dessus du bouton
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(picker);
  // Fermer en cliquant ailleurs
  setTimeout(() => {
    document.addEventListener('click', function close(ev) {
      if (!picker.contains(ev.target) && ev.target !== btn) {
        picker.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 10);
}
function _insertCommentEmoji(inputId, emoji) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const s = input.selectionStart || input.value.length;
  input.value = input.value.slice(0, s) + emoji + input.value.slice(s);
  input.focus();
  input.selectionStart = input.selectionEnd = s + emoji.length;
  document.querySelectorAll('.comment-emoji-picker').forEach(p => p.remove());
}
// ===== FEED SOCIAL =====
const POSTS_PER_PAGE = 5;
let _feedPage = 0;
let _feedLoading = false;
let _feedObserver = null;
const DEFAULT_NEWS = [];
// Cache local des posts (mis a jour depuis le serveur)
let _postsCache = [];
let _feedRendering = false; // verrou anti-race condition
let _pendingComments = new Map(); // postId -> [commentaires en attente de confirmation serveur]
const _commentSort  = {}; // postId -> 'recent' | 'oldest' | 'top'
const _commentPage  = {}; // postId -> nombre de commentaires affichés
const COMMENTS_PER_PAGE = 3;
function getNews() {
  return _postsCache.length ? _postsCache : DEFAULT_NEWS;
}
function saveNews(news) {
  _postsCache = news;
}
// Rafraechissement silencieux du feed (sans reset du scroll)
async function _silentRefreshFeed() {
  if (!window.PaganiAPI) return;
  // Fonctionne pour tous (connects ou non)
  try {
    const fresh = await PaganiAPI.getPosts();
    if (!fresh || !fresh.length) return;
    const container = document.getElementById('feedPosts');
    const user = getUser();
    const isAdmin = user && user.role === 'admin';
    // Fusionner : mettre a jour les posts existants, ajouter les nouveaux.
    // Ne JAMAIS retirer un post du cache ici.
    const freshMap = new Map(fresh.map(p => [p.id, p]));
    // 1. Mettre a jour les posts existants dans le cache
    // Ne pas ecraser un post qui a des commentaires en attente de confirmation
    _postsCache = _postsCache.map(p => {
      if (!freshMap.has(p.id)) return p;
      if (_pendingComments.has(p.id)) {
        // Garder les commentaires locaux, mettre a jour le reste
        const fresh = freshMap.get(p.id);
        return { ...fresh, comments: p.comments };
      }
      return freshMap.get(p.id);
    });
    // 2. Ajouter les posts du serveur absents du cache
    const cacheIds = new Set(_postsCache.map(p => p.id));
    fresh.forEach(p => {
      if (!cacheIds.has(p.id)) {
        _postsCache.unshift(p);
        if (container && !document.getElementById('post-' + p.id)) {
          const el = buildPostCard(p, user, isAdmin);
          el.classList.add('post-animate');
          container.insertBefore(el, container.firstChild);
        }
      }
    });
    if (!container) return;
    // 3. Mettre a jour les stats des posts deja dans le DOM
    fresh.forEach(post => {
      const el = document.getElementById('post-' + post.id);
      if (!el) return;
      const totalComments = (post.comments||[]).reduce((a,c)=>a+1+(c.replies||[]).length,0);
      const statsEl = el.querySelector('.post-stats');
      if (statsEl) {
        _updateReactionCount(post.id, _reactionsCache[post.id] || {});
      }
      if (user) {
        // Mettre à jour le bouton réaction depuis le cache
        const myEmoji = Object.entries(_reactionsCache[post.id] || {}).find(([,ids]) => ids.includes(user.id))?.[0] || null;
        _updateReactionUI(post.id, _reactionsCache[post.id] || {}, myEmoji);
      }
      const commSection = el.querySelector('.comments-section');
      const commList    = el.querySelector('#comments-list-' + post.id);
      if (commSection && commSection.style.display !== 'none' && commList) {
        // Ne pas ecraser si des commentaires sont en attente de confirmation serveur
        if (_pendingComments.has(post.id)) return;
        const isGuest = !user;
        commList.innerHTML = (post.comments||[]).length === 0
          ? '<p class="no-comments">Aucun commentaire. Soyez le premier !</p>'
          : (post.comments||[]).map(c => _buildCommentHTML(c, post.id, user, isGuest)).join('');
      }
    });
  } catch(e) {}
}
async function _loadPosts() {
  try {
    const remote = await PaganiAPI.getPosts();
    // Ne remplacer le cache que si le serveur retourne des donnes valides
    if (remote && remote.length) _postsCache = remote;
    else if (!_postsCache.length) _postsCache = DEFAULT_NEWS;
  } catch(e) {
    if (!_postsCache.length) _postsCache = DEFAULT_NEWS;
  }
  return _postsCache;
}
// Rendu initial du feed (reset + 1re page)
async function renderFeed() {
  if (_feedRendering) return; // ignorer les appels simultans
  _feedRendering = true;
  const container = document.getElementById('feedPosts');
  if (!container) { _feedRendering = false; return; }
  _feedPage   = 0;
  _feedLoading = false;
  if (_feedObserver) { _feedObserver.disconnect(); _feedObserver = null; }
  const user    = getUser();
  const isAdmin = user && user.role === 'admin';
  // Sidebar
  const sidebarUser = document.getElementById('sidebarUser');
  if (sidebarUser) {
    if (user) {
      sidebarUser.style.display = 'block';
      const avEl = document.getElementById('sidebarAvatar');
      if (avEl) {
        if (user.avatarPhoto) { avEl.innerHTML = `<img src="${user.avatarPhoto}" class="avatar-photo" style="width:42px;height:42px" />`; avEl.style.background = 'transparent'; }
        else { avEl.textContent = getInitials(user.name); avEl.style.background = getAvatarColor(user); }
      }
      document.getElementById('sidebarName').textContent = user.name;
      document.getElementById('sidebarPlan').textContent = 'Plan ' + user.plan;
    } else { sidebarUser.style.display = 'none'; }
  }
  updateNavbar(user);
  const adminPanel = document.getElementById('adminPanel');
  if (adminPanel) adminPanel.style.display = isAdmin ? 'block' : 'none';
  // Panneau publication utilisateur
  const userPostPanel = document.getElementById('userPostPanel');
  if (userPostPanel) {
    userPostPanel.style.display = (user && !isAdmin) ? 'block' : 'none';
    if (user && !isAdmin) {
      const av = document.getElementById('userPostAvatar');
      if (av) {
        if (user.avatarPhoto) {
          av.innerHTML = `<img src="${user.avatarPhoto}" class="avatar-photo avatar-sm" />`;
          av.style.background = 'transparent';
        } else {
          av.textContent = getInitials(user.name);
          av.style.background = getAvatarColor(user);
        }
      }
    }
  }
  container.innerHTML = renderSkeletons(3);
  // Charger les posts depuis le serveur
  try { await _loadPosts(); } catch(e) {}
  // Charger les réactions en batch
  try {
    if (window.PaganiAPI && _postsCache.length) {
      const ids = _postsCache.map(p => p.id);
      const batchRes = await Promise.allSettled(ids.slice(0,20).map(id => PaganiAPI.getPostReactions(id)));
      batchRes.forEach((r, i) => { if (r.status === 'fulfilled') _reactionsCache[ids[i]] = r.value; });
    }
  } catch(e) {}
  // Pas de setTimeout : on remplace les skeletons immdiatement
  container.innerHTML = '';
  if (_postsCache.length === 0) {
    container.innerHTML = '<div class="feed-empty"><i class="fas fa-newspaper"></i><p>Aucune publication pour le moment.</p></div>';
    return;
  }
  // _loadMorePosts et _setupInfiniteScroll lisent _postsCache directement (pas de snapshot)
  _loadMorePosts(container, user, isAdmin);
  _setupInfiniteScroll(container, user, isAdmin);
  _observeLazyImages(container);
  scrollToTargetPost();
  _feedRendering = false;
}
// Charge la prochaine tranche de posts — lit toujours _postsCache en direct
function _loadMorePosts(container, user, isAdmin) {
  if (_feedLoading) return;
  const news  = _postsCache; // reference directe, jamais de snapshot
  const start = _feedPage * POSTS_PER_PAGE;
  const slice = news.slice(start, start + POSTS_PER_PAGE);
  if (slice.length === 0) return;
  _feedLoading = true;
  const oldLoader = document.getElementById("feedLoader");
  if (oldLoader) oldLoader.remove();
  slice.forEach((post, i) => {
    // Ne pas re-rendre un post deja prsent dans le DOM (ex: injecte par publishNews)
    if (document.getElementById('post-' + post.id)) return;
    const el = buildPostCard(post, user, isAdmin);
    el.style.animationDelay = `${i * 60}ms`;
    el.classList.add("post-animate");
    container.appendChild(el);
    _observeLazyImages(el);
  });
  _feedPage++;
  _feedLoading = false;
  // Retirer l'ancienne sentinelle/fin avant d'en ajouter une nouvelle
  const oldSentinel = document.getElementById("feedSentinel");
  if (oldSentinel) oldSentinel.remove();
  const oldEnd = container.querySelector('.feed-end');
  if (oldEnd) oldEnd.remove();
  const hasMore = _feedPage * POSTS_PER_PAGE < news.length;
  if (hasMore) {
    const sentinel = document.createElement("div");
    sentinel.id = "feedSentinel";
    sentinel.className = "feed-sentinel";
    sentinel.innerHTML = `<div class="feed-loader"><span></span><span></span><span></span></div>`;
    container.appendChild(sentinel);
  } else {
    const end = document.createElement("div");
    end.className = "feed-end";
    end.innerHTML = `<i class="fas fa-check-circle"></i> Vous avez tout vu !`;
    container.appendChild(end);
  }
}
// IntersectionObserver pour detecter quand la sentinelle est visible
function _setupInfiniteScroll(container, user, isAdmin) {
  _feedObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !_feedLoading) {
        const sentinel = document.getElementById("feedSentinel");
        if (sentinel) sentinel.remove();
        // Charger immdiatement si deja visible (pas de dlai artificiel)
        _loadMorePosts(container, user, isAdmin);
      }
    });
  }, { rootMargin: "200px" });
  const observe = () => {
    const sentinel = document.getElementById("feedSentinel");
    if (sentinel) _feedObserver.observe(sentinel);
  };
  observe();
  const mo = new MutationObserver(observe);
  mo.observe(container, { childList: true });
}
function _buildCommentHTML(c, postId, user, isGuest) {
  const rawId = c.id || (c.author + c.date);
  const cid = String(rawId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const clickHandler = c.authorId
    ? `openPublicProfile(${c.authorId})`
    : `openPublicProfileByName('${esc(c.author).replace(/'/g, "\\'")}')`;
  const cPhoto = (user && c.authorId && c.authorId === user.id) ? (user.avatarPhoto || '') : (c.authorPhoto || '');
  const replies = (c.replies || []).map(r => {
    const rClickHandler = r.authorId
      ? `openPublicProfile(${r.authorId})`
      : `openPublicProfileByName('${esc(r.author).replace(/'/g, "\\'")}')`;
    const rPhoto = (user && r.authorId && r.authorId === user.id) ? (user.avatarPhoto || '') : (r.authorPhoto || '');
    return `
      <div class="reply">
        <div class="avatar-circle avatar-xs" style="${rPhoto ? '' : 'background:'+(r.authorColor||'#6c63ff')};cursor:pointer" onclick="${rClickHandler}">
          ${rPhoto ? `<img src="${rPhoto}" class="avatar-photo avatar-xs" />` : getInitials(r.author)}
        </div>
        <div class="comment-bubble reply-bubble">
          <strong style="cursor:pointer" onclick="${rClickHandler}">${esc(r.author)}</strong>
          <p><a href="javascript:void(0)" class="post-mention" onclick="_openMentionProfile('${r.replyTo}')">${'@' + esc(r.replyTo)}</a> ${_renderCommentText(r.text)}</p>
          <span class="comment-time">${timeAgo(r.date)}</span>
        </div>
      </div>`;
  }).join("");
  const replyInput = isGuest ? "" : `
    <div class="reply-input-row" id="reply-row-${cid}" style="display:none">
      <div class="avatar-circle avatar-xs" style="${user && user.avatarPhoto ? '' : 'background:'+(user ? getAvatarColor(user) : '#6c63ff')}">
        ${user && user.avatarPhoto ? `<img src="${user.avatarPhoto}" class="avatar-photo avatar-xs" />` : getInitials(user ? user.name : "??")}
      </div>
      <div class="comment-input-wrap">
        <button class="comment-emoji-btn" type="button" onclick="toggleCommentEmoji('reply-input-${cid}', this)" title="Emoji"><i class="fas fa-smile"></i></button>
        <input type="text" id="reply-input-${cid}" placeholder="Repondre  ${esc(c.author)}..."
          onkeydown="if(event.key==='Enter') submitReply(${postId}, '${cid}')" />
        <button onclick="submitReply(${postId}, '${cid}')"><i class="fas fa-paper-plane"></i></button>
      </div>
    </div>`;
  return `
    <div class="comment" id="comment-${cid}">
      <div class="avatar-circle avatar-sm" style="${cPhoto ? '' : 'background:'+(c.authorColor||'#6c63ff')};cursor:pointer" onclick="${clickHandler}">
        ${cPhoto ? `<img src="${cPhoto}" class="avatar-photo avatar-sm" />` : getInitials(c.author)}
      </div>
      <div class="comment-main">
        <div class="comment-bubble">
          <strong style="cursor:pointer" onclick="${clickHandler}">${esc(c.author)}</strong>
          <p>${_renderCommentText(c.text)}</p>
          <div class="comment-footer">
            <span class="comment-time">${timeAgo(c.date)}</span>
            ${!isGuest ? `<button class="reply-btn" onclick="toggleReplyInput('${cid}')"><i class="fas fa-reply"></i> Repondre</button>` : ""}
          </div>
        </div>
        ${replies ? `<div class="replies-list">${replies}</div>` : ""}
        ${replyInput}
      </div>
    </div>`;
}
function buildPostCard(post, user, isAdmin) {
  const liked    = user && post.likes.includes(user.email);
  const comments = post.comments || [];
  const isGuest  = !user;
  const totalComments = comments.reduce((acc, c) => acc + 1 + (c.replies ? c.replies.length : 0), 0);
  const article = document.createElement("article");
  article.className = "post-card";
  article.id = `post-${post.id}`;
  article.innerHTML = `
    <div class="post-header">
      <div class="post-author" style="cursor:pointer" onclick="openPublicProfile(${JSON.stringify(post.author === 'Admin' ? null : post.authorId)})">
        <div class="avatar-circle post-avatar" style="background:${post.authorColor || "#6c63ff"}">
          ${post.authorPhoto ? `<img src="${post.authorPhoto}" style="width:42px;height:42px;border-radius:50%;object-fit:cover" />` : getInitials(post.author === "Admin" ? "Pagani Digital" : post.author)}
        </div>
        <div>
          <strong>${post.author === "Admin" ? "Pagani Digital" : post.author}
            ${post.author === "Admin" ? '<span class="verified-badge" title="Compte officiel"><i class="fas fa-check-circle"></i></span>' : ""}
          </strong>
          <span class="post-time">${timeAgo(post.date)}</span>
        </div>
      </div>
      <div class="post-header-right">
        <span class="news-tag tag-${post.category.toLowerCase()}">${post.category}</span>
        ${isAdmin && post.authorId === user.id ? `
          <div class="post-owner-menu" style="position:relative">
            <button class="post-menu-btn" onclick="togglePostMenu(${post.id})" title="Options"><i class="fas fa-ellipsis-h"></i></button>
            <div class="post-menu-dropdown" id="post-menu-${post.id}" style="display:none">
              <button onclick="openEditPostModal(${post.id})"><i class="fas fa-edit"></i> Modifier</button>
              <button onclick="toggleBoostPost(${post.id}, ${post.boostScore || 0}, null)" style="color:var(--gold)"><i class="fas fa-rocket"></i> ${post.boostScore > 0 ? 'Retirer le boost' : 'Booster'}</button>
              <button onclick="deletePost(${post.id})" style="color:var(--red)"><i class="fas fa-trash"></i> Supprimer</button>
            </div>
          </div>` : ""}
        ${isAdmin && post.authorId !== user.id ? `
          <div style="display:flex;gap:0.4rem;align-items:center">
            <button class="news-delete" onclick="toggleBoostPost(${post.id}, ${post.boostScore || 0}, this)" title="${post.boostScore > 0 ? 'Boosté (' + post.boostScore + 'pts) — cliquer pour retirer' : 'Booster ce post'}" style="background:${post.boostScore > 0 ? 'rgba(245,158,11,0.15)' : 'transparent'};color:${post.boostScore > 0 ? 'var(--gold)' : 'var(--text2)'};border:1px solid ${post.boostScore > 0 ? 'rgba(245,158,11,0.4)' : 'var(--border)'};border-radius:8px;padding:0.3rem 0.5rem;cursor:pointer;font-size:0.8rem"><i class="fas fa-rocket"></i></button>
            <button class="news-delete" onclick="deletePost(${post.id})" title="Supprimer"><i class="fas fa-trash"></i></button>
          </div>` : ""}
        ${(!isAdmin && user && post.authorId === user.id) ? `
          <div class="post-owner-menu" style="position:relative">
            <button class="post-menu-btn" onclick="togglePostMenu(${post.id})" title="Options"><i class="fas fa-ellipsis-h"></i></button>
            <div class="post-menu-dropdown" id="post-menu-${post.id}" style="display:none">
              <button onclick="openEditPostModal(${post.id})"><i class="fas fa-edit"></i> Modifier</button>
              <button onclick="deleteUserPost(${post.id})" style="color:var(--red)"><i class="fas fa-trash"></i> Supprimer</button>
            </div>
          </div>` : ""}
      </div>
    </div>
    <div class="post-body">
      <h3 class="post-title">${post.title}${post.boostScore > 0 && isAdmin ? ' <span style="font-size:0.7rem;background:rgba(245,158,11,0.15);color:var(--gold);border:1px solid rgba(245,158,11,0.3);padding:0.15rem 0.5rem;border-radius:50px;margin-left:0.4rem;vertical-align:middle">🚀 Boosté</span>' : ''}</h3>
      <div class="post-content">${formatPostContent(post.content)}</div>
      ${post.image === '__HAS_IMAGE__'
        ? `<div class="post-image-wrap"><img data-postid="${post.id}" data-lazy="1" src="" class="post-image post-image-lazy" alt="" style="min-height:180px;background:var(--bg2)" /></div>`
        : post.image ? `<div class="post-image-wrap"><img src="${post.image}" class="post-image" alt="" onclick="openPostImage('${post.id}')" /></div>` : ""}
      ${post.link ? `<a href="${post.link}" target="_blank" rel="noopener" class="post-link-btn"><i class="fas fa-external-link-alt"></i> ${post.linkLabel || 'En savoir plus'}</a>` : ""}
    </div>
    <div class="post-stats">
      ${(() => { const r=_reactionsCache[post.id]||{}; const tot=Object.values(r).reduce((s,ids)=>s+ids.length,0); const top=Object.entries(r).sort((a,b)=>b[1].length-a[1].length)[0]; return tot>0 ? `<span style="cursor:pointer" onclick="showReactionDetails(${post.id})">${top[0]} ${tot} réaction${tot!==1?'s':''}</span>` : `<span><i class="fas fa-heart" style="color:var(--red)"></i> 0 réaction</span>`; })()}
      <span style="cursor:pointer" onclick="window.location.pathname.includes('post.html') ? toggleComments(${post.id}) : window.location.href='post.html?id=${post.id}'"><i class="fas fa-comment" style="color:var(--accent)"></i> ${totalComments} commentaire${totalComments !== 1 ? "s" : ""}</span>
    </div>
    <div class="post-actions">
      ${isGuest ? `
        <a href="dashboard.html" class="reaction-btn guest-action" title="Connectez-vous pour reagir">
          <i class="fas fa-heart"></i>
          <span class="reaction-label">J'adore</span>
        </a>
        <button class="comment-toggle-btn" onclick="toggleComments(${post.id})">
          <i class="fas fa-comment"></i>
          <span class="reaction-label">Voir les commentaires</span>
        </button>
        <button class="share-fb-btn" onclick="shareOnFacebook(${post.id})" title="Partager sur Facebook">
          <i class="fab fa-facebook"></i>
          <span class="reaction-label">Partager</span>
        </button>
      ` : `
        ${_buildReactionBar(post.id, _reactionsCache[post.id] || {}, (() => { const r = _reactionsCache[post.id] || {}; return Object.entries(r).find(([,ids]) => ids.includes(user.id))?.[0] || null; })())}
        <button class="comment-toggle-btn" onclick="toggleComments(${post.id})">
          <i class="fas fa-comment"></i>
          <span class="reaction-label">Commenter</span>
        </button>
        <button class="share-fb-btn" onclick="shareOnFacebook(${post.id})" title="Partager sur Facebook">
          <i class="fab fa-facebook"></i>
          <span class="reaction-label">Partager</span>
        </button>
      `}
    </div>
    <div class="comments-section" id="comments-${post.id}" style="display:none">
      <div class="comments-list" id="comments-list-${post.id}"></div>
      ${isGuest
        ? `<div class="guest-comment-cta">
             <i class="fas fa-lock"></i>
             <span>Connectez-vous pour laisser un commentaire</span>
             <a href="dashboard.html" class="btn-primary" style="padding:0.4rem 1rem;font-size:0.82rem">Se connecter</a>
           </div>`
        : `<div class="comment-input-row">
             <div class="avatar-circle avatar-sm" style="${user.avatarPhoto ? '' : 'background:'+getAvatarColor(user)}">
               ${user.avatarPhoto ? `<img src="${user.avatarPhoto}" class="avatar-photo avatar-sm" />` : getInitials(user.name)}
             </div>
             <div class="comment-input-wrap">
               <button class="comment-emoji-btn" type="button" onclick="toggleCommentEmoji('comment-input-'+${post.id}, this)" title="Emoji"><i class="fas fa-smile"></i></button>
               <input type="text" id="comment-input-${post.id}" placeholder="Écrire un commentaire..."
                 onkeydown="if(event.key==='Enter') submitComment(${post.id})" />
               <button onclick="submitComment(${post.id})"><i class="fas fa-paper-plane"></i></button>
             </div>
           </div>`
      }
    </div>`;
  // Attacher les listeners touch pour le hold-press (picker réactions)
  if (!isGuest) {
    setTimeout(() => {
      const reactionBtn = article.querySelector('.reaction-btn[data-postid]');
      if (reactionBtn) _attachReactionTouchListeners(post.id, reactionBtn);
    }, 0);
  }
  return article;
}
async function toggleLike(postId) {
  const user = getUser();
  if (!user) { window.location.href = 'dashboard.html'; return; }
  // Mise a jour optimiste locale
  const post = _postsCache.find(p => p.id === postId) || _profilePostsCache.find(p => p.id === postId);
  if (post) {
    const idx = post.likes.indexOf(user.email);
    if (idx === -1) post.likes.push(user.email); else post.likes.splice(idx, 1);
    _updatePostStats(postId, post);
  }
  if (window.PaganiAPI) {
    try { await PaganiAPI.toggleLike(postId); } catch(e) {}
  }
}
function shareOnFacebook(postId) {
  const user = getUser();
  const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/post.html');
  const ref  = user ? user.refCode : '';
  const url  = base + '?id=' + postId + (ref ? '&ref=' + encodeURIComponent(ref) : '');
  const fbUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
  window.open(fbUrl, '_blank', 'width=600,height=400,noopener,noreferrer');
  // Tracker le partage si connect
  if (user && window.PaganiAPI) {
    PaganiAPI.recordShare(postId).catch(() => {});
  }
}
// ── Rendu paginé + trié des commentaires ──────────────────────────────────
function _sortComments(comments, sort) {
  const arr = [...comments];
  if (sort === 'oldest') return arr.sort((a, b) => new Date(a.date) - new Date(b.date));
  if (sort === 'top')    return arr.sort((a, b) => (b.replies||[]).length - (a.replies||[]).length);
  return arr.sort((a, b) => new Date(a.date) - new Date(b.date)); // recent = plus ancien en haut, plus récent en bas
}

function _renderCommentsList(postId, resetPage) {
  const post = _postsCache.find(p => p.id === postId) || (_profilePostsCache && _profilePostsCache.find(p => p.id === postId));
  const listEl = document.getElementById('comments-list-' + postId);
  if (!listEl) return;
  const user    = getUser();
  const isGuest = !user;
  const comments = (post && post.comments) ? post.comments : [];

  if (resetPage) _commentPage[postId] = COMMENTS_PER_PAGE;
  const page = _commentPage[postId] || COMMENTS_PER_PAGE;
  const sort = _commentSort[postId] || 'recent';

  // Trier : recent = du plus ancien au plus récent (les récents en bas)
  const sorted = _sortComments(comments, sort);
  const total  = sorted.length;
  // Prendre les N derniers (les plus récents sont en bas)
  const shown  = sorted.slice(Math.max(0, total - page), total);
  const hidden = total - shown.length;

  if (comments.length === 0) {
    listEl.innerHTML = '<p class="no-comments">Aucun commentaire. Soyez le premier !</p>';
    return;
  }

  // Barre de tri (seulement si > 3 commentaires)
  const sortBar = comments.length > 3 ? `
    <div class="comments-sort-bar">
      <span class="comments-sort-label"><i class="fas fa-sort"></i></span>
      <button class="comments-sort-btn ${sort==='recent'?'active':''}" onclick="_setCommentSort(${postId},'recent')"><i class="fas fa-clock"></i> Récents</button>
      <button class="comments-sort-btn ${sort==='top'?'active':''}"    onclick="_setCommentSort(${postId},'top')"><i class="fas fa-fire"></i> Pertinents</button>
      <button class="comments-sort-btn ${sort==='oldest'?'active':''}" onclick="_setCommentSort(${postId},'oldest')"><i class="fas fa-history"></i> Anciens</button>
    </div>` : '';

  // Bouton "Voir les précédents" en haut
  const loadMore = hidden > 0 ? `
    <button class="comments-load-more" onclick="_loadMoreComments(${postId})">
      <i class="fas fa-chevron-up"></i> Voir ${Math.min(hidden, 5)} commentaire${hidden>1?'s':''} précédent${hidden>1?'s':''}
      <span class="comments-load-more-count">${hidden} restant${hidden>1?'s':''}</span>
    </button>` : '';

  // Sauvegarder scroll avant insertion
  const section   = listEl.closest('.comments-section');
  const oldScroll = listEl.scrollTop;
  const oldHeight = listEl.scrollHeight;

  listEl.innerHTML = sortBar + loadMore +
    shown.map((c, i) => {
      const el = _buildCommentHTML(c, postId, user, isGuest);
      return '<div class="comment-animate" style="animation-delay:' + (i * 40) + 'ms">' + el + '</div>';
    }).join('');

  // Maintenir le scroll si on charge les anciens (pas un reset)
  if (!resetPage && section) {
    const newHeight = listEl.scrollHeight;
    const diff = newHeight - oldHeight;
    if (diff > 0) listEl.scrollTop = oldScroll + diff;
  } else if (resetPage && section) {
    // Reset : scroller vers le bas pour voir les plus récents
    setTimeout(() => { listEl.scrollTop = listEl.scrollHeight; }, 50);
  }
}

function _setCommentSort(postId, sort) {
  _commentSort[postId] = sort;
  _commentPage[postId] = COMMENTS_PER_PAGE;
  _renderCommentsList(postId, false);
}

function _loadMoreComments(postId) {
  _commentPage[postId] = (_commentPage[postId] || COMMENTS_PER_PAGE) + 5;
  _renderCommentsList(postId, false);
}

function toggleComments(postId) {
  // Sur post.html : comportement complet avec commentaires
  if (window.location.pathname.includes('post.html')) {
    const section = document.getElementById('comments-' + postId);
    if (!section) return;
    const isOpen = section.style.display !== 'none';
    section.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
      section.style.animation = 'slideDown 0.25s ease';
      _renderCommentsList(postId, true);
      const input = document.getElementById('comment-input-' + postId);
      if (input) setTimeout(() => { input.focus(); _initMentionAutocomplete(input); }, 100);
    }
    return;
  }
  // Sur feed/profil : afficher seulement le champ de saisie
  const section = document.getElementById('comments-' + postId);
  if (!section) return;
  const isOpen = section.style.display !== 'none';
  section.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    section.style.animation = 'slideDown 0.25s ease';
    const input = document.getElementById('comment-input-' + postId);
    if (input) setTimeout(() => { input.focus(); _initMentionAutocomplete(input); }, 100);
  }
}
async function submitComment(postId) {
  const user = getUser();
  if (!user) return;
  const input = document.getElementById('comment-input-' + postId);
  const text  = input ? input.value.trim() : '';
  if (!text) return;
  if (input) input.value = '';
  const pid = Number(postId);
  try {
    await PaganiAPI.addComment(pid, text);
  } catch(e) {}
  // Sur post.html : rester sur la page et rafraîchir
  if (window.location.pathname.includes('post.html')) {
    const post = _postsCache.find(p => p.id === pid);
    if (post) {
      const newComment = {
        id: String(Date.now()),
        author: user.name, authorId: user.id,
        authorColor: getAvatarColor(user), authorPhoto: user.avatarPhoto || '',
        text, replies: [], date: new Date().toISOString()
      };
      post.comments.push(newComment);
      _renderCommentsList(pid, false);
    }
    return;
  }
  // Sur feed/profil : rediriger vers post.html après envoi
  setTimeout(() => { window.location.href = 'post.html?id=' + pid; }, 300);
}


function toggleReplyInput(commentId) {
  const row = document.getElementById(`reply-row-${commentId}`);
  if (!row) return;
  const isOpen = row.style.display !== 'none';
  row.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) {
    const input = document.getElementById(`reply-input-${commentId}`);
    if (input) setTimeout(() => {
      input.focus();
      // Scroller pour que le champ réponse soit visible au-dessus du champ fixé
      const scrollEl = window.location.pathname.includes('post.html')
        ? (window.innerWidth <= 768 ? document.getElementById('postMain') : document.getElementById('postCommentsList'))
        : null;
      if (scrollEl) {
        const rowRect = row.getBoundingClientRect();
        const elRect  = scrollEl.getBoundingClientRect();
        const offset  = rowRect.bottom - elRect.bottom + 120;
        if (offset > 0) scrollEl.scrollTop += offset;
      }
    }, 50);
  }
}
async function submitReply(postId, commentId) {
  const user = getUser();
  if (!user) return;
  const input = document.getElementById(`reply-input-${commentId}`);
  const text  = input ? input.value.trim() : '';
  if (!text) return;
  if (input) input.value = '';
  const pid     = Number(postId);
  const post    = _postsCache.find(n => n.id === pid);
  const comment = post?.comments.find(c => {
    const norm = String(c.id||(c.author+c.date)).replace(/[^a-zA-Z0-9_-]/g,'_');
    return norm === String(commentId);
  });
  const replyTo = comment?.author || '';
  const newReply = {
    id: String(Date.now())+String(Math.floor(Math.random()*9999)),
    author: user.name, authorId: user.id,
    authorColor: getAvatarColor(user), authorPhoto: user.avatarPhoto||'',
    replyTo, text, date: new Date().toISOString()
  };
  if (comment) { if (!comment.replies) comment.replies = []; comment.replies.push(newReply); }
  const listEl  = document.getElementById(`comments-list-${pid}`);
  const section = document.getElementById(`comments-${pid}`);
  if (listEl && post) listEl.innerHTML = post.comments.map(c => _buildCommentHTML(c, pid, user, false)).join('');
  if (section) section.style.display = 'block';
  if (post) _updatePostStats(pid, post);
  if (window.PaganiAPI) {
    try { await PaganiAPI.addReply(pid, commentId, text, replyTo); }
    catch(e) {
      // echec serveur : retirer la rponse temporaire du cache et re-render
      if (comment) comment.replies = comment.replies.filter(r => r.id !== newReply.id);
      if (listEl && post) listEl.innerHTML = post.comments.map(c => _buildCommentHTML(c, pid, user, false)).join('');
      if (post) _updatePostStats(pid, post);

    }
  }
}
// ===== DITEUR ADMIN =====
function switchEditorTab(tab, btn) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('editorWrite').style.display   = tab === 'write'   ? 'block' : 'none';
  document.getElementById('editorPreview').style.display = tab === 'preview' ? 'block' : 'none';
  if (tab === 'preview') updateEditorPreview(true);
}
function updateEditorPreview(force) {
  const ta    = document.getElementById('newsContent');
  const count = document.getElementById('editorCharCount');
  if (ta && count) count.textContent = ta.value.length + ' caracteres';
  if (!force) return;
  const box   = document.getElementById('editorPreviewContent');
  const title = document.getElementById('newsTitle')?.value.trim();
  const text  = ta?.value.trim();
  if (!box) return;
  box.innerHTML =
    (title ? `<h3 style="margin:0 0 0.6rem;font-size:1rem">${title}</h3>` : '') +
    (text  ? formatPostContent(text) : '<p style="color:var(--text2);font-style:italic">Apercu vide.</p>');
}
function editorFormat(type) {
  const ta = document.getElementById('newsContent');
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e) || 'texte';
  const wrap = type === 'bold' ? '**' : '_';
  const result = wrap + sel + wrap;
  ta.value = ta.value.slice(0, s) + result + ta.value.slice(e);
  ta.focus();
  ta.selectionStart = s + wrap.length;
  ta.selectionEnd   = s + wrap.length + sel.length;
  updateEditorPreview();
}
function editorInsertLink() {
  const ta  = document.getElementById('newsContent');
  const sel = ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd).trim() : '';
  document.getElementById('linkModalText').value = sel;
  document.getElementById('linkModalUrl').value  = '';
  document.getElementById('linkModal').style.display = 'flex';
  setTimeout(() => document.getElementById('linkModalUrl').focus(), 50);
}
function confirmInsertLink() {
  const ta    = document.getElementById('newsContent');
  const url   = document.getElementById('linkModalUrl').value.trim();
  const label = document.getElementById('linkModalText').value.trim();
  if (!url) return;
  const md = '[' + (label || url) + '](' + url + ')';
  if (ta) {
    const s = ta.selectionStart;
    ta.value = ta.value.slice(0, s) + md + ta.value.slice(ta.selectionEnd);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + md.length;
  }
  closeLinkModal();
  updateEditorPreview();
}
function closeLinkModal() {
  const m = document.getElementById('linkModal');
  if (m) m.style.display = 'none';
}
function editorInsertEmoji() {
  const m = document.getElementById('emojiModal');
  if (m) m.style.display = 'flex';
}
function insertEmoji(btn) {
  const ta = document.getElementById('newsContent');
  if (!ta) return;
  const s = ta.selectionStart;
  ta.value = ta.value.slice(0, s) + btn.textContent + ta.value.slice(s);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + btn.textContent.length;
  closeEmojiModal();
  updateEditorPreview();
}
function closeEmojiModal() {
  const m = document.getElementById('emojiModal');
  if (m) m.style.display = 'none';
}
function editorInsertLine() {
  const ta = document.getElementById('newsContent');
  if (!ta) return;
  const s = ta.selectionStart;
  const line = '\n---\n';
  ta.value = ta.value.slice(0, s) + line + ta.value.slice(s);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + line.length;
  updateEditorPreview();
}
function toggleLinkInput() {
  const row = document.getElementById('linkInputRow');
  if (!row) return;
  const visible = row.style.display !== 'none';
  row.style.display = visible ? 'none' : 'flex';
  if (!visible) document.getElementById('newsLink')?.focus();
}
document.addEventListener('click', e => {
  const lm = document.getElementById('linkModal');
  const em = document.getElementById('emojiModal');
  if (lm && e.target === lm) closeLinkModal();
  if (em && e.target === em) closeEmojiModal();
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    const ta = document.getElementById('newsContent');
    if (document.activeElement === ta) { e.preventDefault(); editorInsertLink(); }
  }
  if (e.key === 'Enter') {
    const lm = document.getElementById('linkModal');
    if (lm && lm.style.display !== 'none') { e.preventDefault(); confirmInsertLink(); }
  }
});
// ===== GESTION THUMBNAIL VIDEO =====
let _thumbnailBase64 = '';
function uploadThumbnail(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { alert('Image trop grande (max 3 Mo).'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = e => { _thumbnailBase64 = e.target.result; _showThumbnailPreview(_thumbnailBase64); };
  reader.readAsDataURL(file);
}
function previewThumbnailUrl(url) {
  if (!url || !url.startsWith('http')) return;
  _thumbnailBase64 = url;
  _showThumbnailPreview(url);
}
function _showThumbnailPreview(src) {
  const preview  = document.getElementById('vThumbnailPreview');
  const img      = document.getElementById('vThumbnailImg');
  const actions  = document.getElementById('vThumbnailActions');
  if (!preview || !img) return;
  img.src = src;
  preview.style.display = 'block';
  if (actions) actions.style.display = 'none';
}
function removeThumbnail() {
  _thumbnailBase64 = '';
  const preview = document.getElementById('vThumbnailPreview');
  const actions = document.getElementById('vThumbnailActions');
  const urlInput = document.getElementById('vThumbnailUrl');
  const fileInput = document.getElementById('vThumbnailFile');
  if (preview) preview.style.display = 'none';
  if (actions) actions.style.display = 'flex';
  if (urlInput) urlInput.value = '';
  if (fileInput) fileInput.value = '';
}
function _autoThumbnailFromYoutube(videoId) {
  if (!videoId) return;
  const url = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  if (!_thumbnailBase64) {
    _thumbnailBase64 = url;
    _showThumbnailPreview(url);
  }
}
// ===== GESTION IMAGE POST ADMIN =====
let _postImageBase64 = "";
function previewPostImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert("Image trop grande (max 5 Mo)."); input.value = ""; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    _postImageBase64 = e.target.result;
    const preview = document.getElementById("newsImagePreview");
    const img     = document.getElementById("newsImagePreviewImg");
    if (preview && img) { img.src = _postImageBase64; preview.style.display = "flex"; }
  };
  reader.readAsDataURL(file);
}
function removePostImage() {
  _postImageBase64 = "";
  const preview = document.getElementById("newsImagePreview");
  const input   = document.getElementById("newsImageInput");
  if (preview) preview.style.display = "none";
  if (input)   input.value = "";
}
async function publishNews(e) {
  e.preventDefault();
  const title     = document.getElementById('newsTitle').value.trim();
  const content   = document.getElementById('newsContent').value.trim();
  const category  = document.getElementById('newsCategory').value;
  const link      = document.getElementById('newsLink')?.value.trim()      || '';
  const linkLabel = document.getElementById('newsLinkLabel')?.value.trim() || '';
  if (!title || !content) return;
  try {
    const newPost = await PaganiAPI.createPost({ title, content, category, image: _postImageBase64, link, linkLabel: linkLabel||'En savoir plus' });
    document.getElementById('newsForm').reset();
    removePostImage();
    // Injecter directement le post dans le feed sans reset
    if (newPost && newPost.id) {
      // Normaliser le post (meme format que getPosts)
      const normalized = {
        ...newPost,
        likes:    Array.isArray(newPost.likes)    ? newPost.likes    : [],
        comments: Array.isArray(newPost.comments) ? newPost.comments : [],
        date:     newPost.date || newPost.createdAt || new Date().toISOString(),
      };
      _postsCache.unshift(normalized);
      const container = document.getElementById('feedPosts');
      if (container) {
        const user = getUser();
        const isAdmin = user && user.role === 'admin';
        if (!document.getElementById('post-' + normalized.id)) {
          const el = buildPostCard(normalized, user, isAdmin);
          el.classList.add('post-animate');
          container.insertBefore(el, container.firstChild);
        }
        // Mettre a jour la sentinelle/fin selon le nouvel etat du cache
        const oldEnd = container.querySelector('.feed-end');
        if (oldEnd) oldEnd.remove();
        const renderedCount = container.querySelectorAll('.post-card:not(.skeleton-card)').length;
        if (renderedCount < _postsCache.length && !document.getElementById('feedSentinel')) {
          const sentinel = document.createElement('div');
          sentinel.id = 'feedSentinel';
          sentinel.className = 'feed-sentinel';
          sentinel.innerHTML = '<div class="feed-loader"><span></span><span></span><span></span></div>';
          container.appendChild(sentinel);
        } else if (renderedCount >= _postsCache.length && !document.getElementById('feedSentinel')) {
          const end = document.createElement('div');
          end.className = 'feed-end';
          end.innerHTML = '<i class="fas fa-check-circle"></i> Vous avez tout vu !';
          container.appendChild(end);
        }
      }
    } else {
      // Fallback : recharger silencieusement
      await _silentRefreshFeed();
    }
  } catch(e) { alert('Erreur serveur : ' + e.message); }
}
async function toggleBoostPost(postId, currentBoost, btn) {
  const isBoosted = currentBoost > 0;
  const newScore  = isBoosted ? 0 : 50;
  try {
    const API = (window.PaganiConfig?.API_BASE_URL || 'http://localhost:3001/api');
    const token = localStorage.getItem('pd_jwt');
    await fetch(`${API}/admin/posts/${postId}/boost`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ boostScore: newScore })
    });
    // Mettre à jour le cache
    const post = _postsCache.find(p => p.id === postId);
    if (post) post.boostScore = newScore;
    // Fermer le menu dropdown si ouvert
    document.querySelectorAll('.post-menu-dropdown').forEach(m => m.style.display = 'none');
    if (btn) {
      // Bouton inline (posts des membres)
      btn.title = newScore > 0 ? `Boosté (${newScore}pts) — cliquer pour retirer` : 'Booster ce post';
      btn.style.background  = newScore > 0 ? 'rgba(245,158,11,0.15)' : 'transparent';
      btn.style.color       = newScore > 0 ? 'var(--gold)' : 'var(--text2)';
      btn.style.borderColor = newScore > 0 ? 'rgba(245,158,11,0.4)' : 'var(--border)';
      btn.setAttribute('onclick', `toggleBoostPost(${postId}, ${newScore}, this)`);
    } else {
      // Appelé depuis le menu dropdown — reconstruire le menu
      const menuBtn = document.querySelector(`#post-menu-${postId} button[onclick*="toggleBoostPost"]`);
      if (menuBtn) {
        menuBtn.innerHTML = `<i class="fas fa-rocket"></i> ${newScore > 0 ? 'Retirer le boost' : 'Booster'}`;
        menuBtn.setAttribute('onclick', `toggleBoostPost(${postId}, ${newScore}, null)`);
      }
    }
    // Indicateur visuel sur la carte du post
    const card = document.getElementById('post-' + postId);
    if (card) {
      let badge = card.querySelector('.boost-badge');
      if (newScore > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'boost-badge';
          badge.style.cssText = 'font-size:0.7rem;background:rgba(245,158,11,0.15);color:var(--gold);border:1px solid rgba(245,158,11,0.3);padding:0.15rem 0.5rem;border-radius:50px;margin-left:0.4rem;vertical-align:middle';
          const titleEl = card.querySelector('.post-title');
          if (titleEl) titleEl.appendChild(badge);
        }
        badge.innerHTML = '🚀 Boosté';
      } else if (badge) {
        badge.remove();
      }
    }
    // Recharger le feed depuis le serveur pour appliquer le nouvel ordre
    _postsCache = [];
    await renderFeed();
  } catch(e) { alert('Erreur boost : ' + e.message); }
}

async function deletePost(id) {
  if (!confirm('Supprimer ce post ?')) return;
  try {
    await PaganiAPI.deletePost(id);
    _postsCache = _postsCache.filter(p => p.id !== id);
    document.getElementById('post-' + id)?.remove();
  } catch(e) { alert('Erreur serveur : ' + e.message); }
}

function togglePostMenu(postId) {
  const menu = document.getElementById('post-menu-' + postId);
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  document.querySelectorAll('.post-menu-dropdown').forEach(m => m.style.display = 'none');
  if (isOpen) return;
  menu.style.display = 'block';
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.closest('.post-owner-menu').contains(e.target)) {
        menu.style.display = 'none';
        document.removeEventListener('click', close);
      }
    });
  }, 10);
}

let _editPostImageBase64 = null; // null = pas de changement, '' = supprime, 'data:...' = nouvelle

function openEditPostModal(postId) {
  document.querySelectorAll('.post-menu-dropdown').forEach(m => m.style.display = 'none');
  const pid = Number(postId);
  const post = _postsCache.find(p => Number(p.id) === pid);
  if (!post) return;
  _editPostImageBase64 = null;
  document.getElementById('editPostId').value      = pid;
  document.getElementById('editPostContent').value = post.content || '';
  document.getElementById('editPostMsg').textContent = '';
  // Afficher la photo actuelle si elle existe
  const photoWrap = document.getElementById('editPostCurrentPhoto');
  const photoImg  = document.getElementById('editPostCurrentImg');
  const photoLabel = document.getElementById('editPostPhotoLabel');
  const fileInput  = document.getElementById('editPostImageInput');
  if (fileInput) fileInput.value = '';
  if (post.image && post.image !== '__HAS_IMAGE__') {
    if (photoImg)  photoImg.src = post.image;
    if (photoWrap) photoWrap.style.display = 'block';
    if (photoLabel) photoLabel.textContent = 'Changer la photo';
  } else if (post.image === '__HAS_IMAGE__') {
    // Charger l'image depuis le serveur
    const url = (typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:3001/api') + '/posts/' + pid + '/image';
    fetch(url).then(r => r.json()).then(d => {
      if (d.image) {
        if (photoImg)  photoImg.src = d.image;
        if (photoWrap) photoWrap.style.display = 'block';
        if (photoLabel) photoLabel.textContent = 'Changer la photo';
        const p = _postsCache.find(x => Number(x.id) === pid);
        if (p) p.image = d.image;
      }
    }).catch(() => {});
  } else {
    if (photoWrap) photoWrap.style.display = 'none';
    if (photoLabel) photoLabel.textContent = 'Ajouter une photo';
  }
  document.getElementById('editPostModal').style.display = 'flex';
  setTimeout(() => document.getElementById('editPostContent').focus(), 50);
}

function previewEditPostImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Image trop grande (max 5 Mo).'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = e => {
    _editPostImageBase64 = e.target.result;
    const photoWrap = document.getElementById('editPostCurrentPhoto');
    const photoImg  = document.getElementById('editPostCurrentImg');
    const photoLabel = document.getElementById('editPostPhotoLabel');
    if (photoImg)  photoImg.src = _editPostImageBase64;
    if (photoWrap) photoWrap.style.display = 'block';
    if (photoLabel) photoLabel.textContent = 'Changer la photo';
  };
  reader.readAsDataURL(file);
}

function removeEditPostImage() {
  _editPostImageBase64 = '';
  const photoWrap  = document.getElementById('editPostCurrentPhoto');
  const photoImg   = document.getElementById('editPostCurrentImg');
  const photoLabel = document.getElementById('editPostPhotoLabel');
  const fileInput  = document.getElementById('editPostImageInput');
  if (photoWrap) photoWrap.style.display = 'none';
  if (photoImg)  photoImg.src = '';
  if (photoLabel) photoLabel.textContent = 'Ajouter une photo';
  if (fileInput) fileInput.value = '';
}

function closeEditPostModal() {
  document.getElementById('editPostModal').style.display = 'none';
  _editPostImageBase64 = null;
}

async function submitEditPost() {
  const id      = Number(document.getElementById('editPostId').value);
  const content = document.getElementById('editPostContent').value.trim();
  const msg     = document.getElementById('editPostMsg');
  if (!content) { msg.textContent = 'Le contenu ne peut pas etre vide.'; return; }
  msg.textContent = '';
  const user = getUser();
  const isAdmin = user && user.role === 'admin';
  // Construire le payload : image seulement si modifiee
  const payload = { content };
  if (_editPostImageBase64 !== null) payload.image = _editPostImageBase64;
  try {
    if (isAdmin) {
      await PaganiAPI.editPost(id, payload);
    } else {
      await PaganiAPI.editUserPost(id, payload);
    }
    const post = _postsCache.find(p => Number(p.id) === id);
    if (post) {
      post.content = content;
      if (_editPostImageBase64 !== null) post.image = _editPostImageBase64;
    }
    const el = document.getElementById('post-' + id);
    if (el) {
      const contentEl = el.querySelector('.post-content');
      if (contentEl) contentEl.innerHTML = formatPostContent(content);
      // Mettre a jour l'image dans le DOM
      if (_editPostImageBase64 !== null) {
        const wrap = el.querySelector('.post-image-wrap');
        if (_editPostImageBase64 === '') {
          if (wrap) wrap.remove();
        } else {
          if (wrap) {
            const img = wrap.querySelector('img');
            if (img) img.src = _editPostImageBase64;
          } else {
            const body = el.querySelector('.post-body');
            if (body) body.insertAdjacentHTML('beforeend',
              `<div class="post-image-wrap"><img src="${_editPostImageBase64}" class="post-image" alt="" /></div>`);
          }
        }
      }
    }
    closeEditPostModal();
    if (document.getElementById('myPostsList')) loadMyPosts();
  } catch(e) { msg.textContent = 'Erreur : ' + e.message; }
}

async function deleteUserPost(postId) {
  if (!confirm('Supprimer cette publication ?')) return;
  try {
    await PaganiAPI.deleteUserPost(postId);
    _postsCache = _postsCache.filter(p => p.id !== postId);
    document.getElementById('post-' + postId)?.remove();
    // Rafraechir la liste dashboard si on y est
    if (document.getElementById('myPostsList')) loadMyPosts();
  } catch(e) { alert('Erreur : ' + e.message); }
}
async function _loadPostImage(postId, imgEl) {
  try {
    const url = (typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:3001/api') + `/posts/${postId}/image`;
    const r = await fetch(url);
    const data = await r.json();
    if (!data.image) return;
    const post = _postsCache.find(p => p.id == postId);
    if (post) post.image = data.image;
    imgEl.src = data.image;
    imgEl.style.minHeight = '';
    imgEl.style.background = '';
    imgEl.onclick = () => openPostImage(postId);
    imgEl.removeAttribute('data-lazy');
  } catch(e) {}
}
const _imgObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const img = entry.target;
    _imgObserver.unobserve(img);
    _loadPostImage(img.dataset.postid, img);
  });
}, { rootMargin: '200px' });
function _observeLazyImages(root) {
  (root || document).querySelectorAll('img[data-lazy]').forEach(img => _imgObserver.observe(img));
}
function openPostImage(postId) {
  const post = _postsCache.find(n => n.id == postId);
  if (!post || !post.image || post.image === '__HAS_IMAGE__') return;
  const overlay = document.createElement("div");
  overlay.id = "postImageOverlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem;cursor:zoom-out;animation:fadeIn 0.2s ease";
  overlay.innerHTML = `
    <button onclick="document.getElementById('postImageOverlay').remove()" style="
      position:absolute;top:1rem;right:1rem;
      background:rgba(255,255,255,0.15);border:none;color:#fff;
      width:42px;height:42px;border-radius:50%;cursor:pointer;
      font-size:1.2rem;display:flex;align-items:center;justify-content:center;
      transition:background 0.2s;z-index:1
    " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">
      <i class="fas fa-times"></i>
    </button>
    <img src="${post.image}" style="max-width:100%;max-height:90vh;border-radius:12px;object-fit:contain;box-shadow:0 20px 60px rgba(0,0,0,0.6)" />
    <p style="position:absolute;bottom:1.2rem;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.4);font-size:0.78rem;white-space:nowrap">Cliquez n'importe ou ou appuyez sur Echap pour fermer</p>
  `;
  // Fermer au clic sur l'overlay (pas sur l\'image)
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.tagName === "P") overlay.remove();
  });
  // Fermer avec Escape
  const onKey = (e) => {
    if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onKey); }
  };
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}
// ===== PROFIL PUBLIC =====
async function loadUserPostsForProfile(userId) {
  const list = document.getElementById('profilePostsList');
  const statEl = document.getElementById('pubStatPosts');
  if (!list) return;
  list.innerHTML = '<div class="feed-loader" style="justify-content:center;padding:1rem"><span></span><span></span><span></span></div>';
  try {
    const posts = await PaganiAPI.getPostsByUser(userId);
    if (statEl) statEl.textContent = posts.length;
    if (!posts.length) {
      list.innerHTML = '<div class="feed-empty"><i class="fas fa-newspaper"></i><p>Aucune publication.</p></div>';
      return;
    }
    // Charger les réactions en batch
    try {
      const ids = posts.map(p => p.id);
      const batchRes = await Promise.allSettled(ids.slice(0, 20).map(id => PaganiAPI.getPostReactions(id)));
      batchRes.forEach((r, i) => { if (r.status === 'fulfilled') _reactionsCache[ids[i]] = r.value; });
    } catch(e) {}
    const user = getUser();
    list.innerHTML = '';
    posts.forEach((post, i) => {
      post.likes    = post.likes    || [];
      post.comments = post.comments || [];
      const el = buildPostCard(post, user, false);
      el.style.animationDelay = (i * 40) + 'ms';
      el.classList.add('post-animate');
      list.appendChild(el);
    });
    _observeLazyImages(list);
  } catch(e) {
    if (statEl) statEl.textContent = '0';
    list.innerHTML = '<div class="feed-empty"><i class="fas fa-newspaper"></i><p>Aucune publication.</p></div>';
  }
}
function openPublicProfile(userId) {
  if (!userId) return;
  window.location.href = `profil.html?id=${userId}`;
}
async function openPublicProfileByName(name) {
  try {
    const users = await PaganiAPI.admin.getUsers();
    const found = users.find(u => u.name === name);
    if (found) window.location.href = `profil.html?id=${found.id}`;
  } catch(e) {}
}
// Dfilement vers un post cible depuis une notification (ancre #post-ID)
function scrollToTargetPost(retries) {
  if (retries === undefined) retries = 30;
  const hash = window.location.hash;
  if (!hash || !hash.startsWith("#post-")) return;
  const postId = parseInt(hash.slice(6));
  if (!postId) return;

  // Chercher le post dans le cache et charger toutes les tranches jusqu'à lui
  const container = document.getElementById('feedPosts');
  const user = getUser();
  const isAdmin = !!(user && user.role === 'admin');

  // Si le post est dans le cache mais pas encore rendu, charger jusqu'à lui
  if (container && _postsCache.length) {
    const idx = _postsCache.findIndex(function(p) { return p.id === postId; });
    if (idx !== -1) {
      // Charger toutes les tranches nécessaires pour atteindre ce post
      while (_feedPage * 5 <= idx) {
        _loadMorePosts(container, user, isAdmin);
      }
    }
  }

  const target = document.getElementById('post-' + postId);
  if (!target) {
    if (retries > 0) setTimeout(function() { scrollToTargetPost(retries - 1); }, 300);
    return;
  }

  setTimeout(function() {
    const top = target.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: top, behavior: "smooth" });
    target.classList.add("post-highlight");
    setTimeout(function() { target.classList.remove("post-highlight"); }, 3000);
    const commSection = target.querySelector(".comments-section");
    if (commSection) commSection.style.display = "block";
    history.replaceState(null, "", window.location.pathname);
  }, 150);
}
function renderNews() { renderFeed(); }

// ── HASHTAGS ──────────────────────────────────────────────────────────────────
function filterByHashtag(tag) {
  // Mettre à jour l'URL sans recharger
  history.pushState({}, '', '?tag=' + encodeURIComponent(tag));
  _activeHashtag = tag;
  _renderHashtagBanner(tag);
  _filterFeedByHashtag(tag);
  // Mettre en surbrillance le tag actif dans la sidebar
  document.querySelectorAll('.hashtag-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.tag === tag);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearHashtagFilter() {
  history.pushState({}, '', window.location.pathname);
  _activeHashtag = null;
  const banner = document.getElementById('hashtagBanner');
  if (banner) banner.style.display = 'none';
  document.querySelectorAll('.hashtag-pill').forEach(p => p.classList.remove('active'));
  // Réafficher tous les posts
  document.querySelectorAll('.post-card').forEach(p => p.style.display = '');
  const empty = document.getElementById('hashtagEmpty');
  if (empty) empty.remove();
}

function _renderHashtagBanner(tag) {
  let banner = document.getElementById('hashtagBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'hashtagBanner';
    banner.style.cssText = 'display:flex;align-items:center;gap:0.6rem;padding:0.6rem 1rem;background:rgba(108,99,255,0.12);border:1px solid rgba(108,99,255,0.25);border-radius:10px;margin-bottom:1rem;font-size:0.88rem';
    const feed = document.getElementById('feedPosts');
    if (feed) feed.parentNode.insertBefore(banner, feed);
  }
  banner.style.display = 'flex';
  banner.innerHTML = `<i class="fas fa-hashtag" style="color:var(--accent)"></i>
    <strong style="color:var(--accent)">#${tag}</strong>
    <span style="color:var(--text2);flex:1">Posts avec ce hashtag</span>
    <button onclick="clearHashtagFilter()" style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:1rem;padding:0.2rem 0.4rem" title="Effacer le filtre"><i class="fas fa-times"></i></button>`;
}

function _filterFeedByHashtag(tag) {
  const lower = tag.toLowerCase();
  let visible = 0;
  document.querySelectorAll('.post-card').forEach(card => {
    const text = (card.querySelector('.post-content')?.textContent || '') +
                 (card.querySelector('.post-title')?.textContent || '');
    const hasTag = text.toLowerCase().includes('#' + lower);
    card.style.display = hasTag ? '' : 'none';
    if (hasTag) visible++;
  });
  // Message si aucun résultat
  const old = document.getElementById('hashtagEmpty');
  if (old) old.remove();
  if (visible === 0) {
    const div = document.createElement('div');
    div.id = 'hashtagEmpty';
    div.className = 'feed-empty';
    div.innerHTML = `<i class="fas fa-hashtag"></i><p>Aucun post avec <strong>#${tag}</strong> pour le moment.</p>`;
    const feed = document.getElementById('feedPosts');
    if (feed) feed.appendChild(div);
  }
}

function extractTopHashtags(posts, limit) {
  const counts = {};
  posts.forEach(p => {
    const text = (p.title || '') + ' ' + (p.content || '');
    const tags = text.match(/#([wÀ-ɏ]+)/g) || [];
    tags.forEach(t => {
      const k = t.slice(1).toLowerCase();
      counts[k] = (counts[k] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit || 8)
    .map(([tag, count]) => ({ tag, count }));
}

function renderTrendingHashtags(posts) {
  const wrap = document.getElementById('trendingHashtags');
  if (!wrap) return;
  const top = extractTopHashtags(posts, 8);
  if (!top.length) { wrap.closest('.sidebar-card')?.style && (wrap.closest('.sidebar-card').style.display = 'none'); return; }
  wrap.innerHTML = top.map(({ tag, count }) =>
    `<button class="hashtag-pill" data-tag="${tag}" onclick="filterByHashtag('${tag}')">#${tag} <span>${count}</span></button>`
  ).join('');
}

let _activeHashtag = null;

// ── RÉACTIONS POSTS ───────────────────────────────────────────────────────────
const POST_REACTIONS = ['❤️','😂','😮','😢','😡','👍'];
const REACTION_LABELS = { '❤️':'J\'adore','😂':'Haha','😮':'Wow','😢':'Triste','😡':'Grrr','👍':'Super' };
// Cache local : postId -> { emoji: [userId, ...] }
const _reactionsCache = {};

function _getMyReaction(postId, userEmail) {
  // On stocke par userId dans le cache serveur, mais on compare par email côté like legacy
  // Pour les réactions, on stocke userId
  return null; // sera résolu depuis le DOM
}

function _buildReactionBar(postId, reactions, myReaction) {
  // Compter le total et trouver la réaction dominante
  const counts = {};
  let total = 0;
  for (const [emoji, users] of Object.entries(reactions || {})) {
    counts[emoji] = users.length;
    total += users.length;
  }
  // Top 3 emojis
  const top = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([e]) => e);

  const myEmoji = myReaction || null;
  const label = myEmoji ? REACTION_LABELS[myEmoji] : 'Réagir';
  const btnClass = myEmoji ? 'reaction-btn reacted' : 'reaction-btn';
  const btnStyle = myEmoji ? `color:var(--reaction-${_reactionColor(myEmoji)})` : '';

  return `<div class="reaction-btn-wrap" style="position:relative;flex:1">
    <button class="${btnClass}" style="${btnStyle}"
      onclick="_onReactionBtnClick(${postId}, this)"
      onmouseenter="_showReactionPicker(${postId}, this)"
      data-postid="${postId}" data-myreaction="${myEmoji || ''}">
      <span class="reaction-main-emoji">${myEmoji || '👍'}</span>
      <span class="reaction-label">${label}</span>
    </button>
    <div class="reaction-picker" id="rpicker-${postId}" style="display:none">
      ${POST_REACTIONS.map(e => `<button class="rp-btn ${e === myEmoji ? 'rp-active' : ''}"
        onclick="selectReaction(${postId}, '${e}', this)"
        title="${REACTION_LABELS[e]}">${e}</button>`).join('')}
    </div>
  </div>`;
}

// Clic simple = réagir avec ❤️ (ou retirer si déjà réagi)
// Maintien (desktop: hover déjà géré) = ouvrir le picker
function _onReactionBtnClick(postId, btn) {
  // Sur mobile, tout est géré par _attachReactionTouchListeners
  // Ce handler ne s'exécute que sur desktop (pas de touch)
  if (window.matchMedia('(hover: none)').matches) return;

  const picker = document.getElementById('rpicker-' + postId);
  const prevEmoji = btn.dataset.myreaction || '';
  if (prevEmoji) {
    if (picker) picker.style.display = 'none';
    selectReaction(postId, prevEmoji, btn);
  } else {
    toggleReactionPicker(postId, btn);
  }
}

// Touch : détecter maintien (500ms) pour ouvrir le picker
// Géré via addEventListener (passive:false) pour pouvoir preventDefault
let _reactionLastHoldTime = 0;

function _attachReactionTouchListeners(postId, btn) {
  let timer = null;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let holdFired = false;

  // Bloquer le click natif — tout est géré via touch
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (holdFired) { holdFired = false; return; } // ignorer le click post-hold
    // Clic simple
    const prevEmoji = btn.dataset.myreaction || '';
    if (prevEmoji) {
      selectReaction(postId, prevEmoji, btn);
    } else {
      toggleReactionPicker(postId, btn);
    }
  });

  btn.addEventListener('touchstart', function(e) {
    moved = false;
    holdFired = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    if (timer) { clearTimeout(timer); timer = null; }
    timer = setTimeout(() => {
      if (!moved) {
        holdFired = true;
        toggleReactionPicker(postId, btn);
      }
      timer = null;
    }, 500);
  }, { passive: true });

  btn.addEventListener('touchmove', function(e) {
    if (!moved) {
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dx > 8 || dy > 8) {
        moved = true;
        if (timer) { clearTimeout(timer); timer = null; }
      }
    }
  }, { passive: true });

  btn.addEventListener('touchend', function() {
    if (timer) { clearTimeout(timer); timer = null; }
  }, { passive: true });
}

function _reactionColor(emoji) {
  const map = { '❤️':'red','😂':'gold','😮':'gold','😢':'blue','😡':'red','👍':'accent' };
  return map[emoji] || 'accent';
}

function _showReactionPicker(postId, btn) {
  const picker = document.getElementById('rpicker-' + postId);
  if (!picker) return;

  // Annuler le timer de fermeture
  clearTimeout(btn._hideTimer);
  clearTimeout(btn._showTimer);

  // Ouvrir après 600ms (comme Facebook)
  btn._showTimer = setTimeout(() => {
    // Fermer tous les autres pickers
    document.querySelectorAll('.reaction-picker').forEach(p => {
      if (p !== picker) p.style.display = 'none';
    });
    picker.style.display = 'flex';
  }, 600);

  // Initialiser les listeners mouseleave une seule fois par wrap
  const wrap = btn.closest('.reaction-btn-wrap');
  if (wrap && !wrap._pickerInit) {
    wrap._pickerInit = true;
    wrap.addEventListener('mouseleave', () => {
      clearTimeout(btn._showTimer);
      btn._hideTimer = setTimeout(() => { picker.style.display = 'none'; }, 300);
    });
    picker.addEventListener('mouseenter', () => {
      clearTimeout(btn._hideTimer);
      clearTimeout(btn._showTimer);
    });
    picker.addEventListener('mouseleave', () => {
      btn._hideTimer = setTimeout(() => { picker.style.display = 'none'; }, 300);
    });
  }
}

function toggleReactionPicker(postId, btn) {
  const picker = document.getElementById('rpicker-' + postId);
  if (!picker) return;
  const isOpen = picker.style.display !== 'none';
  document.querySelectorAll('.reaction-picker').forEach(p => p.style.display = 'none');
  if (!isOpen) {
    picker.style.display = 'flex';
    // Délai plus long après un hold pour laisser passer le click synthétique du touch
    const delay = (Date.now() - _reactionLastHoldTime < 800) ? 400 : 10;
    setTimeout(() => {
      document.addEventListener('click', function close(e) {
        if (!picker.contains(e.target) && e.target !== btn) {
          picker.style.display = 'none';
          document.removeEventListener('click', close);
        }
      });
    }, delay);
  }
}

async function selectReaction(postId, emoji, btn) {
  const user = getUser();
  if (!user) { window.location.href = 'dashboard.html'; return; }

  // Fermer le picker
  const picker = document.getElementById('rpicker-' + postId);
  if (picker) picker.style.display = 'none';

  // Lire la réaction actuelle
  const mainBtn = document.querySelector('[data-postid="' + postId + '"].reaction-btn');
  const prevEmoji = mainBtn ? mainBtn.dataset.myreaction : '';
  const isSame = prevEmoji === emoji;
  const newEmoji = isSame ? null : emoji;

  // Mise à jour optimiste du cache local
  if (!_reactionsCache[postId]) _reactionsCache[postId] = {};
  const cache = _reactionsCache[postId];
  // Retirer l'ancienne réaction de l'utilisateur du cache
  if (prevEmoji && cache[prevEmoji]) {
    cache[prevEmoji] = cache[prevEmoji].filter(id => id !== user.id);
    if (!cache[prevEmoji].length) delete cache[prevEmoji];
  }
  // Ajouter la nouvelle réaction
  if (newEmoji) {
    if (!cache[newEmoji]) cache[newEmoji] = [];
    if (!cache[newEmoji].includes(user.id)) cache[newEmoji].push(user.id);
  }

  // Mise à jour optimiste du bouton et du compteur
  _updateReactionUI(postId, cache, newEmoji);
  _updateReactionCount(postId, cache);

  // Appel API
  try {
    if (window.PaganiAPI) {
      await PaganiAPI.togglePostReaction(postId, emoji);
      // Recharger les réactions réelles depuis le serveur pour rester en sync
      const fresh = await PaganiAPI.getPostReactions(postId);
      _reactionsCache[postId] = fresh;
      // Recalculer ma réaction depuis les données serveur
      const myFreshEmoji = Object.entries(fresh).find(([,ids]) => ids.includes(user.id))?.[0] || null;
      _updateReactionUI(postId, fresh, myFreshEmoji);
      _updateReactionCount(postId, fresh);
    }
  } catch(e) {
    // Rollback
    if (prevEmoji) {
      if (!cache[prevEmoji]) cache[prevEmoji] = [];
      if (!cache[prevEmoji].includes(user.id)) cache[prevEmoji].push(user.id);
    }
    if (newEmoji && cache[newEmoji]) {
      cache[newEmoji] = cache[newEmoji].filter(id => id !== user.id);
      if (!cache[newEmoji].length) delete cache[newEmoji];
    }
    _updateReactionUI(postId, cache, prevEmoji || null);
    _updateReactionCount(postId, cache);
  }
}


function _updateReactionCount(postId, reactions) {
  const el = document.getElementById('post-' + postId);
  if (!el) return;
  const statsEl = el.querySelector('.post-stats');
  if (!statsEl) return;
  const total = Object.values(reactions || {}).reduce((s, ids) => s + ids.length, 0);
  const post = _postsCache.find(p => p.id === postId);
  const totalComments = post ? (post.comments||[]).reduce((a,c) => a + 1 + (c.replies||[]).length, 0) : 0;
  // Top emoji pour affichage
  const top = Object.entries(reactions || {}).sort((a,b) => b[1].length - a[1].length)[0];
  const topEmoji = top ? top[0] : '❤️';
  statsEl.innerHTML =
    (total > 0
      ? '<span style="cursor:pointer" onclick="showReactionDetails(' + postId + ')">' + topEmoji + ' ' + total + ' r\u00e9action' + (total !== 1 ? 's' : '') + '</span>'
      : '<span><i class="fas fa-heart" style="color:var(--red)"></i> 0 r\u00e9action</span>') +
    '<span><i class="fas fa-comment" style="color:var(--accent)"></i> ' + totalComments + ' commentaire' + (totalComments !== 1 ? 's' : '') + '</span>';
}

function _updateReactionUI(postId, reactions, myEmoji) {
  const mainBtn = document.querySelector('[data-postid="' + postId + '"].reaction-btn');
  if (!mainBtn) return;
  const emojiSpan = mainBtn.querySelector('.reaction-main-emoji');
  const labelSpan = mainBtn.querySelector('.reaction-label');
  if (emojiSpan) emojiSpan.textContent = myEmoji || '👍';
  if (labelSpan) labelSpan.textContent = myEmoji ? (REACTION_LABELS[myEmoji] || myEmoji) : 'Réagir';
  if (myEmoji) {
    mainBtn.className = 'reaction-btn reacted';
    mainBtn.style.color = 'var(--reaction-' + _reactionColor(myEmoji) + ')';
  } else {
    mainBtn.className = 'reaction-btn';
    mainBtn.style.color = '';
  }
  mainBtn.dataset.myreaction = myEmoji || '';
  const picker = document.getElementById('rpicker-' + postId);
  if (picker) {
    picker.querySelectorAll('.rp-btn').forEach(b => {
      b.className = 'rp-btn' + (b.textContent.trim() === myEmoji ? ' rp-active' : '');
    });
  }
}


async function showReactionDetails(postId) {
  document.getElementById('rxOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'rxOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--bg3);border:1px solid var(--border);border-radius:16px;width:100%;max-width:420px;max-height:80vh;display:flex;flex-direction:column;animation:fadeIn 0.2s ease;overflow:hidden';
  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem 1.2rem;border-bottom:1px solid var(--border);flex-shrink:0">
      <strong style="font-size:1rem">Réactions</strong>
      <button id="rxClose" style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:1.2rem;line-height:1;padding:0.2rem 0.5rem">✕</button>
    </div>
    <div id="rxTabs" style="display:flex;border-bottom:1px solid var(--border);flex-shrink:0;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch"></div>
    <div id="rxList" style="overflow-y:auto;flex:1"><div style="text-align:center;padding:2rem;color:var(--text2);font-size:0.88rem">Chargement...</div></div>
  `;

  overlay.appendChild(box);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  box.querySelector('#rxClose').addEventListener('click', () => overlay.remove());

  // Charger les données avec la nouvelle route
  let data = {};
  try {
    data = await PaganiAPI.getPostReactionsDetail(postId);
  } catch(e) {
    // Fallback : utiliser le cache local (userId seulement, sans noms)
    const cache = _reactionsCache[postId] || {};
    for (const [emoji, ids] of Object.entries(cache)) {
      data[emoji] = ids.map(id => ({ id, name: 'Utilisateur #' + id, avatarPhoto: null, avatarColor: '#6c63ff' }));
    }
  }

  const tabs = box.querySelector('#rxTabs');
  const list = box.querySelector('#rxList');

  const allUsers = Object.entries(data).flatMap(([emoji, users]) => users.map(u => ({ ...u, emoji })));

  if (!allUsers.length) {
    list.innerHTML = '<p style="text-align:center;color:var(--text2);padding:2rem;font-size:0.88rem">Aucune réaction.</p>';
    return;
  }

  const emojiGroups = Object.entries(data).sort((a, b) => b[1].length - a[1].length);
  const tabsData = [
    { key: 'all', label: 'Tous', count: allUsers.length },
    ...emojiGroups.map(([e, u]) => ({ key: e, label: e, count: u.length }))
  ];

  let activeKey = 'all';

  function renderTabs() {
    tabs.innerHTML = '';
    tabsData.forEach(t => {
      const btn = document.createElement('button');
      const isActive = t.key === activeKey;
      btn.style.cssText = `background:none;border:none;border-bottom:2px solid ${isActive ? 'var(--accent)' : 'transparent'};color:${isActive ? 'var(--accent)' : 'var(--text2)'};padding:0.65rem 1rem;cursor:pointer;font-size:${t.key === 'all' ? '0.85rem' : '1.3rem'};white-space:nowrap;font-family:inherit;font-weight:${isActive ? '700' : '400'};flex-shrink:0;transition:color 0.15s`;
      btn.innerHTML = t.key === 'all' ? `Tous <span style="font-size:0.75rem;opacity:0.6">${t.count}</span>` : t.label;
      btn.addEventListener('click', () => { activeKey = t.key; renderTabs(); renderList(); });
      tabs.appendChild(btn);
    });
  }

  function renderList() {
    const users = activeKey === 'all' ? allUsers : (data[activeKey] || []).map(u => ({ ...u, emoji: activeKey }));
    list.innerHTML = '';
    users.forEach(u => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:0.9rem;padding:0.75rem 1.2rem;cursor:pointer;transition:background 0.15s';
      row.onmouseover = () => row.style.background = 'rgba(108,99,255,0.07)';
      row.onmouseout  = () => row.style.background = '';

      const initials = (u.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const av = document.createElement('div');
      if (u.avatarPhoto) {
        av.innerHTML = `<img src="${u.avatarPhoto}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0" />`;
      } else {
        av.style.cssText = `width:44px;height:44px;border-radius:50%;background:${u.avatarColor||'#6c63ff'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;color:#fff;flex-shrink:0`;
        av.textContent = initials;
      }

      const name = document.createElement('span');
      name.style.cssText = 'flex:1;font-size:0.92rem;font-weight:600';
      name.textContent = u.name;

      const emoji = document.createElement('span');
      emoji.style.fontSize = '1.3rem';
      emoji.textContent = u.emoji;

      row.appendChild(av);
      row.appendChild(name);
      row.appendChild(emoji);
      row.addEventListener('click', () => { overlay.remove(); openPublicProfile(u.id); });
      list.appendChild(row);
    });
  }

  renderTabs();
  renderList();
}
// --- Skeleton loader ---
function renderSkeletons(n) {
  return Array.from({length: n}, () => `
    <div class="post-card skeleton-card">
      <div class="skeleton-header">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line" style="width:40%"></div>
          <div class="skeleton-line" style="width:25%"></div>
        </div>
      </div>
      <div class="skeleton-line" style="width:70%;margin:1rem 1.2rem 0.4rem"></div>
      <div class="skeleton-line" style="width:95%;margin:0 1.2rem 0.3rem"></div>
      <div class="skeleton-line" style="width:80%;margin:0 1.2rem 1rem"></div>
    </div>`).join("");
}
// ===== AUTH =====
async function login(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const pass  = document.getElementById("loginPassword").value;
  const err   = document.getElementById("loginError");
  err.textContent = "";
  try {
    const user = await PaganiAPI.login(email, pass);
    window._currentUser = user;
    showDashboard(user);
  } catch (ex) {
    const msgs = {
      USER_NOT_FOUND:   "Aucun compte trouve avec cet email.",
      WRONG_PASSWORD:   "Mot de passe incorrect.",
      ACCOUNT_DISABLED: "Ce compte a t desactive.",
    };
    err.textContent = msgs[ex.message] || "Erreur de connexion. Verifiez que le serveur est demarr.";
  }
}
async function register(e) {
  e.preventDefault();
  const name    = document.getElementById("regName").value.trim();
  const email   = document.getElementById("regEmail").value.trim();
  const pass    = document.getElementById("regPassword").value;
  const ref     = document.getElementById("regRef").value.trim();
  const mmPhone = document.getElementById("regMmPhone")?.value.trim();
  const mmName  = document.getElementById("regMmName")?.value.trim();
  const mmOpEl  = document.querySelector('input[name="regOperator"]:checked');
  const mmOperator = mmOpEl ? mmOpEl.value : 'MVola';
  const err = document.getElementById("regError");
  if (err) err.textContent = "";
  if (pass.length < 6) {
    if (err) err.textContent = "Le mot de passe doit contenir au moins 6 caractères.";
    return;
  }
  if (!mmPhone) {
    if (err) err.textContent = "Le numero Mobile Money est obligatoire.";
    return;
  }
  if (!mmName) {
    if (err) err.textContent = "Le nom attach au compte Mobile Money est obligatoire.";
    return;
  }
  try {
    const user = await PaganiAPI.register({ name, email, password: pass, refCode: ref, mmPhone, mmOperator, mmName });
    window._currentUser = user;
    if (window.PaganiNotif) await PaganiNotif.newUser(name);
    window.location.href = 'index.html';
  } catch (ex) {
    const msgs = { EMAIL_TAKEN: "Cet email est deja utilise.", MM_PHONE_REQUIS: "Le numero Mobile Money est obligatoire." };
    if (err) err.textContent = msgs[ex.message] || "Erreur lors de l\'inscription. Verifiez que le serveur est demarr.";
  }
}
async function logout() {
  _stopPresencePing();
  PaganiAPI.logout();
  window._currentUser = null;
  document.getElementById("dashboardSection").style.display = "none";
  document.getElementById("loginSection").style.display = "flex";
}
function showLogin() {
  document.getElementById("registerSection").style.display = "none";
  document.getElementById("loginSection").style.display = "flex";
}
function showRegister() {
  document.getElementById("loginSection").style.display = "none";
  document.getElementById("registerSection").style.display = "flex";
}
function showDashboard(user) {
  document.getElementById("loginSection").style.display = "none";
  document.getElementById("registerSection").style.display = "none";
  document.getElementById("dashboardSection").style.display = "block";
  document.getElementById("userName").textContent = user.name.split(" ")[0];
  document.getElementById("userPlan").textContent = "Plan " + user.plan;
  // Streak badge
  const _sb = document.getElementById('dashStreakBadge');
  if (_sb) {
    if (user.streak > 1) {
      _sb.innerHTML = '<i class="fas fa-fire"></i> ' + user.streak + ' jours consécutifs';
      _sb.style.display = 'inline-flex';
    } else {
      _sb.style.display = 'none';
    }
  }
  document.getElementById("dashRefs").textContent = user.refs || 0;
  document.getElementById("dashEarnings").textContent = formatAR(user.earningsAR || 0);
  document.getElementById("coursesWatched").textContent = (user.unlockedCourses || []).length || (user.plan === "Pro" || user.plan === "Elite" ? getVideos().filter(v => !v.free).length : 0);
  document.getElementById("dashLevel").textContent = _getUserLevel(user);
  // Afficher les onglets selon le rle
  const adminTabBtn  = document.getElementById("adminTabBtn");
  const videosTabBtn = document.getElementById("videosTabBtn");
  const subTabBtn    = document.getElementById("subTabBtn");
  const overviewTab  = document.querySelector(".dash-tab[onclick*=\"overview\"]");
  const profileTab   = document.querySelector(".dash-tab[onclick*=\"profile\"]");
  const walletTab    = document.querySelector(".dash-tab[onclick*=\"wallet\"]");
  if (user.role === "admin") {
    if (overviewTab) overviewTab.style.display = "none";
    if (walletTab)   walletTab.style.display   = "none";
    if (subTabBtn)   subTabBtn.style.display   = "none";
    if (profileTab)  profileTab.style.display  = "flex";
    if (adminTabBtn)  adminTabBtn.style.display  = "flex";
    if (videosTabBtn) videosTabBtn.style.display = "flex";
    const ebooksTabBtn2 = document.getElementById('ebooksTabBtn');
    if (ebooksTabBtn2) ebooksTabBtn2.style.display = "flex";
    const myVideosTabBtn = document.getElementById('myVideosTabBtn');
    if (myVideosTabBtn) myVideosTabBtn.style.display = 'none';
    switchTab('admin', adminTabBtn);
    setTimeout(() => {
      const usersBtn = document.querySelector(".admin-subnav-btn[onclick*=\'users\']");
      if (usersBtn) usersBtn.click();
    }, 300);
  } else {
    if (overviewTab) overviewTab.style.display = "flex";
    if (walletTab)   walletTab.style.display   = "flex";
    if (subTabBtn)   subTabBtn.style.display   = "flex";
    if (adminTabBtn)  adminTabBtn.style.display  = "none";
    if (videosTabBtn) videosTabBtn.style.display = "none";
    const ebooksTabBtn3 = document.getElementById('ebooksTabBtn');
    if (ebooksTabBtn3) ebooksTabBtn3.style.display = "none";
    const myVideosTabBtn = document.getElementById('myVideosTabBtn');
    if (myVideosTabBtn) myVideosTabBtn.style.display = 'flex';
    const myPostsTabBtn = document.getElementById('myPostsTabBtn');
    if (myPostsTabBtn) myPostsTabBtn.style.display = 'flex';
    const trainerTabBtn = document.getElementById('trainerTabBtn');
    if (trainerTabBtn) trainerTabBtn.style.display = 'flex';
    switchTab('myposts', myPostsTabBtn);
  }
  // Activer les notifications
  if (window.PaganiNotif) {
    PaganiNotif.refreshBadge();
    PaganiNotif.startPolling();
  }
  // Polling admin pour les badges en temps rel
  if (user.role === 'admin') _startAdminPolling();
  // Verifier si on doit ouvrir l'onglet messages depuis une notification
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam  = urlParams.get('tab');
  const withParam = urlParams.get('with');
  if (tabParam === 'messages') {
    // Rediriger vers la page ddie
    window.location.href = 'messages.html' + (withParam ? '?with=' + withParam : '');
    return;
  }
  if (tabParam === 'trainer' && user.role !== 'admin') {
    switchTab('trainer', document.getElementById('trainerTabBtn'));
  }
  if (tabParam === 'subscription' && user.role !== 'admin') {
    const subTabBtn = document.getElementById('subTabBtn');
    if (subTabBtn) switchTab('subscription', subTabBtn);
    const subId = urlParams.get('sub');
    if (subId) setTimeout(() => _scrollToSubCard(subId), 600);
  }

  if (tabParam === 'admin' && user.role === 'admin') {
    const sectionParam = urlParams.get('section');
    switchTab('admin', document.getElementById('adminTabBtn'));
    if (sectionParam) {
      setTimeout(() => {
        const btn = document.querySelector(`.admin-subnav-btn[onclick*="'${sectionParam}'"]`);
        if (btn) btn.click();
        const subId = urlParams.get('sub');
        if (subId) setTimeout(() => _scrollToSubCard(subId), 800);
        const purchaseId = urlParams.get('purchase');
        if (purchaseId && sectionParam === 'videopurchases') setTimeout(() => _scrollToVideoPurchaseCard(purchaseId), 800);
      }, 300);
    }
  }
  renderProgress();
  updateAffiliateStats(user);
  renderProfile(user);
  loadStories();
}
// ===== COMPTES MOBILE MONEY =====
function _renderWithdrawMmSelector(user) {
  const selector = document.getElementById('withdrawMmSelector');
  const noneMsg  = document.getElementById('withdrawMmNone');
  if (!selector) return;
  // Construire la liste des comptes remplis
  let accounts = user.mmAccounts;
  if (!accounts || !accounts.length) {
    accounts = user.mmPhone ? [{ operator: user.mmOperator||'MVola', phone: user.mmPhone, name: user.mmName||user.name, locked: true }] : [];
  }
  const filled = accounts.filter(a => a.phone);
  if (!filled.length) {
    selector.innerHTML = '';
    if (noneMsg) noneMsg.style.display = 'flex';
    return;
  }
  if (noneMsg) noneMsg.style.display = 'none';
  const colors = { 'MVola': '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
  selector.innerHTML = filled.map((acc, i) => {
    const color = colors[acc.operator] || 'var(--accent)';
    return `
      <label class="withdraw-mm-option">
        <input type="radio" name="withdrawMmChoice" value="${i}" ${i===0?'checked':''}
          onchange="_selectWithdrawMm('${acc.operator}','${acc.phone}')" />
        <span class="withdraw-mm-card">
          <span class="withdraw-mm-op-icon" style="background:${color}22;color:${color}">
            <i class="fas fa-mobile-alt"></i>
          </span>
          <span class="withdraw-mm-details">
            <strong>${acc.operator}</strong>
            <span>${acc.phone}</span>
            <span class="withdraw-mm-name">${acc.name}</span>
          </span>
          <span class="withdraw-mm-check"><i class="fas fa-check-circle"></i></span>
        </span>
      </label>`;
  }).join('');
  // Sélectionner le premier par défaut
  if (filled.length) _selectWithdrawMm(filled[0].operator, filled[0].phone);
}
function _selectWithdrawMm(operator, phone) {
  const phoneInput = document.getElementById('withdrawPhone');
  const opInput    = document.getElementById('withdrawOperator');
  if (phoneInput) phoneInput.value = phone;
  if (opInput)    opInput.value    = operator;
}const MM_OPERATORS = [
  { key: 'MVola',        color: '#e91e8c', icon: 'fas fa-mobile-alt' },
  { key: 'Orange Money', color: '#ff6600', icon: 'fas fa-mobile-alt' },
  { key: 'Airtel Money', color: '#e53935', icon: 'fas fa-mobile-alt' },
];
let _mmAddingOperator = null;
function renderMmAccounts(user) {
  const list = document.getElementById('mmAccountsList');
  if (!list) return;
  // Construire la liste complte des 3 operateurs
  // en fusionnant avec les comptes existants dans mmAccounts
  let savedAccounts = user.mmAccounts || [];
  // Migration : si mmAccounts est vide mais mmPhone existe, l'intgrer
  if (!savedAccounts.length && user.mmPhone) {
    savedAccounts = [{
      operator: user.mmOperator || 'MVola',
      phone: user.mmPhone,
      name: user.mmName || user.name,
      locked: true
    }];
  }
  // Toujours afficher les 3 operateurs, remplis ou non
  const accounts = MM_OPERATORS.map(op => {
    const saved = savedAccounts.find(a => a.operator === op.key);
    return saved
      ? { ...saved, operator: op.key }
      : { operator: op.key, phone: '', name: '', locked: false };
  });
  list.innerHTML = accounts.map(acc => {
    const op = MM_OPERATORS.find(o => o.key === acc.operator) || MM_OPERATORS[0];
    const filled = !!acc.phone;
    return `
      <div class="mm-account-row ${filled ? 'mm-filled' : 'mm-empty'}">
        <div class="mm-account-icon" style="background:${op.color}22;color:${op.color}">
          <i class="${op.icon}"></i>
        </div>
        <div class="mm-account-info">
          <strong>${acc.operator}</strong>
          ${filled
            ? `<span>${acc.phone}</span><span class="mm-account-name">${acc.name}</span>`
            : `<span class="mm-account-empty">Non renseigne</span>`
          }
        </div>
        <div class="mm-account-status">
          ${filled
            ? `<span class="mm-locked-badge"><i class="fas fa-lock"></i> Verrouille</span>`
            : `<button class="mm-add-btn" onclick="openAddMmModal('${acc.operator}')">
                 <i class="fas fa-plus"></i> Ajouter
               </button>`
          }
        </div>
      </div>`;
  }).join('');
}
function openAddMmModal(operator) {
  _mmAddingOperator = operator;
  document.getElementById('mmAddOperatorLabel').textContent = operator;
  document.getElementById('mmAddPhone').value = '';
  document.getElementById('mmAddName').value  = '';
  document.getElementById('mmAddMsg').textContent = '';
  document.getElementById('mmAddModal').style.display = 'flex';
  setTimeout(() => document.getElementById('mmAddPhone').focus(), 50);
}
async function confirmAddMmAccount() {
  const phone = document.getElementById('mmAddPhone').value.trim();
  const name  = document.getElementById('mmAddName').value.trim();
  const msg   = document.getElementById('mmAddMsg');
  if (!phone) { msg.textContent = 'Entrez le numero.'; return; }
  if (!name)  { msg.textContent = 'Entrez le nom attache au compte.'; return; }
  msg.textContent = '';
  try {
    const updated = await PaganiAPI.addMmAccount(_mmAddingOperator, phone, name);
    window._currentUser = updated;
    document.getElementById('mmAddModal').style.display = 'none';
    renderMmAccounts(updated);
    renderProfile(updated);
  } catch(e) {
    const msgs = {
      COMPTE_VERROUILLE:  'Ce compte est deja verrouille.',
      COMPTE_DEJA_AJOUTE: 'Ce compte a deja ete ajoute.',
      OPERATEUR_INVALIDE: 'Operateur invalide.',
    };
    msg.textContent = msgs[e.message] || 'Erreur lors de l\'ajout.';
  }
}
// ===== PROFIL =====
function renderProfile(user) {
  // --- Avatar : photo ou initiales ---
  const container = document.getElementById("profileAvatarContainer");
  const img       = document.getElementById("profileAvatarImg");
  const circle    = document.getElementById("profileAvatar");
  if (container) {
    if (user.avatarPhoto) {
      if (img)    { img.src = user.avatarPhoto; img.style.display = "block"; }
      if (circle) circle.style.display = "none";
      // Bouton supprimer photo
      let removeBtn = container.querySelector(".avatar-remove-btn");
      if (!removeBtn) {
        removeBtn = document.createElement("button");
        removeBtn.className = "avatar-remove-btn";
        removeBtn.title = "Supprimer la photo";
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.onclick = removeAvatarPhoto;
        container.appendChild(removeBtn);
      }
    } else {
      if (img)    { img.src = ""; img.style.display = "none"; }
      if (circle) {
        circle.style.display = "flex";
        circle.textContent   = getInitials(user.name);
        circle.style.background = getAvatarColor(user);
      }
      const removeBtn = container.querySelector(".avatar-remove-btn");
      if (removeBtn) removeBtn.remove();
    }
  }
  document.getElementById("profileName").textContent = user.name;
  const pubLink = document.getElementById("btnViewPublicProfile");
  if (pubLink) pubLink.href = "profil.html?id=" + user.id;
  document.getElementById("profilePlanBadge").textContent = "Plan " + user.plan;
  document.getElementById("profileBio").textContent = user.bio || "Aucune bio renseignee.";
  // Charger les badges
  const _apiUrl = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  fetch(_apiUrl + '/auth/me/badges', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('pd_jwt') } })
    .then(r => r.json()).then(badges => {
      const wrap = document.getElementById('profileBadges');
      if (wrap) { wrap.innerHTML = _buildBadgesHTML(badges); wrap.style.display = badges.length ? 'flex' : 'none'; }
    }).catch(() => {});
  document.getElementById("pStatCourses").textContent = (user.unlockedCourses || []).length || (user.plan === "Pro" || user.plan === "Elite" ? getVideos().filter(v => !v.free).length : 0);
  document.getElementById("pStatRefs").textContent = user.refs || 0;
  document.getElementById("pStatEarnings").textContent = formatAR(user.earningsAR || 0);
  // Charger les stats followers/following
  _loadProfileFollowStats(user.id);
  renderMmAccounts(user);
  const details = document.getElementById("profileDetails");
  details.innerHTML = [
    user.location ? `<span><i class="fas fa-map-marker-alt"></i> ${esc(user.location)}</span>` : "",
    user.website  ? `<span><i class="fas fa-link"></i> <a href="${esc(user.website)}" target="_blank" rel="noopener">${esc(user.website)}</a></span>` : "",
    user.phone    ? `<span><i class="fas fa-phone"></i> ${esc(user.phone)}</span>` : "",
    user.mmPhone  ? `<span style="color:var(--accent2)"><i class="fas fa-mobile-alt"></i> ${esc(user.mmOperator||'Mobile Money')} : <strong>${esc(user.mmPhone)}</strong> <span style="font-size:0.72rem;opacity:0.7">(${esc(user.mmName||user.name)})</span> <i class="fas fa-lock" style="font-size:0.7rem" title="Non modifiable"></i></span>` : "",
    `<span><i class="fas fa-calendar-alt"></i> Membre depuis ${new Date(user.createdAt).toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}</span>`,
    `<span><i class="fas fa-tag"></i> Code parrainage : <strong style="color:var(--accent)">${esc(user.refCode)}</strong></span>`
  ].filter(Boolean).join("");
}
function toggleEditProfile() {
  const form = document.getElementById("editProfileForm");
  const user = getUser();
  if (!user) return;
  if (form.style.display === "none") {
    document.getElementById("editName").value     = user.name     || "";
    document.getElementById("editBio").value      = user.bio      || "";
    document.getElementById("editLocation").value = user.location || "";
    document.getElementById("editWebsite").value  = user.website  || "";
    document.getElementById("editPhone").value    = user.phone    || "";
    const privSel = document.getElementById("editFollowingPrivacy");
    if (privSel) privSel.value = user.followingPrivacy || "public";
    form.style.display = "block";
  } else {
    form.style.display = "none";
  }
}
async function saveProfile() {
  const user = getUser();
  if (!user) return;
  const privEl = document.getElementById("editFollowingPrivacy");
  const fields = {
    name:              document.getElementById("editName").value.trim()     || user.name,
    bio:               document.getElementById("editBio").value.trim(),
    location:          document.getElementById("editLocation").value.trim(),
    website:           document.getElementById("editWebsite").value.trim(),
    phone:             document.getElementById("editPhone").value.trim(),
    following_privacy: privEl ? privEl.value : "public",
  };
  const updated = await PaganiAPI.updateProfile(fields);
  window._currentUser = updated;
  document.getElementById("editProfileForm").style.display = "none";
  document.getElementById("userName").textContent = updated.name.split(" ")[0];
  renderProfile(updated);
}
// ===== AVATAR : recadrage & upload =====
const _crop = {
  src: null, scale: 1,
  offsetX: 0, offsetY: 0,
  dragging: false, startX: 0, startY: 0, lastX: 0, lastY: 0
};
function uploadAvatarPhoto(input) {
  const file = input.files[0];
  input.value = ""; // reset pour permettre re-slection
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert("Image trop grande (max 5 Mo)."); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    _crop.src = e.target.result;
    _crop.scale = 1;
    _crop.offsetX = 0;
    _crop.offsetY = 0;
    openCropModal(e.target.result);
  };
  reader.readAsDataURL(file);
}
function openCropModal(src) {
  const overlay = document.getElementById("cropModalOverlay");
  const img     = document.getElementById("cropImg");
  const zoom    = document.getElementById("cropZoom");
  if (!overlay) return;
  img.src = src;
  zoom.value = 1;
  _crop.scale = 1; _crop.offsetX = 0; _crop.offsetY = 0;
  overlay.style.display = "flex";
  img.onload = () => {
    updateCrop();
    initCropDrag();
  };
}
function closeCropModal() {
  const overlay = document.getElementById("cropModalOverlay");
  if (overlay) overlay.style.display = "none";
}
function updateCrop() {
  const img   = document.getElementById("cropImg");
  const wrap  = document.getElementById("cropWrap");
  const zoom  = document.getElementById("cropZoom");
  if (!img || !wrap) return;
  const wrapSize = wrap.offsetWidth;
  _crop.scale    = parseFloat(zoom.value);
  const naturalW = img.naturalWidth  || 400;
  const naturalH = img.naturalHeight || 400;
  const baseScale = wrapSize / Math.min(naturalW, naturalH);
  const s = baseScale * _crop.scale;
  const w = naturalW * s;
  const h = naturalH * s;
  // Limiter le dplacement pour ne pas sortir du cadre
  const maxX = 0;
  const minX = wrapSize - w;
  const maxY = 0;
  const minY = wrapSize - h;
  _crop.offsetX = Math.min(maxX, Math.max(minX, _crop.offsetX));
  _crop.offsetY = Math.min(maxY, Math.max(minY, _crop.offsetY));
  img.style.width     = w + "px";
  img.style.height    = h + "px";
  img.style.transform = `translate(${_crop.offsetX}px, ${_crop.offsetY}px)`;
}
function initCropDrag() {
  const wrap = document.getElementById("cropWrap");
  if (!wrap || wrap._dragInit) return;
  wrap._dragInit = true;
  const onDown = (e) => {
    _crop.dragging = true;
    const pt = e.touches ? e.touches[0] : e;
    _crop.startX = pt.clientX - _crop.offsetX;
    _crop.startY = pt.clientY - _crop.offsetY;
  };
  const onMove = (e) => {
    if (!_crop.dragging) return;
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;
    _crop.offsetX = pt.clientX - _crop.startX;
    _crop.offsetY = pt.clientY - _crop.startY;
    updateCrop();
  };
  const onUp = () => { _crop.dragging = false; };
  wrap.addEventListener("mousedown",  onDown);
  wrap.addEventListener("touchstart", onDown, { passive: true });
  document.addEventListener("mousemove", onMove);
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("mouseup",  onUp);
  document.addEventListener("touchend", onUp);
}
async function applyCrop() {
  const img    = document.getElementById("cropImg");
  const wrap   = document.getElementById("cropWrap");
  if (!img || !wrap) return;
  const wrapSize   = wrap.offsetWidth;
  const circleSize = wrapSize * 0.76;
  const circleX    = (wrapSize - circleSize) / 2;
  const circleY    = (wrapSize - circleSize) / 2;
  const scaleX   = img.naturalWidth  / img.offsetWidth;
  const scaleY   = img.naturalHeight / img.offsetHeight;
  const srcX = (circleX - _crop.offsetX) * scaleX;
  const srcY = (circleY - _crop.offsetY) * scaleY;
  const srcW = circleSize * scaleX;
  const srcH = circleSize * scaleY;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 256, 256);
  const base64 = canvas.toDataURL("image/jpeg", 0.85);
  closeCropModal();
  const user = getUser();
  if (!user) return;
  const updated = await PaganiAPI.updateProfile({ avatarPhoto: base64 });
  window._currentUser = updated;
  renderProfile(updated);
  updateNavbar(updated);
}
async function removeAvatarPhoto() {
  const user = getUser();
  if (!user) return;
  const updated = await PaganiAPI.updateProfile({ avatarPhoto: '' });
  window._currentUser = updated;
  renderProfile(updated);
  updateNavbar(updated);
}
async function changePassword(e) {
  e.preventDefault();
  const user    = getUser();
  const oldPass = document.getElementById("oldPassword").value;
  const newPass = document.getElementById("newPassword").value;
  const msg     = document.getElementById("passwordMsg");
  if (!user) return;
  if (newPass.length < 6) { msg.textContent = "Minimum 6 caractères."; msg.style.color="var(--red)"; return; }
  try {
    await PaganiAPI.changePassword(oldPass, newPass);
    msg.textContent = "✅ Mot de passe modifié avec succès.";
    msg.style.color = "var(--green)";
    document.getElementById("changePasswordForm").reset();
  } catch(ex) {
    msg.textContent = ex.message === "WRONG_PASSWORD" ? "Ancien mot de passe incorrect." : "Erreur.";
    msg.style.color = "var(--red)";
  }
  setTimeout(() => msg.textContent = "", 4000);
}
// ===== ESPACE FORMATEUR =====
async function loadTrainerTab() {
  const user = getUser();
  if (!user) return;
  const API = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  const token = localStorage.getItem('pd_jwt');
  const statusEl   = document.getElementById('trainerRequestStatus');
  const formEl     = document.getElementById('trainerRequestForm');
  const submitEl   = document.getElementById('trainerSubmitSection');
  const earningsEl = document.getElementById('trainerEarningsSection');
  const subListEl  = document.getElementById('trainerSubmissionsList');
  if (statusEl)   statusEl.innerHTML = '';
  if (formEl)     formEl.style.display     = 'none';
  if (submitEl)   submitEl.style.display   = 'none';
  if (earningsEl) earningsEl.style.display = 'none';
  if (subListEl)  subListEl.style.display  = 'none';
  // Rafraîchir le user pour avoir le rôle à jour (ex: après acceptation formateur)
  try {
    const fresh = await PaganiAPI.getMe();
    if (fresh) { user = fresh; window._currentUser = fresh; }
  } catch(e) {}
  if (user.role === 'formateur') {
    if (submitEl)   submitEl.style.display   = 'block';
    if (earningsEl) earningsEl.style.display = 'block';
    if (subListEl)  subListEl.style.display  = 'block';
    var modulesEl = document.getElementById('trainerModulesSection');
    if (modulesEl) modulesEl.style.display = 'block';
    await _loadTrainerEarnings(API, token);
    await _loadTrainerSubmissions(API, token);
    await _renderTrainerModules();
    return;
  }
  try {
    const r = await fetch(API + '/trainer/my-request', { headers: { 'Authorization': 'Bearer ' + token } });
    const req = await r.json();
    if (!req) { if (formEl) formEl.style.display = 'block'; return; }
    if (req.statut === 'En attente') {
      if (statusEl) statusEl.innerHTML =
        '<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:14px;padding:1.2rem;display:flex;align-items:center;gap:0.8rem">' +
        '<i class="fas fa-clock" style="color:var(--gold);font-size:1.4rem;flex-shrink:0"></i>' +
        '<div><strong>Demande en cours d\'examen</strong>' +
        '<p style="font-size:0.82rem;color:var(--text2);margin-top:0.3rem">Votre candidature a été reçue. L\'admin vous contactera prochainement.</p></div></div>';
      return;
    }
    if (req.statut === 'Rejeté') {
      if (statusEl) statusEl.innerHTML =
        '<div style="background:rgba(255,77,109,0.1);border:1px solid rgba(255,77,109,0.3);border-radius:14px;padding:1.2rem;display:flex;align-items:center;gap:0.8rem;margin-bottom:1rem">' +
        '<i class="fas fa-times-circle" style="color:var(--red);font-size:1.4rem;flex-shrink:0"></i>' +
        '<div><strong>Demande refusée</strong>' +
        (req.reject_reason ? '<p style="font-size:0.82rem;color:var(--text2);margin-top:0.3rem">Raison : ' + req.reject_reason + '</p>' : '') +
        '<p style="font-size:0.82rem;color:var(--text2);margin-top:0.3rem">Vous pouvez soumettre une nouvelle candidature.</p></div></div>';
      if (formEl) formEl.style.display = 'block';
      return;
    }
    if (formEl) formEl.style.display = 'block';
  } catch(e) { if (formEl) formEl.style.display = 'block'; }
}

async function submitTrainerRequest() {
  const expertise   = document.getElementById('trainerExpertise')?.value.trim();
  const description = document.getElementById('trainerDescription')?.value.trim();
  const demoUrl     = document.getElementById('trainerDemoUrl')?.value.trim();
  const msg         = document.getElementById('trainerRequestMsg');
  if (!expertise)   { msg.style.color = 'var(--red)'; msg.textContent = 'Le domaine d\'expertise est obligatoire.'; return; }
  if (!description) { msg.style.color = 'var(--red)'; msg.textContent = 'La description est obligatoire.'; return; }
  msg.style.color = 'var(--text2)'; msg.textContent = 'Envoi en cours...';
  const API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  const token = localStorage.getItem('pd_jwt');
  try {
    const r = await fetch(API + '/trainer/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ expertise, description, demoUrl })
    });
    const d = await r.json();
    if (!r.ok) {
      const errs = { DEMANDE_DEJA_EN_COURS: 'Vous avez déjà une demande en cours.', CHAMPS_MANQUANTS: 'Remplissez tous les champs obligatoires.' };
      msg.style.color = 'var(--red)'; msg.textContent = errs[d.error] || 'Erreur : ' + d.error; return;
    }
    msg.style.color = 'var(--accent2)'; msg.textContent = '✅ Candidature envoyée ! L\'admin vous contactera prochainement.';
    setTimeout(() => loadTrainerTab(), 2000);
  } catch(e) { msg.style.color = 'var(--red)'; msg.textContent = 'Erreur serveur.'; }
}

async function _loadTrainerEarnings(API, token) {
  const statsEl = document.getElementById('trainerEarningsStats');
  const listEl  = document.getElementById('trainerEarningsList');
  if (!statsEl || !listEl) return;
  try {
    const r = await fetch(API + '/trainer/my-earnings', { headers: { 'Authorization': 'Bearer ' + token } });
    const d = await r.json();
    const fmt = function(n) { return Number(n).toLocaleString('fr-FR'); };
    statsEl.innerHTML =
      '<div class="aff-stat"><i class="fas fa-coins" style="color:var(--gold)"></i><div><strong>' + fmt(d.total||0) + ' AR</strong><span>Total gagné</span></div></div>' +
      '<div class="aff-stat"><i class="fas fa-clock" style="color:var(--accent2)"></i><div><strong>' + fmt(d.pending||0) + ' AR</strong><span>En attente</span></div></div>' +
      '<div class="aff-stat"><i class="fas fa-check-circle" style="color:var(--green)"></i><div><strong>' + fmt(d.paid||0) + ' AR</strong><span>Versé</span></div></div>';
    if (!d.earnings || !d.earnings.length) { listEl.innerHTML = '<p style="color:var(--text2);font-size:0.85rem">Aucun gain pour le moment.</p>'; return; }
    var statusColor = { 'En attente': 'var(--gold)', 'Payé': 'var(--green)' };
    listEl.innerHTML = d.earnings.map(function(e) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:0.7rem 0;border-bottom:1px solid var(--border);font-size:0.85rem">' +
        '<div><strong>' + e.content_title + '</strong>' +
        '<span style="display:block;font-size:0.75rem;color:var(--text2)">' + e.buyer_name + ' · ' + new Date(e.created_at).toLocaleDateString('fr-FR') + '</span></div>' +
        '<div style="text-align:right"><strong style="color:var(--accent2)">' + fmt(e.commission_amount) + ' AR</strong>' +
        '<span style="display:block;font-size:0.72rem;color:' + (statusColor[e.statut]||'var(--gold)') + '">' + e.statut + '</span></div></div>';
    }).join('');
  } catch(e) { if (listEl) listEl.innerHTML = '<p style="color:var(--red);font-size:0.85rem">Erreur de chargement.</p>'; }
}

async function _loadTrainerSubmissions(API, token) {
  const listEl = document.getElementById('trainerSubmissionsContent');
  if (!listEl) return;
  try {
    const r = await fetch(API + '/trainer/my-submissions', { headers: { 'Authorization': 'Bearer ' + token } });
    const subs = await r.json();
    if (!subs.length) { listEl.innerHTML = '<p style="color:var(--text2);font-size:0.85rem">Aucun contenu soumis.</p>'; return; }
    var sColor = { 'En attente': 'var(--gold)', 'Approuvé': 'var(--green)', 'Rejeté': 'var(--red)' };
    var sIcon  = { 'En attente': 'fa-clock', 'Approuvé': 'fa-check-circle', 'Rejeté': 'fa-times-circle' };
    listEl.innerHTML = subs.map(function(s) {
      var c = sColor[s.statut] || 'var(--text2)';
      return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1rem;margin-bottom:0.8rem">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:0.8rem;flex-wrap:wrap">' +
        '<div><strong style="font-size:0.92rem">' + s.title + '</strong>' +
        '<span style="display:block;font-size:0.75rem;color:var(--text2);margin-top:0.2rem">' + s.content_type + ' · ' + s.category + ' · ' + Number(s.price).toLocaleString('fr-FR') + ' AR</span></div>' +
        '<span style="font-size:0.78rem;font-weight:700;color:' + c + ';background:' + c + '22;border:1px solid ' + c + '44;padding:0.2rem 0.7rem;border-radius:50px;white-space:nowrap">' +
        '<i class="fas ' + (sIcon[s.statut]||'fa-clock') + '"></i> ' + s.statut + '</span></div>' +
        (s.reject_reason ? '<p style="font-size:0.78rem;color:var(--red);margin-top:0.5rem">' + s.reject_reason + '</p>' : '') +
        '</div>';
    }).join('');
  } catch(e) { if (listEl) listEl.innerHTML = '<p style="color:var(--red);font-size:0.85rem">Erreur de chargement.</p>'; }
}
function _tsPreview() {
  var videoId = (document.getElementById('tsVideoId')?.value || '').trim();
  var source  = document.getElementById('tsVideoSource')?.value || 'youtube';
  var wrap    = document.getElementById('tsPreviewWrap');
  var frame   = document.getElementById('tsPreviewFrame');
  if (!videoId || !wrap || !frame) return;
  var src = '';
  if (source === 'youtube') {
    // Extraire l'ID si l'utilisateur colle une URL complète
    var match = videoId.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
    var ytId = match ? match[1] : videoId;
    src = 'https://www.youtube.com/embed/' + ytId + '?autoplay=0';
  } else {
    // Drive : extraire l'ID si URL complète
    var dmatch = videoId.match(/\/d\/([^/]+)\//);
    var driveId = dmatch ? dmatch[1] : videoId;
    src = 'https://drive.google.com/file/d/' + driveId + '/preview';
  }
  frame.src = src;
  wrap.style.display = 'block';
}

function _tsAutoThumb(value) {
  var source = document.getElementById('tsVideoSource')?.value || 'youtube';
  if (source !== 'youtube') return;
  var match = value.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  var ytId = match ? match[1] : (value.length === 11 ? value : null);
  if (!ytId) return;
  var thumbUrl = 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg';
  // Pré-remplir le champ miniature si vide
  var thumbInput = document.getElementById('tsThumbnail');
  if (thumbInput && !thumbInput.value) thumbInput.value = thumbUrl;
  // Afficher l'aperçu miniature
  var preview = document.getElementById('tsThumbnailPreview');
  var img     = document.getElementById('tsThumbnailImg');
  if (preview && img) { img.src = thumbUrl; preview.style.display = 'block'; }
}
function openTrainerSubmitModal() {
  var overlay = document.getElementById('trainerSubmitOverlay');
  if (!overlay) return;
  // Reset formulaire
  var fields = ['tsTitle','tsDescription','tsPrice','tsDuration','tsVideoId','tsThumbnail','tsAuthorName','tsCover','tsFileUrl'];
  fields.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });
  var pages = document.getElementById('tsPages'); if (pages) pages.value = '';
  var msg = document.getElementById('trainerSubmitMsg'); if (msg) msg.textContent = '';
  // Reset prévisualisation
  var pw = document.getElementById('tsPreviewWrap'); if (pw) pw.style.display = 'none';
  var pf = document.getElementById('tsPreviewFrame'); if (pf) pf.src = '';
  var tp = document.getElementById('tsThumbnailPreview'); if (tp) tp.style.display = 'none';
  // Reset module + prix unitaire
  var tup = document.getElementById('tsUnitPrice'); if (tup) tup.value = '';
  var hint = document.getElementById('tsModuleHint'); if (hint) hint.textContent = '';
  // Peupler le select des modules
  _populateTsModuleSelect();
  // Type vidéo par défaut
  var radioVideo = document.querySelector('input[name="trainerContentType"][value="video"]');
  if (radioVideo) { radioVideo.checked = true; toggleTrainerContentType('video'); }
  overlay.style.display = 'flex';
}

function closeTrainerSubmitModal() {
  var overlay = document.getElementById('trainerSubmitOverlay');
  if (overlay) overlay.style.display = 'none';
}

function toggleTrainerContentType(type) {
  var videoFields = document.getElementById('tsVideoFields');
  var ebookFields = document.getElementById('tsEbookFields');
  if (videoFields) videoFields.style.display = type === 'video' ? 'block' : 'none';
  if (ebookFields) ebookFields.style.display = type === 'ebook' ? 'block' : 'none';
}

async function submitTrainerContent() {
  var typeEl = document.querySelector('input[name="trainerContentType"]:checked');
  var contentType = typeEl ? typeEl.value : 'video';
  var title       = (document.getElementById('tsTitle')?.value || '').trim();
  var description = (document.getElementById('tsDescription')?.value || '').trim();
  var category    = document.getElementById('tsCategory')?.value || 'debutant';
  var level       = document.getElementById('tsLevel')?.value || 'Débutant';
  var price       = parseInt(document.getElementById('tsPrice')?.value) || 0;
  var msg         = document.getElementById('trainerSubmitMsg');
  if (!title) { msg.style.color = 'var(--red)'; msg.textContent = 'Le titre est obligatoire.'; return; }
  if (!price) { msg.style.color = 'var(--red)'; msg.textContent = 'Le prix est obligatoire.'; return; }
  var moduleId  = document.getElementById('tsModuleId')?.value || null;
  var unitPrice = parseInt(document.getElementById('tsUnitPrice')?.value) || 0;
  var payload = { contentType, title, description, category, level, price, moduleId: moduleId || null, unitPrice };
  if (contentType === 'video') {
    payload.duration    = (document.getElementById('tsDuration')?.value || '').trim();
    payload.videoSource = document.getElementById('tsVideoSource')?.value || 'youtube';
    payload.videoId     = (document.getElementById('tsVideoId')?.value || '').trim();
    payload.thumbnail   = (document.getElementById('tsThumbnail')?.value || '').trim();
    if (!payload.videoId) { msg.style.color = 'var(--red)'; msg.textContent = 'L\'ID vidéo est obligatoire.'; return; }
  } else {
    payload.authorName = (document.getElementById('tsAuthorName')?.value || '').trim();
    payload.pages      = parseInt(document.getElementById('tsPages')?.value) || null;
    payload.cover      = (document.getElementById('tsCover')?.value || '').trim();
    payload.fileUrl    = (document.getElementById('tsFileUrl')?.value || '').trim();
    if (!payload.fileUrl) { msg.style.color = 'var(--red)'; msg.textContent = 'L\'URL du fichier PDF est obligatoire.'; return; }
  }
  msg.style.color = 'var(--text2)'; msg.textContent = 'Envoi en cours...';
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  try {
    var r = await fetch(API + '/trainer/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(payload)
    });
    var d = await r.json();
    if (!r.ok) {
      var errs = { FORMATEUR_REQUIS: 'Accès réservé aux formateurs acceptés.', TITRE_REQUIS: 'Le titre est obligatoire.' };
      msg.style.color = 'var(--red)'; msg.textContent = errs[d.error] || 'Erreur : ' + d.error; return;
    }
    msg.style.color = 'var(--accent2)'; msg.textContent = '✅ Contenu soumis ! L\'admin va l\'examiner.';
    setTimeout(function() { closeTrainerSubmitModal(); loadTrainerTab(); }, 2000);
  } catch(e) { msg.style.color = 'var(--red)'; msg.textContent = 'Erreur serveur.'; }
}
// ===== MODULES FORMATEUR =====
var _trainerModules = [];
var _editingTrainerModuleId = null;

async function _loadTrainerModules() {
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  try {
    var r = await fetch(API + '/trainer/my-modules', { headers: { 'Authorization': 'Bearer ' + token } });
    _trainerModules = await r.json();
  } catch(e) { _trainerModules = []; }
}

async function _renderTrainerModules() {
  var list = document.getElementById('trainerModulesList');
  if (!list) return;
  await _loadTrainerModules();
  if (!_trainerModules.length) {
    list.innerHTML = '<p style="color:var(--text2);font-size:0.85rem">Aucun module créé. Cliquez sur <strong>Créer un module</strong> pour commencer.</p>';
    return;
  }
  var fmt = function(n) { return Number(n).toLocaleString('fr-FR'); };
  list.innerHTML = _trainerModules.map(function(m) {
    var hasPrice = m.module_price && m.module_price > 0;
    return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:1rem;margin-bottom:0.8rem">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:0.8rem;flex-wrap:wrap;margin-bottom:0.6rem">' +
      '<div><strong style="font-size:0.95rem">' + m.title + '</strong>' +
      (m.description ? '<span style="display:block;font-size:0.78rem;color:var(--text2);margin-top:0.2rem">' + m.description + '</span>' : '') + '</div>' +
      '<div style="display:flex;gap:0.4rem">' +
      '<button onclick="openTrainerModuleModal(' + m.id + ')" style="background:rgba(108,99,255,0.12);border:1px solid rgba(108,99,255,0.3);color:var(--accent);padding:0.3rem 0.7rem;border-radius:8px;cursor:pointer;font-size:0.78rem;font-family:inherit"><i class="fas fa-edit"></i></button>' +
      '<button onclick="_deleteTrainerModule(' + m.id + ')" style="background:rgba(255,77,109,0.1);border:1px solid rgba(255,77,109,0.3);color:var(--red);padding:0.3rem 0.7rem;border-radius:8px;cursor:pointer;font-size:0.78rem;font-family:inherit"><i class="fas fa-trash"></i></button>' +
      '</div></div>' +
      '<div style="display:flex;gap:0.5rem;flex-wrap:wrap">' +
      '<span style="font-size:0.75rem;background:var(--bg3);border:1px solid var(--border);padding:0.2rem 0.6rem;border-radius:50px"><i class="fas fa-play-circle"></i> ' + (m.video_count || 0) + ' vidéo(s)</span>' +
      '<span style="font-size:0.75rem;background:var(--bg3);border:1px solid var(--border);padding:0.2rem 0.6rem;border-radius:50px"><i class="fas fa-shopping-cart"></i> ' + (m.sales_count || 0) + ' vente(s)</span>' +
      (hasPrice ? '<span style="font-size:0.75rem;font-weight:700;color:var(--gold);background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);padding:0.2rem 0.6rem;border-radius:50px"><i class="fas fa-tag"></i> Pack : ' + fmt(m.module_price) + ' AR</span>' : '<span style="font-size:0.75rem;color:var(--text2);background:var(--bg3);border:1px solid var(--border);padding:0.2rem 0.6rem;border-radius:50px">Pas de prix pack</span>') +
      (m.total_revenue > 0 ? '<span style="font-size:0.75rem;font-weight:700;color:var(--green);background:rgba(0,212,170,0.1);border:1px solid rgba(0,212,170,0.3);padding:0.2rem 0.6rem;border-radius:50px"><i class="fas fa-coins"></i> ' + fmt(m.total_revenue) + ' AR</span>' : '') +
      '</div></div>';
  }).join('');
}

function openTrainerModuleModal(id) {
  _editingTrainerModuleId = id || null;
  var m = id ? _trainerModules.find(function(x) { return x.id === id; }) : null;
  var title = document.getElementById('trainerModuleModalTitle');
  if (title) title.innerHTML = m
    ? '<i class="fas fa-edit" style="color:var(--accent)"></i> Modifier le module'
    : '<i class="fas fa-layer-group" style="color:var(--accent)"></i> Créer un module';
  var tmTitle = document.getElementById('tmTitle');
  var tmDesc  = document.getElementById('tmDescription');
  var tmPrice = document.getElementById('tmPrice');
  var tmMsg   = document.getElementById('trainerModuleModalMsg');
  if (tmTitle) tmTitle.value = m ? m.title : '';
  if (tmDesc)  tmDesc.value  = m ? (m.description || '') : '';
  if (tmPrice) tmPrice.value = (m && m.module_price) ? m.module_price : '';
  if (tmMsg)   tmMsg.textContent = '';
  var overlay = document.getElementById('trainerModuleModalOverlay');
  if (overlay) overlay.style.display = 'flex';
  setTimeout(function() { if (tmTitle) tmTitle.focus(); }, 50);
}

function closeTrainerModuleModal() {
  var overlay = document.getElementById('trainerModuleModalOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function saveTrainerModule() {
  var title = (document.getElementById('tmTitle')?.value || '').trim();
  var desc  = (document.getElementById('tmDescription')?.value || '').trim();
  var price = parseInt(document.getElementById('tmPrice')?.value) || null;
  var msg   = document.getElementById('trainerModuleModalMsg');
  if (!title) { msg.style.color = 'var(--red)'; msg.textContent = 'Le titre est obligatoire.'; return; }
  msg.style.color = 'var(--text2)'; msg.textContent = 'Enregistrement...';
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  try {
    var url    = _editingTrainerModuleId ? API + '/trainer/modules/' + _editingTrainerModuleId : API + '/trainer/modules';
    var method = _editingTrainerModuleId ? 'PUT' : 'POST';
    var r = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ title: title, description: desc, modulePrice: price })
    });
    var d = await r.json();
    if (!r.ok) { msg.style.color = 'var(--red)'; msg.textContent = d.error || 'Erreur serveur'; return; }
    msg.style.color = 'var(--accent2)'; msg.textContent = '✅ Module enregistré !';
    setTimeout(function() {
      closeTrainerModuleModal();
      _renderTrainerModules();
      _populateTsModuleSelect();
    }, 1000);
  } catch(e) { msg.style.color = 'var(--red)'; msg.textContent = 'Erreur serveur.'; }
}

async function _deleteTrainerModule(id) {
  if (!confirm('Supprimer ce module ? Les vidéos ne seront pas supprimées.')) return;
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  try {
    var r = await fetch(API + '/trainer/modules/' + id, {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token }
    });
    var d = await r.json();
    if (!r.ok) {
      var errs = { MODULE_AVEC_VENTES: 'Ce module a des ventes — impossible de le supprimer.', NON_AUTORISE: 'Non autorisé.' };
      alert(errs[d.error] || d.error); return;
    }
    _renderTrainerModules();
    _populateTsModuleSelect();
  } catch(e) { alert('Erreur serveur.'); }
}

async function _populateTsModuleSelect() {
  var sel = document.getElementById('tsModuleId');
  if (!sel) return;
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  var myMods = [], pubMods = [];
  try {
    var r1 = await fetch(API + '/trainer/my-modules', { headers: { 'Authorization': 'Bearer ' + token } });
    myMods = await r1.json();
  } catch(e) {}
  try {
    var r2 = await fetch(API + '/trainer/available-modules', { headers: { 'Authorization': 'Bearer ' + token } });
    pubMods = await r2.json();
  } catch(e) {}
  var html = '<option value="">-- Aucun module --</option>';
  if (myMods.length) {
    html += '<optgroup label="Mes modules privés">';
    html += myMods.map(function(m) { return '<option value="' + m.id + '">' + m.title + (m.module_price ? ' (' + Number(m.module_price).toLocaleString('fr-FR') + ' AR pack)' : '') + '</option>'; }).join('');
    html += '</optgroup>';
  }
  if (pubMods.length) {
    html += '<optgroup label="Modules publics (Pagani Digital)">';
    html += pubMods.map(function(m) { return '<option value="' + m.id + '">' + m.title + '</option>'; }).join('');
    html += '</optgroup>';
  }
  sel.innerHTML = html;
  _onTsModuleChange();
}

function _onTsModuleChange() {
  var sel  = document.getElementById('tsModuleId');
  var hint = document.getElementById('tsModuleHint');
  if (!sel || !hint) return;
  var val = sel.value;
  if (!val) { hint.textContent = ''; return; }
  // Chercher dans mes modules
  var myMod = _trainerModules.find(function(m) { return String(m.id) === String(val); });
  if (myMod && myMod.module_price) {
    hint.innerHTML = '<i class="fas fa-info-circle" style="color:var(--accent)"></i> Module pack à ' + Number(myMod.module_price).toLocaleString('fr-FR') + ' AR. Vous pouvez aussi définir un prix unitaire ci-dessous.';
  } else {
    hint.textContent = '';
  }
}
// ===== TABS DASHBOARD =====
function switchTab(tab, btn) {
  ["myposts", "overview", "profile", "wallet", "subscription", "myvideos", "myebooks", "trainer", "admin", "videos", "ebooks"].forEach(t => {
    const el = document.getElementById("tab-" + t);
    if (el) el.style.display = t === tab ? "block" : "none";
  });
  document.querySelectorAll(".dash-tab").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  if (tab === "wallet") {
    const user = getUser();
    if (user) {
      document.getElementById("walletAR").textContent     = formatAR(user.pendingAR || 0);
      document.getElementById("walletPaidAR").textContent = formatAR(user.paidAR   || 0);
    }
  }
  if (tab === "myposts")      { loadMyPosts(); _initMyPostsPanel(); }
  if (tab === "profile")      { updatePushNotifUI(); }
  if (tab === "subscription") renderUserSubscriptions();
  if (tab === "myvideos")     renderUserVideoPurchases();
  if (tab === "myebooks")     loadMyEbooks();
  if (tab === "admin")  loadAdminStats();
  if (tab === "ebooks") loadAdminEbooks();
  if (tab === "videos") renderAdminVideos();
  if (tab === "trainer") loadTrainerTab();
}
// ===== ADMIN STATS =====
async function loadAdminStats() {
  let stats;
  try { stats = await PaganiAPI.admin.getStats(); }
  catch(e) { return; }
  // KPIs
  document.getElementById("kpiTotal").textContent      = stats.totalMembers;
  document.getElementById("kpiActive").textContent     = stats.usersActive;
  document.getElementById("kpiCourse").textContent     = stats.usersWithCourse;
  document.getElementById("kpiSubscribed").textContent = stats.usersSubscribed;
  document.getElementById("kpiPro").textContent        = stats.proMembers;
  document.getElementById("kpiElite").textContent      = stats.eliteMembers;
  document.getElementById("kpiRevenue").textContent    = formatAR(stats.totalRevenueAR);
  document.getElementById("kpiPending").textContent    = formatAR(stats.pendingWithdraws);
  // Barre de rpartition des plans
  const total = stats.totalMembers || 1;
  const plans = [
    { label: "Starter", count: stats.starterMembers,  color: "var(--text2)" },
    { label: "Pro",     count: stats.proMembers,      color: "var(--accent)" },
    { label: "Elite",   count: stats.eliteMembers,    color: "var(--gold)" },
  ];
  const bar = document.getElementById("adminPlansBar");
  const legend = document.getElementById("adminPlansLegend");
  bar.innerHTML = plans.map(p => {
    const pct = total > 0 ? ((p.count / total) * 100).toFixed(1) : 0;
    return `<div class="admin-bar-segment" style="width:${pct}%;background:${p.color}" title="${p.label}: ${p.count}"></div>`;
  }).join("");
  legend.innerHTML = plans.map(p => `
    <span class="admin-legend-item">
      <span class="admin-legend-dot" style="background:${p.color}"></span>
      ${p.label} <strong>${p.count}</strong>
    </span>`).join("");
  // Derniers inscrits
  const container = document.getElementById("adminRecentUsers");
  if (stats.recentUsers.length === 0) {
    container.innerHTML = '<div class="history-empty"><i class="fas fa-users"></i><p>Aucun membre inscrit.</p></div>';
    return;
  }
  container.innerHTML = stats.recentUsers.map(u => {
    const av = u.avatarPhoto
      ? `<img src="${u.avatarPhoto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover" />`
      : `<div class="avatar-circle avatar-sm" style="background:${u.avatarColor||'#6c63ff'}">${getInitials(u.name)}</div>`;
    const planColors = { Starter: "var(--text2)", Pro: "var(--accent)", Elite: "var(--gold)" };
    return `
      <div class="admin-user-row">
        <span class="admin-user-name">${av}<span>${u.name}<small>${u.email}</small></span></span>
        <span><span class="admin-plan-badge" style="background:${planColors[u.plan]||'var(--accent)'}">${u.plan}</span></span>
        <span>${new Date(u.createdAt).toLocaleDateString("fr-FR")}</span>
        <span><span class="status-badge ${u.isActive ? 'status-paid' : 'status-pending'}">${u.isActive ? 'Actif' : 'Inactif'}</span></span>
      </div>`;
  }).join("");
  // Charger les comptes de paiement
  await loadAdminPaymentAccounts();
  // Mini-KPI Finance auto
  setTimeout(async () => {
    try {
      const token = localStorage.getItem('pd_jwt');
      const fin = await fetch(API_URL + '/admin/finance-summary', {
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(r => r.json());
      const fmt = n => Number(n).toLocaleString('fr-FR') + ' AR';
      const el = id => document.getElementById(id);
      if (el('kpiTotalSales'))      el('kpiTotalSales').textContent      = fmt(fin.totalSales);
      if (el('kpiTrainerBrut'))     el('kpiTrainerBrut').textContent     = fmt(fin.trainerBrut);
      if (el('kpiWithdrawPending')) el('kpiWithdrawPending').textContent = fmt(fin.withdrawPending);
      if (el('kpiNetAdmin'))        el('kpiNetAdmin').textContent        = fmt(fin.netAdmin);
    } catch(e) {}
  }, 500);
  // Badge abonnements en attente
  try {
    if (window.PaganiAPI) {
      const subs = await PaganiAPI.admin.getUpgradeRequests();
      _subsCache = subs;
      _updateSubsBadge();
    }
  } catch(e) {}
}
// ===== COMPTES DE PAIEMENT ADMIN =====
const _PA_OPERATORS = [
  { key: 'MVola',        color: '#e91e8c' },
  { key: 'Orange Money', color: '#ff6600' },
  { key: 'Airtel Money', color: '#e53935' },
];
function _getLocalPaymentAccounts() {
  return _PA_OPERATORS.map(op => ({ operator: op.key, phone: '', name: '' }));
}
function _saveLocalPaymentAccounts(accounts) {
  // Stockage serveur uniquement — plus de localStorage
}
async function loadAdminPaymentAccounts() {
  const container = document.getElementById('adminPaymentAccounts');
  if (!container) return;
  let accounts = [];
  try {
    accounts = await PaganiAPI.admin.getPaymentAccounts();
  } catch(e) {
    accounts = _getLocalPaymentAccounts();
  }
  _PA_OPERATORS.forEach(op => {
    if (!accounts.find(a => a.operator === op.key))
      accounts.push({ operator: op.key, phone: '', name: '' });
  });
  container.innerHTML = accounts.map(acc => {
    const op      = _PA_OPERATORS.find(o => o.key === acc.operator) || _PA_OPERATORS[0];
    const key     = acc.operator.replace(/ /g, '-');
    const hasPh   = !!acc.phone;
    const isOff   = !!acc.disabled;
    return `
    <div class="admin-payment-row" id="pay-row-${key}">
      <!-- Operateur -->
      <div class="admin-payment-op">
        <span class="admin-payment-icon" style="background:${op.color}22;color:${op.color}">
          <i class="fas fa-mobile-alt"></i>
        </span>
        <strong>${acc.operator}</strong>
      </div>
      <!-- Affichage -->
      <div class="admin-payment-fields" id="pay-fields-${key}">
        ${hasPh ? `
          <span class="admin-payment-info">
            <span>${acc.phone}</span>
            <span class="admin-payment-name">${acc.name}</span>
          </span>
          ${isOff
            ? `<span class="pay-disabled-badge"><i class="fas fa-ban"></i> Desactive${acc.disabledReason ? ' — ' + acc.disabledReason : ''}</span>`
            : `<span class="admin-pay-saved"><i class="fas fa-check-circle"></i> Actif</span>`
          }
          <div class="admin-payment-actions">
            <button class="admin-action-btn ${isOff ? 'toggle' : 'plan'}" title="${isOff ? 'Reactiver' : 'Desactiver'}" onclick="openTogglePayment('${acc.operator}', ${isOff})">
              <i class="fas fa-${isOff ? 'check-circle' : 'ban'}"></i>
            </button>
            <button class="admin-action-btn edit" title="Modifier" onclick="editPaymentAccount('${acc.operator}')">
              <i class="fas fa-edit"></i>
            </button>
            <button class="admin-action-btn del" title="Supprimer le numero" onclick="openClearPayment('${acc.operator}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>` : `
          <span class="admin-payment-empty">Non configure</span>
          <button class="admin-payment-edit-btn" onclick="editPaymentAccount('${acc.operator}')">
            <i class="fas fa-plus"></i> Ajouter
          </button>`
        }
      </div>
      <!-- Formulaire inline dition -->
      <div class="admin-payment-edit-form" id="pay-edit-${key}" style="display:none">
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;width:100%">
          <input type="tel"  id="pay-phone-${key}" class="upgrade-input" placeholder="Numero ${acc.operator}" value="${acc.phone||''}" style="flex:1;min-width:140px" />
          <input type="text" id="pay-name-${key}"  class="upgrade-input" placeholder="Nom du compte" value="${acc.name||''}" style="flex:1;min-width:140px" />
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:0.4rem">
          <button class="btn-primary" style="flex:1;padding:0.5rem;font-size:0.82rem" onclick="savePaymentAccount('${acc.operator}')">
            <i class="fas fa-save"></i> Enregistrer
          </button>
          <button class="editor-btn" style="flex:1;justify-content:center" onclick="cancelPaymentEdit('${acc.operator}')">
            <i class="fas fa-times"></i> Annuler
          </button>
        </div>
        <p id="pay-msg-${key}" style="font-size:0.78rem;min-height:1rem;color:var(--red);margin-top:0.3rem"></p>
      </div>
    </div>`;
  }).join('');
}
function editPaymentAccount(operator) {
  const key = operator.replace(/ /g, '-');
  document.getElementById(`pay-fields-${key}`).style.display = 'none';
  const form = document.getElementById(`pay-edit-${key}`);
  form.style.display = 'flex';
  form.style.flexDirection = 'column';
  setTimeout(() => document.getElementById(`pay-phone-${key}`)?.focus(), 50);
}
function cancelPaymentEdit(operator) {
  const key = operator.replace(/ /g, '-');
  document.getElementById(`pay-fields-${key}`).style.display = 'flex';
  document.getElementById(`pay-edit-${key}`).style.display   = 'none';
}
// ===== TOGGLE DSACTIVER / RACTIVER COMPTE PAIEMENT =====
let _togglePayTarget = null;
function openTogglePayment(operator, isCurrentlyDisabled) {
  _togglePayTarget = { operator, isCurrentlyDisabled };
  const modal = document.getElementById('togglePayModal');
  const title = document.getElementById('togglePayTitle');
  const reasonWrap = document.getElementById('togglePayReasonWrap');
  const reasonInput = document.getElementById('togglePayReason');
  const confirmBtn  = document.getElementById('togglePayConfirmBtn');
  if (isCurrentlyDisabled) {
    title.innerHTML = `<i class="fas fa-check-circle" style="color:var(--green)"></i> Reactiver ${operator} ?`;
    reasonWrap.style.display = 'none';
    confirmBtn.style.background = 'var(--green)';
    confirmBtn.innerHTML = '<i class="fas fa-check-circle"></i> Reactiver';
  } else {
    title.innerHTML = `<i class="fas fa-ban" style="color:var(--red)"></i> Desactiver ${operator} ?`;
    reasonWrap.style.display = 'block';
    if (reasonInput) reasonInput.value = '';
    confirmBtn.style.background = '';
    confirmBtn.className = 'btn-primary';
    confirmBtn.style.cssText = 'width:100%;background:var(--red);border:none';
    confirmBtn.innerHTML = '<i class="fas fa-ban"></i> Desactiver';
  }
  modal.style.display = 'flex';
  if (!isCurrentlyDisabled) setTimeout(() => reasonInput?.focus(), 50);
}
async function confirmTogglePayment() {
  if (!_togglePayTarget) return;
  const { operator, isCurrentlyDisabled } = _togglePayTarget;
  const reason = document.getElementById('togglePayReason')?.value.trim() || '';
  document.getElementById('togglePayModal').style.display = 'none';
  try {
    const t = localStorage.getItem('pd_jwt');
    const enc = encodeURIComponent(operator);
    await fetch(`${API_URL}/admin/payment-accounts/${enc}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
      body: JSON.stringify({ disabled: !isCurrentlyDisabled, reason })
    });
    await loadAdminPaymentAccounts();
  } catch(e) { alert('Erreur : ' + e.message); }
  _togglePayTarget = null;
}
// ===== SUPPRIMER NUMRO COMPTE PAIEMENT =====
let _clearPayTarget = null;
function openClearPayment(operator) {
  _clearPayTarget = operator;
  document.getElementById('clearPayName').textContent = operator;
  document.getElementById('clearPayModal').style.display = 'flex';
}
async function confirmClearPayment() {
  if (!_clearPayTarget) return;
  document.getElementById('clearPayModal').style.display = 'none';
  try {
    const t = localStorage.getItem('pd_jwt');
    const enc = encodeURIComponent(_clearPayTarget);
    await fetch(`${API_URL}/admin/payment-accounts/${enc}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + t }
    });
    await loadAdminPaymentAccounts();
  } catch(e) { alert('Erreur : ' + e.message); }
  _clearPayTarget = null;
}
async function savePaymentAccount(operator) {
  const key   = operator.replace(/ /g, '-');
  const phone = document.getElementById(`pay-phone-${key}`).value.trim();
  const name  = document.getElementById(`pay-name-${key}`).value.trim();
  const msg   = document.getElementById(`pay-msg-${key}`);
  if (!phone) { msg.textContent = 'Entrez le numero.'; return; }
  if (!name)  { msg.textContent = 'Entrez le nom du compte.'; return; }
  msg.textContent = '';
  try {
    await PaganiAPI.admin.updatePaymentAccount(operator, { phone, name });
  } catch(e) {
    msg.textContent = 'Erreur serveur : ' + e.message;
    return;
  }
  await loadAdminPaymentAccounts();
}
// ===== DASHBOARD =====
// Calcule le niveau textuel d'un utilisateur selon ses cours debloqus et son plan
function _getUserLevel(user) {
  const unlocked = (user.unlockedCourses || []).length;
  if (user.plan === 'Elite' || unlocked >= 8) return 'Expert';
  if (user.plan === 'Pro'   || unlocked >= 3) return 'Intermediaire';
  return 'Debutant';
}
function renderProgress() {
  const list = document.getElementById("progressList");
  if (!list) return;
  const user = getUser();
  const allVideos   = getVideos();
  const freeCourses = allVideos.filter(v => v.free);
  const unlocked    = user ? (user.unlockedCourses || []) : [];
  const unlockedCourses = allVideos.filter(v => unlocked.includes(v.id));
  const toShow = [...unlockedCourses, ...freeCourses]
    .filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i)
    .slice(0, 5);
  if (!toShow.length) {
    list.innerHTML = '<div class="history-empty"><i class="fas fa-play-circle"></i><p>Aucune formation commencee.</p></div>';
    return;
  }
  list.innerHTML = toShow.map(v => {
    const progress = (v.free || unlocked.includes(v.id)) ? 100 : 0;
    return `
    <div class="progress-item">
      <div class="progress-item-header"><span>${v.title}</span><span>${progress}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
    </div>`;
  }).join("");
}

function requestWithdraw() {
  alert("Demande de retrait envoyee ! Vous recevrez vos fonds sous 24-72h.");
}
// ===== FORMATIONS =====
// Table de correspondance cours -> index DOM (jamais l\'ID rel en attribut HTML)
let _courseIndexMap = [];
function renderCourses(filter = "all") {
  const grid = document.getElementById("coursesGrid");
  if (!grid) return;
  const videos   = getVideos(); // source de vrit (localStorage ou COURSES)
  const all      = videos;
  const filtered = filter === "all" ? all : all.filter(c => c.category === filter);
  const user     = getUser();
  // Construire la map index -> id rel (jamais exposee dans le HTML)
  _courseIndexMap = filtered.map(c => c.id);
  grid.innerHTML = filtered.map((c, idx) => {
    const hasAccess = c.free || (user && (user.plan === 'Pro' || user.plan === 'Elite')) || (user && (user.unlockedCourses||[]).includes(c.id));
    const lockBadge = !hasAccess
      ? (c.unitPrice
          ? `<span class="course-lock" style="color:var(--accent2)"><i class="fas fa-tag"></i> ${Number(c.unitPrice).toLocaleString('fr-FR')} AR</span>`
          : '<span class="course-lock"><i class="fas fa-lock"></i> Pro</span>')
      : '';
    return `
    <div class="course-card" onclick="openCourse(${idx})" data-idx="${idx}">
      <div class="course-thumb">
        <i class="${c.icon}"></i>
        <div class="play-overlay"><i class="fas fa-play-circle"></i></div>
        ${lockBadge}
      </div>
      <div class="course-info">
        <span class="course-tag">${c.category.toUpperCase()}</span>
        <h3>${c.title}</h3>
        <p>${c.desc}</p>
        <div class="course-meta">
          <span><i class="fas fa-clock"></i> ${c.duration}</span>
          <span><i class="fas fa-signal"></i> ${c.level}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}
function filterCourses(cat, btn) {
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderCourses(cat);
}
// Applique filtre actif + recherche texte sur la grille formations
function _applyFiltersAndSearch() {
  const grid = document.getElementById('coursesGrid');
  const empty = document.getElementById('coursesEmpty');
  const banner = document.getElementById('searchResultBanner');
  if (!grid) return;
  const videos = getVideos();
  const activeBtn = document.querySelector('.filter-btn.active');
  const activeCat = activeBtn ? (activeBtn.onclick ? '' : '') : 'all';
  // Lire la catgorie depuis le bouton actif
  let cat = 'all';
  document.querySelectorAll('.filter-btn').forEach(b => {
    if (b.classList.contains('active')) {
      const oc = b.getAttribute('onclick') || '';
      const m = oc.match(/filterCourses\('([^']+)'/);
      if (m) cat = m[1];
    }
  });
  let filtered = cat === 'all' ? videos : videos.filter(c => c.category === cat);
  if (_searchQuery) {
    filtered = filtered.filter(c =>
      c.title.toLowerCase().includes(_searchQuery) ||
      (c.desc || '').toLowerCase().includes(_searchQuery)
    );
  }
  _courseIndexMap = filtered.map(c => c.id);
  const user = getUser();
  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    if (banner) banner.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (banner) {
    if (_searchQuery) {
      banner.style.display = 'block';
      banner.textContent = filtered.length + ' resultat' + (filtered.length > 1 ? 's' : '') + ' pour "' + _searchQuery + '"';
    } else {
      banner.style.display = 'none';
    }
  }
  grid.innerHTML = filtered.map((c, idx) => {
    const hasAccess = c.free || (user && (user.plan === 'Pro' || user.plan === 'Elite')) || (user && (user.unlockedCourses || []).includes(c.id));
    const lockBadge = !hasAccess
      ? (c.unitPrice
          ? `<span class="course-lock" style="color:var(--accent2)"><i class="fas fa-tag"></i> ${Number(c.unitPrice).toLocaleString('fr-FR')} AR</span>`
          : '<span class="course-lock"><i class="fas fa-lock"></i> Pro</span>')
      : '';
    return `
    <div class="course-card" onclick="openCourse(${idx})" data-idx="${idx}">
      <div class="course-thumb">
        <i class="${c.icon}"></i>
        <div class="play-overlay"><i class="fas fa-play-circle"></i></div>
        ${lockBadge}
      </div>
      <div class="course-info">
        <span class="course-tag">${c.category.toUpperCase()}</span>
        <h3>${c.title}</h3>
        <p>${c.desc}</p>
        <div class="course-meta">
          <span><i class="fas fa-clock"></i> ${c.duration}</span>
          <span><i class="fas fa-signal"></i> ${c.level}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}
// Bascule entre vue grille et vue liste
function setView(view, btn) {
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const grid = document.getElementById('coursesGrid');
  if (!grid) return;
  if (view === 'list') {
    grid.classList.add('courses-list');
    grid.classList.remove('courses-grid-view');
  } else {
    grid.classList.remove('courses-list');
    grid.classList.add('courses-grid-view');
  }
}
// Met a jour les stats hero de la page formations
function updateFormationsStats() {
  const videos = getVideos();
  const total = videos.length;
  const free  = videos.filter(v => v.free).length;
  const paid  = videos.filter(v => !v.free).length;
  const elTotal = document.getElementById('statTotal');
  const elFree  = document.getElementById('statFree');
  const elPaid  = document.getElementById('statPaid');
  if (elTotal) elTotal.textContent = total;
  if (elFree)  elFree.textContent  = free;
  if (elPaid)  elPaid.textContent  = paid;
}
// ===== PLAYER VIDEO (YouTube IFrame API + Google Drive) =====
let _ytPlayer     = null;
let _ytApiReady   = false;
let _ytPendingId  = null;
// Callback appel automatiquement par l'API YouTube quand elle est charge
function onYouTubeIframeAPIReady() {
  _ytApiReady = true;
  if (_ytPendingId) { _loadYT(_ytPendingId); _ytPendingId = null; }
}
function _loadYT(videoId) {
  _showVideoSlot('youtube');
  // Dtruire l\'ancien player s'il existe pour repartir propre
  if (_ytPlayer) {
    try { _ytPlayer.destroy(); } catch(e) {}
    _ytPlayer = null;
    // Recreeer le div cible (destroy() le vide)
    const container = document.getElementById('videoContainer');
    if (container && !document.getElementById('ytPlayer')) {
      const div = document.createElement('div');
      div.id = 'ytPlayer';
      container.insertBefore(div, container.firstChild);
    }
  }
  _ytPlayer = new YT.Player('ytPlayer', {
    videoId,
    width:  '100%',
    height: '100%',
    playerVars: { autoplay: 1, rel: 0, modestbranding: 1, origin: window.location.origin },
    events: {
      onError: (e) => {
        const blocked = [101, 150].includes(e.data);
        _showVideoError(
          blocked
            ? 'Intégration désactivée. Activez « Autoriser l\'intégration » dans YouTube Studio.'
            : 'Impossible de lire cette vido (code ' + e.data + ').'
        );
      }
    }
  });
}
function _loadDrive(driveId) {
  _showVideoSlot('drive');
  const frame = document.getElementById('driveFrame');
  if (!frame) return;
  frame.src = `https://drive.google.com/file/d/${driveId}/preview`;
  // Detecter si Drive ouvre un nouvel onglet et le fermer immdiatement
  const onBlur = () => {
    setTimeout(() => {
      // Si la fenetre a perdu le focus  cause d'un nouvel onglet Drive
      if (document.hidden) return;
      // Tenter de fermer le dernier onglet ouvert
      try {
        const w = window.open('', '_blank');
        if (w) { w.close(); }
      } catch(e) {}
    }, 300);
  };
  window.addEventListener('blur', onBlur, { once: true });
}
function _showVideoSlot(slot) {
  const ytDiv  = document.getElementById('ytPlayer');
  const drive  = document.getElementById('driveFrame');
  const errDiv = document.getElementById('videoError');
  if (ytDiv)  ytDiv.style.display  = slot === 'youtube' ? 'block' : 'none';
  if (drive)  drive.style.display  = slot === 'drive'   ? 'block' : 'none';
  if (errDiv) errDiv.style.display = slot === 'error'   ? 'flex'  : 'none';
}
function _showVideoError(msg) {
  _showVideoSlot('error');
  const p = document.getElementById('videoErrorMsg');
  if (p) p.textContent = msg;
}
function _showLoginPrompt() {
  _showUpgradeModal(null);
}
async function _showUpgradeModal(user, courseName, isFree) {
  const existing = document.getElementById('upgradeModalOverlay');
  if (existing) existing.remove();
  const isGuest = !user;
  const overlay = document.createElement('div');
  overlay.id = 'upgradeModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto';
  overlay.innerHTML = `
    <div class="upgrade-modal" id="upgradeModalBox">
      <!-- Header -->
      <div class="upgrade-modal-header">
        <div class="upgrade-lock-icon">🔒</div>
        <h2>${isGuest ? 'Connectez-vous pour acceder' : 'Passez a un plan superieur'}</h2>
        <p>${isGuest
          ? (isFree
              ? 'Connectez-vous pour regarder cette formation gratuite.'
              : 'Cette formation est reservee aux membres <strong>Pro</strong> et <strong>Elite</strong>.')
          : `<strong>${courseName||'Cette formation'}</strong> est reservee aux membres <strong>Pro</strong> et <strong>Elite</strong>.`
        }</p>
        <button class="upgrade-modal-close" onclick="document.getElementById('upgradeModalOverlay').remove()"><i class="fas fa-times"></i></button>
      </div>
      ${isGuest ? `
        <!-- Guest : juste connexion -->
        <div class="upgrade-guest">
          <a href="dashboard.html" class="btn-primary" style="width:100%;justify-content:center;font-size:1rem;padding:0.9rem">
            <i class="fas fa-sign-in-alt"></i> Se connecter / S'inscrire
          </a>
          <p style="color:var(--text2);font-size:0.82rem;text-align:center">Deja membre Pro/Elite ? Connectez-vous pour acceder.</p>
        </div>
      ` : `
        <!-- Plans -->
        <div class="upgrade-plans">
          <div class="upgrade-plan" id="upgradePlanPro">
            <div class="upgrade-plan-header">
              <span class="upgrade-plan-badge popular">&#11088; Populaire</span>
              <h3>Plan Pro</h3>
              <div class="upgrade-plan-price" id="upgradeModalPricePro">30 000 <span>AR</span><small>/mois</small></div>
            </div>
            <ul class="upgrade-plan-features">
              <li><i class="fas fa-check"></i> Toutes les formations</li>
              <li><i class="fas fa-check"></i> Crypto + Contenu + Facebook</li>
              <li><i class="fas fa-check"></i> Commission affiliation 35%</li>
              <li><i class="fas fa-check"></i> Support prioritaire</li>
            </ul>
            <button class="upgrade-plan-btn" id="upgradeModalBtnPro" onclick="_selectUpgradePlan('Pro', 30000)">
              Choisir Pro <i class="fas fa-arrow-right"></i>
            </button>
          </div>
          <div class="upgrade-plan upgrade-plan-elite" id="upgradePlanElite">
            <div class="upgrade-plan-header">
              <span class="upgrade-plan-badge elite">&#128081; Elite</span>
              <h3>Plan Elite</h3>
              <div class="upgrade-plan-price" id="upgradeModalPriceElite">90 000 <span>AR</span><small>/mois</small></div>
            </div>
            <ul class="upgrade-plan-features">
              <li><i class="fas fa-check"></i> Tout le plan Pro</li>
              <li><i class="fas fa-check"></i> Commission affiliation 50%</li>
              <li><i class="fas fa-check"></i> Coaching 1-on-1</li>
              <li><i class="fas fa-check"></i> Retrait prioritaire 24h</li>
            </ul>
            <button class="upgrade-plan-btn elite" id="upgradeModalBtnElite" onclick="_selectUpgradePlan('Elite', 90000)">
              Choisir Elite <i class="fas fa-arrow-right"></i>
            </button>
          </div>
        </div>
        <!-- Formulaire paiement (masqu par defaut) -->
        <div class="upgrade-payment" id="upgradePayment" style="display:none">
          <div class="upgrade-payment-header">
            <button class="upgrade-back-btn" onclick="_backToPlans()"><i class="fas fa-arrow-left"></i> Retour</button>
            <h3 id="upgradePaymentTitle">Paiement Plan Pro</h3>
          </div>
          <div class="upgrade-payment-steps">
            <div class="upgrade-step">
              <div class="upgrade-step-num">1</div>
              <div style="width:100%">
                <strong>Choisissez votre methode de paiement</strong>
                <p style="margin-bottom:0.8rem">Selectionnez le compte Mobile Money depuis lequel vous allez envoyer <strong id="upgradeAmount" style="color:var(--accent2)"></strong> :</p>
                <div id="upgradeUserMmWrap"></div>
              </div>
            </div>
            <div class="upgrade-step" id="upgradeStep2">
              <div class="upgrade-step-num">2</div>
              <div style="width:100%">
                <strong>Envoyez le montant a ce numero</strong>
                <p style="margin-bottom:0.6rem">Envoyez exactement <strong id="upgradeAmountRepeat" style="color:var(--accent2)"></strong> au compte ci-dessous :</p>
                <div id="upgradeMmTargets" class="upgrade-mm-targets"></div>
              </div>
            </div>
            <div class="upgrade-step">
              <div class="upgrade-step-num">3</div>
              <div style="width:100%">
                <strong>Confirmez votre envoi</strong>
                <p style="margin-bottom:0.8rem">Remplissez les informations ci-dessous apres avoir effectue le transfert :</p>
                <div class="upgrade-form">
                  <input type="text" id="upgradeTxRef" class="upgrade-input" placeholder="Reference transaction (optionnel)" />
                  <!-- PREUVE DE PAIEMENT -->
                  <div id="upgradeProofWrap" style="margin-top:0.6rem">
                    <label style="display:block;font-size:0.8rem;color:var(--text2);font-weight:600;margin-bottom:0.4rem">
                      <i class="fas fa-camera" style="color:var(--accent)"></i>
                      Joindre la preuve de paiement <span style="color:var(--red);font-size:0.72rem">* Obligatoire</span>
                    </label>
                    <label id="upgradeProofLabel" style="
                      display:flex;align-items:center;gap:0.6rem;
                      background:var(--bg2);border:2px dashed var(--border);
                      border-radius:10px;padding:0.75rem 1rem;
                      cursor:pointer;transition:border-color 0.2s;
                      font-size:0.85rem;color:var(--text2);
                    "
                    onmouseover="this.style.borderColor='var(--accent)'"
                    onmouseout="this.style.borderColor=document.getElementById('upgradeProofImg').src?'var(--accent2)':'var(--border)'">
                      <i class="fas fa-image" style="font-size:1.2rem;color:var(--accent)"></i>
                      <span id="upgradeProofText">Cliquez pour ajouter une capture d\'ecran</span>
                      <input type="file" id="upgradeProofInput" accept="image/*" style="display:none"
                        onchange="_previewUpgradeProof(this)" />
                    </label>
                    <div id="upgradeProofPreview" style="display:none;margin-top:0.5rem;position:relative">
                      <img id="upgradeProofImg" src="" alt="Preuve" style="
                        width:100%;max-height:180px;object-fit:cover;
                        border-radius:8px;border:2px solid var(--accent2);
                        display:block;
                      " />
                      <button onclick="_removeUpgradeProof()" style="
                        position:absolute;top:0.4rem;right:0.4rem;
                        background:rgba(0,0,0,0.65);border:none;color:#fff;
                        width:26px;height:26px;border-radius:50%;cursor:pointer;
                        font-size:0.75rem;display:flex;align-items:center;justify-content:center;
                      "><i class="fas fa-times"></i></button>
                    </div>
                  </div>
                  <button class="btn-primary" style="width:100%;padding:0.85rem;font-size:0.95rem;margin-top:0.6rem" onclick="_submitUpgradeRequest()">
                    <i class="fas fa-paper-plane"></i> J'ai envoye le paiement
                  </button>
                  <p id="upgradeMsg" style="font-size:0.82rem;min-height:1rem;text-align:center"></p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- Succs -->
        <div class="upgrade-success" id="upgradeSuccess" style="display:none">
          <div style="font-size:3rem">✅</div>
          <h3>Demande envoyée !</h3>
          <p>Votre demande de passage au plan <strong id="upgradeSuccessPlan"></strong> a ete recue.<br>Votre compte sera active sous <strong>24h</strong> apres verification du paiement.</p>
          <button class="btn-outline" onclick="document.getElementById('upgradeModalOverlay').remove()" style="margin-top:0.5rem">Fermer</button>
        </div>
      `}
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  // Charger les prix dynamiques
  try {
    const p = await PaganiAPI.getPricing();
    const fmt = n => Number(n).toLocaleString('fr-FR');
    const pro = p.pro || 30000, elite = p.elite || 90000;
    const elPro   = document.getElementById('upgradeModalPricePro');
    const elElite = document.getElementById('upgradeModalPriceElite');
    const btnPro  = document.getElementById('upgradeModalBtnPro');
    const btnElite= document.getElementById('upgradeModalBtnElite');
    if (elPro)    elPro.innerHTML   = `${fmt(pro)} <span>AR</span><small>/mois</small>`;
    if (elElite)  elElite.innerHTML = `${fmt(elite)} <span>AR</span><small>/mois</small>`;
    if (btnPro)   btnPro.onclick    = () => _selectUpgradePlan('Pro', pro);
    if (btnElite) btnElite.onclick  = () => _selectUpgradePlan('Elite', elite);
  } catch(e) {}
}
// ===== MODALE UPGRADE — PAIEMENT INTELLIGENT =====
let _selectedPlan     = null;
let _selectedAmount   = 0;
let _adminPayAccounts = [];
// Charge les comptes admin UNE SEULE FOIS et met a jour le cache
async function _loadAdminPayAccounts() {
  try {
    const data = await PaganiAPI.getPaymentAccounts ? PaganiAPI.getPaymentAccounts() : fetch(API_URL + '/payment-accounts').then(r => r.json());
    const result = await data;
    if (Array.isArray(result) && result.length) {
      _adminPayAccounts = result;
      return result;
    }
  } catch(e) {}
  _adminPayAccounts = [];
  return [];
}
async function _selectUpgradePlan(plan, amount) {
  // Utiliser le prix dynamique depuis l'API si disponible
  try {
    const p = await PaganiAPI.getPricing();
    if (plan === 'Pro'   && p.pro)   amount = p.pro;
    if (plan === 'Elite' && p.elite) amount = p.elite;
  } catch(e) {}
  _selectedPlan   = plan;
  _selectedAmount = amount;
  // Remplir les textes statiques
  document.getElementById('upgradePaymentTitle').textContent = `Paiement Plan ${plan}`;
  const amtStr = amount.toLocaleString('fr-FR') + ' AR';
  document.getElementById('upgradeAmount').textContent = amtStr;
  const repeatEl = document.getElementById('upgradeAmountRepeat');
  if (repeatEl) repeatEl.textContent = amtStr;
  const emailHint = document.getElementById('upgradeEmailHint');
  const user = getUser();
  if (emailHint) emailHint.textContent = user ? user.email : 'votre@email.com';
  document.querySelector('.upgrade-plans').style.display = 'none';
  document.getElementById('upgradePayment').style.display = 'block';
  // Afficher un loader dans la zone cible pendant le chargement
  const targetsWrap = document.getElementById('upgradeMmTargets');
  if (targetsWrap) targetsWrap.innerHTML = '<div class="feed-loader"><span></span><span></span><span></span></div>';
  // Charger les comptes admin PUIS construire la vue — une seule fois
  const adminAccounts = await _loadAdminPayAccounts();
  _buildPaymentView(user, adminAccounts);
}
/**
 * Construit toute la vue de paiement :
 * - Rcupre les comptes MM de l\'utilisateur
 * - Filtre les operateurs admin disponibles
 * - Si l\'utilisateur a plusieurs comptes ? slecteur de cartes
 * - Si un seul ? affichage direct
 * - Quand l\'utilisateur choisit un operateur ? affiche le numero admin correspondant
 */
function _buildPaymentView(user, adminAccounts) {
  const adminConfigured = adminAccounts.filter(a => a.phone);
  // Comptes MM de l\'utilisateur
  let userAccounts = [];
  if (user) {
    const raw = user.mmAccounts || [];
    userAccounts = raw.filter(a => a.phone);
    if (!userAccounts.length && user.mmPhone) {
      userAccounts = [{ operator: user.mmOperator || 'MVola', phone: user.mmPhone, name: user.mmName || user.name }];
    }
  }
  // Trouver les operateurs en commun (user a le compte ET admin a le numero)
  const commonOps = userAccounts.filter(ua =>
    adminConfigured.some(aa => aa.operator === ua.operator)
  );
  // Construire le slecteur utilisateur
  _renderUserMmSelector(user, userAccounts, commonOps, adminConfigured);
  // Afficher le numero admin du premier operateur commun par defaut
  if (commonOps.length) {
    _showAdminTargetFor(commonOps[0].operator, adminConfigured);
    _setUpgradeFields(commonOps[0].operator, commonOps[0].phone);
  } else if (userAccounts.length) {
    // L'utilisateur a des comptes mais aucun operateur admin correspondant
    _showAdminTargetFor(null, adminConfigured);
    _setUpgradeFields(userAccounts[0].operator, userAccounts[0].phone);
  } else {
    _showAdminTargetFor(null, adminConfigured);
  }
}
function _showAdminTargetFor(operator, adminAccounts) {
  const wrap = document.getElementById('upgradeMmTargets');
  if (!wrap) return;
  const colors     = { 'MVola': '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
  // Filtrer les comptes desactives — non visibles aux membres
  const configured = adminAccounts.filter(a => a.phone && !a.disabled);
  if (!configured.length) {
    wrap.innerHTML = `
      <div class="upgrade-mm-no-admin">
        <i class="fas fa-exclamation-circle"></i>
        Aucun numero de paiement configure. Contactez l\'administrateur.
      </div>`;
    return;
  }
  // Dterminer le compte slectionn par defaut
  const defaultAcc = operator
    ? (configured.find(a => a.operator === operator) || configured[0])
    : configured[0];
  wrap.innerHTML = `
    <div id="upgradeAdminMmSelector">
      ${configured.map((acc, i) => {
        const color    = colors[acc.operator] || 'var(--accent)';
        const selected = acc.operator === defaultAcc.operator;
        return `
          <div id="adminMmOpt-${i}" style="${selected ? '' : 'display:none'}; margin-bottom:0.5rem; cursor:pointer"
               onclick="_onAdminMmSelect(${i})">
            <div style="
              display:flex; align-items:center; gap:0.8rem;
              background:var(--bg2);
              border:2px solid ${selected ? 'var(--accent2)' : 'var(--border)'};
              border-radius:12px; padding:0.85rem 1rem;
              ${selected ? 'box-shadow:0 0 0 3px rgba(0,212,170,0.12);background:rgba(0,212,170,0.07)' : ''}
            ">
              <span style="width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;background:${color}22;color:${color}">
                <i class="fas fa-mobile-alt"></i>
              </span>
              <span style="flex:1;display:flex;flex-direction:column;gap:0.1rem">
                <strong style="font-size:0.92rem">${acc.operator}</strong>
                <span style="font-size:1.05rem;font-weight:700;color:var(--text);letter-spacing:0.04em">${acc.phone}</span>
                <span style="font-size:0.72rem;color:var(--text2)">${acc.name}</span>
              </span>
              <span style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem;flex-shrink:0">
                ${selected ? `
                  <span style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.72rem;font-weight:700;color:var(--accent2);background:rgba(0,212,170,0.12);border:1px solid rgba(0,212,170,0.25);padding:0.25rem 0.6rem;border-radius:50px;white-space:nowrap">
                    <i class="fas fa-check-circle"></i> Envoyer ici
                  </span>` : ''}
                <button onclick="event.stopPropagation();_copyAdminPhone('${acc.phone}',this)" style="
                  display:inline-flex;align-items:center;gap:0.3rem;
                  background:rgba(108,99,255,0.1);border:1px solid rgba(108,99,255,0.25);
                  color:var(--accent);padding:0.25rem 0.7rem;border-radius:8px;
                  cursor:pointer;font-size:0.75rem;font-family:inherit;white-space:nowrap;
                  transition:background 0.2s;
                " onmouseover="this.style.background='rgba(108,99,255,0.22)'"
                   onmouseout="this.style.background='rgba(108,99,255,0.1)'">
                  <i class="fas fa-copy"></i> Copier
                </button>
              </span>
            </div>
          </div>`;
      }).join('')}
    </div>
    ${configured.length > 1 ? `
      <button id="upgradeAdminMmChangeBtn"
        style="display:inline-flex;align-items:center;gap:0.4rem;background:transparent;border:1px dashed var(--border);color:var(--text2);padding:0.4rem 0.9rem;border-radius:8px;cursor:pointer;font-size:0.78rem;font-family:inherit;margin-top:0.3rem"
        onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
        onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text2)'"
        onclick="_toggleAdminMmAll()">
        <i class="fas fa-exchange-alt"></i> Changer de methode
      </button>` : ''}`;
}
function _toggleAdminMmAll() {
  const selector = document.getElementById('upgradeAdminMmSelector');
  if (!selector) return;
  const opts = selector.querySelectorAll('[id^="adminMmOpt-"]');
  const btn  = document.getElementById('upgradeAdminMmChangeBtn');
  const allVisible = [...opts].every(o => o.style.display !== 'none');
  if (allVisible) {
    // Recacher les non-slectionnes
    opts.forEach(o => {
      const card = o.querySelector('div');
      const isSelected = card && card.style.borderColor.includes('accent2') || card && card.style.border.includes('accent2');
      // Detecter via le badge "Envoyer ici"
      const hasBadge = o.querySelector('[style*="Envoyer"]') || o.innerHTML.includes('Envoyer ici');
      if (!hasBadge) o.style.display = 'none';
    });
    if (btn) btn.innerHTML = '<i class="fas fa-exchange-alt"></i> Changer de methode';
  } else {
    opts.forEach(o => o.style.display = 'block');
    if (btn) btn.innerHTML = '<i class="fas fa-times"></i> Annuler';
  }
}
function _onAdminMmSelect(selectedIdx) {
  const selector = document.getElementById('upgradeAdminMmSelector');
  if (!selector) return;
  const opts = selector.querySelectorAll('[id^="adminMmOpt-"]');
  const colors = { 'MVola': '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
  opts.forEach((opt, i) => {
    const card = opt.querySelector('div');
    if (!card) return;
    if (i === selectedIdx) {
      opt.style.display = 'block';
      card.style.border = '2px solid var(--accent2)';
      card.style.background = 'rgba(0,212,170,0.07)';
      card.style.boxShadow = '0 0 0 3px rgba(0,212,170,0.12)';
      // Ajouter badge si absent
      if (!opt.innerHTML.includes('Envoyer ici')) {
        const badge = document.createElement('span');
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:0.3rem;font-size:0.72rem;font-weight:700;color:var(--accent2);background:rgba(0,212,170,0.12);border:1px solid rgba(0,212,170,0.25);padding:0.25rem 0.6rem;border-radius:50px;white-space:nowrap;flex-shrink:0';
        badge.innerHTML = '<i class="fas fa-check-circle"></i> Envoyer ici';
        card.appendChild(badge);
      }
    } else {
      opt.style.display = 'none';
      card.style.border = '2px solid var(--border)';
      card.style.background = 'var(--bg2)';
      card.style.boxShadow = 'none';
      // Supprimer badge
      const badge = card.querySelector('span:last-child');
      if (badge && badge.innerHTML.includes('Envoyer ici')) badge.remove();
    }
  });
  const btn = document.getElementById('upgradeAdminMmChangeBtn');
  if (btn) btn.innerHTML = '<i class="fas fa-exchange-alt"></i> Changer de methode';
}
/**
 * Construit le slecteur de compte MM utilisateur.
 * - Si pas connect ? champs manuels
 * - Si connect sans compte ? alerte + champs manuels
 * - Si 1 seul compte  affichage fixe (pas de choix)
 * - Si plusieurs comptes ? cartes radio cliquables
 *    seuls les operateurs avec numero admin sont mis en avant
 */
function _renderUserMmSelector(user, userAccounts, commonOps, adminConfigured) {
  const wrap = document.getElementById('upgradeUserMmWrap');
  if (!wrap) return;
  const colors = { 'MVola': '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
  // Cas 1 : visiteur non connect
  if (!user) {
    wrap.innerHTML = `
      <div class="upgrade-mm-notice">
        <i class="fas fa-info-circle"></i>
        <span>Connectez-vous pour utiliser votre compte Mobile Money enregistre.</span>
      </div>
      <div class="upgrade-form-manual">
        <label class="upgrade-form-label">Votre operateur</label>
        <select id="upgradeOperator" class="upgrade-input" onchange="_onManualOpChange(this.value)">
          ${adminConfigured.map(a =>
            `<option value="${a.operator}">${a.operator}</option>`
          ).join('')}
        </select>
        <label class="upgrade-form-label" style="margin-top:0.5rem">Votre numero Mobile Money</label>
        <input type="tel" id="upgradePhone" class="upgrade-input" placeholder="Ex: 034 XX XXX XX" />
      </div>`;
    if (adminConfigured.length) _showAdminTargetFor(adminConfigured[0].operator, adminConfigured);
    return;
  }
  // Cas 2 : connect sans aucun compte MM
  if (!userAccounts.length) {
    wrap.innerHTML = `
      <div class="upgrade-mm-notice upgrade-mm-notice-warn">
        <i class="fas fa-exclamation-triangle"></i>
        <span>Aucun compte Mobile Money dans votre profil.
          <a href="dashboard.html?tab=profile#mm-accounts">Ajoutez-en un</a> pour simplifier vos paiements.
        </span>
      </div>
      <div class="upgrade-form-manual">
        <label class="upgrade-form-label">Votre operateur</label>
        <select id="upgradeOperator" class="upgrade-input" onchange="_onManualOpChange(this.value)">
          ${adminConfigured.length
            ? adminConfigured.map(a => `<option value="${a.operator}">${a.operator}</option>`).join('')
            : `<option value="MVola">MVola</option><option value="Orange Money">Orange Money</option><option value="Airtel Money">Airtel Money</option>`
          }
        </select>
        <label class="upgrade-form-label" style="margin-top:0.5rem">Votre numero Mobile Money</label>
        <input type="tel" id="upgradePhone" class="upgrade-input" placeholder="Ex: 034 XX XXX XX" />
      </div>`;
    if (adminConfigured.length) _showAdminTargetFor(adminConfigured[0].operator, adminConfigured);
    return;
  }
  // Cas 3 : 1 seul compte MM  affichage fixe, pas de slecteur
  if (userAccounts.length === 1) {
    const acc   = userAccounts[0];
    const color = colors[acc.operator] || 'var(--accent)';
    const hasAdmin = adminConfigured.some(a => a.operator === acc.operator);
    wrap.innerHTML = `
      <div class="upgrade-user-mm-single">
        <span class="upgrade-user-mm-icon" style="background:${color}22;color:${color}">
          <i class="fas fa-mobile-alt"></i>
        </span>
        <span class="upgrade-user-mm-details">
          <strong>${acc.operator}</strong>
          <span>${acc.phone}</span>
          <span class="upgrade-user-mm-name">${acc.name}</span>
        </span>
        <span class="upgrade-user-mm-locked">
          <i class="fas fa-lock"></i> Votre compte
        </span>
      </div>
      ${!hasAdmin ? `
        <div class="upgrade-mm-notice upgrade-mm-notice-warn" style="margin-top:0.5rem">
          <i class="fas fa-exclamation-triangle"></i>
          <span>L'operateur <strong>${acc.operator}</strong> n'est pas encore configure par l\'admin.
            Choisissez un autre numero admin ci-dessus pour envoyer.</span>
        </div>` : ''}
      <input type="hidden" id="upgradeOperator" value="${acc.operator}" />
      <input type="hidden" id="upgradePhone"    value="${acc.phone}" />`;
    return;
  }
  // Cas 4 : plusieurs comptes MM ? slecteur de cartes
  wrap.innerHTML = `
    <p class="upgrade-form-label" style="margin-bottom:0.5rem">
      <i class="fas fa-hand-pointer" style="color:var(--accent)"></i>
      Choisissez votre compte d'envoi :
    </p>
    <div class="upgrade-user-mm-selector">
      ${userAccounts.map((acc, i) => {
        const color    = colors[acc.operator] || 'var(--accent)';
        const hasAdmin = adminConfigured.some(a => a.operator === acc.operator);
        const isFirst  = (commonOps.length ? acc.operator === commonOps[0].operator : i === 0);
        return `
          <label class="upgrade-user-mm-option">
            <input type="radio" name="upgradeUserMm" value="${i}" ${isFirst ? 'checked' : ''}
              onchange="_onUserMmChange('${acc.operator}','${acc.phone}')" />
            <span class="upgrade-user-mm-card ${!hasAdmin ? 'upgrade-mm-card-warn' : ''}">
              <span class="upgrade-user-mm-icon" style="background:${color}22;color:${color}">
                <i class="fas fa-mobile-alt"></i>
              </span>
              <span class="upgrade-user-mm-details">
                <strong>${acc.operator}</strong>
                <span>${acc.phone}</span>
                <span class="upgrade-user-mm-name">${acc.name}</span>
              </span>
              <span class="upgrade-user-mm-right">
                ${hasAdmin
                  ? `<span class="upgrade-mm-match"><i class="fas fa-check-circle"></i></span>`
                  : `<span class="upgrade-mm-nomatch" title="Pas de numero admin pour cet operateur"><i class="fas fa-exclamation-circle"></i></span>`
                }
                <span class="upgrade-user-mm-check"><i class="fas fa-check-circle"></i></span>
              </span>
            </span>
          </label>`;
      }).join('')}
    </div>
    <input type="hidden" id="upgradeOperator" value="${(commonOps[0] || userAccounts[0]).operator}" />
    <input type="hidden" id="upgradePhone"    value="${(commonOps[0] || userAccounts[0]).phone}" />`;
}
// Appel quand l\'utilisateur change de compte MM (slecteur cartes)
function _onUserMmChange(operator, phone) {
  _setUpgradeFields(operator, phone);
  _showAdminTargetFor(operator, _adminPayAccounts);
}
// Appel quand l\'utilisateur change l'operateur dans le select manuel
function _onManualOpChange(operator) {
  const opEl = document.getElementById('upgradeOperator');
  if (opEl) opEl.value = operator;
  const accounts = (_adminPayAccounts && _adminPayAccounts.length)
    ? _adminPayAccounts
    : _getLocalPaymentAccounts();
  _showAdminTargetFor(operator, accounts);
}
function _setUpgradeFields(operator, phone) {
  const opEl = document.getElementById('upgradeOperator');
  const phEl = document.getElementById('upgradePhone');
  if (opEl) opEl.value = operator;
  if (phEl) phEl.value = phone;
}
function _copyAdminPhone(phone, btn) {
  const _onSuccess = () => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Copie !';
    btn.style.background = 'rgba(0,212,170,0.15)';
    btn.style.borderColor = 'var(--accent2)';
    btn.style.color = 'var(--accent2)';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.background = 'rgba(108,99,255,0.1)';
      btn.style.borderColor = 'rgba(108,99,255,0.25)';
      btn.style.color = 'var(--accent)';
    }, 2000);
  };
  const _fallback = () => {
    try {
      const inp = document.createElement('input');
      inp.value = phone;
      inp.setAttribute('readonly', '');
      inp.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;opacity:0';
      document.body.appendChild(inp);
      inp.focus();
      inp.select();
      inp.setSelectionRange(0, 99999);
      document.execCommand('copy');
      document.body.removeChild(inp);
      _onSuccess();
    } catch(e) {
      btn.innerHTML = '<i class="fas fa-mobile-alt"></i> ' + phone;
      btn.style.color = 'var(--accent2)';
      setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copier'; btn.style.color = 'var(--accent)'; }, 3000);
    }
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(phone).then(_onSuccess).catch(_fallback);
  } else {
    _fallback();
  }
}
let _upgradeProofBase64 = '';
function _previewUpgradeProof(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert('Image trop grande (max 5 Mo).');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    _upgradeProofBase64 = e.target.result;
    const preview = document.getElementById('upgradeProofPreview');
    const img     = document.getElementById('upgradeProofImg');
    const label   = document.getElementById('upgradeProofLabel');
    const text    = document.getElementById('upgradeProofText');
    if (img)     img.src = _upgradeProofBase64;
    if (preview) preview.style.display = 'block';
    if (label)   label.style.borderColor = 'var(--accent2)';
    if (text)    text.textContent = file.name;
  };
  reader.readAsDataURL(file);
}
function _removeUpgradeProof() {
  _upgradeProofBase64 = '';
  const preview = document.getElementById('upgradeProofPreview');
  const img     = document.getElementById('upgradeProofImg');
  const input   = document.getElementById('upgradeProofInput');
  const label   = document.getElementById('upgradeProofLabel');
  const text    = document.getElementById('upgradeProofText');
  if (preview) preview.style.display = 'none';
  if (img)     img.src = '';
  if (input)   input.value = '';
  if (label)   label.style.borderColor = 'var(--border)';
  if (text)    text.textContent = "Cliquez pour ajouter une capture d\'ecran";
}
function _backToPlans() {
  document.querySelector('.upgrade-plans').style.display = 'grid';
  document.getElementById('upgradePayment').style.display = 'none';
}
async function _submitUpgradeRequest() {
  const phone    = document.getElementById('upgradePhone').value.trim();
  const operator = document.getElementById('upgradeOperator').value;
  const txRef    = document.getElementById('upgradeTxRef').value.trim();
  const proof    = _upgradeProofBase64;
  const msg      = document.getElementById('upgradeMsg');
  if (!phone)  { msg.style.color = 'var(--red)'; msg.textContent = 'Entrez votre numero Mobile Money.'; return; }
  if (!proof)  {
    msg.style.color = 'var(--red)';
    msg.textContent = 'La preuve de paiement est obligatoire. Veuillez joindre une capture d\'ecran.';
    // Mettre en vidence la zone de preuve
    const label = document.getElementById('upgradeProofLabel');
    if (label) {
      label.style.borderColor = 'var(--red)';
      label.style.boxShadow   = '0 0 0 3px rgba(255,77,109,0.15)';
      label.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        label.style.borderColor = 'var(--border)';
        label.style.boxShadow   = 'none';
      }, 3000);
    }
    return;
  }
  msg.style.color = 'var(--text2)'; msg.textContent = 'Envoi en cours...';
  try {
    if (!window.PaganiAPI) throw new Error('SERVEUR_INDISPONIBLE');
    const url = (typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:3001/api') + '/upgrade-request';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('pd_jwt') },
      body: JSON.stringify({ plan: _selectedPlan, amount: _selectedAmount, phone, operator, txRef, proof })
    });
    if (!r.ok) {
      const err = await r.json();
      if (err.error === 'PREUVE_REQUISE') {
        msg.style.color = 'var(--red)';
        msg.textContent = '⚠️ La preuve de paiement est obligatoire.';
        const label = document.getElementById('upgradeProofLabel');
        if (label) { label.style.borderColor = 'var(--red)'; label.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => label.style.borderColor = 'var(--border)', 3000); }
        return;
      }
      throw new Error(err.error || 'ERREUR_SERVEUR');
    }
    // Succs rel — l'API a confirma la rception
    _upgradeProofBase64 = '';
    document.getElementById('upgradePayment').style.display = 'none';
    document.getElementById('upgradeSuccess').style.display = 'flex';
    document.getElementById('upgradeSuccessPlan').textContent = _selectedPlan;
  } catch(e) {
    // Erreur relle — on affiche le message, on ne cache PAS le formulaire
    const errMsgs = {
      SERVEUR_INDISPONIBLE: 'Le serveur est inaccessible. Verifiez votre connexion.',
      NON_AUTHENTIFIE:      'Session expiree. Veuillez vous reconnecter.',
      TOKEN_INVALIDE:       'Session expiree. Veuillez vous reconnecter.',
      PREUVE_REQUISE:       'La preuve de paiement est obligatoire.',
      ERREUR_SERVEUR:       'Erreur serveur. Reessayez dans quelques instants.',
    };
    msg.style.color = 'var(--red)';
    msg.textContent = '⚠️ ' + (errMsgs[e.message] || 'Erreur : ' + e.message);
  }
}
async function openCourse(idx) {
  const realId = _courseIndexMap[idx];
  if (realId === undefined) return;
  // Utiliser le cache deja charg, sinon COURSES hardcodes
  const allVideos = getVideos();
  let course = allVideos.find(c => c.id === realId || c.id === Number(realId));
  // Si pas dans le cache local, charger depuis le serveur
  if (!course && window.PaganiAPI) {
    try {
      const fresh = await PaganiAPI.getVideos();
      if (fresh.length) { _adminVideosCache = fresh; }
      course = fresh.find(c => c.id === realId || c.id === Number(realId));
    } catch(e) {}
  }
  if (!course) return;
  let user = getUser();
  if (!user) {
    try { user = await PaganiAPI.getMe(); window._currentUser = user; } catch(e) {}
  }
  if (!course.free && !user) { _showUpgradeModal(null, course.title); return; }
  // Utilisateur Starter : proposer achat unitaire ou upgrade selon le type d'acces
  if (!course.free && user && user.plan === 'Starter') {
    // Rafraechir le user depuis le serveur pour avoir unlockedCourses a jour
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
  }
  const modal = document.getElementById('videoModal');
  if (!modal) return;
  document.getElementById('modalTitle').textContent = course.title;
  document.getElementById('modalDesc').textContent  = course.desc;
  // Description dtaille admin
  const descWrap    = document.getElementById('modalVideoDesc');
  const descContent = document.getElementById('modalVideoDescContent');
  const descToggle  = document.getElementById('modalVideoDescToggle');
  const descIcon    = document.getElementById('modalVideoDescIcon');
  if (descWrap && descContent) {
    const vd = course.videoDescription || '';
    if (vd) {
      descWrap.style.display = 'block';
      descContent.style.display = 'none';
      if (descIcon)  descIcon.className = 'fas fa-chevron-down';
      if (descToggle) descToggle.childNodes[1] && (descToggle.childNodes[1].textContent = ' Voir la description compl\u00e8te');
      // Rendu avec liens cliquables
      const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
      descContent.innerHTML = vd.split('\n').map(line => {
        const escaped = line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return escaped.replace(urlRegex, url =>
          `<a href="${url}" target="_blank" rel="noopener" style="color:var(--accent);word-break:break-all">${url}</a>`
        );
      }).join('<br>');
    } else {
      descWrap.style.display = 'none';
    }
  }
  // Video gratuite : connexion requise pour lire
  if (course.free) {
    if (!user) { _showUpgradeModal(null, course.title, true); return; }
    modal.classList.add('open');
    const src = course.videoSource || 'youtube';
    const id  = src === 'drive' ? _decode(course.driveId || '') : (course.videoId || '');
    if (!id) { _showVideoSlot('youtube'); return; }
    if (src === 'drive') { _loadDrive(id); }
    else { _ytApiReady ? _loadYT(id) : (_ytPendingId = id, _showVideoSlot('youtube')); }
    return;
  }
  // Video payante : demander un token au serveur
  if (window.PaganiAPI) {
    modal.classList.add('open');
    _showVideoSlot('youtube'); // afficher un loader
    try {
      const result = await PaganiAPI.getVideoToken(realId);
      if (result.source === 'drive') {
        // Rsoudre le token en driveId rel
        const { driveId } = await PaganiAPI.resolveVideoToken(result.token);
        _loadDrive(driveId);
      } else {
        _ytApiReady ? _loadYT(result.videoId) : (_ytPendingId = result.videoId, _showVideoSlot('youtube'));
      }
    } catch(e) {
      _showVideoError(
        e.message === 'ACCES_REFUSE'
          ? '🔒 Cette formation est reservee aux membres Pro et Elite.'
          : ' Vidéo bientôt disponible.'
      );
    }
    return;
  }
  // Fallback : ancien systme sans serveur
  const video = _getSecureVideo(course, user);
  modal.classList.add('open');
  if (!video) {
    _showVideoError(
      !user || (user.plan === 'Starter')
        ? '🔒 Cette formation est reservee aux membres Pro et Elite.'
        : ' Vidéo bientôt disponible.'
    );
    return;
  }
  if (video.source === 'drive') { _loadDrive(video.id); }
  else { _ytApiReady ? _loadYT(video.id) : (_ytPendingId = video.id, _showVideoSlot('youtube')); }
}
function closeModal() {
  const modal = document.getElementById('videoModal');
  if (!modal) return;
  modal.classList.remove('open');
  // Mettre en pause sans dtruire
  if (_ytPlayer && typeof _ytPlayer.pauseVideo === 'function') {
    try { _ytPlayer.pauseVideo(); } catch(e) {}
  }
  // Vider Drive
  const drive = document.getElementById('driveFrame');
  if (drive) drive.src = '';
  _showVideoSlot('youtube');
}
// ===== Achat video unitaire =====
async function _showBuyVideoModal(user, course) {
  const existing = document.getElementById('buyVideoModalOverlay');
  if (existing) existing.remove();
  // Rcuprer le prix dynamique depuis le serveur si disponible
  let unitPrice = course.unitPrice || 10000;
  try {
    if (window.PaganiAPI) { const fv = await PaganiAPI.getVideos(); if (fv && fv.length) _adminVideosCache = fv; }
    const stored2 = _adminVideosCache.find(v => v.id === course.id);
    if (stored2 && stored2.unitPrice) unitPrice = stored2.unitPrice;
    const p = await PaganiAPI.getPricing();
    // Prix spcifique a la video (stocke dans la video elle-meme) ou prix global
    const stored = getVideos().find(v => v.id === course.id);
    unitPrice = (stored && stored.unitPrice) || course.unitPrice || p.video || 10000;
  } catch(e) {}
  const overlay = document.createElement('div');
  overlay.id = 'buyVideoModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem;overflow-y:auto';
  overlay.innerHTML = `
    <div class="buy-video-modal" id="buyVideoModalBox">
      <div class="buy-video-header">
        <div class="buy-video-icon">🎥</div>
        <h2>${course.title}</h2>
        <p class="buy-video-desc">${course.desc}</p>
        <div class="buy-video-meta">
          <span><i class="fas fa-clock"></i> ${course.duration}</span>
          <span><i class="fas fa-signal"></i> ${course.level}</span>
          <span><i class="fas fa-tag" style="color:var(--accent2)"></i> <strong style="color:var(--accent2)">${unitPrice.toLocaleString('fr-FR')} AR</strong></span>
        </div>
        <button class="upgrade-modal-close" onclick="document.getElementById('buyVideoModalOverlay').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="buy-video-options">
        <!-- Option 1 : Achat unitaire -->
        <div class="buy-video-option" id="buyOptionUnit">
          <div class="buy-option-header">
            <span class="buy-option-badge unit"><i class="fas fa-film"></i> Achat unique</span>
            <div class="buy-option-price">${unitPrice.toLocaleString('fr-FR')} <span>AR</span></div>
            <p>Acces permanent a cette video uniquement.</p>
          </div>
          <ul class="buy-option-features">
            <li><i class="fas fa-check"></i> Acces a vie a cette formation</li>
            <li><i class="fas fa-check"></i> Paiement unique, pas d'abonnement</li>
            <li class="muted"><i class="fas fa-times"></i> Autres formations non incluses</li>
          </ul>
          <button class="buy-option-btn unit" onclick="_selectBuyOption('unit', ${unitPrice})">
            Acheter cette video <i class="fas fa-arrow-right"></i>
          </button>
        </div>
        <!-- Option 2 : Abonnement Pro -->
        <div class="buy-video-option featured" id="buyOptionPro">
          <span class="buy-option-popular">⭐ Meilleure valeur</span>
          <div class="buy-option-header">
            <span class="buy-option-badge pro"><i class="fas fa-crown"></i> Plan Pro</span>
            <div class="buy-option-price" id="buyModalPricePro">30 000 <span>AR</span><small>/mois</small></div>
            <p>Toutes les formations + commission affiliation 35%.</p>
          </div>
          <ul class="buy-option-features">
            <li><i class="fas fa-check"></i> Toutes les formations incluses</li>
            <li><i class="fas fa-check"></i> Crypto + Contenu + Facebook</li>
            <li><i class="fas fa-check"></i> Commission affiliation 35%</li>
            <li><i class="fas fa-check"></i> Support prioritaire</li>
          </ul>
          <button class="buy-option-btn pro" onclick="_selectBuyOption('pro', 30000)">
            S'abonner Pro <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
      <!-- Formulaire paiement (masqu par defaut) -->
      <div id="buyVideoPayment" style="display:none;padding:1.5rem">
        <div class="upgrade-payment-header">
          <button class="upgrade-back-btn" onclick="_backToBuyOptions()"><i class="fas fa-arrow-left"></i> Retour</button>
          <h3 id="buyPaymentTitle">Paiement</h3>
        </div>
        <div class="upgrade-payment-steps" style="margin-top:1rem">
          <div class="upgrade-step">
            <div class="upgrade-step-num">1</div>
            <div style="width:100%">
              <strong>Selectionnez le compte Mobile Money depuis lequel vous allez envoyer</strong>
              <p style="margin-bottom:0.8rem;margin-top:0.4rem;font-size:0.85rem;color:var(--text2)">Ce compte sera utilise pour verifier votre paiement.</p>
              <div id="buyUserMmWrap"></div>
            </div>
          </div>
          <div class="upgrade-step" id="buyStep2">
            <div class="upgrade-step-num">2</div>
            <div style="width:100%">
              <strong>Envoyez exactement <strong id="buyAmountRepeat" style="color:var(--accent2)"></strong> au compte ci-dessous</strong>
              <div id="buyMmTargets" class="upgrade-mm-targets" style="margin-top:0.8rem"></div>
            </div>
          </div>
          <div class="upgrade-step">
            <div class="upgrade-step-num">3</div>
            <div style="width:100%">
              <strong>Confirmez votre paiement</strong>
              <div class="upgrade-form" style="margin-top:0.6rem">
                <input type="text" id="buyTxRef" class="upgrade-input" placeholder="Reference transaction (optionnel)" />
                <div id="buyProofWrap" style="margin-top:0.6rem">
                  <label style="display:block;font-size:0.8rem;color:var(--text2);font-weight:600;margin-bottom:0.4rem">
                    <i class="fas fa-camera" style="color:var(--accent)"></i>
                    Preuve de paiement <span style="color:var(--red);font-size:0.72rem">* Obligatoire</span>
                  </label>
                  <label id="buyProofLabel" style="display:flex;align-items:center;gap:0.6rem;background:var(--bg2);border:2px dashed var(--border);border-radius:10px;padding:0.75rem 1rem;cursor:pointer;font-size:0.85rem;color:var(--text2)">
                    <i class="fas fa-image" style="font-size:1.2rem;color:var(--accent)"></i>
                    <span id="buyProofText">Cliquez pour ajouter une capture d\'ecran</span>
                    <input type="file" id="buyProofInput" accept="image/*" style="display:none" onchange="_previewBuyProof(this)" />
                  </label>
                  <div id="buyProofPreview" style="display:none;margin-top:0.5rem;position:relative">
                    <img id="buyProofImg" src="" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;border:2px solid var(--accent2)" />
                    <button onclick="_removeBuyProof()" style="position:absolute;top:0.4rem;right:0.4rem;background:rgba(0,0,0,0.65);border:none;color:#fff;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;justify-content:center"><i class="fas fa-times"></i></button>
                  </div>
                </div>
                <button class="btn-primary" style="width:100%;padding:0.85rem;font-size:0.95rem;margin-top:0.6rem" onclick="_submitBuyRequest(${course.id})">
                  <i class="fas fa-paper-plane"></i> J'ai envoye le paiement
                </button>
                <p id="buyMsg" style="font-size:0.82rem;min-height:1rem;text-align:center"></p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Succs -->
      <div id="buyVideoSuccess" style="display:none;padding:2rem;flex-direction:column;align-items:center;text-align:center;gap:0.8rem">
        <div style="font-size:3rem">✅</div>
        <h3>Demande envoyée !</h3>
        <p id="buySuccessMsg" style="color:var(--text2);font-size:0.9rem;line-height:1.6"></p>
        <button class="btn-outline" onclick="document.getElementById('buyVideoModalOverlay').remove()" style="margin-top:0.5rem">Fermer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  // Charger les prix dynamiques
  try {
    const p = await PaganiAPI.getPricing();
    const fmt = n => Number(n).toLocaleString('fr-FR');
    const elPro = document.getElementById('buyModalPricePro');
    if (elPro) elPro.innerHTML = `${fmt(p.pro || 30000)} <span>AR</span><small>/mois</small>`;
    // Mettre a jour le bouton Pro avec le bon prix
    const btnPro = overlay.querySelector('.buy-option-btn.pro');
    if (btnPro) btnPro.onclick = () => _selectBuyOption('pro', p.pro || 30000);
  } catch(e) {}
  // Charger les comptes de paiement admin
  await _loadAdminPayAccounts();
}
let _buySelectedType   = null;
let _buySelectedAmount = 0;
let _buyProofBase64    = '';
async function _selectBuyOption(type, amount) {
  _buySelectedType   = type;
  _buySelectedAmount = amount;
  if (type === 'pro' || type === 'elite') {
    document.getElementById('buyVideoModalOverlay')?.remove();
    const user = getUser();
    await _showUpgradeModal(user, type === 'pro' ? 'Plan Pro' : 'Plan Elite');
    setTimeout(() => {
      const btn = document.querySelector(type === 'elite' ? '.upgrade-plan-btn.elite' : '.upgrade-plan-btn:not(.elite)');
      if (btn) btn.click();
    }, 150);
    return;
  }
  // Achat unitaire — afficher le formulaire de paiement
  const optionsEl = document.querySelector('.buy-video-options');
  const paymentEl = document.getElementById('buyVideoPayment');
  if (optionsEl) optionsEl.style.display = 'none';
  if (paymentEl) paymentEl.style.display = 'block';
  const title = document.getElementById('buyPaymentTitle');
  if (title) title.textContent = `Paiement — ${amount.toLocaleString('fr-FR')} AR`;
  const repeatEl = document.getElementById('buyAmountRepeat');
  if (repeatEl) repeatEl.textContent = amount.toLocaleString('fr-FR') + ' AR';
  // Loader pendant le chargement des comptes
  const targetsWrap = document.getElementById('buyMmTargets');
  if (targetsWrap) targetsWrap.innerHTML = '<div class="feed-loader"><span></span><span></span><span></span></div>';
  const adminAccounts = await _loadAdminPayAccounts();
  const user = getUser();
  _buildBuyPaymentView(user, adminAccounts);
}

function _backToBuyOptions() {
  const optionsEl = document.querySelector('.buy-video-options');
  const paymentEl = document.getElementById('buyVideoPayment');
  if (optionsEl) optionsEl.style.display = 'grid';
  if (paymentEl) paymentEl.style.display = 'none';
}
// ===== ACHAT VIDEO — SYSTEME DE PAIEMENT DYNAMIQUE =====
function _buildBuyPaymentView(user, adminAccounts) {
  const adminConfigured = adminAccounts.filter(a => a.phone);
  let userAccounts = [];
  if (user) {
    const raw = user.mmAccounts || [];
    userAccounts = raw.filter(a => a.phone);
    if (!userAccounts.length && user.mmPhone) {
      userAccounts = [{ operator: user.mmOperator || 'MVola', phone: user.mmPhone, name: user.mmName || user.name }];
    }
  }
  const commonOps = userAccounts.filter(ua => adminConfigured.some(aa => aa.operator === ua.operator));
  _renderBuyUserMmSelector(user, userAccounts, commonOps, adminConfigured);
  if (commonOps.length) {
    _showBuyAdminTargetFor(commonOps[0].operator, adminConfigured);
    _setBuyFields(commonOps[0].operator, commonOps[0].phone, commonOps[0].name || '');
  } else if (userAccounts.length) {
    _showBuyAdminTargetFor(null, adminConfigured);
    _setBuyFields(userAccounts[0].operator, userAccounts[0].phone, userAccounts[0].name || '');
  } else {
    _showBuyAdminTargetFor(null, adminConfigured);
  }
}
function _showBuyAdminTargetFor(operator, adminAccounts) {
  const wrap = document.getElementById('buyMmTargets');
  if (!wrap) return;
  const colors = { MVola: '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
  const configured = adminAccounts.filter(a => a.phone && !a.disabled);
  if (!configured.length) {
    wrap.innerHTML = `<div class="upgrade-mm-no-admin"><i class="fas fa-exclamation-circle"></i> Aucun numero de paiement configure. Contactez l'administrateur.</div>`;
    return;
  }
  const defaultAcc = operator ? (configured.find(a => a.operator === operator) || configured[0]) : configured[0];
  let html = '<div id="buyAdminMmSelector">';
  configured.forEach((acc, i) => {
    const color    = colors[acc.operator] || 'var(--accent)';
    const selected = acc.operator === defaultAcc.operator;
    const selStyle = selected
      ? 'display:flex;align-items:center;gap:0.8rem;background:rgba(0,212,170,0.07);border:2px solid var(--accent2);border-radius:12px;padding:0.85rem 1rem;box-shadow:0 0 0 3px rgba(0,212,170,0.12)'
      : 'display:flex;align-items:center;gap:0.8rem;background:var(--bg2);border:2px solid var(--border);border-radius:12px;padding:0.85rem 1rem';
    const badge = selected
      ? `<span style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.72rem;font-weight:700;color:var(--accent2);background:rgba(0,212,170,0.12);border:1px solid rgba(0,212,170,0.25);padding:0.25rem 0.6rem;border-radius:50px;white-space:nowrap"><i class="fas fa-check-circle"></i> Envoyer ici</span>`
      : '';
    const copyBtn = `<button onclick="event.stopPropagation();_copyAdminPhone('` + acc.phone + `',this)" style="display:inline-flex;align-items:center;gap:0.3rem;background:rgba(108,99,255,0.1);border:1px solid rgba(108,99,255,0.25);color:var(--accent);padding:0.25rem 0.7rem;border-radius:8px;cursor:pointer;font-size:0.75rem;font-family:inherit;white-space:nowrap" onmouseover="this.style.background='rgba(108,99,255,0.22)'" onmouseout="this.style.background='rgba(108,99,255,0.1)'"><i class="fas fa-copy"></i> Copier</button>`;
    html += `<div id="buyAdminMmOpt-` + i + `" style="` + (selected ? '' : 'display:none;') + `margin-bottom:0.5rem;cursor:pointer" onclick="_onBuyAdminMmSelect(` + i + `)">`;
    html += `<div style="` + selStyle + `">`;
    html += `<span style="width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;background:` + color + `22;color:` + color + `"><i class="fas fa-mobile-alt"></i></span>`;
    html += `<span style="flex:1;display:flex;flex-direction:column;gap:0.1rem"><strong style="font-size:0.92rem">` + acc.operator + `</strong><span style="font-size:1.05rem;font-weight:700;color:var(--text);letter-spacing:0.04em">` + acc.phone + `</span><span style="font-size:0.72rem;color:var(--text2)">` + acc.name + `</span></span>`;
    html += `<span style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem;flex-shrink:0">` + badge + copyBtn + `</span>`;
    html += '</div></div>';
  });
  html += '</div>';
  if (configured.length > 1) {
    html += `<button id="buyAdminMmChangeBtn" style="display:inline-flex;align-items:center;gap:0.4rem;background:transparent;border:1px dashed var(--border);color:var(--text2);padding:0.4rem 0.9rem;border-radius:8px;cursor:pointer;font-size:0.78rem;font-family:inherit;margin-top:0.3rem" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text2)'" onclick="_toggleBuyAdminMmAll()"><i class="fas fa-exchange-alt"></i> Changer de methode</button>`;
  }
  wrap.innerHTML = html;
}
function _toggleBuyAdminMmAll() {
  const selector = document.getElementById('buyAdminMmSelector');
  if (!selector) return;
  const opts = selector.querySelectorAll('[id^="buyAdminMmOpt-"]');
  const btn  = document.getElementById('buyAdminMmChangeBtn');
  const allVisible = [...opts].every(o => o.style.display !== 'none');
  if (allVisible) {
    opts.forEach(o => { if (!o.innerHTML.includes('Envoyer ici')) o.style.display = 'none'; });
    if (btn) btn.innerHTML = '<i class="fas fa-exchange-alt"></i> Changer de methode';
  } else {
    opts.forEach(o => o.style.display = 'block');
    if (btn) btn.innerHTML = '<i class="fas fa-times"></i> Annuler';
  }
}
function _onBuyAdminMmSelect(selectedIdx) {
  const selector = document.getElementById('buyAdminMmSelector');
  if (!selector) return;
  const opts = selector.querySelectorAll('[id^="buyAdminMmOpt-"]');
  opts.forEach((opt, i) => {
    const card = opt.querySelector('div');
    if (!card) return;
    if (i === selectedIdx) {
      opt.style.display = 'block';
      card.style.border = '2px solid var(--accent2)';
      card.style.background = 'rgba(0,212,170,0.07)';
      card.style.boxShadow = '0 0 0 3px rgba(0,212,170,0.12)';
      if (!opt.innerHTML.includes('Envoyer ici')) {
        const badge = document.createElement('span');
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:0.3rem;font-size:0.72rem;font-weight:700;color:var(--accent2);background:rgba(0,212,170,0.12);border:1px solid rgba(0,212,170,0.25);padding:0.25rem 0.6rem;border-radius:50px;white-space:nowrap;flex-shrink:0';
        badge.innerHTML = '<i class="fas fa-check-circle"></i> Envoyer ici';
        card.appendChild(badge);
      }
    } else {
      opt.style.display = 'none';
      card.style.border = '2px solid var(--border)';
      card.style.background = 'var(--bg2)';
      card.style.boxShadow = 'none';
      const badge = card.querySelector('span:last-child');
      if (badge && badge.innerHTML.includes('Envoyer ici')) badge.remove();
    }
  });
  const btn = document.getElementById('buyAdminMmChangeBtn');
  if (btn) btn.innerHTML = '<i class="fas fa-exchange-alt"></i> Changer de methode';
}
function _renderBuyUserMmSelector(user, userAccounts, commonOps, adminConfigured) {
  const wrap = document.getElementById('buyUserMmWrap');
  if (!wrap) return;
  const colors = { MVola: '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
  const opOptions = adminConfigured.length
    ? adminConfigured.map(a => `<option value="` + a.operator + `">` + a.operator + `</option>`).join('')
    : '<option value="MVola">MVola</option><option value="Orange Money">Orange Money</option><option value="Airtel Money">Airtel Money</option>';
  if (!user) {
    wrap.innerHTML = `<div class="upgrade-mm-notice"><i class="fas fa-info-circle"></i><span>Connectez-vous pour utiliser votre compte Mobile Money enregistre.</span></div><div class="upgrade-form-manual"><label class="upgrade-form-label">Votre operateur</label><select id="buyOperatorSelect" class="upgrade-input" onchange="_onBuyManualOpChange(this.value)">` + opOptions + `</select><label class="upgrade-form-label" style="margin-top:0.5rem">Votre numero Mobile Money</label><input type="tel" id="buyPhoneInput" class="upgrade-input" placeholder="Ex: 034 XX XXX XX" oninput="_onBuyPhoneInput(this.value)" /></div><input type="hidden" id="buyOperator" value="` + (adminConfigured[0] ? adminConfigured[0].operator : '') + `" /><input type="hidden" id="buyPhone" value="" /><input type="hidden" id="buyMmName" value="" />`;
    if (adminConfigured.length) _showBuyAdminTargetFor(adminConfigured[0].operator, adminConfigured);
    return;
  }
  if (!userAccounts.length) {
    wrap.innerHTML = `<div class="upgrade-mm-notice upgrade-mm-notice-warn"><i class="fas fa-exclamation-triangle"></i><span>Aucun compte Mobile Money dans votre profil. <a href="dashboard.html?tab=profile#mm-accounts">Ajoutez-en un</a> pour simplifier vos paiements.</span></div><div class="upgrade-form-manual"><label class="upgrade-form-label">Votre operateur</label><select id="buyOperatorSelect" class="upgrade-input" onchange="_onBuyManualOpChange(this.value)">` + opOptions + `</select><label class="upgrade-form-label" style="margin-top:0.5rem">Votre numero Mobile Money</label><input type="tel" id="buyPhoneInput" class="upgrade-input" placeholder="Ex: 034 XX XXX XX" oninput="_onBuyPhoneInput(this.value)" /></div><input type="hidden" id="buyOperator" value="` + (adminConfigured[0] ? adminConfigured[0].operator : '') + `" /><input type="hidden" id="buyPhone" value="" /><input type="hidden" id="buyMmName" value="" />`;
    if (adminConfigured.length) _showBuyAdminTargetFor(adminConfigured[0].operator, adminConfigured);
    return;
  }
  if (userAccounts.length === 1) {
    const acc      = userAccounts[0];
    const color    = colors[acc.operator] || 'var(--accent)';
    const hasAdmin = adminConfigured.some(a => a.operator === acc.operator);
    const warn     = hasAdmin ? '' : `<div class="upgrade-mm-notice upgrade-mm-notice-warn" style="margin-top:0.5rem"><i class="fas fa-exclamation-triangle"></i><span>L'operateur <strong>` + acc.operator + `</strong> n'est pas encore configure par l'admin.</span></div>`;
    wrap.innerHTML = `<div class="upgrade-user-mm-single"><span class="upgrade-user-mm-icon" style="background:` + color + `22;color:` + color + `"><i class="fas fa-mobile-alt"></i></span><span class="upgrade-user-mm-details"><strong>` + acc.operator + `</strong><span>` + acc.phone + `</span><span class="upgrade-user-mm-name">` + acc.name + `</span></span><span class="upgrade-user-mm-locked"><i class="fas fa-lock"></i> Votre compte</span></div>` + warn + `<input type="hidden" id="buyOperator" value="` + acc.operator + `" /><input type="hidden" id="buyPhone" value="` + acc.phone + `" /><input type="hidden" id="buyMmName" value="` + (acc.name || '') + `" />`;
    return;
  }
  // Plusieurs comptes — selecteur de cartes
  const defAcc = commonOps[0] || userAccounts[0];
  let html = `<p class="upgrade-form-label" style="margin-bottom:0.5rem"><i class="fas fa-hand-pointer" style="color:var(--accent)"></i> Choisissez votre compte d'envoi :</p><div class="upgrade-user-mm-selector">`;
  userAccounts.forEach((acc, i) => {
    const color    = colors[acc.operator] || 'var(--accent)';
    const hasAdmin = adminConfigured.some(a => a.operator === acc.operator);
    const isFirst  = acc.operator === defAcc.operator;
    const matchIcon = hasAdmin
      ? '<span class="upgrade-mm-match"><i class="fas fa-check-circle"></i></span>'
      : '<span class="upgrade-mm-nomatch"><i class="fas fa-exclamation-circle"></i></span>';
    html += `<label class="upgrade-user-mm-option"><input type="radio" name="buyUserMm" value="` + i + `" ` + (isFirst ? 'checked' : '') + ` onchange="_onBuyUserMmChange('` + acc.operator + `','` + acc.phone + `','` + (acc.name || '') + `')" /><span class="upgrade-user-mm-card ` + (!hasAdmin ? 'upgrade-mm-card-warn' : '') + `"><span class="upgrade-user-mm-icon" style="background:` + color + `22;color:` + color + `"><i class="fas fa-mobile-alt"></i></span><span class="upgrade-user-mm-details"><strong>` + acc.operator + `</strong><span>` + acc.phone + `</span><span class="upgrade-user-mm-name">` + acc.name + `</span></span><span class="upgrade-user-mm-right">` + matchIcon + `<span class="upgrade-user-mm-check"><i class="fas fa-check-circle"></i></span></span></span></label>`;
  });
  html += `</div><input type="hidden" id="buyOperator" value="` + defAcc.operator + `" /><input type="hidden" id="buyPhone" value="` + defAcc.phone + `" /><input type="hidden" id="buyMmName" value="` + (defAcc.name || '') + `" />`;
  wrap.innerHTML = html;
}
function _onBuyUserMmChange(operator, phone, name) {
  _setBuyFields(operator, phone, name);
  _showBuyAdminTargetFor(operator, _adminPayAccounts);
}
function _onBuyManualOpChange(operator) {
  const opEl = document.getElementById('buyOperator');
  if (opEl) opEl.value = operator;
  _showBuyAdminTargetFor(operator, _adminPayAccounts.length ? _adminPayAccounts : _getLocalPaymentAccounts());
}
function _onBuyPhoneInput(phone) {
  const phEl = document.getElementById('buyPhone');
  if (phEl) phEl.value = phone;
}
function _setBuyFields(operator, phone, name) {
  const opEl = document.getElementById('buyOperator');
  const phEl = document.getElementById('buyPhone');
  const nmEl = document.getElementById('buyMmName');
  if (opEl) opEl.value = operator;
  if (phEl) phEl.value = phone;
  if (nmEl) nmEl.value = name || '';
}

function _previewBuyProof(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Image trop grande (max 5 Mo).'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = e => {
    _buyProofBase64 = e.target.result;
    const preview = document.getElementById('buyProofPreview');
    const img     = document.getElementById('buyProofImg');
    const text    = document.getElementById('buyProofText');
    const label   = document.getElementById('buyProofLabel');
    if (img)     img.src = _buyProofBase64;
    if (preview) preview.style.display = 'block';
    if (label)   label.style.borderColor = 'var(--accent2)';
    if (text)    text.textContent = file.name;
  };
  reader.readAsDataURL(file);
}
function _removeBuyProof() {
  _buyProofBase64 = '';
  const preview = document.getElementById('buyProofPreview');
  const img     = document.getElementById('buyProofImg');
  const input   = document.getElementById('buyProofInput');
  const label   = document.getElementById('buyProofLabel');
  const text    = document.getElementById('buyProofText');
  if (preview) preview.style.display = 'none';
  if (img)     img.src = '';
  if (input)   input.value = '';
  if (label)   label.style.borderColor = 'var(--border)';
  if (text)    text.textContent = "Cliquez pour ajouter une capture d\'ecran";
}
async function _submitBuyRequest(courseId) {
  const txRef = document.getElementById('buyTxRef')?.value.trim() || '';
  const proof = _buyProofBase64;
  const msg   = document.getElementById('buyMsg');
  const user  = getUser();
  // Lire les champs dynamiques injectes par _buildBuyPaymentView
  const operator = document.getElementById('buyOperator')?.value || '';
  const phone    = document.getElementById('buyPhone')?.value    || '';
  const mmName   = document.getElementById('buyMmName')?.value   || '';
  if (!proof) {
    msg.style.color = 'var(--red)';
    msg.textContent = '⚠️ La preuve de paiement est obligatoire.';
    const label = document.getElementById('buyProofLabel');
    if (label) { label.style.borderColor = 'var(--red)'; label.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => label.style.borderColor = 'var(--border)', 3000); }
    return;
  }
  msg.style.color = 'var(--text2)'; msg.textContent = 'Envoi en cours...';
  try {
    const result = await PaganiAPI.buyVideo({ courseId, amount: _buySelectedAmount, txRef, proof, phone, operator, mmName });
    const allVideos = getVideos();
    const course = allVideos.find(c => c.id === courseId || c.id === Number(courseId));
    if (user && window.PaganiNotif) {
      const purchaseId = result && result.id ? result.id : null;
      await PaganiNotif.newFormationPurchase(user.name, course?.title || 'Video', purchaseId);
    }
    _buyProofBase64 = '';
    document.getElementById('buyVideoPayment').style.display = 'none';
    const successEl = document.getElementById('buyVideoSuccess');
    if (successEl) {
      successEl.style.display = 'flex';
      const successMsg = document.getElementById('buySuccessMsg');
      if (successMsg) successMsg.innerHTML = 'Votre demande d\'achat a ete recue.<br>Votre acces sera active sous <strong>24h</strong> apres verification du paiement.';
    }
  } catch(e) {
    const errMsgs = {
      NON_AUTHENTIFIE:   'Session expiree. Veuillez vous reconnecter.',
      TOKEN_INVALIDE:    'Session expiree. Veuillez vous reconnecter.',
      PREUVE_REQUISE:    'La preuve de paiement est obligatoire.',
      DEJA_ACHETE:       'Vous avez deja achete cette formation.',
      VIDEO_INTROUVABLE: 'Formation introuvable.',
    };
    msg.style.color = 'var(--red)';
    msg.textContent = '⚠️ ' + (errMsgs[e.message] || 'Erreur : ' + e.message);
  }
}

// ===== AFFILIATION AR =====
function copyLink() {
  const input = document.getElementById("affiliateLink");
  if (!input) return;
  const user = getUser();
  if (user) input.value = `https://pagani-digital.vercel.app /dashboard.html?ref=${user.refCode}`;
  navigator.clipboard.writeText(input.value).then(() => {
    const msg = document.getElementById("copyMsg");
    msg.textContent = "✅ Lien copié dans le presse-papiers !";
    setTimeout(() => msg.textContent = "", 3000);
  });
}
function formatAR(n) {
  return Number(n).toLocaleString("fr-FR") + " AR";
}
async function updateAffiliateStats(user) {
  const refs    = document.getElementById("totalRefs");
  const earned  = document.getElementById("totalEarned");
  const pending = document.getElementById("pendingPay");
  const paid    = document.getElementById("paidOut");
  const balance = document.getElementById("withdrawBalance");
  const affLink = document.getElementById("affiliateLink");
  if (refs)    refs.textContent    = user.refs || 0;
  if (earned)  earned.textContent  = formatAR(user.earningsAR || 0);
  if (pending) pending.textContent = formatAR(user.pendingAR  || 0);
  if (paid)    paid.textContent    = formatAR(user.paidAR     || 0);
  if (balance) balance.textContent = formatAR(user.pendingAR  || 0);
  if (affLink) affLink.value = `https://pagani-digital.vercel.app /dashboard.html?ref=${user.refCode}`;
  _renderWithdrawMmSelector(user);
  await renderCommissionHistory(user);
}
async function renderCommissionHistory(user) {
  const container = document.getElementById("commissionHistory");
  if (!container) return;
  let history = [];
  try { history = await PaganiAPI.getCommissions(); }
  catch(e) { history = []; }
  if (history.length === 0) {
    container.innerHTML = '<div class="history-empty"><i class="fas fa-inbox"></i><p>Aucune commission pour le moment.</p></div>';
    return;
  }
  container.innerHTML = history.map(h => `
    <div class="history-row">
      <span>${new Date(h.createdAt).toLocaleDateString("fr-FR")}</span>
      <span>${h.filleulName}</span>
      <span><span class="history-type">${h.type}</span></span>
      <span class="green">${formatAR(h.montant)}</span>
      <span><span class="status-badge ${h.statut === 'Verse' ? 'status-paid' : 'status-pending'}">${h.statut}</span></span>
    </div>`).join("");
}
async function requestWithdrawAR(e) {
  e.preventDefault();
  const amount   = parseInt(document.getElementById("withdrawAmount").value);
  const phone    = document.getElementById("withdrawPhone").value.trim();
  const operator = document.getElementById("withdrawOperator").value;
  const msg      = document.getElementById("withdrawMsg");
  const user     = getUser();
  if (!user) { msg.textContent = "Connectez-vous pour faire une demande."; return; }
  if (!phone) { msg.style.color = "var(--red)"; msg.textContent = "Sélectionnez un compte Mobile Money."; return; }
  try {
    await PaganiAPI.requestWithdraw({ montant: amount, phone, operator });
    const updated = await PaganiAPI.getMe();
    if (updated) { window._currentUser = updated; updateAffiliateStats(updated); }
    msg.style.color = "var(--green)";
    msg.textContent = `Demande de ${formatAR(amount)} envoyee vers ${operator} (${phone}). Traitement sous 24-72h.`;
  } catch(ex) {
    msg.style.color = "var(--red)";
    const errs = { MONTANT_MIN: "Montant minimum : 5 000 AR.", SOLDE_INSUFFISANT: "Solde insuffisant." };
    msg.textContent = errs[ex.message] || "Erreur lors de la demande.";
  }
  setTimeout(() => msg.textContent = "", 6000);
}
// ===== LIENS SOCIAUX FOOTER =====
async function loadFooterSocialLinks() {
  try {
    const data = await fetch(API_URL + '/social-links').then(r => r.json());
    const map = { facebook: 'footerFacebook', tiktok: 'footerTiktok', telegram: 'footerTelegram', youtube: 'footerYoutube' };
    Object.entries(map).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el && data[key]) el.href = data[key];
    });
  } catch(e) {}
}

// ===== NAVBAR DYNAMIQUE =====
function updateNavbar(user) {
  const navLinks = document.querySelector(".nav-links");
  if (!navLinks) return;
  const btn = navLinks.querySelector(".btn-nav");
  if (!btn) return;
  if (user) {
    const av = user.avatarPhoto
      ? `<img src="${user.avatarPhoto}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0" />`
      : `<div class="avatar-circle" style="width:24px;height:24px;min-width:24px;font-size:0.62rem;background:${getAvatarColor(user)}">${getInitials(user.name)}</div>`;
    btn.innerHTML = `${av}<span class="nav-name">${esc(user.name.split(' ')[0])}</span>`;
  } else {
    btn.innerHTML = "Mon Espace";
  }
}
// ===== BOUTON NAVBAR PERSONNALISE =====
async function loadNavbarCustomBtn() {
  const btn = document.getElementById('navCustomBtn');
  if (!btn) return;
  try {
    const data = await fetch(API_URL + '/navbar-button').then(r => r.json());
    if (data && data.enabled && data.link) {
      btn.href = data.link;
      btn.title = data.label || '';
      const img = document.getElementById('navCustomBtnIcon');
      if (img && data.icon_url) img.src = data.icon_url;
      btn.style.display = '';
    }
  } catch(e) {}
}

function _navBtnPreview() {
  const enabled = document.getElementById('navBtnEnabled') && document.getElementById('navBtnEnabled').checked;
  const iconUrl = document.getElementById('navBtnIconUrl') ? document.getElementById('navBtnIconUrl').value : '';
  const link    = document.getElementById('navBtnLink')    ? document.getElementById('navBtnLink').value    : '';
  const label   = document.getElementById('navBtnLabel')   ? document.getElementById('navBtnLabel').value   : '';
  const box     = document.getElementById('navBtnPreviewBox');
  if (!box) return;
  if (enabled && (iconUrl || link)) {
    box.style.display = '';
    const img = document.getElementById('navBtnPreviewIcon');
    const el  = document.getElementById('navBtnPreviewEl');
    if (img) img.src = iconUrl || '';
    if (el)  el.title = label || '';
  } else {
    box.style.display = 'none';
  }
}

async function saveNavbarButton() {
  const msg = document.getElementById('navBtnMsg');
  const payload = {
    enabled:  document.getElementById('navBtnEnabled') ? document.getElementById('navBtnEnabled').checked : false,
    label:    document.getElementById('navBtnLabel')   ? document.getElementById('navBtnLabel').value   : '',
    icon_url: document.getElementById('navBtnIconUrl') ? document.getElementById('navBtnIconUrl').value : '',
    link:     document.getElementById('navBtnLink')    ? document.getElementById('navBtnLink').value    : ''
  };
  try {
    const token = localStorage.getItem('pd_jwt');
    const r = await fetch(API_URL + '/admin/navbar-button', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (data.ok) {
      if (msg) { msg.style.color = 'var(--success)'; msg.textContent = '✅ Sauvegardé !'; }
    } else {
      if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = data.error || 'Erreur'; }
    }
  } catch(e) {
    if (msg) { msg.style.color = 'var(--danger)'; msg.textContent = 'Erreur reseau'; }
  }
}

async function loadNavbarBtnAdmin() {
  try {
    const token = localStorage.getItem('pd_jwt');
    const r = await fetch(API_URL + '/navbar-button', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await r.json();
    const en = document.getElementById('navBtnEnabled');
    const lb = document.getElementById('navBtnLabel');
    const ic = document.getElementById('navBtnIconUrl');
    const lk = document.getElementById('navBtnLink');
    if (en) en.checked = !!data.enabled;
    if (lb) lb.value   = data.label    || '';
    if (ic) ic.value   = data.icon_url || '';
    if (lk) lk.value   = data.link     || '';
    _navBtnPreview();
  } catch(e) {}
}

async function loadSocialLinksAdmin() {
  try {
    const r = await fetch(API_URL + '/social-links');
    const data = await r.json();
    const el = id => document.getElementById(id);
    if (el('socialFacebook')) el('socialFacebook').value = data.facebook || '';
    if (el('socialTiktok'))   el('socialTiktok').value   = data.tiktok   || '';
    if (el('socialTelegram')) el('socialTelegram').value = data.telegram  || '';
    if (el('socialYoutube'))  el('socialYoutube').value  = data.youtube   || '';
  } catch(e) {}
}

async function saveSocialLinks() {
  const msg = document.getElementById('socialLinksMsg');
  const payload = {
    facebook: document.getElementById('socialFacebook')?.value.trim() || '',
    tiktok:   document.getElementById('socialTiktok')?.value.trim()   || '',
    telegram: document.getElementById('socialTelegram')?.value.trim() || '',
    youtube:  document.getElementById('socialYoutube')?.value.trim()  || '',
  };
  try {
    const token = localStorage.getItem('pd_jwt');
    const r = await fetch(API_URL + '/admin/social-links', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (msg) { msg.style.color = data.ok ? 'var(--green)' : 'var(--red)'; msg.textContent = data.ok ? '✅ Sauvegardé !' : (data.error || 'Erreur'); }
    setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
  } catch(e) {
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'Erreur reseau'; }
  }
}

// ===== ADMIN EBOOKS =====
let _editingEbookId = null;
let _ebookPurchasesCache = [];

async function loadAdminEbooks() {
  const list = document.getElementById('adminEbooksList');
  if (!list) return;
  list.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i><p>Chargement...</p></div>';
  let ebooks = [];
  try { ebooks = await PaganiAPI.admin.getEbooks(); } catch(e) {
    list.innerHTML = '<div class="history-empty"><i class="fas fa-exclamation-circle"></i><p>Erreur de chargement.</p></div>';
    return;
  }
  if (!ebooks.length) {
    list.innerHTML = '<div class="history-empty"><i class="fas fa-book"></i><p>Aucun ebook. Cliquez sur "Nouvel ebook" pour commencer.</p></div>';
    return;
  }
  list.innerHTML = `
    <div class="video-admin-header" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr">
      <span>Titre</span><span>Catégorie</span><span>Auteur</span><span>Prix</span><span>Actions</span>
    </div>
    ${ebooks.map(eb => `
    <div class="video-admin-row" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr">
      <span class="video-admin-title">
        <i class="fas fa-book-open" style="color:var(--accent2);margin-right:0.5rem"></i>
        <span><strong>${esc(eb.title)}</strong><small>${eb.pages ? eb.pages + ' pages' : ''}</small></span>
      </span>
      <span><span class="course-tag">${esc(eb.category || '—')}</span></span>
      <span style="font-size:0.82rem;color:var(--text2)">${esc(eb.author || '—')}</span>
      <span style="font-size:0.88rem;font-weight:700;color:var(--accent2)">${Number(eb.price).toLocaleString('fr-FR')} AR</span>
      <span class="video-admin-actions">
        <button class="video-action-btn edit" onclick="editEbook(${eb.id})" title="Modifier"><i class="fas fa-edit"></i></button>
        <button class="video-action-btn delete" onclick="deleteEbook(${eb.id}, '${esc(eb.title).replace(/'/g,"\\'")}')"><i class="fas fa-trash"></i></button>
      </span>
    </div>`).join('')}`;
}

function openEbookModal() {
  _editingEbookId = null;
  document.getElementById('ebookModalTitle').innerHTML = '<i class="fas fa-plus" style="color:var(--accent2)"></i> Nouvel ebook';
  ['ebTitle','ebDesc','ebCategory','ebAuthor','ebCover','ebFileUrl'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  ['ebPages','ebPrice'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('ebookModalMsg').textContent = '';
  document.getElementById('ebookModalOverlay').style.display = 'flex';
  setTimeout(() => document.getElementById('ebTitle').focus(), 50);
}

async function editEbook(id) {
  let eb;
  try { const all = await PaganiAPI.admin.getEbooks(); eb = all.find(e => e.id === id); } catch(e) {}
  if (!eb) return;
  _editingEbookId = id;
  document.getElementById('ebookModalTitle').innerHTML = '<i class="fas fa-edit" style="color:var(--accent2)"></i> Modifier l\'ebook';
  document.getElementById('ebTitle').value    = eb.title       || '';
  document.getElementById('ebDesc').value     = eb.description || '';
  document.getElementById('ebCategory').value = eb.category    || '';
  document.getElementById('ebAuthor').value   = eb.author      || '';
  document.getElementById('ebPages').value    = eb.pages       || '';
  document.getElementById('ebPrice').value    = eb.price       || '';
  document.getElementById('ebCover').value    = eb.cover       || '';
  document.getElementById('ebFileUrl').value  = eb.fileUrl     || '';
  document.getElementById('ebookModalMsg').textContent = '';
  document.getElementById('ebookModalOverlay').style.display = 'flex';
}

async function saveEbook() {
  const title    = document.getElementById('ebTitle').value.trim();
  const price    = parseInt(document.getElementById('ebPrice').value);
  const msg      = document.getElementById('ebookModalMsg');
  if (!title)       { msg.textContent = 'Le titre est obligatoire.'; return; }
  if (!price || price < 0) { msg.textContent = 'Entrez un prix valide.'; return; }
  const payload = {
    title,
    description: document.getElementById('ebDesc').value.trim(),
    category:    document.getElementById('ebCategory').value.trim(),
    author:      document.getElementById('ebAuthor').value.trim(),
    pages:       parseInt(document.getElementById('ebPages').value) || null,
    price,
    cover:       document.getElementById('ebCover').value.trim(),
    fileUrl:     document.getElementById('ebFileUrl').value.trim(),
  };
  msg.textContent = '';
  try {
    if (_editingEbookId !== null) {
      await PaganiAPI.admin.updateEbook(_editingEbookId, payload);
    } else {
      await PaganiAPI.admin.createEbook(payload);
    }
    closeEbookModal();
    loadAdminEbooks();
  } catch(e) { msg.textContent = 'Erreur : ' + e.message; }
}

function closeEbookModal() {
  document.getElementById('ebookModalOverlay').style.display = 'none';
  _editingEbookId = null;
}

function deleteEbook(id, title) {
  const overlay = document.getElementById('deleteEbookOverlay');
  document.getElementById('deleteEbookName').textContent = title;
  document.getElementById('deleteEbookConfirmBtn').onclick = async () => {
    overlay.style.display = 'none';
    try { await PaganiAPI.admin.deleteEbook(id); loadAdminEbooks(); }
    catch(e) { alert('Erreur : ' + e.message); }
  };
  overlay.style.display = 'flex';
}

// ===== ADMIN ACHATS EBOOKS =====
async function loadAdminEbookPurchases() {
  const list = document.getElementById('adminEbookPurchasesList');
  if (!list) return;
  list.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i><p>Chargement...</p></div>';
  try {
    _ebookPurchasesCache = await PaganiAPI.admin.getEbookPurchases();
  } catch(e) {
    list.innerHTML = '<div class="history-empty"><i class="fas fa-exclamation-circle"></i><p>Erreur de chargement.</p></div>';
    return;
  }
  const pending = _ebookPurchasesCache.filter(p => p.statut === 'En attente').length;
  const badge = document.getElementById('ebookPurchasesBadge');
  if (badge) { badge.textContent = pending; badge.style.display = pending ? 'inline-flex' : 'none'; }
  _renderEbookPurchases(_ebookPurchasesCache);
}

function filterEbookPurchases(status, btn) {
  document.querySelectorAll('#adminSection-ebookpurchases .admin-filter-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const filtered = status === 'all' ? _ebookPurchasesCache : _ebookPurchasesCache.filter(p => p.statut === status);
  _renderEbookPurchases(filtered);
}

function _renderEbookPurchases(purchases) {
  const list = document.getElementById('adminEbookPurchasesList');
  if (!list) return;
  if (!purchases.length) {
    list.innerHTML = '<div class="history-empty"><i class="fas fa-shopping-bag"></i><p>Aucune demande.</p></div>';
    return;
  }
  list.innerHTML = purchases.map(p => {
    const isApproved = p.statut === 'Approuvé';
    const isPending  = p.statut === 'En attente';
    const statusColor = isApproved ? 'var(--green)' : isPending ? 'var(--gold)' : 'var(--red)';
    const statusIcon  = isApproved ? 'fa-check-circle' : isPending ? 'fa-clock' : 'fa-times-circle';
    return `
    <div class="sub-user-card ${isApproved ? 'sub-user-approved' : isPending ? 'sub-user-pending' : 'sub-user-rejected'}" style="margin-bottom:1rem">
      <div class="sub-user-card-header">
        <div style="display:flex;align-items:center;gap:0.8rem">
          <div style="width:42px;height:42px;border-radius:10px;background:rgba(0,212,170,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fas fa-book-open" style="color:var(--accent2)"></i>
          </div>
          <div>
            <strong style="font-size:0.95rem">${esc(p.userName || '')}</strong>
            <span style="display:block;font-size:0.78rem;color:var(--text2)">${esc(p.ebookTitle || '')}</span>
            <span style="display:block;font-size:0.72rem;color:var(--text2)">${new Date(p.createdAt).toLocaleDateString('fr-FR', {day:'2-digit',month:'short',year:'numeric'})}</span>
          </div>
        </div>
        <span style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.78rem;font-weight:700;color:${statusColor};background:${statusColor}22;border:1px solid ${statusColor}44;padding:0.25rem 0.7rem;border-radius:50px">
          <i class="fas ${statusIcon}"></i> ${p.statut}
        </span>
      </div>
      <div class="sub-user-details">
        <div class="sub-user-detail"><i class="fas fa-tag" style="color:var(--accent2)"></i><span><strong>${Number(p.amount).toLocaleString('fr-FR')} AR</strong><small>Montant</small></span></div>
        <div class="sub-user-detail"><i class="fas fa-mobile-alt" style="color:var(--accent)"></i><span><strong>${esc(p.operator || '—')}</strong><small>${esc(p.phone || '')}</small></span></div>
        ${p.txRef ? `<div class="sub-user-detail"><i class="fas fa-hashtag" style="color:var(--text2)"></i><span><strong>${esc(p.txRef)}</strong><small>Réf. transaction</small></span></div>` : ''}
        ${p.proof ? `<div class="sub-user-detail" style="cursor:pointer" onclick="_showEbookProof('${p.id}','${esc(p.userName || '')}','${esc(p.ebookTitle || '')}')"><i class="fas fa-camera" style="color:var(--accent2)"></i><span><strong style="color:var(--accent2)">Voir la preuve</strong><small>Capture d'—cran</small></span></div>` : ''}
      </div>
      ${isPending ? `
      <div class="sub-user-actions">
        <button class="btn-primary" style="padding:0.45rem 1.1rem;font-size:0.82rem" onclick="_approveEbookPurchase(${p.id},'${esc(p.fileUrl || '')}')">
          <i class="fas fa-check"></i> Approuver
        </button>
        <button class="btn-outline" style="padding:0.45rem 1.1rem;font-size:0.82rem;color:var(--red);border-color:var(--red)" onclick="_rejectEbookPurchase(${p.id})">
          <i class="fas fa-times"></i> Rejeter
        </button>
      </div>` : ''}
    </div>`;
  }).join('');
}

function _showEbookProof(purchaseId, userName, ebookTitle) {
  const p = _ebookPurchasesCache.find(x => x.id == purchaseId);
  if (!p || !p.proof) return;
  document.getElementById('ebookProofModalInfo').textContent = `${userName} — ${ebookTitle}`;
  document.getElementById('ebookProofModalImg').src = p.proof;
  document.getElementById('ebookProofModalDownload').href = p.proof;
  document.getElementById('ebookProofModal').style.display = 'flex';
}

async function _approveEbookPurchase(id, defaultFileUrl) {
  const fileUrl = prompt('URL de téléchargement du fichier PDF (laisser vide pour utiliser celle de l\'ebook) :', defaultFileUrl || '');
  if (fileUrl === null) return; // annulé
  try {
    await PaganiAPI.admin.updateEbookPurchase(id, { statut: 'Approuvé', fileUrl: fileUrl.trim() || defaultFileUrl || '' });
    loadAdminEbookPurchases();
  } catch(e) { alert('Erreur : ' + e.message); }
}

async function _rejectEbookPurchase(id) {
  const reason = prompt('Raison du rejet (optionnel) :') ;
  if (reason === null) return;
  try {
    await PaganiAPI.admin.updateEbookPurchase(id, { statut: 'Rejeté', rejectReason: reason.trim() });
    loadAdminEbookPurchases();
  } catch(e) { alert('Erreur : ' + e.message); }
}

async function loadAdminShares() {
  const kpisEl = document.getElementById('sharesKpis');
  const tableEl = document.getElementById('sharesTableWrap');
  if (!tableEl) return;
  tableEl.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text2)"><i class="fas fa-spinner fa-spin"></i></div>';
  let shares = [];
  try { shares = await PaganiAPI.admin.getShares(); } catch(e) {
    tableEl.innerHTML = '<div class="history-empty"><i class="fas fa-exclamation-circle"></i><p>Erreur de chargement.</p></div>';
    return;
  }
  // KPIs
  if (kpisEl) {
    const total   = shares.length;
    const uniq    = new Set(shares.map(s => s.userId)).size;
    const topPost = shares.reduce((acc, s) => { acc[s.postId] = (acc[s.postId] || 0) + 1; return acc; }, {});
    const topId   = Object.entries(topPost).sort((a,b) => b[1]-a[1])[0];
    const topTitle = topId ? (shares.find(s => s.postId == topId[0])?.title || 'Post #' + topId[0]) : '';
    kpisEl.innerHTML = `
      <div class="video-stat-card"><i class="fab fa-facebook" style="color:#1877f2"></i><strong>${total}</strong><span>Partages total</span></div>
      <div class="video-stat-card"><i class="fas fa-users" style="color:var(--accent)"></i><strong>${uniq}</strong><span>Membres actifs</span></div>
      <div class="video-stat-card" style="flex:2;min-width:200px"><i class="fas fa-fire" style="color:var(--gold)"></i><strong style="font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${esc(topTitle)}</strong><span>Post le plus partag</span></div>`;
  }
  if (!shares.length) {
    tableEl.innerHTML = '<div class="history-empty"><i class="fab fa-facebook" style="opacity:0.3"></i><p>Aucun partage enregistre pour le moment.</p></div>';
    return;
  }
  tableEl.innerHTML = `
    <div class="video-admin-header" style="grid-template-columns:1.5fr 2fr 1.2fr 1fr">
      <span>Membre</span><span>Post partage</span><span>Code parrain</span><span>Date</span>
    </div>
    ${shares.map(s => `
    <div class="video-admin-row" style="grid-template-columns:1.5fr 2fr 1.2fr 1fr">
      <span style="font-weight:600;font-size:0.88rem">${esc(s.userName || '')}</span>
      <span style="font-size:0.82rem;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.title || 'Post #' + s.postId)}</span>
      <span><code style="background:rgba(108,99,255,0.1);color:var(--accent);padding:0.15rem 0.5rem;border-radius:5px;font-size:0.78rem">${esc(s.refCode || '')}</code></span>
      <span style="font-size:0.78rem;color:var(--text2)">${timeAgo(s.createdAt)}</span>
    </div>`).join('')}`;
}

// ===== COMPTEUR ANIM (hero stats) =====
function animateCounters() {
  document.querySelectorAll(".stat strong[data-target]").forEach(el => {
    const target = parseInt(el.dataset.target);
    const suffix = el.dataset.suffix || "";
    let current  = 0;
    const step   = Math.ceil(target / 60);
    const timer  = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current.toLocaleString("fr-FR") + suffix;
      if (current >= target) clearInterval(timer);
    }, 20);
  });
}
// ===== NAVBAR MOBILE =====
function toggleMenu() {
  document.querySelector(".nav-links").classList.toggle("open");
}
// ===== GESTION VIDEOS ADMIN =====
let _editingVideoId = null;
let _adminVideosCache = []; // cache local pour viter des appels rpts
function getVideos() {
  return _adminVideosCache.length ? _adminVideosCache : [];
}
function saveVideos(videos) {
  _adminVideosCache = videos;
  COURSES.length = 0;
  videos.forEach(v => COURSES.push(v.free ? { ...v } : { ...v, videoId: '', driveId: '' }));
}
function filterAdminVideos(filter, btn) {
  document.querySelectorAll('.video-admin-filters .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAdminVideos(filter);
}
async function renderAdminVideos(filter = 'all') {
  const list  = document.getElementById('videoAdminList');
  const stats = document.getElementById('videoAdminStats');
  if (!list) return;
  list.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i><p>Chargement...</p></div>';
  let videos = [];
  try {
    videos = await PaganiAPI.admin.getVideos();
    _adminVideosCache = videos;
  } catch(e) {
    videos = getVideos();
  }
  const free = videos.filter(v => v.free).length;
  const unit = videos.filter(v => !v.free && v.unitPrice).length;
  const pro  = videos.filter(v => !v.free && !v.unitPrice).length;
  if (stats) stats.innerHTML = `
    <div class="video-stat-card"><i class="fas fa-film" style="color:var(--accent)"></i><strong>${videos.length}</strong><span>Total</span></div>
    <div class="video-stat-card"><i class="fas fa-unlock" style="color:var(--green)"></i><strong>${free}</strong><span>Gratuites</span></div>
    <div class="video-stat-card"><i class="fas fa-tag" style="color:var(--accent2)"></i><strong>${unit}</strong><span>Achat unitaire</span></div>
    <div class="video-stat-card"><i class="fas fa-crown" style="color:var(--gold)"></i><strong>${pro}</strong><span>Abonnement Pro+</span></div>`;
  let filtered = videos;
  if (filter === 'free')       filtered = videos.filter(v => v.free);
  else if (filter === 'paid')  filtered = videos.filter(v => !v.free);
  else if (filter === 'unit')  filtered = videos.filter(v => !v.free && v.unitPrice);
  else if (filter === 'pro')   filtered = videos.filter(v => !v.free && !v.unitPrice);
  else if (filter !== 'all')   filtered = videos.filter(v => v.category === filter);
  if (filtered.length === 0) {
    list.innerHTML = '<div class="history-empty"><i class="fas fa-film"></i><p>Aucune video dans cette categorie.</p></div>';
    return;
  }
  list.innerHTML = `
    <div class="video-admin-header">
      <span>Titre</span><span>Categorie</span><span>Niveau</span><span>Acces</span><span>Actions</span>
    </div>
    ${filtered.map(v => `
    <div class="video-admin-row" id="vrow-${v.id}">
      <span class="video-admin-title">
        <i class="${v.icon || 'fas fa-play-circle'}" style="color:var(--accent);margin-right:0.5rem"></i>
        <span><strong>${v.title}</strong><small>${v.duration || ''}</small></span>
      </span>
      <span><span class="course-tag">${v.category.toUpperCase()}</span></span>
      <span style="font-size:0.82rem;color:var(--text2)">${v.level || ''}</span>
      <span>
        ${v.free
          ? `<button class="access-toggle-btn free" onclick="setVideoAccess(${v.id},'pro')"><i class="fas fa-unlock"></i> Gratuit</button>`
          : v.unitPrice
            ? `<button class="access-toggle-btn unit" onclick="setVideoAccess(${v.id},'pro')"><i class="fas fa-tag"></i> Achat unitaire <small style="opacity:0.75">${Number(v.unitPrice).toLocaleString('fr-FR')} AR</small></button>`
            : `<button class="access-toggle-btn paid" onclick="setVideoAccess(${v.id},'free')"><i class="fas fa-crown"></i> Abonnement Pro+</button>`
        }
      </span>
      <span class="video-admin-actions">
        <button class="video-action-btn edit" onclick="editVideo(${v.id})" title="Modifier"><i class="fas fa-edit"></i></button>
        <button class="video-action-btn delete" onclick="deleteVideo(${v.id})" title="Supprimer"><i class="fas fa-trash"></i></button>
      </span>
    </div>`).join('')}`;
}
async function toggleVideoAccess(id) {
  const videos = getVideos();
  const v = videos.find(v => v.id === id);
  if (!v) return;
  v.free = !v.free;
  try {
    await PaganiAPI.admin.updateVideo(id, { free: v.free });
  } catch(e) { alert('Erreur serveur : ' + e.message); return; }
  renderAdminVideos(_currentAdminFilter());
}
async function setVideoAccess(id, targetType) {
  const v = getVideos().find(v => v.id === id);
  if (!v) return;
  // Si on clique sur "Achat unitaire" ? ouvrir un mini-menu pour choisir
  if (!v.free && v.unitPrice && targetType === 'pro') {
    const row = document.getElementById(`vrow-${id}`);
    if (!row) return;
    // Verifier si un menu existe deja
    if (row.querySelector('.access-menu')) { row.querySelector('.access-menu').remove(); return; }
    const menu = document.createElement('div');
    menu.className = 'access-menu';
    menu.innerHTML = `
      <button onclick="_applyAccess(${id},'free')"><i class="fas fa-unlock" style="color:var(--green)"></i> Passer Gratuit</button>
      <button onclick="_applyAccess(${id},'pro')"><i class="fas fa-crown" style="color:var(--gold)"></i> Passer Abonnement Pro+</button>
      <button onclick="this.closest('.access-menu').remove()" style="color:var(--text2)"><i class="fas fa-times"></i> Annuler</button>`;
    row.querySelector('span:nth-child(4)').appendChild(menu);
    return;
  }
  await _applyAccess(id, targetType);
}
async function _applyAccess(id, targetType) {
  const v = getVideos().find(v => v.id === id);
  if (!v) return;
  const payload = targetType === 'free'
    ? { free: true,  unitPrice: null, accessType: 'free' }
    : targetType === 'pro'
    ? { free: false, unitPrice: null, accessType: 'paid' }
    : { free: false, accessType: 'unit' };
  try {
    await PaganiAPI.admin.updateVideo(id, payload);
    Object.assign(v, payload);
    renderAdminVideos(_currentAdminFilter());
  } catch(e) { alert('Erreur serveur : ' + e.message); }
}
function _currentAdminFilter() {
  const active = document.querySelector('.video-admin-filters .filter-btn.active');
  if (!active) return 'all';
  const txt = active.textContent.trim().toLowerCase();
  if (txt.includes('gratuit'))         return 'free';
  if (txt.includes('achat unitaire'))  return 'unit';
  if (txt.includes('abonnement'))      return 'pro';
  if (txt.includes('payant'))          return 'paid';
  if (txt === 'toutes')                return 'all';
  return txt;
}
function _onAccessTypeChange(type) {
  const priceGroup = document.getElementById('vPriceGroup');
  if (priceGroup) priceGroup.style.display = type === 'unit' ? 'block' : 'none';
  // Synchroniser les radios si appel programmatiquement
  const map = { free: 'vFree', paid: 'vPaid', unit: 'vUnit', pro: 'vPaid' };
  const radioId = map[type];
  if (radioId) {
    const el = document.getElementById(radioId);
    if (el && !el.checked) el.checked = true;
  }
}
function openVideoModal() {
  _editingVideoId = null;
  _thumbnailBase64 = '';
  document.getElementById('videoModalTitle').innerHTML = '<i class="fas fa-plus" style="color:var(--accent)"></i> Ajouter une video';
  ['vTitle','vDesc','vVideoDescription','vDuration','vVideoId','vDriveId','vThumbnailUrl','vPrice'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  document.getElementById('vCategory').value = 'debutant';
  document.getElementById('vLevel').value    = 'Debutant';
  document.getElementById('vFree').checked   = true;
  if (document.getElementById('vUnit')) document.getElementById('vUnit').checked = false;
  if (document.getElementById('vPaid')) document.getElementById('vPaid').checked = false;
  document.getElementById('vSource').value   = 'youtube';
  _onAccessTypeChange('free');
  _toggleSourceFields('youtube');
  _hidePreview();
  removeThumbnail();
  _populateModuleSelect(null);
  document.getElementById('videoModalOverlay').style.display = 'flex';
}
async function editVideo(id) {
  // Charger depuis le serveur pour avoir le driveId en clair
  let v = null;
  if (window.PaganiAPI) {
    try {
      const all = await PaganiAPI.admin.getVideos();
      v = all.find(x => x.id === id);
    } catch(e) {}
  }
  if (!v) v = getVideos().find(x => x.id === id);
  if (!v) return;
  _editingVideoId = id;
  document.getElementById('videoModalTitle').innerHTML = '<i class="fas fa-edit" style="color:var(--accent)"></i> Modifier la video';
  document.getElementById('vTitle').value    = v.title    || '';
  document.getElementById('vDesc').value     = v.description || v.desc || '';
  document.getElementById('vVideoDescription').value = v.videoDescription || '';
  document.getElementById('vDuration').value = v.duration || '';
  document.getElementById('vVideoId').value  = v.videoId  || '';
  // Le serveur retourne le driveId en clair, localStorage le retourne chiffre
  document.getElementById('vDriveId').value  = window.PaganiAPI ? (v.driveId || '') : (v.driveId ? _decode(v.driveId) : '');
  document.getElementById('vCategory').value = v.category || 'debutant';
  document.getElementById('vLevel').value    = v.level    || 'Debutant';
  // Dterminer le type d'acces
  const accessType = v.free ? 'free' : (v.accessType === 'unit' || v.unitPrice ? 'unit' : 'paid');
  const radioEl = document.getElementById(accessType === 'free' ? 'vFree' : accessType === 'unit' ? 'vUnit' : 'vPaid');
  if (radioEl) radioEl.checked = true;
  _onAccessTypeChange(accessType);
  // Prix unitaire
  const priceEl = document.getElementById('vPrice');
  if (priceEl) priceEl.value = v.unitPrice || '';
  const src = v.videoSource || 'youtube';
  document.getElementById('vSource').value = src;
  _toggleSourceFields(src);
  if (src === 'youtube' && v.videoId) _showPreview('youtube', v.videoId);
  else if (src === 'drive' && v.driveId) _showPreview('drive', window.PaganiAPI ? v.driveId : _decode(v.driveId));
  else _hidePreview();
  // Thumbnail
  _thumbnailBase64 = v.thumbnail || '';
  if (_thumbnailBase64) _showThumbnailPreview(_thumbnailBase64);
  else removeThumbnail();
  _populateModuleSelect(v.moduleId || null);
  document.getElementById('videoModalOverlay').style.display = 'flex';
}
async function saveVideo() {
  const title       = document.getElementById('vTitle').value.trim();
  const desc        = document.getElementById('vDesc').value.trim();
  const duration    = document.getElementById('vDuration').value.trim();
  const category    = document.getElementById('vCategory').value;
  const level       = document.getElementById('vLevel').value;
  const accessRadio = document.querySelector('input[name="vAccess"]:checked');
  const accessType  = accessRadio ? accessRadio.value : 'free';
  const free        = accessType === 'free';
  const unitPrice   = accessType === 'unit' ? (parseInt(document.getElementById('vPrice').value) || null) : null;
  const videoSource = document.getElementById('vSource').value;
  const videoId     = videoSource === 'youtube' ? document.getElementById('vVideoId').value.trim() : '';
  const driveRaw    = videoSource === 'drive'   ? _extractDriveId(document.getElementById('vDriveId').value.trim()) : '';
  if (!title) { alert('Le titre est obligatoire.'); return; }
  if (accessType === 'unit' && !unitPrice) { alert('Entrez un prix unitaire.'); return; }
  if (videoSource === 'drive' && !free && !driveRaw) { alert('Entrez l\'ID ou le lien Google Drive.'); return; }
  const payload = { title, desc, duration, category, level, free, accessType, unitPrice, videoSource, videoId,
    moduleId: parseInt(document.getElementById('vModuleId')?.value) || null,
    driveId: driveRaw || '',
    videoDescription: document.getElementById('vVideoDescription')?.value.trim() || '',
    thumbnail: _thumbnailBase64 || (videoSource === 'youtube' && videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '') };
  try {
    if (_editingVideoId !== null) {
      await PaganiAPI.admin.updateVideo(_editingVideoId, payload);
    } else {
      await PaganiAPI.admin.createVideo(payload);
    }
    closeVideoModal();
    renderAdminVideos(_currentAdminFilter());
  } catch(e) {
    alert('Erreur serveur : ' + e.message);
  }
}
async function deleteVideo(id) {
  const videos = getVideos();
  const v = videos.find(v => v.id === id);
  if (!v) return;
  const overlay = document.getElementById('deleteVideoOverlay');
  document.getElementById('deleteVideoName').textContent = v.title;
  document.getElementById('deleteVideoConfirmBtn').onclick = async () => {
    overlay.style.display = 'none';
    try {
      await PaganiAPI.admin.deleteVideo(id);
    } catch(e) { alert('Erreur serveur : ' + e.message); return; }
    renderAdminVideos(_currentAdminFilter());
  };
  overlay.style.display = 'flex';
}
function _toggleSourceFields(src) {
  document.getElementById('vYoutubeFields').style.display   = src === 'youtube' ? 'block' : 'none';
  document.getElementById('vDriveFields').style.display     = src === 'drive'   ? 'block' : 'none';
  document.getElementById('vPreviewBtnYt').style.display    = src === 'youtube' ? 'inline-flex' : 'none';
  document.getElementById('vPreviewBtnDrive').style.display = src === 'drive'   ? 'inline-flex' : 'none';
  _hidePreview();
}
function closeVideoModal() {
  document.getElementById('videoModalOverlay').style.display = 'none';
  _hidePreview();
  _editingVideoId = null;
}
function _closeVideoModalOutside(e) {
  if (e.target === document.getElementById('videoModalOverlay')) closeVideoModal();
}
function _showPreview(source, id) {
  const wrap  = document.getElementById('vPreviewWrap');
  const frame = document.getElementById('vPreviewFrame');
  if (!wrap || !frame) return;
  frame.src = source === 'drive'
    ? `https://drive.google.com/file/d/${id}/preview`
    : `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
  wrap.style.display = 'block';
}
function _hidePreview() {
  const wrap  = document.getElementById('vPreviewWrap');
  const frame = document.getElementById('vPreviewFrame');
  if (wrap)  wrap.style.display = 'none';
  if (frame) frame.src = '';
}
function previewYoutube() {
  const id = document.getElementById('vVideoId').value.trim();
  if (!id) { alert('Entrez d\'abord un ID YouTube.'); return; }
  _showPreview('youtube', id);
  _autoThumbnailFromYoutube(id);
}
function previewDrive() {
  const raw = document.getElementById('vDriveId').value.trim();
  const id  = _extractDriveId(raw);
  if (!id) { alert('Entrez d\'abord un lien ou ID Google Drive valide.'); return; }
  _showPreview('drive', id);
}
function _extractDriveId(input) {
  if (!input) return '';
  const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return input.replace(/[^a-zA-Z0-9_-]/g, '');
}
function _setPayReason(text) {
  const input = document.getElementById('togglePayReason');
  if (input) { input.value = text; input.focus(); }
}
// ===== FOLLOWERS DASHBOARD =====
async function _loadProfileFollowStats(userId) {
  const elFollowers = document.getElementById('pStatFollowers');
  const elFollowing = document.getElementById('pStatFollowing');
  if (!elFollowers || !elFollowing) return;
  try {
    const stats = await PaganiAPI.getFollowStats(userId);
    elFollowers.textContent = stats.followers ?? 0;
    elFollowing.textContent = stats.following ?? 0;
  } catch(e) {
    elFollowers.textContent = '0';
    elFollowing.textContent = '0';
  }
}
async function openDashFollowModal(type) {
  const user = getUser();
  if (!user) return;
  const modal = document.getElementById('dashFollowModal');
  const title = document.getElementById('dashFollowModalTitle');
  const list  = document.getElementById('dashFollowModalList');
  if (!modal || !title || !list) return;
  title.innerHTML = type === 'followers'
    ? '<i class="fas fa-users" style="color:var(--accent)"></i> Mes Followers'
    : '<i class="fas fa-user-check" style="color:var(--accent2)"></i> Mes Abonnements';
  list.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text2)"><i class="fas fa-spinner fa-spin"></i></div>';
  modal.style.display = 'flex';
  try {
    const users = type === 'followers'
      ? await PaganiAPI.getFollowers(user.id)
      : await PaganiAPI.getFollowing(user.id);
    if (!users.length) {
      list.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text2);font-size:0.85rem">
        <i class="fas fa-${type === 'followers' ? 'users' : 'user-check'}" style="font-size:2rem;opacity:0.25;display:block;margin-bottom:0.6rem"></i>
        ${type === 'followers' ? 'Aucun follower pour le moment.' : 'Vous ne suivez personne pour le moment.'}
      </div>`;
      return;
    }
    const planColors = { Starter: 'var(--text2)', Pro: 'var(--accent)', Elite: 'var(--gold)' };
    list.innerHTML = users.map(u => {
      const av = u.avatarPhoto
        ? `<img src="${u.avatarPhoto}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0" />`
        : `<div class="avatar-circle" style="width:42px;height:42px;min-width:42px;font-size:0.82rem;background:${u.avatarColor||'#6c63ff'}">${getInitials(u.name)}</div>`;
      return `
        <div onclick="window.location.href='profil.html?id=${u.id}'"
          style="display:flex;align-items:center;gap:0.8rem;padding:0.65rem 0.5rem;border-radius:10px;cursor:pointer;transition:background 0.15s"
          onmouseover="this.style.background='rgba(108,99,255,0.08)'" onmouseout="this.style.background='transparent'">
          ${av}
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</div>
            <div style="font-size:0.72rem;color:${planColors[u.plan]||'var(--text2)'}">${u.plan}</div>
          </div>
          <i class="fas fa-chevron-right" style="color:var(--text2);font-size:0.75rem;opacity:0.4"></i>
        </div>`;
    }).join('');
  } catch(e) {
    list.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--red);font-size:0.85rem">Erreur de chargement</div>';
  }
}
function closeDashFollowModal() {
  const modal = document.getElementById('dashFollowModal');
  if (modal) modal.style.display = 'none';
}
// ===== MESSAGERIE PRIVE =====
let _currentChatUserId   = null;
let _currentChatUserName = null;
let _chatPollingTimer    = null;

// Gestion du clavier virtuel mobile (visualViewport) + resize desktop
function _initVirtualKeyboard() {
  const body = document.querySelector('.msg-page-body');
  if (!body) return;

  function _applyHeight() {
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    body.style.height = vh + 'px';
    const msgs = document.getElementById('chatMessages');
    if (msgs) setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 50);
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _applyHeight);
    window.visualViewport.addEventListener('scroll', _applyHeight);
  }
  window.addEventListener('resize', _applyHeight);
  _applyHeight();
}
// Appela une fois au chargement de la page messages
if (document.getElementById('msgApp')) {
  document.addEventListener('DOMContentLoaded', _initVirtualKeyboard);
}
// Construit l'avatar HTML pour la messagerie
function _msgAvatar(u, size) {
  const s = size || 40;
  if (u.avatarPhoto) {
    return `<img src="${u.avatarPhoto}" style="width:${s}px;height:${s}px;border-radius:50%;object-fit:cover" />`;
  }
  return `<div class="avatar-circle msg-bubble-avatar" style="width:${s}px;height:${s}px;min-width:${s}px;font-size:${Math.round(s*0.3)}px;background:${u.avatarColor||'#6c63ff'}">${getInitials(u.name)}</div>`;
}
// Aperçu du dernier événement dans la liste des conversations (message ou réaction)
function _convPreview(c) {
  const me = getUser();
  const myId = me ? me.id : null;
  // Comparer les dates : réaction vs dernier message
  const rxDate  = c.lastRxDate  ? new Date(c.lastRxDate).getTime()  : 0;
  const msgDate = c.lastDate    ? new Date(c.lastDate).getTime()    : 0;
  if (c.lastRxEmoji && rxDate >= msgDate) {
    // La réaction est plus récente (ou égale) au dernier message
    const iMReacted = String(c.lastRxUserId) === String(myId);
    const preview   = c.lastRxMsgContent ? (c.lastRxMsgContent.length > 20 ? c.lastRxMsgContent.slice(0,20)+'...' : c.lastRxMsgContent) : (c.lastRxMsgImage ? 'Photo' : 'Photo');
    if (iMReacted) {
      return c.lastRxEmoji + ' Vous avez réagi : ' + preview;
    } else {
      return c.lastRxEmoji + ' ' + c.name.split(' ')[0] + ' a réagi : ' + preview;
    }
  }
  // Sinon : dernier message normal
  if (!c.lastContent && c.lastImage) return '📷 Photo';
  return esc(c.lastContent) || 'Démarrer la conversation';
}

async function loadConversations() {
  const list = document.getElementById('convList');
  if (!list) return;
  if (!list.children.length) list.innerHTML = '<div class="mpx-conv-empty"><i class="fas fa-spinner fa-spin"></i><p>Chargement...</p></div>';
  try {
    const convs = await PaganiAPI.getConversations();
    _allConvs = convs;
    if (!convs.length) {
      list.innerHTML = '<div class="mpx-conv-empty"><i class="fas fa-comment-slash"></i><p>Aucune conversation.<br>Envoyez un message depuis un profil.</p></div>';
      return;
    }
    // Supprimer le spinner s'il est encore là
    const _spinner = list.querySelector('.mpx-conv-empty');
    if (_spinner) _spinner.remove();

    // Refresh silencieux : diff DOM sans vider la liste
    const _existingIds = new Set([...list.querySelectorAll('.mpx-conv-item')].map(el => el.dataset.userid));
    const _newIds = new Set(convs.map(c => String(c.id)));
    _existingIds.forEach(id => { if (!_newIds.has(id)) { const el = list.querySelector('[data-userid="'+id+'"]'); if (el) el.remove(); } });
    convs.forEach(function(c, idx) {
      const unread   = parseInt(c.unreadCount) || 0;
      const isActive = _currentChatUserId === c.id;
      const av = c.avatarPhoto
        ? '<img src="'+c.avatarPhoto+'" style="width:44px;height:44px;border-radius:50%;object-fit:cover" />'
        : '<div class="avatar-circle" style="width:44px;height:44px;min-width:44px;font-size:0.85rem;background:'+(c.avatarColor||'#6c63ff')+'">'+getInitials(c.name)+'</div>';
      const timeStr = c.lastDate ? timeAgo(c.lastDate) : '';
      let item = list.querySelector('[data-userid="'+c.id+'"]');
      if (!item) {
        item = document.createElement('div');
        item.dataset.userid = String(c.id);
        item.dataset.name = c.name.replace(/"/g,'&quot;');
        item.addEventListener('click', (function(cv){ return function(){ openChat(cv.id,cv.name,cv.avatarColor||'#6c63ff',cv.avatarPhoto||'',cv.plan||''); }; })(c));
        list.appendChild(item);
      }
      const items = list.querySelectorAll('.mpx-conv-item');
      if (items[idx] !== item) list.insertBefore(item, items[idx] || null);
      item.className = 'mpx-conv-item' + (isActive ? ' active' : '');
      item.innerHTML =
        '<div class="mpx-conv-av">'+av+(unread ? '<span class="mpx-conv-unread">'+(unread > 9 ? '9+' : unread)+'</span>' : '')+'</div>'+
        '<div class="mpx-conv-body"><div class="mpx-conv-name">'+esc(c.name)+'</div><div class="mpx-conv-preview">'+_convPreview(c)+'</div></div>'+
        '<div class="mpx-conv-right">'+(timeStr ? '<span class="mpx-conv-time">'+timeStr+'</span>' : '')+'<div class="mpx-conv-presence-slot" id="pres-'+c.id+'"></div></div>';
    });
    // Statut de présence dans le slot dédié (colonne droite)
    if (window.PaganiAPI && convs.length) {
      convs.forEach(function(cv) {
        PaganiAPI.getPresence(cv.id).then(function(p) {
          var item = list.querySelector('[data-userid="'+cv.id+'"]');
          if (!item) return;
          // Point vert sur l'avatar via classe CSS (::after)
          var av = item.querySelector('.mpx-conv-av');
          if (av) {
            if (p && p.online) av.classList.add('mpx-conv-av--online');
            else av.classList.remove('mpx-conv-av--online');
          }
          // Texte de présence dans le slot dédié (colonne droite, sous le time)
          var slot = document.getElementById('pres-'+cv.id);
          if (slot) {
            if (p && p.online) {
              slot.innerHTML = '<span class="mpx-pres-online">En ligne</span>';
            } else {
              slot.innerHTML = '';
            }
          }
        }).catch(function(){});
      });
    }
    // Ouvrir automatiquement si redirig depuis une notification
    if (window._openChatWith) {
      const target = convs.find(c => c.id === window._openChatWith);
      if (target) openChat(target.id, target.name, target.avatarColor || '#6c63ff', target.avatarPhoto || '', target.plan || '');
      window._openChatWith = null;
    }
  } catch(e) {
    list.innerHTML = '<div class="mpx-conv-empty" style="color:var(--red)"><i class="fas fa-exclamation-circle"></i><p>Erreur de chargement</p></div>';
  }
}
async function openChat(userId, userName, avatarColor, avatarPhoto, userPlan) {
  _currentChatUserId   = userId;
  window.__typingChatUserId = userId;
  _currentChatUserName = userName;
  _chatMsgsCache = []; // Reinitialiser le cache a chaque nouvelle conversation
  _chatOldestTs  = null; // Reset pagination
  _chatAllLoaded = false;
  _chatLoadingMore = false;
  _chatBusy = false;
  const header   = document.getElementById('chatHeader');
  const headerAv = document.getElementById('chatHeaderAvatar');
  const headerNm = document.getElementById('chatHeaderName');
  const headerSub = document.getElementById('chatHeaderSub');
  const empty    = document.getElementById('chatEmpty');
  const messages = document.getElementById('chatMessages');
  const inputRow = document.getElementById('chatInputRow');
  const profLink = document.getElementById('chatProfileLink');
  if (!messages) return;
  // Mettre a jour l'URL pour persister l'etat au refresh
  const newUrl = window.location.pathname + '?with=' + userId;
  if (window.location.search !== '?with=' + userId) {
    history.pushState({ chatWith: userId, chatName: userName }, '', newUrl);
  }
  // Afficher les elements
  if (header)   header.style.display   = 'flex';
  if (empty)    empty.style.display    = 'none';
  if (messages) messages.style.display = 'flex';
  if (inputRow) inputRow.style.display = 'block';
  if (profLink) profLink.href = `profil.html?id=${userId}`;
  const avatarLink = document.getElementById('chatHeaderAvatar');
  const infoLink   = document.getElementById('chatHeaderInfoLink');
  if (avatarLink) avatarLink.href = `profil.html?id=${userId}`;
  if (infoLink)   infoLink.href   = `profil.html?id=${userId}`;
  // Avatar + nom dans l'en-tte
  if (headerAv) {
    headerAv.className = 'mpx-chat-avatar';
    headerAv.innerHTML = avatarPhoto
      ? `<img src="${avatarPhoto}" style="width:40px;height:40px;border-radius:50%;object-fit:cover" />`
      : `<div class="avatar-circle" style="width:40px;height:40px;min-width:40px;font-size:0.8rem;background:${avatarColor||'#6c63ff'}">${getInitials(userName)}</div>`;
  }
  if (headerNm) headerNm.textContent = userName;
  if (headerSub) {
    const planColors = { Pro: 'var(--accent)', Elite: 'var(--gold)', Starter: 'var(--text2)' };
    const color = planColors[userPlan] || 'var(--text2)';
    const planHtml = userPlan
      ? `<span style="color:${color}">Plan ${userPlan}</span>`
      : '';
    headerSub.innerHTML = '';
    // Verifier le statut en ligne
    if (window.PaganiAPI) {
      var _presenceForUserId = userId;
      PaganiAPI.getPresence(userId).then(function(p) {
        // Ignorer si l'utilisateur a change entre temps
        if (_currentChatUserId !== _presenceForUserId) return;
        const isOnline = p && p.online;
        if (headerAv) { if (isOnline) headerAv.classList.add('mpx-chat-avatar-online'); else headerAv.classList.remove('mpx-chat-avatar-online'); }
        const onlineText = isOnline ? 'En ligne' : _presenceTimeAgo(p && p.lastSeen);
        if (document.getElementById('chatHeaderSub') === headerSub) {
          headerSub.className = 'mpx-chat-sub' + (isOnline ? ' mpx-chat-sub--online' : '');
          headerSub.textContent = onlineText;
          headerSub.style.display = onlineText ? 'flex' : 'none';
        }
      }).catch(function(){});
    }
  }
  document.title = `${userName} - Messages`;
  // Loader
  messages.innerHTML = '<div class="mpx-loading"><span></span><span></span><span></span></div>';
  // Mobile : afficher la colonne chat
  const sidebar = document.getElementById('mpxSidebar') || document.getElementById('msgConvCol');
  const chat    = document.getElementById('mpxChat')    || document.getElementById('msgChatCol');
  if (sidebar) sidebar.classList.add('msg-hidden');
  if (chat)    chat.classList.add('msg-visible');
  document.body.classList.add('chat-open');
  // Animation slide (desktop + mobile)
  if (chat) {
    chat.classList.remove('mpx-chat-leaving');
    chat.classList.add('mpx-chat-entering');
    chat.addEventListener('animationend', () => chat.classList.remove('mpx-chat-entering'), { once: true });
  }
  // Mettre a jour la liste (marquer actif)
  loadConversations();
  await _loadChatMessages(userId, true);
  _rxCache = {};
  // Marquer les messages comme lus (ticks ??)
  if (window.PaganiAPI) PaganiAPI.markMessagesRead(userId).catch(() => {});
  _initChatScrollBtn(document.getElementById('chatMessages'));
  // Polling toutes les 5s
  if (_chatPollingTimer) clearInterval(_chatPollingTimer);
  var _presenceRefreshCount = 0;
  _chatPollingTimer = setInterval(() => {
    if (_currentChatUserId === userId && !_chatBusy) {
      _loadChatMessages(userId);
      loadConversations();
      _updateMsgBadge();
      // Rafraîchir le statut de présence toutes les 30s (1 fois sur 6)
      _presenceRefreshCount++;
      if (_presenceRefreshCount % 6 === 0 && window.PaganiAPI) {
        PaganiAPI.getPresence(userId).then(function(p) {
          var hSub = document.getElementById('chatHeaderSub');
          var hAv  = document.getElementById('chatHeaderAvatar');
          if (!hSub) return;
          var planColors = { Pro: 'var(--accent)', Elite: 'var(--gold)', Starter: 'var(--text2)' };
          var color = planColors[userPlan] || 'var(--text2)';
          var planHtml = userPlan ? '<span style="color:'+color+'">Plan '+userPlan+'</span>' : '';
          var isOnline = p && p.online;
          if (hAv) { if (isOnline) hAv.classList.add('mpx-chat-avatar-online'); else hAv.classList.remove('mpx-chat-avatar-online'); }
          var onlineText = isOnline ? 'En ligne' : _presenceTimeAgo(p && p.lastSeen);
          hSub.className = 'mpx-chat-sub' + (isOnline ? ' mpx-chat-sub--online' : '');
          hSub.textContent = onlineText;
          hSub.style.display = onlineText ? 'flex' : 'none';
        }).catch(function(){});
      }
    }
  }, 5000);
}
function closeChatMobile() {
  const sidebar = document.getElementById('mpxSidebar') || document.getElementById('msgConvCol');
  const chat    = document.getElementById('mpxChat')    || document.getElementById('msgChatCol');
  document.body.classList.remove('chat-open');
  const body = document.querySelector('.msg-page-body');
  if (body) body.style.height = '';
  // Retour immdiat a la sidebar sans attendre animationend
  if (chat)    { chat.classList.remove('msg-visible'); chat.classList.remove('mpx-chat-entering'); chat.classList.remove('mpx-chat-leaving'); }
  if (sidebar) sidebar.classList.remove('msg-hidden');
  _currentChatUserId   = null;
  window.__typingChatUserId = null;
  _currentChatUserName = null;
  if (_chatPollingTimer) { clearInterval(_chatPollingTimer); _chatPollingTimer = null; }
  history.pushState({}, '', window.location.pathname);
  document.title = 'Messages - Pagani Digital';
  const header   = document.getElementById('chatHeader');
  const messages = document.getElementById('chatMessages');
  const inputRow = document.getElementById('chatInputRow');
  if (header)   header.style.display   = 'none';
  if (window.innerWidth > 580) { const empty = document.getElementById('chatEmpty'); if (empty) empty.style.display = 'flex'; }
  if (messages) messages.style.display = 'none';
  if (inputRow) inputRow.style.display = 'none';
}
// Grer le bouton retour du navigateur
window.addEventListener('popstate', (e) => {
  if (!document.getElementById('mpxChat')) return;
  const params = new URLSearchParams(window.location.search);
  if (!params.get('with')) {
    // Retour a la liste
    const sidebar = document.getElementById('mpxSidebar');
    const chat    = document.getElementById('mpxChat');
    if (sidebar) sidebar.classList.remove('msg-hidden');
    if (chat)    chat.classList.remove('msg-visible');
    document.body.classList.remove('chat-open');
    _currentChatUserId   = null;
    _currentChatUserName = null;
    if (_chatPollingTimer) { clearInterval(_chatPollingTimer); _chatPollingTimer = null; }
    const header   = document.getElementById('chatHeader');
    const empty    = document.getElementById('chatEmpty');
    const messages = document.getElementById('chatMessages');
    const inputRow = document.getElementById('chatInputRow');
    if (header)   header.style.display   = 'none';

    if (messages) messages.style.display = 'none';
    if (inputRow) inputRow.style.display = 'none';
  }
});
function _formatMsgTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
// ===== NOTIFICATION SONORE MESSAGES =====
function _playMsgSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch(e) {}
}
// Cache local des messages affiches (id -> true) pour eviter de reconstruire le DOM
let _chatMsgsCache = [];

let _chatImageBase64 = '';
let _replyMsg = null; // { id, content, senderName, isMine }

function _setReply(msgId, content, senderName, isMine) {
  _replyMsg = { id: msgId, content, senderName, isMine };
  const bar = document.getElementById('chatReplyBar');
  const name = document.getElementById('chatReplyName');
  const text = document.getElementById('chatReplyText');
  if (!bar) return;
  if (name) name.textContent = isMine ? 'Vous' : senderName;
  if (text) text.textContent = content || '📷 Photo';
  bar.style.display = 'flex';
  document.getElementById('chatInput')?.focus();
}

function _clearReply() {
  _replyMsg = null;
  const bar = document.getElementById('chatReplyBar');
  if (bar) bar.style.display = 'none';
}

function _previewChatImage(input) {
  const file2 = input.files[0];
  if (!file2) return;
  if (file2.size > 2 * 1024 * 1024) { alert('Image trop grande (max 2 Mo).'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = e => {
    _chatImageBase64 = e.target.result;
    const preview = document.getElementById('chatImagePreview');
    const img     = document.getElementById('chatImagePreviewImg');
    if (img)     img.src = _chatImageBase64;
    if (preview) preview.style.display = 'block';
  };
  reader.readAsDataURL(file2);
}
function _removeChatImage() {
  _chatImageBase64 = '';
  const preview = document.getElementById('chatImagePreview');
  const input2  = document.getElementById('chatImageInput');
  if (preview) preview.style.display = 'none';
  if (input2)  input2.value = '';
}
function _openMsgImage(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem;cursor:zoom-out';
  overlay.innerHTML = '<img src="' + src + '" style="max-width:100%;max-height:90vh;border-radius:12px;object-fit:contain" />';
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}
function _buildBubbleHTML(m, isMine, otherAv, dateSep, nextIsSame, isNew) {
  const avatarHtml = (!isMine && !nextIsSame)
    ? `<div class="mpx-bubble-av">${otherAv}</div>`
    : (!isMine ? `<div class="mpx-bubble-av" style="visibility:hidden"></div>` : '');
  const timeStr   = _formatMsgTime(m.createdAt);
  const animClass = isNew ? ' mpx-bubble-new' : '';
  const imageHtml = m.image ? '<div class="mpx-bubble-img-wrap"><img src="' + m.image + '" class="mpx-bubble-img" onclick="_openMsgImage(this.src)" /></div>' : '';
  const textHtml  = m.content ? esc(m.content) : '';
  const tickHtml  = isMine
    ? (m.read
        ? '<span class="mpx-tick mpx-tick-read" title="Vu"><i class="fas fa-check-double"></i></span>'
        : '<span class="mpx-tick" title="Envoy\u00e9"><i class="fas fa-check"></i></span>')
    : '';
  const senderName = isMine ? 'Vous' : (_currentChatUserName || '');
  const quoteHtml = m.replyTo
    ? `<div class="mpx-bubble-quote" onclick="_scrollToMsg(${m.replyTo.id})">
        <div class="mpx-bubble-quote-inner">
          <span class="mpx-bubble-quote-name">${esc(m.replyTo.senderName || '')}</span>
          <span class="mpx-bubble-quote-text">${esc(m.replyTo.content || '📷 Photo')}</span>
        </div>
       </div>`
    : '';
  const safeContent = (m.content || '').replace(/\\/g, '\\\\').replace(/'/g, '\x27');
  const safeSender  = senderName.replace(/\\/g, '\\\\').replace(/'/g, '\x27');
  const rowSwipeAttr = `data-msgid="${m.id}" ontouchstart="_onBubbleTouchStart(event,${m.id},'${safeContent}','${safeSender}',${isMine})" ontouchend="_onBubbleTouchEnd(event)" ontouchcancel="_onBubbleTouchEnd(event)" ontouchmove="_onBubbleTouchMove(event)"`;
  const bubbleLpAttr = `ontouchstart="_startMsgLongPress(event,${m.id})" ontouchend="_cancelMsgLongPress()" ontouchcancel="_cancelMsgLongPress()"`;
  const rxTrigger = `<button class="mpx-rx-trigger" title="R\u00e9agir" onclick="event.stopPropagation();_showRxPicker(event,${m.id})"><i class="fas fa-smile"></i></button>`;
  const replyBtn  = `<button class="mpx-reply-btn" title="R\u00e9pondre" onclick="event.stopPropagation();_setReply(${m.id},'${safeContent}','${safeSender}',${isMine})"><i class="fas fa-reply"></i></button>`;
  const rxZone = `<div class="mpx-bubble-reactions" id="rx-zone-${m.id}"></div>`;
  return dateSep + `<div class="mpx-bubble-row${isMine ? ' mine' : ''}${animClass}" ${rowSwipeAttr} id="msg-${m.id}">
    ${avatarHtml}
    <div class="mpx-bubble-wrap">
      ${replyBtn}
      <div class="mpx-bubble ${isMine ? 'mine' : 'theirs'}${(m.image && !m.content) ? ' img-only' : ''}" ${bubbleLpAttr}>
        ${quoteHtml}${imageHtml}${textHtml}
        <span class="mpx-bubble-meta">${timeStr}${tickHtml}</span>
        ${rxTrigger}
      </div>
    </div>
  </div>
  ${rxZone}`;
}

// Met a jour les ticks ?/?? dans le DOM sans re-render

// ===== SUPPRESSION MESSAGE (LONG PRESS) =====
let _msgLPT = null;
function _startMsgLongPress(e, id) {
  _cancelMsgLongPress();
  // Long press uniquement sur mobile (touch)
  if (e.type !== 'touchstart') return;
  _msgLPT = setTimeout(function() {
    _msgLPT = null;
    _closeRxPicker();
    _showRxPicker(e, id);
  }, 500);
}
function _cancelMsgLongPress() { if (_msgLPT) { clearTimeout(_msgLPT); _msgLPT = null; } }
// ===== SWIPE POUR REPONDRE =====
var _swipeStartX = 0, _swipeStartY = 0, _swipeEl = null, _swipeActive = false;
var _swipeMsgId = null, _swipeMsgContent = null, _swipeMsgSender = null, _swipeMsgIsMine = false;

function _onBubbleTouchStart(e, id, content, sender, isMine) {
  if (e.touches.length !== 1) return;
  _swipeStartX   = e.touches[0].clientX;
  _swipeStartY   = e.touches[0].clientY;
  _swipeEl       = e.currentTarget;
  _swipeActive   = false;
  _swipeMsgId      = id;
  _swipeMsgContent = content;
  _swipeMsgSender  = sender;
  _swipeMsgIsMine  = isMine;
}

function _onBubbleTouchMove(e) {
  if (!_swipeEl || e.touches.length !== 1) return;
  var dx = e.touches[0].clientX - _swipeStartX;
  var dy = e.touches[0].clientY - _swipeStartY;
  // Swipe horizontal uniquement (pas de scroll vertical)
  if (!_swipeActive && Math.abs(dy) > Math.abs(dx)) { _swipeEl = null; return; }
  if (Math.abs(dx) < 8) return;
  _swipeActive = true;
  e.preventDefault();
  // Limiter le déplacement à 72px
  var clamped = Math.max(-72, Math.min(72, dx));
  var wrap = _swipeEl.querySelector('.mpx-bubble-wrap');
  if (wrap) wrap.style.transform = 'translateX(' + clamped + 'px)';
  // Afficher l'icône reply quand on dépasse 40px
  var btn = _swipeEl.querySelector('.mpx-reply-btn');
  if (btn) btn.classList.toggle('mpx-reply-btn--active', Math.abs(clamped) >= 40);
}

function _onBubbleTouchEnd(e) {
  if (!_swipeEl) return;
  var wrap = _swipeEl.querySelector('.mpx-bubble-wrap');
  var btn  = _swipeEl.querySelector('.mpx-reply-btn');
  var dx   = (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : _swipeStartX) - _swipeStartX;
  if (wrap) { wrap.style.transition = 'transform 0.2s ease'; wrap.style.transform = 'translateX(0)'; setTimeout(function(){ if(wrap) wrap.style.transition = ''; }, 220); }
  if (btn)  btn.classList.remove('mpx-reply-btn--active');
  if (_swipeActive && Math.abs(dx) >= 40) {
    _setReply(_swipeMsgId, _swipeMsgContent, _swipeMsgSender, _swipeMsgIsMine);
  }
  _swipeEl = null; _swipeActive = false;
}

function _scrollToMsg(msgId) {
  var el = document.getElementById('msg-' + msgId);
  if (!el) return;
  var container = document.getElementById('chatMessages');
  if (container) {
    var elTop    = el.offsetTop;
    var elHeight = el.offsetHeight;
    var target   = elTop - (container.clientHeight / 2) + (elHeight / 2);
    container.scrollTo({ top: target, behavior: 'smooth' });
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  el.classList.add('mpx-bubble-highlight');
  setTimeout(function(){ el.classList.remove('mpx-bubble-highlight'); }, 1500);
}
function _showMsgMenu(id) {
  document.querySelectorAll('.mpx-msg-menu').forEach(function(m) { m.remove(); });
  var menu = document.createElement('div');
  menu.className = 'mpx-msg-menu';
  menu.innerHTML = '<button onclick="_deleteChatMessage(' + id + ')"><i class="fas fa-trash"></i> Supprimer</button>';
  var row = document.querySelector('[data-msgid="' + id + '"]');
  if (!row) return;
  row.style.position = 'relative';
  row.appendChild(menu);
  function blockClick(ev) { ev.stopPropagation(); row.removeEventListener('click', blockClick, true); }
  row.addEventListener('click', blockClick, true);
  setTimeout(function() {
    row.removeEventListener('click', blockClick, true);
    document.addEventListener('click', function c(ev) {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', c, true); }
    }, true);
  }, 500);
}
async function _deleteChatMessage(id) {
  document.querySelectorAll('.mpx-msg-menu').forEach(function(m) { m.remove(); });
  if (!_currentChatUserId || !window.PaganiAPI) return;
  try {
    await PaganiAPI.deleteMessage(_currentChatUserId, id);
    var row = document.querySelector('[data-msgid="' + id + '"]');
    if (row) row.remove();
    _chatMsgsCache = _chatMsgsCache.filter(function(m) { return m.id !== id; });
  } catch(e) {}
}
function _updateReadTicks(msgs, container) {
  if (!container) return;
  msgs.forEach(m => {
    if (!m.id) return;
    const row = container.querySelector('[data-msgid="' + m.id + '"]');
    if (!row || !row.classList.contains('mine')) return;
    const meta = row.querySelector('.mpx-bubble-meta');
    if (!meta) return;
    const oldTick = meta.querySelector('.mpx-tick');
    if (m.read) {
      if (oldTick && !oldTick.classList.contains('mpx-tick-read')) {
        oldTick.className = 'mpx-tick mpx-tick-read';
        oldTick.title = 'Vu';
        oldTick.innerHTML = '<i class="fas fa-check-double"></i>';
      } else if (!oldTick) {
        meta.insertAdjacentHTML('beforeend', '<span class="mpx-tick mpx-tick-read" title="Vu"><i class="fas fa-check-double"></i></span>');
      }
    }
  });
}

// Curseur pour la pagination (oldest createdAt charg)
let _chatOldestTs = null;
let _chatAllLoaded = false;
let _chatLoadingMore = false;
let _chatBusy = false;
async function _loadChatMessages(userId, forceScrollBottom) {
  const messages = document.getElementById('chatMessages');
  if (!messages) return;

  const isAtBottom    = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
  const shouldScroll  = forceScrollBottom || isAtBottom;
  const user          = getUser();
  const otherAv       = document.getElementById('chatHeaderAvatar')?.innerHTML || '';
  const isFirstLoad   = _chatMsgsCache.length === 0;

  if (isFirstLoad) {
    _chatBusy = true;
    messages.innerHTML = '<div class="mpx-loading mpx-loading-center"><span></span><span></span><span></span></div>';
  }

  try {
    const msgs = await PaganiAPI.getMessages(userId, 30);

    if (!msgs.length) {
      if (isFirstLoad) {
        messages.innerHTML = '<div class="mpx-empty" style="flex:1;justify-content:center"><div class="mpx-empty-blob"><i class="fas fa-comment"></i></div><p>Démarrez la conversation !</p></div>';
        _chatMsgsCache = [];
        _chatOldestTs  = null;
        _chatAllLoaded = true;
      }
      return;
    }

    if (isFirstLoad) {
      // -- PREMIER CHARGEMENT ---------------------------------------
      _chatOldestTs  = msgs[0].createdAt;
      _chatAllLoaded = msgs.length < 30;

      const html = msgs.map((m, i) => {
        const isMine = m.senderId === (user && user.id);
        const prev   = msgs[i - 1];
        const next   = msgs[i + 1];
        const mDate  = new Date(m.createdAt).toDateString();
        const pDate  = prev ? new Date(prev.createdAt).toDateString() : null;
        let dateSep  = '';
        if (!prev || mDate !== pDate) {
          const label = mDate === new Date().toDateString() ? "Aujourd'hui"
            : mDate === new Date(Date.now() - 86400000).toDateString() ? 'Hier'
            : new Date(m.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
          dateSep = '<div class="mpx-date-sep">' + label + '</div>';
        }
        return _buildBubbleHTML(m, isMine, otherAv, dateSep, next && next.senderId === m.senderId);
      }).join('');

      messages.style.scrollBehavior = 'auto';
      messages.innerHTML = html;
      messages.querySelectorAll('.mpx-bubble-row').forEach(el => { el.style.animation = 'none'; });
      _updateReadTicks(msgs, messages);
      _chatMsgsCache = msgs.slice();

      if (!_chatAllLoaded) _insertLoadMoreSentinel(messages);
      _initChatScrollBtn(messages);
      _initChatScrollUp(messages, userId);

      messages.scrollTop = messages.scrollHeight;
      messages.style.scrollBehavior = '';
      _chatBusy = false;
      // Charger les reactions apres que les rx-zone soient dans le DOM
      _loadRxForConv(userId);

    } else {
      // -- POLLING : ajouter uniquement les nouveaux messages -------
      const cachedIds = new Set(_chatMsgsCache.map(m => m.id));
      const newMsgs   = msgs.filter(m => !cachedIds.has(m.id));

      if (newMsgs.length > 0) {
        // Son discret si au moins un message reçu (pas de moi)
        const hasIncoming = newMsgs.some(m => m.senderId !== (user && user.id));
        if (hasIncoming) _playMsgSound();
        newMsgs.forEach(m => {
          const globalPrev = _chatMsgsCache[_chatMsgsCache.length - 1];
          const isMine     = m.senderId === (user && user.id);
          const mDate      = new Date(m.createdAt).toDateString();
          const pDate      = globalPrev ? new Date(globalPrev.createdAt).toDateString() : null;
          let dateSep      = '';
          if (!globalPrev || mDate !== pDate) {
            const label = mDate === new Date().toDateString() ? "Aujourd'hui"
              : mDate === new Date(Date.now() - 86400000).toDateString() ? 'Hier'
              : new Date(m.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
            dateSep = '<div class="mpx-date-sep">' + label + '</div>';
          }
          const html = _buildBubbleHTML(m, isMine, otherAv, dateSep, false, true);
          const tmp  = document.createElement('div');
          tmp.innerHTML = html;

          // Remplacer le message optimiste en place (pas de suppression + réinsertion)
          const optimistic = isMine ? messages.querySelector('[data-optimistic]') : null;
          if (optimistic) {
            const realRow = tmp.querySelector('.mpx-bubble-row');
            if (realRow) {
              realRow.style.animation = 'none';
              optimistic.replaceWith(realRow);
            } else {
              optimistic.remove();
              while (tmp.firstChild) messages.appendChild(tmp.firstChild);
            }
          } else {
            while (tmp.firstChild) messages.appendChild(tmp.firstChild);
          }
          _chatMsgsCache.push(m);
        });
        if (shouldScroll) {
          messages.scrollTop = messages.scrollHeight;
        } else {
          _showScrollDownBadge(newMsgs.length);
        }
      }

      // Mettre à jour les ticks même sans nouveaux messages
      _updateReadTicks(msgs, messages);
      // Refresh réactions — chaque cycle polling
      _loadRxForConv(userId);
    }

    _updateMsgBadge();
  } catch(e) {
    if (isFirstLoad) {
      _chatBusy = false;
      messages.innerHTML = '<div class="mpx-empty" style="flex:1;justify-content:center"><i class="fas fa-exclamation-circle" style="font-size:2rem;color:var(--red);opacity:0.5"></i><p>Erreur de chargement</p></div>';
    }
  }
}

function _insertLoadMoreSentinel(messages) {
  if (messages.querySelector('.mpx-load-more')) return;
  const sentinel = document.createElement('div');
  sentinel.className = 'mpx-load-more';
  sentinel.innerHTML = '<div class="mpx-loading"><span></span><span></span><span></span></div>';
  messages.insertBefore(sentinel, messages.firstChild);
}

function _initChatScrollUp(messages, userId) {
  if (messages._scrollUpHandler) {
    messages.removeEventListener('scroll', messages._scrollUpHandler);
  }
  messages._scrollUpHandler = function() {
    if (_chatAllLoaded || _chatLoadingMore || _chatBusy) return;
    if (messages.scrollTop > 80) return;
    _loadOlderMessages(messages, userId);
  };
  messages.addEventListener('scroll', messages._scrollUpHandler);
}

async function _loadOlderMessages(messages, userId) {
  if (_chatLoadingMore || _chatAllLoaded || !_chatOldestTs) return;
  _chatLoadingMore = true;
  _chatBusy = true;

  let sentinel = messages.querySelector('.mpx-load-more');
  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.className = 'mpx-load-more';
    messages.insertBefore(sentinel, messages.firstChild);
  }
  sentinel.innerHTML = '<div class="mpx-loading"><span></span><span></span><span></span></div>';

  const scrollBefore = messages.scrollHeight - messages.scrollTop;

  try {
    const user    = getUser();
    const otherAv = document.getElementById('chatHeaderAvatar')?.innerHTML || '';
    const older   = await PaganiAPI.getMessages(userId, 30, _chatOldestTs);

    if (!older.length || older.length < 30) _chatAllLoaded = true;

    if (older.length) {
      _chatOldestTs = older[0].createdAt;
      const html = older.map((m, i) => {
        const isMine = m.senderId === (user && user.id);
        const prev   = older[i - 1] || null;
        const next   = older[i + 1] || _chatMsgsCache[0] || null;
        const mDate  = new Date(m.createdAt).toDateString();
        const pDate  = prev ? new Date(prev.createdAt).toDateString() : null;
        let dateSep  = '';
        if (!prev || mDate !== pDate) {
          const label = mDate === new Date().toDateString() ? "Aujourd'hui"
            : mDate === new Date(Date.now() - 86400000).toDateString() ? 'Hier'
            : new Date(m.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
          dateSep = '<div class="mpx-date-sep">' + label + '</div>';
        }
        return _buildBubbleHTML(m, isMine, otherAv, dateSep, next && next.senderId === m.senderId);
      }).join('');

      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      tmp.querySelectorAll('.mpx-bubble-row').forEach(el => { el.style.animation = 'none'; });
      while (tmp.lastChild) {
        messages.insertBefore(tmp.lastChild, sentinel.nextSibling);
      }
      _chatMsgsCache = older.concat(_chatMsgsCache);
    }

    if (_chatAllLoaded) {
      sentinel.remove();
    } else {
      sentinel.innerHTML = '<div class="mpx-loading"><span></span><span></span><span></span></div>';
    }

    // Restaurer la position sans saut visible
    messages.style.scrollBehavior = 'auto';
    messages.scrollTop = messages.scrollHeight - scrollBefore;
    messages.style.scrollBehavior = '';

  } catch(e) {
    if (sentinel) sentinel.remove();
  } finally {
    _chatLoadingMore = false;
    _chatBusy = false;
  }
}

async function sendChatMessage() {
  const input   = document.getElementById('chatInput');
  const content = input ? input.value.trim() : '';
  const image   = _chatImageBase64;
  if (!content && !image) return;
  if (!_currentChatUserId) return;

  const reply = _replyMsg ? { id: _replyMsg.id, content: _replyMsg.content, senderName: _replyMsg.senderName } : null;
  _clearReply();

  if (input) input.value = '';
  if (input) input.focus();
  _removeChatImage();

  const messages = document.getElementById('chatMessages');
  if (messages) {
    const row = document.createElement('div');
    row.className = 'mpx-bubble-row mine mpx-bubble-new';
    row.setAttribute('data-optimistic', '1');
    const timeStr  = _formatMsgTime(new Date().toISOString());
    const imgHtml  = image ? '<div class="mpx-bubble-img-wrap"><img src="' + image + '" class="mpx-bubble-img" /></div>' : '';
    const quoteHtml = reply
      ? '<div class="mpx-bubble-quote"><div class="mpx-bubble-quote-inner"><span class="mpx-bubble-quote-name">' + esc(reply.senderName || '') + '</span><span class="mpx-bubble-quote-text">' + esc(reply.content || '\ud83d\udcf7 Photo') + '</span></div></div>'
      : '';
    row.innerHTML = '<div class="mpx-bubble-wrap"><div class="mpx-bubble mine">' + quoteHtml + imgHtml + (content ? esc(content) : '') + '<span class="mpx-bubble-meta">' + timeStr + '<span class="mpx-tick" title="Envoy\u00e9"><i class="fas fa-check"></i></span></span></div></div>';
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  try {
    await PaganiAPI.sendMessage(_currentChatUserId, content, image, reply ? reply.id : null);
    loadConversations();
  } catch(e) {
    if (messages) { const opt = messages.querySelector('[data-optimistic]'); if (opt) opt.remove(); }
    if (input && content) input.value = content;
  }
}
function scrollChatToBottom() {
  const messages = document.getElementById('chatMessages');
  if (!messages) return;
  messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
}

function _initChatScrollBtn(messagesEl) {
  const btn   = document.getElementById('scrollDownBtn');
  const badge = document.getElementById('scrollDownBadge');
  if (!btn || !messagesEl) return;
  // Supprimer l'ancien listener s'il existe
  if (messagesEl._scrollHandler) {
    messagesEl.removeEventListener('scroll', messagesEl._scrollHandler);
  }
  messagesEl._scrollHandler = function() {
    const distFromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    if (distFromBottom > 120) {
      btn.classList.add('visible');
      btn.style.display = 'flex';
    } else {
      btn.classList.remove('visible');
      setTimeout(() => { if (!btn.classList.contains('visible')) btn.style.display = 'none'; }, 250);
      if (badge) badge.style.display = 'none';
    }
  };
  messagesEl.addEventListener('scroll', messagesEl._scrollHandler);
}

function _showScrollDownBadge(count) {
  const btn   = document.getElementById('scrollDownBtn');
  const badge = document.getElementById('scrollDownBadge');
  if (!btn || !badge) return;
  const messages = document.getElementById('chatMessages');
  if (!messages) return;
  const distFromBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight;
  if (distFromBottom > 120 && count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = 'flex';
    btn.classList.add('visible');
    btn.style.display = 'flex';
  }
}

async function _updateMsgBadge() {
  try {
    const data  = await PaganiAPI.getUnreadMessages();
    // Badge dans l'onglet dashboard
    const badge = document.getElementById('msgUnreadBadge');
    if (badge) {
      const prev = parseInt(badge.textContent) || 0;
      if (data.count > 0) {
        badge.textContent = data.count > 9 ? '9+' : data.count;
        badge.style.display = 'inline-flex';
        if (data.count > prev) {
          badge.classList.remove('flip');
          void badge.offsetWidth;
          badge.classList.add('flip');
          badge.addEventListener('animationend', () => badge.classList.remove('flip'), { once: true });
        }
      } else {
        badge.style.display = 'none';
      }
    }
    // Badge dans la navbar (toutes les pages)
    const navBadge = document.getElementById('msgNavBadge');
    if (navBadge) {
      const prevNav = parseInt(navBadge.textContent) || 0;
      if (data.count > 0) {
        navBadge.textContent = data.count > 9 ? '9+' : data.count;
        navBadge.style.display = 'inline-flex';
        if (data.count > prevNav) {
          navBadge.classList.remove('flip');
          void navBadge.offsetWidth;
          navBadge.classList.add('flip');
          navBadge.addEventListener('animationend', () => navBadge.classList.remove('flip'), { once: true });
        }
      } else {
        navBadge.style.display = 'none';
      }
    }
  } catch(e) {}
}
// ===== ABONNEMENT UTILISATEUR =====
async function renderUserSubscriptions() {
  const list    = document.getElementById('subUserList');
  const planBox = document.getElementById('subCurrentPlan');
  if (!list) return;
  const user = getUser();
  if (!user) return;
  // Plan actuel
  if (planBox) {
    const planColors = { Starter: 'var(--text2)', Pro: 'var(--accent)', Elite: 'var(--gold)' };
    const planIcons  = { Starter: 'fas fa-user', Pro: 'fas fa-crown', Elite: 'fas fa-gem' };
    const planDescs  = {
      Starter: 'Acces aux formations gratuites et au programme d\'affiliation.',
      Pro:     'Acces a toutes les formations + commission 35%.',
      Elite:   'Acces complet + coaching 1-on-1 + commission 50%.'
    };
    planBox.innerHTML = `
      <div class="sub-current-card">
        <div class="sub-current-icon" style="background:${planColors[user.plan]}22;color:${planColors[user.plan]}">
          <i class="${planIcons[user.plan]||'fas fa-user'}"></i>
        </div>
        <div class="sub-current-info">
          <div class="sub-current-label">Plan actuel</div>
          <div class="sub-current-name" style="color:${planColors[user.plan]}">${user.plan}</div>
          <div class="sub-current-desc">${planDescs[user.plan]||''}</div>
        </div>
        ${user.plan === 'Starter' ? `
        <button class="btn-primary" style="padding:0.5rem 1.2rem;font-size:0.85rem;white-space:nowrap" onclick="_showUpgradeModal(window._currentUser, 'Passer au plan Pro ou Elite')">
          <i class="fas fa-arrow-up"></i> Passer Pro / Elite
        </button>` : ''}
      </div>`;
  }
  list.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i></div>';
  let subs = [];
  try {
    if (window.PaganiAPI) {
      const t = localStorage.getItem('pd_jwt');
      const r = await fetch(`${API_URL}/my-subscriptions`, { headers: { Authorization: 'Bearer ' + t } });
      if (r.ok) subs = await r.json();
    }
  } catch(e) {}
  if (!subs.length) {
    list.innerHTML = `
      <div class="sub-user-empty">
        <i class="fas fa-id-card"></i>
        <p>Aucune demande d'abonnement pour le moment.</p>
        ${user.plan === 'Starter' ? `
        <button class="btn-primary" style="margin-top:0.8rem" onclick="_showUpgradeModal(window._currentUser, 'Passer au plan Pro ou Elite')">
          <i class="fas fa-arrow-up"></i> Souscrire maintenant
        </button>` : ''}
      </div>`;
    return;
  }
  const planColors = { Pro: 'var(--accent)', Elite: 'var(--gold)' };
  const planIcons  = { Pro: 'fas fa-crown', Elite: 'fas fa-gem' };
  const opColors   = { 'MVola': '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
  list.innerHTML = `<h3 style="font-size:0.95rem;font-weight:700;margin-bottom:1rem;color:var(--text2)">
    <i class="fas fa-history"></i> Historique des demandes
  </h3>` + subs.map(r => {
    const statusClass = r.statut === 'En attente' ? 'status-pending'
                      : r.statut === 'Approuve'   ? 'status-paid'
                      : 'status-rejected';
    const statusIcon  = r.statut === 'En attente' ? 'fas fa-clock'
                      : r.statut === 'Approuve'   ? 'fas fa-check-circle'
                      : 'fas fa-times-circle';
    const opColor = opColors[r.operator] || 'var(--accent)';
    const canRetry = r.statut === 'Rejete';
    const isPending = r.statut === 'En attente';
    return `
    <div class="sub-user-card ${r.statut === 'Approuve' ? 'sub-user-approved' : r.statut === 'Rejete' ? 'sub-user-rejected' : 'sub-user-pending'}" id="sub-user-${r.id}">
      <!-- EN-TTE -->
      <div class="sub-user-card-header">
        <div style="display:flex;align-items:center;gap:0.7rem">
          <span class="sub-plan-badge" style="background:${planColors[r.plan]||'var(--accent)'}22;color:${planColors[r.plan]||'var(--accent)'}">
            <i class="${planIcons[r.plan]||'fas fa-crown'}"></i> Plan ${r.plan}
          </span>
          <span class="status-badge ${statusClass}">
            <i class="${statusIcon}"></i> ${r.statut}
          </span>
        </div>
        <span style="font-size:0.78rem;color:var(--text2)">
          ${new Date(r.createdAt).toLocaleDateString('fr-FR')}  ${new Date(r.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
        </span>
      </div>
      <!-- DTAILS PAIEMENT -->
      <div class="sub-user-details">
        <div class="sub-user-detail">
          <i class="fas fa-money-bill-wave" style="color:var(--accent2)"></i>
          <span><strong>${(r.amount||0).toLocaleString('fr-FR')} AR</strong><small>Montant envoye</small></span>
        </div>
        <div class="sub-user-detail">
          <i class="fas fa-mobile-alt" style="color:${opColor}"></i>
          <span><strong>${r.operator}</strong><small>${r.phone}</small></span>
        </div>
        ${r.txRef ? `
        <div class="sub-user-detail">
          <i class="fas fa-hashtag" style="color:var(--text2)"></i>
          <span><strong>${r.txRef}</strong><small>Reference</small></span>
        </div>` : ''}
      </div>
      <!-- MESSAGE STATUT -->
      ${r.statut === 'Approuve' ? `
      <div class="sub-user-status-msg approved">
        <i class="fas fa-check-circle"></i>
        <div>
          <strong>Abonnement activee !</strong>
          <p>Votre plan ${r.plan} est actif. Profitez de toutes les formations.</p>
        </div>
        <a href="formations.html" class="btn-primary" style="padding:0.45rem 1rem;font-size:0.82rem;white-space:nowrap">
          <i class="fas fa-play"></i> Voir les formations
        </a>
      </div>` : ''}
      ${r.statut === 'En attente' ? `
      <div class="sub-user-status-msg pending">
        <i class="fas fa-clock"></i>
        <div>
          <strong>En cours de verification</strong>
          <p>Votre paiement est en cours de verification par l\'administrateur. Activation sous 24h.</p>
        </div>
      </div>` : ''}
      ${r.statut === 'Rejete' ? `
      <div class="sub-user-status-msg rejected">
        <i class="fas fa-times-circle"></i>
        <div>
          <strong>Demande rejetee</strong>
          ${r.rejectReason
            ? `<p><strong>Raison :</strong> ${r.rejectReason}</p>`
            : `<p>Votre demande n'a pas pu etre validee. Contactez le support si besoin.</p>`
          }
        </div>
      </div>` : ''}
      <!-- ACTIONS -->
      ${canRetry ? `
      <div class="sub-user-actions">
        <p style="font-size:0.82rem;color:var(--text2)">
          <i class="fas fa-info-circle" style="color:var(--accent)"></i>
          Vous pouvez corriger votre paiement et soumettre une nouvelle demande.
        </p>
        <button class="sub-retry-btn" onclick="_retrySubscription('${r.plan}', ${r.amount||0})">
          <i class="fas fa-redo"></i> Relancer le paiement
        </button>
      </div>` : ''}
      ${isPending ? `
      <div class="sub-user-actions">
        <p style="font-size:0.78rem;color:var(--text2)">
          <i class="fas fa-info-circle" style="color:var(--gold)"></i>
          Si vous n'avez pas encore envoye le paiement, vous pouvez le faire maintenant.
        </p>
      </div>` : ''}
    </div>`;
  }).join('');
}
function _retrySubscription(plan, amount) {
  const user = getUser();
  if (!user) return;
  // Ouvrir directement la modale de paiement sur le bon plan
  _showUpgradeModal(user, `Plan ${plan}`);
  // Aprs que la modale s'ouvre, slectionner automatiquement le bon plan
  setTimeout(() => {
    const btn = document.querySelector(`.upgrade-plan-btn${plan === 'Elite' ? '.elite' : ':not(.elite)'}`);
    if (btn) btn.click();
  }, 100);
}
// Scrolle, surligne et ouvre la preuve de paiement pour une transaction admin
// ou surligne simplement la carte utilisateur
function _scrollToSubCard(subId) {
  const isAdmin = !!(getUser()?.role === 'admin');
  // Carte admin : sub-{id} | carte utilisateur : sub-user-{id}
  const card = document.getElementById('sub-' + subId) || document.getElementById('sub-user-' + subId);
  if (!card) {
    // Liste pas encore rendue — réessayer dans 400ms (max 3 fois)
    if (!_scrollToSubCard._retries) _scrollToSubCard._retries = {};
    const key = String(subId);
    _scrollToSubCard._retries[key] = (_scrollToSubCard._retries[key] || 0) + 1;
    if (_scrollToSubCard._retries[key] <= 3) {
      setTimeout(() => _scrollToSubCard(subId), 400);
    } else {
      delete _scrollToSubCard._retries[key];
    }
    return;
  }
  if (_scrollToSubCard._retries) delete _scrollToSubCard._retries[String(subId)];
  // Scroll vers la carte
  const top = card.getBoundingClientRect().top + window.scrollY - 90;
  window.scrollTo({ top, behavior: 'smooth' });
  // Effet highlight
  card.classList.add('sub-highlight');
  setTimeout(() => card.classList.remove('sub-highlight'), 3500);
  // Admin : ouvrir automatiquement la modale preuve de paiement si elle existe
  if (isAdmin) {
    const req = _subsCache.find(r => String(r.id) === String(subId));
    if (req && req.proof) {
      setTimeout(() => openProofModal(req.id), 600);
    }
  }
}
function switchAdminSection(section, btn) {
  document.querySelectorAll('.admin-sub-section').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.admin-subnav-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('adminSection-' + section);
  if (el) el.style.display = 'block';
  if (btn) btn.classList.add('active');
  if (section === 'users')          renderAdminUsers();
  if (section === 'subscriptions')  renderAdminSubscriptions();
  if (section === 'payments')       loadAdminPaymentAccounts();
  if (section === 'pricing')        { loadAdminPricing(); switchPricingTab('subscriptions', document.querySelector('.pricing-tab')); }
  if (section === 'videopurchases')  renderAdminVideoPurchases();
  if (section === 'modules')         renderAdminModules();
  if (section === 'modulepurchases') renderAdminModulePurchases();
  if (section === 'leaderboard')     { if (typeof loadAdminLeaderboard === 'function') loadAdminLeaderboard(); }
  if (section === 'navbarbtn') loadNavbarBtnAdmin();
  if (section === 'sociallinks') loadSocialLinksAdmin();
  if (section === 'shares')          loadAdminShares();
  if (section === 'ebooks')          loadAdminEbooks();
  if (section === 'ebookpurchases')  loadAdminEbookPurchases();
  if (section === 'trainers')          loadAdminTrainers();
  if (section === 'trainersubmissions') loadAdminTrainerSubmissions();
  if (section === 'trainerearnings')    loadAdminTrainerEarnings();
  if (section === 'finance')            loadAdminFinance();
}
// ===== ADMIN FORMATEURS =====
async function loadAdminTrainers() {
  var list = document.getElementById('adminTrainersList');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text2)"><i class="fas fa-spinner fa-spin"></i></div>';
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  try {
    var r = await fetch(API + '/admin/trainer-requests', { headers: { 'Authorization': 'Bearer ' + token } });
    var reqs = await r.json();
    // Mettre à jour le badge
    var pending = reqs.filter(function(r) { return r.statut === 'En attente'; }).length;
    var badge = document.getElementById('trainerRequestsBadge');
    if (badge) { badge.textContent = pending; badge.style.display = pending ? 'inline-flex' : 'none'; }
    if (!reqs.length) { list.innerHTML = '<p style="color:var(--text2);padding:1rem;font-size:0.88rem">Aucune demande pour le moment.</p>'; return; }
    var sColor = { 'En attente': 'var(--gold)', 'Approuvé': 'var(--green)', 'Rejeté': 'var(--red)' };
    var sIcon  = { 'En attente': 'fa-clock', 'Approuvé': 'fa-check-circle', 'Rejeté': 'fa-times-circle' };
    list.innerHTML = reqs.map(function(req) {
      var av = req.avatar_photo
        ? '<img src="' + req.avatar_photo + '" style="width:38px;height:38px;border-radius:50%;object-fit:cover" />'
        : '<div class="avatar-circle avatar-sm" style="background:' + (req.avatar_color||'#6c63ff') + '">' + (req.user_name||'?').split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2) + '</div>';
      var c = sColor[req.statut] || 'var(--text2)';
      var isPending = req.statut === 'En attente';
      return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:1.2rem;margin-bottom:0.8rem">' +
        '<div style="display:flex;align-items:center;gap:0.8rem;flex-wrap:wrap;margin-bottom:0.8rem">' +
        av +
        '<div style="flex:1"><strong>' + req.user_name + '</strong>' +
        '<span style="display:block;font-size:0.75rem;color:var(--text2)">' + new Date(req.created_at).toLocaleDateString('fr-FR') + '</span></div>' +
        '<span style="font-size:0.78rem;font-weight:700;color:' + c + ';background:' + c + '22;border:1px solid ' + c + '44;padding:0.2rem 0.7rem;border-radius:50px">' +
        '<i class="fas ' + (sIcon[req.statut]||'fa-clock') + '"></i> ' + req.statut + '</span></div>' +
        '<div style="font-size:0.82rem;color:var(--text2);margin-bottom:0.6rem"><strong style="color:var(--text)">Expertise :</strong> ' + req.expertise + '</div>' +
        '<div style="font-size:0.82rem;color:var(--text2);margin-bottom:0.8rem">' + req.description + '</div>' +
        (req.demo_url ? '<div style="margin-bottom:0.8rem"><a href="' + req.demo_url + '" target="_blank" rel="noopener" style="font-size:0.8rem;color:var(--accent)"><i class="fas fa-link"></i> Voir la démo</a></div>' : '') +
        (isPending ? (
          '<div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:center">' +
          '<label style="font-size:0.78rem;color:var(--text2)">Commission % :</label>' +
          '<input type="number" id="commRate-' + req.id + '" value="50" min="1" max="100" style="width:70px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:0.3rem 0.5rem;font-size:0.82rem" />' +
          '<button onclick="_approveTrainer(' + req.id + ')" class="btn-primary" style="padding:0.4rem 1rem;font-size:0.82rem"><i class="fas fa-check"></i> Accepter</button>' +
          '<button onclick="_rejectTrainer(' + req.id + ')" style="padding:0.4rem 1rem;font-size:0.82rem;background:var(--red);border:none;color:#fff;border-radius:10px;cursor:pointer;font-family:inherit"><i class="fas fa-times"></i> Refuser</button>' +
          '</div>'
        ) : '') +
        '</div>';
    }).join('');
  } catch(e) { list.innerHTML = '<p style="color:var(--red);padding:1rem">Erreur de chargement.</p>'; }
}

async function _approveTrainer(id) {
  var rate = parseInt(document.getElementById('commRate-' + id)?.value) || 50;
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  try {
    var r = await fetch(API + '/admin/trainer-requests/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ statut: 'Approuvé', commissionRate: rate })
    });
    if (!r.ok) throw new Error('Erreur serveur');
    loadAdminTrainers();
  } catch(e) { alert('Erreur : ' + e.message); }
}

async function _rejectTrainer(id) {
  var reason = prompt('Raison du refus (optionnel) :') || '';
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  try {
    var r = await fetch(API + '/admin/trainer-requests/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ statut: 'Rejeté', rejectReason: reason })
    });
    if (!r.ok) throw new Error('Erreur serveur');
    loadAdminTrainers();
  } catch(e) { alert('Erreur : ' + e.message); }
}

async function loadAdminTrainerSubmissions() {
  var list = document.getElementById('adminTrainerSubmissionsList');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text2)"><i class="fas fa-spinner fa-spin"></i></div>';
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  try {
    var r = await fetch(API + '/admin/trainer-submissions', { headers: { 'Authorization': 'Bearer ' + token } });
    var subs = await r.json();
    var pending = subs.filter(function(s) { return s.statut === 'En attente'; }).length;
    var badge = document.getElementById('trainerSubmissionsBadge');
    if (badge) { badge.textContent = pending; badge.style.display = pending ? 'inline-flex' : 'none'; }
    if (!subs.length) { list.innerHTML = '<p style="color:var(--text2);padding:1rem;font-size:0.88rem">Aucune soumission pour le moment.</p>'; return; }
    var sColor = { 'En attente': 'var(--gold)', 'Approuvé': 'var(--green)', 'Rejeté': 'var(--red)' };
    var sIcon  = { 'En attente': 'fa-clock', 'Approuvé': 'fa-check-circle', 'Rejeté': 'fa-times-circle' };
    list.innerHTML = subs.map(function(s) {
      var c = sColor[s.statut] || 'var(--text2)';
      var isPending = s.statut === 'En attente';
      var isVideo = s.content_type === 'video';

      // Bloc prévisualisation
      var previewBlock = '';
      if (isVideo) {
        var ytId = s.video_source === 'youtube' ? s.video_id : '';
        var driveId = s.video_source === 'drive' ? s.drive_id : '';
        var thumb = s.thumbnail || (ytId ? 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg' : '');
        previewBlock =
          '<div style="margin-bottom:0.8rem">' +
          (thumb ? '<img src="' + thumb + '" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px;margin-bottom:0.5rem;display:block" />' : '') +
          '<div style="display:flex;gap:0.5rem;flex-wrap:wrap">' +
          (ytId ? '<a href="https://www.youtube.com/watch?v=' + ytId + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.4rem;background:rgba(255,0,0,0.12);color:#ff4444;border:1px solid rgba(255,0,0,0.3);padding:0.35rem 0.8rem;border-radius:8px;font-size:0.8rem;text-decoration:none"><i class="fab fa-youtube"></i> Voir sur YouTube</a>' : '') +
          (driveId ? '<a href="https://drive.google.com/file/d/' + driveId + '/view" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.4rem;background:rgba(108,99,255,0.12);color:var(--accent);border:1px solid rgba(108,99,255,0.3);padding:0.35rem 0.8rem;border-radius:8px;font-size:0.8rem;text-decoration:none"><i class="fas fa-play-circle"></i> Voir sur Drive</a>' : '') +
          '</div></div>';
      } else {
        previewBlock =
          '<div style="display:flex;gap:0.8rem;align-items:flex-start;margin-bottom:0.8rem">' +
          (s.cover ? '<img src="' + s.cover + '" style="width:60px;height:80px;object-fit:cover;border-radius:8px;flex-shrink:0;border:1px solid var(--border)" />' : '') +
          '<div>' +
          (s.file_url ? '<a href="' + s.file_url + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.4rem;background:rgba(0,212,170,0.12);color:var(--accent2);border:1px solid rgba(0,212,170,0.3);padding:0.35rem 0.8rem;border-radius:8px;font-size:0.8rem;text-decoration:none"><i class="fas fa-file-pdf"></i> Voir le PDF</a>' : '') +
          (s.pages ? '<span style="display:block;font-size:0.75rem;color:var(--text2);margin-top:0.4rem"><i class="fas fa-book"></i> ' + s.pages + ' pages</span>' : '') +
          '</div></div>';
      }

      // Infos détaillées
      var infoBlock =
        '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.8rem">' +
        '<span style="font-size:0.75rem;background:var(--bg3);border:1px solid var(--border);padding:0.2rem 0.6rem;border-radius:50px"><i class="fas fa-tag"></i> ' + Number(s.price).toLocaleString('fr-FR') + ' AR</span>' +
        '<span style="font-size:0.75rem;background:var(--bg3);border:1px solid var(--border);padding:0.2rem 0.6rem;border-radius:50px"><i class="fas fa-layer-group"></i> ' + s.category + '</span>' +
        '<span style="font-size:0.75rem;background:var(--bg3);border:1px solid var(--border);padding:0.2rem 0.6rem;border-radius:50px"><i class="fas fa-signal"></i> ' + (s.level||'—') + '</span>' +
        (isVideo && s.duration ? '<span style="font-size:0.75rem;background:var(--bg3);border:1px solid var(--border);padding:0.2rem 0.6rem;border-radius:50px"><i class="fas fa-clock"></i> ' + s.duration + '</span>' : '') +
        '<span style="font-size:0.75rem;background:var(--bg3);border:1px solid var(--border);padding:0.2rem 0.6rem;border-radius:50px"><i class="fas fa-' + (isVideo ? 'play-circle' : 'book-open') + '"></i> ' + s.content_type + '</span>' +
        '</div>';

      // Bloc actions (uniquement si En attente)
      var actionsBlock = '';
      if (isPending) {
        actionsBlock =
          '<div style="border-top:1px solid var(--border);padding-top:0.8rem;margin-top:0.4rem">' +
          '<div style="display:flex;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.6rem">' +
          '<button onclick="_approveSubmission(' + s.id + ', this)" class="btn-primary" style="padding:0.45rem 1.1rem;font-size:0.82rem"><i class="fas fa-check"></i> Valider et publier</button>' +
          '<button onclick="_toggleRejectForm(' + s.id + ')" style="padding:0.45rem 1.1rem;font-size:0.82rem;background:transparent;border:1px solid var(--red);color:var(--red);border-radius:10px;cursor:pointer;font-family:inherit"><i class="fas fa-times"></i> Refuser</button>' +
          '</div>' +
          '<div id="rejectForm-' + s.id + '" style="display:none;margin-top:0.4rem">' +
          '<textarea id="rejectReason-' + s.id + '" rows="2" placeholder="Raison du refus (obligatoire)..." style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:0.6rem;font-size:0.82rem;font-family:inherit;resize:none;margin-bottom:0.5rem"></textarea>' +
          '<button onclick="_rejectSubmission(' + s.id + ')" style="padding:0.4rem 1rem;font-size:0.82rem;background:var(--red);border:none;color:#fff;border-radius:10px;cursor:pointer;font-family:inherit"><i class="fas fa-times-circle"></i> Confirmer le refus</button>' +
          '</div>' +
          '</div>';
      }

      return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:1.2rem;margin-bottom:1rem">' +
        // En-tête
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.8rem;flex-wrap:wrap;margin-bottom:0.8rem">' +
        '<div><strong style="font-size:0.95rem">' + s.title + '</strong>' +
        '<span style="display:block;font-size:0.78rem;color:var(--text2);margin-top:0.2rem"><i class="fas fa-user"></i> ' + s.trainer_name + ' · ' + new Date(s.created_at).toLocaleDateString('fr-FR') + '</span></div>' +
        '<span style="font-size:0.78rem;font-weight:700;color:' + c + ';background:' + c + '22;border:1px solid ' + c + '44;padding:0.2rem 0.7rem;border-radius:50px;white-space:nowrap">' +
        '<i class="fas ' + (sIcon[s.statut]||'fa-clock') + '"></i> ' + s.statut + '</span></div>' +
        // Description
        (s.description ? '<div style="font-size:0.82rem;color:var(--text2);margin-bottom:0.8rem;line-height:1.5">' + s.description + '</div>' : '') +
        // Infos
        infoBlock +
        // Prévisualisation
        previewBlock +
        // Raison refus si rejeté
        (s.reject_reason ? '<div style="font-size:0.8rem;color:var(--red);background:rgba(255,77,109,0.08);border:1px solid rgba(255,77,109,0.2);border-radius:8px;padding:0.5rem 0.8rem;margin-bottom:0.6rem"><i class="fas fa-info-circle"></i> ' + s.reject_reason + '</div>' : '') +
        // Actions
        actionsBlock +
        '</div>';
    }).join('');
  } catch(e) { list.innerHTML = '<p style="color:var(--red);padding:1rem">Erreur de chargement.</p>'; }
}

async function _approveSubmission(id, btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publication...'; }
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  try {
    var r = await fetch(API + '/admin/trainer-submissions/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ statut: 'Approuvé' })
    });
    if (!r.ok) throw new Error('Erreur serveur');
    loadAdminTrainerSubmissions();
  } catch(e) { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Valider et publier'; } alert('Erreur : ' + e.message); }
}

function _toggleRejectForm(id) {
  var form = document.getElementById('rejectForm-' + id);
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function _rejectSubmission(id) {
  var reasonEl = document.getElementById('rejectReason-' + id);
  var reason   = reasonEl ? reasonEl.value.trim() : '';
  if (!reason) { if (reasonEl) { reasonEl.style.borderColor = 'var(--red)'; reasonEl.focus(); } return; }
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  try {
    var r = await fetch(API + '/admin/trainer-submissions/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ statut: 'Rejeté', rejectReason: reason })
    });
    if (!r.ok) throw new Error('Erreur serveur');
    loadAdminTrainerSubmissions();
  } catch(e) { alert('Erreur : ' + e.message); }
}

async function loadAdminTrainerEarnings() {
  var list = document.getElementById('adminTrainerEarningsList');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text2)"><i class="fas fa-spinner fa-spin"></i></div>';
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  try {
    var r = await fetch(API + '/admin/trainer-earnings', { headers: { 'Authorization': 'Bearer ' + token } });
    var earnings = await r.json();
    if (!earnings.length) { list.innerHTML = '<p style="color:var(--text2);padding:1rem;font-size:0.88rem">Aucun gain pour le moment.</p>'; return; }
    var fmt = function(n) { return Number(n).toLocaleString('fr-FR'); };
    list.innerHTML = earnings.map(function(e) {
      var isPending = e.statut === 'En attente';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:0.8rem;background:var(--bg2);border:1px solid var(--border);border-radius:12px;margin-bottom:0.6rem;gap:0.8rem;flex-wrap:wrap">' +
        '<div><strong>' + e.trainer_name + '</strong>' +
        '<span style="display:block;font-size:0.75rem;color:var(--text2)">' + e.content_title + ' · ' + e.buyer_name + ' · ' + new Date(e.created_at).toLocaleDateString('fr-FR') + '</span></div>' +
        '<div style="display:flex;align-items:center;gap:0.6rem">' +
        '<strong style="color:var(--accent2)">' + fmt(e.commission_amount) + ' AR</strong>' +
        (isPending
          ? '<button onclick="_markTrainerEarningPaid(' + e.id + ', this)" style="font-size:0.72rem;background:rgba(0,212,170,0.1);color:var(--accent2);border:1px solid rgba(0,212,170,0.3);padding:0.2rem 0.6rem;border-radius:50px;cursor:pointer;font-family:inherit">Marquer payé</button>'
          : '<span style="font-size:0.72rem;color:var(--green);background:rgba(0,200,100,0.1);padding:0.2rem 0.5rem;border-radius:50px">✓ Payé</span>'
        ) +
        '</div></div>';
    }).join('');
  } catch(e) { list.innerHTML = '<p style="color:var(--red);padding:1rem">Erreur de chargement.</p>'; }
}

async function _markTrainerEarningPaid(id, btn) {
  var API   = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
  var token = localStorage.getItem('pd_jwt');
  btn.disabled = true;
  try {
    await fetch(API + '/admin/trainer-earnings/' + id + '/paid', {
      method: 'PATCH', headers: { 'Authorization': 'Bearer ' + token }
    });
    btn.outerHTML = '<span style="font-size:0.72rem;color:var(--green);background:rgba(0,200,100,0.1);padding:0.2rem 0.5rem;border-radius:50px">✓ Payé</span>';
  } catch(e) { btn.disabled = false; alert('Erreur : ' + e.message); }
}
// ===== TARIFS ADMIN — ONGLETS =====
function switchPricingTab(tab, btn) {
  document.querySelectorAll('.pricing-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.pricing-tab-content').forEach(c => c.style.display = 'none');
  if (btn) btn.classList.add('active');
  const el = document.getElementById('pricingTab-' + tab);
  if (el) el.style.display = 'block';
  if (tab === 'subscriptions') loadAdminPricingSubscriptions();
  if (tab === 'videos')        loadAdminVideoPricing();
  if (tab === 'modules')       loadAdminModulePricing();
  if (tab === 'commissions')   loadAdminCommissions();
}
async function loadAdminPricing() {
  loadAdminPricingSubscriptions();
}
async function loadAdminPricingSubscriptions() {
  const container = document.getElementById('adminPricingContent');
  if (!container) return;
  container.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i></div>';
  let p = { pro: 30000, elite: 90000, video: 10000,
    commStarter: { abonnement: 20, formation: 15 },
    commPro:     { abonnement: 35, formation: 25 },
    commElite:   { abonnement: 50, formation: 40 },
    withdrawMin: 5000 };
  try {
    if (window.PaganiAPI) p = { ...p, ...(await PaganiAPI.getPricing()) };
  } catch(e) {}
  container.innerHTML = `
    <div class="pricing-admin-grid">
      <!-- Abonnements -->
      <div class="pricing-admin-card">
        <div class="pricing-admin-card-header">
          <i class="fas fa-crown" style="color:var(--gold)"></i>
          <strong>Abonnements</strong>
        </div>
        <div class="pricing-admin-row">
          <label>Plan Pro <small>(AR/mois)</small></label>
          <input type="number" id="pricePro" class="upgrade-input" value="${p.pro}" min="0" step="1000" />
        </div>
        <div class="pricing-admin-row">
          <label>Plan Elite <small>(AR/mois)</small></label>
          <input type="number" id="priceElite" class="upgrade-input" value="${p.elite}" min="0" step="1000" />
        </div>
      </div>
      <!-- Video unitaire -->
      <div class="pricing-admin-card">
        <div class="pricing-admin-card-header">
          <i class="fas fa-film" style="color:var(--accent)"></i>
          <strong>Achat video unitaire</strong>
        </div>
        <div class="pricing-admin-row">
          <label>Prix par video <small>(AR)</small></label>
          <input type="number" id="priceVideo" class="upgrade-input" value="${p.video}" min="0" step="500" />
        </div>
        <div class="pricing-admin-row">
          <label>Retrait minimum <small>(AR)</small></label>
          <input type="number" id="priceWithdrawMin" class="upgrade-input" value="${p.withdrawMin}" min="0" step="500" />
        </div>
      </div>
      <!-- Commissions Starter -->
      <div class="pricing-admin-card">
        <div class="pricing-admin-card-header">
          <i class="fas fa-user" style="color:var(--text2)"></i>
          <strong>Commissions Starter</strong>
        </div>
        <div class="pricing-admin-row">
          <label>Abonnement <small>(%)</small></label>
          <input type="number" id="commStarterAbo" class="upgrade-input" value="${p.commStarter?.abonnement ?? 20}" min="0" max="100" />
        </div>
        <div class="pricing-admin-row">
          <label>Formation <small>(%)</small></label>
          <input type="number" id="commStarterForm" class="upgrade-input" value="${p.commStarter?.formation ?? 15}" min="0" max="100" />
        </div>
      </div>
      <!-- Commissions Pro -->
      <div class="pricing-admin-card">
        <div class="pricing-admin-card-header">
          <i class="fas fa-crown" style="color:var(--accent)"></i>
          <strong>Commissions Pro</strong>
        </div>
        <div class="pricing-admin-row">
          <label>Abonnement <small>(%)</small></label>
          <input type="number" id="commProAbo" class="upgrade-input" value="${p.commPro?.abonnement ?? 35}" min="0" max="100" />
        </div>
        <div class="pricing-admin-row">
          <label>Formation <small>(%)</small></label>
          <input type="number" id="commProForm" class="upgrade-input" value="${p.commPro?.formation ?? 25}" min="0" max="100" />
        </div>
      </div>
      <!-- Commissions Elite -->
      <div class="pricing-admin-card">
        <div class="pricing-admin-card-header">
          <i class="fas fa-gem" style="color:var(--gold)"></i>
          <strong>Commissions Elite</strong>
        </div>
        <div class="pricing-admin-row">
          <label>Abonnement <small>(%)</small></label>
          <input type="number" id="commEliteAbo" class="upgrade-input" value="${p.commElite?.abonnement ?? 50}" min="0" max="100" />
        </div>
        <div class="pricing-admin-row">
          <label>Formation <small>(%)</small></label>
          <input type="number" id="commEliteForm" class="upgrade-input" value="${p.commElite?.formation ?? 40}" min="0" max="100" />
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.2rem;flex-wrap:wrap">
      <button class="btn-primary" style="padding:0.6rem 1.6rem" onclick="saveAdminPricing()">
        <i class="fas fa-save"></i> Enregistrer les tarifs
      </button>
      <p id="pricingMsg" style="font-size:0.82rem;min-height:1rem"></p>
    </div>
    ${p.updatedAt ? `<p style="font-size:0.72rem;color:var(--text2);margin-top:0.4rem"><i class="fas fa-clock"></i> Derniere mise a jour : ${new Date(p.updatedAt).toLocaleString('fr-FR')}</p>` : ''}`;
}
async function saveAdminPricing() {
  const msg = document.getElementById('pricingMsg');
  const payload = {
    pro:         parseInt(document.getElementById('pricePro').value)         || 0,
    elite:       parseInt(document.getElementById('priceElite').value)       || 0,
    video:       parseInt(document.getElementById('priceVideo').value)       || 0,
    withdrawMin: parseInt(document.getElementById('priceWithdrawMin').value) || 0,
    commStarter: {
      abonnement: parseInt(document.getElementById('commStarterAbo').value)  || 0,
      formation:  parseInt(document.getElementById('commStarterForm').value) || 0,
    },
    commPro: {
      abonnement: parseInt(document.getElementById('commProAbo').value)      || 0,
      formation:  parseInt(document.getElementById('commProForm').value)     || 0,
    },
    commElite: {
      abonnement: parseInt(document.getElementById('commEliteAbo').value)    || 0,
      formation:  parseInt(document.getElementById('commEliteForm').value)   || 0,
    },
  };
  try {
    await PaganiAPI.admin.updatePricing(payload);
    if (msg) { msg.style.color = 'var(--green)'; msg.textContent = 'Tarifs mis a jour avec succes.'; }
    setTimeout(() => loadAdminPricingSubscriptions(), 800);
  } catch(e) {
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'Erreur : ' + e.message; }
  }
  setTimeout(() => { if (msg) msg.textContent = ''; }, 4000);
}
// ===== TARIFS ADMIN — PRIX PAR VIDEO =====
async function loadAdminVideoPricing() {
  const container = document.getElementById('adminVideoPricingContent');
  if (!container) return;
  container.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i></div>';
  let videos = [];
  let globalPrice = 10000;
  try {
    videos = await PaganiAPI.admin.getVideos();
    const p = await PaganiAPI.getPricing();
    globalPrice = p.video || 10000;
  } catch(e) {
    videos = getVideos();
  }
  const paid = videos.filter(v => !v.free);
  container.innerHTML = `
    <div class="pricing-video-header">
      <div class="pricing-video-global">
        <div class="pricing-admin-card-header">
          <i class="fas fa-tag" style="color:var(--accent2)"></i>
          <strong>Prix global par defaut</strong>
        </div>
        <p style="font-size:0.8rem;color:var(--text2);margin:0.4rem 0 0.8rem">Ce prix s'applique aux videos sans prix individuel defini.</p>
        <div style="display:flex;align-items:center;gap:0.8rem;flex-wrap:wrap">
          <div style="display:flex;flex-direction:column;gap:0.3rem;flex:1;min-width:160px">
            <label style="font-size:0.78rem;color:var(--text2);font-weight:600">Prix global <small>(AR)</small></label>
            <input type="number" id="globalVideoPrice" class="upgrade-input" value="${globalPrice}" min="0" step="500" style="max-width:200px" />
          </div>
          <button class="btn-primary" style="padding:0.5rem 1.2rem;font-size:0.82rem;align-self:flex-end" onclick="saveGlobalVideoPrice()">
            <i class="fas fa-save"></i> Sauvegarder
          </button>
          <p id="globalVideoPriceMsg" style="font-size:0.78rem;min-height:1rem;align-self:flex-end"></p>
        </div>
      </div>
    </div>
    <div style="margin-top:1.5rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem">
        <h3 style="font-size:0.95rem;font-weight:700">
          <i class="fas fa-film" style="color:var(--accent)"></i>
          Prix individuels - Videos payantes (${paid.length})
        </h3>
        <span style="font-size:0.78rem;color:var(--text2)">Laissez vide pour utiliser le prix global</span>
      </div>
      ${paid.length === 0
        ? '<div class="history-empty"><i class="fas fa-film"></i><p>Aucune video payante.</p></div>'
        : `<div class="video-price-list">
            <div class="video-price-header">
              <span>Video</span><span>Categorie</span><span>Prix actuel</span><span>Nouveau prix (AR)</span><span></span>
            </div>
            ${paid.map(v => `
            <div class="video-price-row" id="vpr-${v.id}">
              <span class="video-price-title">
                <i class="${v.icon||'fas fa-play-circle'}" style="color:var(--accent);flex-shrink:0"></i>
                <span>${v.title}</span>
              </span>
              <span><span class="course-tag">${v.category.toUpperCase()}</span></span>
              <span class="video-price-current">
                ${v.unitPrice
                  ? `<strong style="color:var(--accent2)">${Number(v.unitPrice).toLocaleString('fr-FR')} AR</strong>`
                  : `<span style="color:var(--text2);font-style:italic">Global (${globalPrice.toLocaleString('fr-FR')} AR)</span>`
                }
              </span>
              <span>
                <input type="number" class="upgrade-input" id="vp-${v.id}" value="${v.unitPrice||''}" placeholder="${globalPrice}" min="0" step="500" style="max-width:140px;padding:0.4rem 0.7rem" />
              </span>
              <span>
                <button class="admin-action-btn edit" onclick="saveVideoPrice(${v.id})" title="Sauvegarder">
                  <i class="fas fa-save"></i>
                </button>
              </span>
            </div>`).join('')}
          </div>`
      }`;
}
async function saveGlobalVideoPrice() {
  const val = parseInt(document.getElementById('globalVideoPrice')?.value) || 0;
  const msg = document.getElementById('globalVideoPriceMsg');
  try {
    const p = await PaganiAPI.getPricing();
    await PaganiAPI.admin.updatePricing({ ...p, video: val });
    if (msg) { msg.style.color = 'var(--green)'; msg.textContent = 'Sauvegarde'; }
  } catch(e) {
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'Erreur'; }
  }
  setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
}
async function saveVideoPrice(videoId) {
  const input = document.getElementById(`vp-${videoId}`);
  if (!input) return;
  const price = input.value ? parseInt(input.value) : null;
  // Envoyer unitPrice ET accessType pour que le backend les synchronise
  const payload = price
    ? { unitPrice: price, accessType: 'unit', free: false }
    : { unitPrice: null,  accessType: 'pro',  free: false };
  try {
    await PaganiAPI.admin.updateVideo(videoId, payload);
    const row = document.getElementById(`vpr-${videoId}`);
    if (row) {
      const currentEl = row.querySelector('.video-price-current');
      if (currentEl) {
        const globalPrice = parseInt(document.getElementById('globalVideoPrice')?.value) || 10000;
        currentEl.innerHTML = price
          ? `<strong style="color:var(--accent2)">${price.toLocaleString('fr-FR')} AR</strong>`
          : `<span style="color:var(--text2);font-style:italic">Global (${globalPrice.toLocaleString('fr-FR')} AR)</span>`;
      }
      row.style.background = 'rgba(0,212,170,0.06)';
      setTimeout(() => row.style.background = '', 1200);
    }
    // Mettre a jour le cache local
    const v = _adminVideosCache.find(x => x.id === videoId);
    if (v) { v.unitPrice = price; v.accessType = price ? 'unit' : 'pro'; }
  } catch(e) { alert('Erreur : ' + e.message); }
}
// ===== TARIFS ADMIN — PRIX PAR MODULE =====
async function loadAdminModulePricing() {
  const container = document.getElementById('adminModulePricingContent');
  if (!container) return;
  container.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i></div>';
  let modules = [];
  try { modules = await PaganiAPI.admin.getVideoModules(); } catch(e) {}
  if (!modules.length) {
    container.innerHTML = '<div class="history-empty"><i class="fas fa-layer-group"></i><p>Aucun module creee. Creeez d\'abord des modules dans la section Modules.</p></div>';
    return;
  }
  container.innerHTML = `
    <p style="font-size:0.82rem;color:var(--text2);margin-bottom:1.2rem">
      <i class="fas fa-info-circle" style="color:var(--accent)"></i>
      Definissez un prix d'acces par module. Un utilisateur qui achete un module debloque toutes ses videos.
    </p>
    <div class="module-pricing-grid">
      ${modules.map(m => `
      <div class="module-price-card">
        <div class="module-price-header">
          <span class="module-price-icon" style="background:${m.color||'#6c63ff'}22;color:${m.color||'#6c63ff'}">
            <i class="${m.icon||'fas fa-layer-group'}"></i>
          </span>
          <div>
            <strong>${m.title}</strong>
            <span style="font-size:0.75rem;color:var(--text2)">${m.description||''}</span>
          </div>
        </div>
        <div class="module-price-row" style="margin-top:0.8rem">
          <label>Prix du module <small>(AR)</small></label>
          <input type="number" class="upgrade-input" id="mp-${m.id}"
            value="${m.modulePrice||''}" placeholder="Ex: 15000" min="0" step="1000"
            style="padding:0.4rem 0.7rem;max-width:160px" />
        </div>
        <button class="btn-primary" style="width:100%;padding:0.5rem;font-size:0.82rem;margin-top:0.6rem"
          onclick="saveModulePrice(${m.id})">
          <i class="fas fa-save"></i> Enregistrer
        </button>
        <p id="mpm-${m.id}" style="font-size:0.75rem;min-height:1rem;text-align:center;margin-top:0.3rem"></p>
      </div>`).join('')}
    </div>`;
}
async function saveModulePrice(moduleId) {
  const price = parseInt(document.getElementById(`mp-${moduleId}`)?.value) || null;
  const msg   = document.getElementById(`mpm-${moduleId}`);
  try {
    await PaganiAPI.admin.updateVideoModule(moduleId, { modulePrice: price });
    if (msg) { msg.style.color = 'var(--green)'; msg.textContent = '? Sauvegarde'; }
  } catch(e) {
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'Erreur'; }
  }
  setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
}
// ===== TARIFS ADMIN — COMMISSIONS =====
async function loadAdminCommissions() {
  const container = document.getElementById('adminCommissionContent');
  if (!container) return;
  container.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i></div>';
  let p = {
    commStarter: { abonnement: 20, formation: 15 },
    commPro:     { abonnement: 35, formation: 25 },
    commElite:   { abonnement: 50, formation: 40 },
    withdrawMin: 5000
  };
  try {
    if (window.PaganiAPI) p = { ...p, ...(await PaganiAPI.getPricing()) };
  } catch(e) {}
  const plans = [
    { key: 'Starter', icon: 'fas fa-user',  color: 'var(--text2)', comm: p.commStarter, inputKey: 'commStarterC' },
    { key: 'Pro',     icon: 'fas fa-crown', color: 'var(--accent)', comm: p.commPro,     inputKey: 'commProC' },
    { key: 'Elite',   icon: 'fas fa-gem',   color: 'var(--gold)',   comm: p.commElite,   inputKey: 'commEliteC' },
  ];
  container.innerHTML = `
    <p style="font-size:0.82rem;color:var(--text2);margin-bottom:1.2rem">
      <i class="fas fa-info-circle" style="color:var(--accent)"></i>
      Les commissions sont calculees sur le montant paye par le filleul lors d'un abonnement ou d'un achat de formation.
    </p>
    <div class="comm-pricing-grid">
      ${plans.map(pl => `
      <div class="comm-pricing-card">
        <div class="comm-pricing-header" style="color:${pl.color}">
          <i class="${pl.icon}"></i>
          <strong>Plan ${pl.key}</strong>
        </div>
        <div class="comm-pricing-row">
          <label>Commission abonnement <small>(%)</small></label>
          <div class="comm-input-wrap">
            <input type="number" class="upgrade-input" id="${pl.inputKey}Abo" value="${pl.comm?.abonnement ?? 0}" min="0" max="100" step="1" />
            <span class="comm-pct-badge">%</span>
          </div>
        </div>
        <div class="comm-pricing-row">
          <label>Commission formation <small>(%)</small></label>
          <div class="comm-input-wrap">
            <input type="number" class="upgrade-input" id="${pl.inputKey}Form" value="${pl.comm?.formation ?? 0}" min="0" max="100" step="1" />
            <span class="comm-pct-badge">%</span>
          </div>
        </div>
        <div class="comm-pricing-example">
          <i class="fas fa-calculator" style="color:var(--text2)"></i>
          <span>Ex: abonnement Pro 30 000 AR - <strong id="commEx-${pl.key}" style="color:${pl.color}"></strong></span>
        </div>
      </div>`).join('')}
    </div>
    <div class="comm-pricing-withdraw">
      <div class="pricing-admin-card-header">
        <i class="fas fa-money-bill-wave" style="color:var(--accent2)"></i>
        <strong>Retrait minimum</strong>
      </div>
      <div style="display:flex;align-items:center;gap:0.8rem;flex-wrap:wrap;margin-top:0.6rem">
        <div style="display:flex;flex-direction:column;gap:0.3rem;flex:1;min-width:160px">
          <label style="font-size:0.78rem;color:var(--text2);font-weight:600">Montant minimum de retrait <small>(AR)</small></label>
          <input type="number" id="commWithdrawMinC" class="upgrade-input" value="${p.withdrawMin||5000}" min="0" step="500" style="max-width:200px" />
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.2rem;flex-wrap:wrap">
      <button class="btn-primary" style="padding:0.6rem 1.6rem" onclick="saveAdminCommissions()">
        <i class="fas fa-save"></i> Enregistrer les commissions
      </button>
      <p id="commPricingMsg" style="font-size:0.82rem;min-height:1rem"></p>
    </div>`;
  // Calculer les exemples
  _updateCommExamples();
  container.querySelectorAll('input[type=number]').forEach(inp => inp.addEventListener('input', _updateCommExamples));
}
function _updateCommExamples() {
  const plans = [
    { key: 'Starter', inputKey: 'commStarterC', proPrice: 30000 },
    { key: 'Pro',     inputKey: 'commProC',     proPrice: 30000 },
    { key: 'Elite',   inputKey: 'commEliteC',   proPrice: 30000 },
  ];
  plans.forEach(pl => {
    const rate = parseFloat(document.getElementById(`${pl.inputKey}Abo`)?.value) || 0;
    const amount = Math.round(pl.proPrice * rate / 100);
    const el = document.getElementById(`commEx-${pl.key}`);
    if (el) el.textContent = amount.toLocaleString('fr-FR') + ' AR';
  });
}
async function saveAdminCommissions() {
  const msg = document.getElementById('commPricingMsg');
  try {
    const p = await PaganiAPI.getPricing();
    const payload = {
      ...p,
      withdrawMin: parseInt(document.getElementById('commWithdrawMinC')?.value) || 0,
      commStarter: {
        abonnement: parseInt(document.getElementById('commStarterCAbo')?.value) || 0,
        formation:  parseInt(document.getElementById('commStarterCForm')?.value) || 0,
      },
      commPro: {
        abonnement: parseInt(document.getElementById('commProCAbo')?.value) || 0,
        formation:  parseInt(document.getElementById('commProCForm')?.value) || 0,
      },
      commElite: {
        abonnement: parseInt(document.getElementById('commEliteCAbo')?.value) || 0,
        formation:  parseInt(document.getElementById('commEliteCForm')?.value) || 0,
      },
    };
    await PaganiAPI.admin.updatePricing(payload);
    if (msg) { msg.style.color = 'var(--green)'; msg.textContent = 'Commissions mises a jour.'; }
  } catch(e) {
    if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'Erreur : ' + e.message; }
  }
  setTimeout(() => { if (msg) msg.textContent = ''; }, 4000);
}
// ===== ACHATS VIDEOS ADMIN =====
let _videoPurchasesCache = [];
let _videoPurchasesFilter = 'all';
async function renderAdminVideoPurchases() {
  const container = document.getElementById('adminVideoPurchasesList');
  if (!container) return;
  container.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    if (!_allUsersCache.length) _allUsersCache = await PaganiAPI.admin.getUsers();
    _videoPurchasesCache = await PaganiAPI.admin.getVideoPurchases();
  } catch(e) {
    _videoPurchasesCache = [];
  }
  _updateVideoPurchasesBadge();
  _renderFilteredVideoPurchases();
  // Scroller vers une demande spcifique si parametre URL
  const urlParams = new URLSearchParams(window.location.search);
  const purchaseId = urlParams.get('purchase');
  if (purchaseId) setTimeout(() => _scrollToVideoPurchaseCard(purchaseId), 400);
}
function _updateVideoPurchasesBadge() {
  const badge = document.getElementById('videoPurchasesBadge');
  if (!badge) return;
  const count = _videoPurchasesCache.filter(r => r.statut === 'En attente').length;
  if (count > 0) { badge.textContent = count; badge.style.display = 'inline-flex'; }
  else badge.style.display = 'none';
}
function filterVideoPurchases(status, btn) {
  _videoPurchasesFilter = status;
  document.querySelectorAll('#adminSection-videopurchases .admin-filter-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _renderFilteredVideoPurchases();
}
// ===== MODALE CONFIRMATION VP =====
let _vpConfirmResolve = null;
function _vpConfirm(type, r) {
  return new Promise(resolve => {
    _vpConfirmResolve = resolve;
    const modal   = document.getElementById('vpConfirmModal');
    const box     = document.getElementById('vpConfirmBox');
    const iconEl  = document.getElementById('vpConfirmIcon');
    const titleEl = document.getElementById('vpConfirmTitle');
    const subEl   = document.getElementById('vpConfirmSubtitle');
    const userEl  = document.getElementById('vpConfirmUser');
    const okBtn   = document.getElementById('vpConfirmOkBtn');
    const okLabel = document.getElementById('vpConfirmOkLabel');
    if (!modal) { resolve(true); return; }
    box.className = 'vp-confirm-box vp-confirm-' + type;
    if (type === 'approve') {
      iconEl.textContent  = '?';
      titleEl.textContent = 'Approuver cet achat ?';
      subEl.textContent   = 'L\'acces a la video sera debloque immediatement pour ce membre.';
      okLabel.textContent = 'Oui, approuver';
      okBtn.querySelector('i').className = 'fas fa-check';
    } else {
      iconEl.textContent  = '?';
      titleEl.textContent = 'Rejeter cette demande ?';
      subEl.textContent   = 'Le membre sera notifie du rejet. Cette action peut etre annulee.';
      okLabel.textContent = 'Oui, rejeter';
      okBtn.querySelector('i').className = 'fas fa-ban';
    }
    const user  = _allUsersCache.find(u => u.id === r.userId);
    const color = (user && user.avatarColor) ? user.avatarColor : '#6c63ff';
    const av    = (user && user.avatarPhoto)
      ? '<img src="' + user.avatarPhoto + '" style="width:38px;height:38px;border-radius:50%;object-fit:cover" />'
      : '<div class="vp-confirm-user-avatar" style="background:' + color + '">' + getInitials(r.userName || '?') + '</div>';
    const videoLabel = (r.videoTitle || ('Video #' + r.courseId));
    const amtLabel   = (r.amount || 0).toLocaleString('fr-FR') + ' AR';
    userEl.innerHTML = av + '<div class="vp-confirm-user-info"><strong>' + (r.userName || 'Utilisateur') + '</strong><small>' + videoLabel + ' — ' + amtLabel + '</small></div>';
    okBtn.onclick = function() { _vpConfirmClose(); _vpConfirmResolve = null; resolve(true); };
    modal.classList.add('vp-confirm-open');
  });
}
function _vpConfirmCancel() {
  _vpConfirmClose();
  if (_vpConfirmResolve) { _vpConfirmResolve(false); _vpConfirmResolve = null; }
}
function _vpConfirmClose() {
  const modal = document.getElementById('vpConfirmModal');
  if (modal) modal.classList.remove('vp-confirm-open');
}
function _vpTimeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
  if (diff < 1)  return { text: ' l\'instant', urgent: true };
  if (diff < 60) return { text: `Il y a ${diff} min`, urgent: diff < 30 };
  if (diff < 1440) return { text: `Il y a ${Math.floor(diff/60)}h`, urgent: false };
  return { text: new Date(dateStr).toLocaleDateString('fr-FR'), urgent: false };
}
function _vpShowToast(msg, type = 'success') {
  document.querySelectorAll('.vp-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = `vp-toast ${type}`;
  t.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${msg}`;
  document.body.appendChild(t);
  setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 400); }, 3000);
}
function _renderFilteredVideoPurchases() {
  const container = document.getElementById('adminVideoPurchasesList');
  if (!container) return;
  const list = _videoPurchasesFilter === 'all'
    ? _videoPurchasesCache
    : _videoPurchasesCache.filter(r => r.statut === _videoPurchasesFilter);
  // Compteurs
  const pending  = _videoPurchasesCache.filter(r => r.statut === 'En attente').length;
  const approved = _videoPurchasesCache.filter(r => r.statut === 'Approuve').length;
  const rejected = _videoPurchasesCache.filter(r => r.statut === 'Rejete').length;
  const counterHTML = `
    <div class="vp-section-counter">
      ${pending  ? `<span class="vp-counter-pill pending"><i class="fas fa-clock"></i> ${pending} en attente</span>` : ''}
      ${approved ? `<span class="vp-counter-pill approved"><i class="fas fa-check-circle"></i> ${approved} approuvee${approved>1?'s':''}</span>` : ''}
      ${rejected ? `<span class="vp-counter-pill rejected"><i class="fas fa-times-circle"></i> ${rejected} rejetee${rejected>1?'s':''}</span>` : ''}
    </div>`;
  if (!list.length) {
    container.innerHTML = counterHTML + '<div class="history-empty"><i class="fas fa-shopping-cart"></i><p>Aucune demande d\'Achat video.</p></div>';
    return;
  }
  const opColors = { 'MVola': '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
  const now = Date.now();
  container.innerHTML = counterHTML + list.map((r, idx) => {
    const statusClass = r.statut === 'En attente' ? 'status-pending'
                      : r.statut === 'Approuve'   ? 'status-paid'
                      : 'status-rejected';
    const statusIcon  = r.statut === 'En attente' ? 'fas fa-clock'
                      : r.statut === 'Approuve'   ? 'fas fa-check-circle'
                      : 'fas fa-times-circle';
    const opColor  = opColors[r.operator] || 'var(--accent)';
    const user     = _allUsersCache.find(u => u.id === r.userId);
    const av       = user?.avatarPhoto
      ? `<img src="${user.avatarPhoto}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0" />`
      : `<div class="avatar-circle avatar-sm" style="background:${user?.avatarColor||'#6c63ff'};flex-shrink:0">${getInitials(r.userName||'?')}</div>`;
    const timeInfo = _vpTimeAgo(r.createdAt);
    const isNew    = r.statut === 'En attente' && (now - new Date(r.createdAt)) < 3600000;
    const vpClass  = r.statut === 'En attente' ? 'vp-pending' : r.statut === 'Approuve' ? 'vp-approved' : 'vp-rejected';
    return `
    <div class="vp-card ${vpClass}" id="vp-${r.id}" style="animation-delay:${idx * 50}ms">
      <div class="vp-card-header">
        <div class="vp-card-user">
          ${av}
          <div>
            <strong>${r.userName || 'Utilisateur'}</strong>
            <small>${user?.email || ''}</small>
          </div>
        </div>
        <div class="vp-card-meta">
          ${isNew ? '<span class="vp-new-badge">Nouveau</span>' : ''}
          <span class="sub-plan-badge" style="background:rgba(245,158,11,0.15);color:var(--gold)">
            <i class="fas fa-film"></i> Achat video
          </span>
          <span class="status-badge ${statusClass}" id="vp-status-${r.id}">
            <i class="${statusIcon}"></i> ${r.statut}
          </span>
          <span class="vp-time-ago ${timeInfo.urgent ? 'vp-urgent' : ''}">
            <i class="fas fa-clock"></i> ${timeInfo.text}
          </span>
        </div>
      </div>
      <div class="vp-card-details">
        <div class="vp-detail-item">
          <i class="fas fa-play-circle" style="color:var(--accent)"></i>
          <span><strong>${r.videoTitle || 'Video #' + r.courseId}</strong><small>Formation</small></span>
        </div>
        <div class="vp-detail-item">
          <i class="fas fa-money-bill-wave" style="color:var(--accent2)"></i>
          <span><strong class="vp-amount-highlight">${(r.amount||0).toLocaleString('fr-FR')} AR</strong><small>Montant</small></span>
        </div>
        ${(r.phone || r.operator) ? `<div class="vp-detail-item"><i class="fas fa-mobile-alt" style="color:${opColor}"></i><span><strong>${r.operator||''}${r.mmName?' — '+r.mmName:''}</strong><small>${r.phone||''}</small></span></div>` : ''}
        <div class="vp-detail-item">
          <i class="fas fa-calendar-alt" style="color:var(--text2)"></i>
          <span><strong>${new Date(r.createdAt).toLocaleDateString('fr-FR')}</strong><small>${new Date(r.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</small></span>
        </div>
        ${r.txRef ? `
        <div class="vp-detail-item">
          <i class="fas fa-hashtag" style="color:var(--text2)"></i>
          <span><strong>${r.txRef}</strong><small>Reference</small></span>
        </div>` : ''}
      </div>
      <div class="vp-proof-zone">
        ${r.proof ? `
          <img src="${r.proof}" class="vp-proof-thumb" onclick="openVideoPurchaseProof(${r.id})" title="Voir la preuve" />
          <button class="vp-proof-btn" onclick="openVideoPurchaseProof(${r.id})">
            <i class="fas fa-camera"></i> Voir la preuve de paiement
          </button>` :
          `<span style="font-size:0.78rem;color:var(--text2);font-style:italic"><i class="fas fa-image"></i> Aucune preuve jointe</span>`
        }
      </div>
      <div id="vp-reject-modal-${r.id}"></div>
      <div class="vp-actions" id="vp-actions-${r.id}">
        ${_buildVideoPurchaseActions(r)}
      </div>
    </div>`;
  }).join('');
}
function _buildVideoPurchaseActions(r) {
  if (r.statut === 'En attente') {
    return `
      <button class="vp-btn-reject" id="vp-btn-reject-${r.id}" onclick="_vpShowRejectModal(${r.id})">
        <i class="fas fa-times"></i> Rejeter
      </button>
      <button class="vp-btn-approve" id="vp-btn-approve-${r.id}" onclick="approveVideoPurchase(${r.id})">
        <i class="fas fa-check"></i> Approuver et debloquer
      </button>`;
  }
  if (r.statut === 'Rejete') {
    return `
      <span class="vp-status-done rejected">
        <i class="fas fa-times-circle"></i>
        Rejete le ${r.treatedAt ? new Date(r.treatedAt).toLocaleDateString('fr-FR') : '—'}
        ${r.rejectReason ? `<em style="opacity:0.7;font-style:italic"> — ${r.rejectReason}</em>` : ''}
      </span>
      <button class="vp-btn-sm-approve" onclick="approveVideoPurchase(${r.id})">
        <i class="fas fa-undo"></i> Approuver quand meme
      </button>`;
  }
  return `
    <span class="vp-status-done approved">
      <i class="fas fa-check-circle"></i>
      Approuve le ${r.treatedAt ? new Date(r.treatedAt).toLocaleDateString('fr-FR') : '—'}
    </span>
    <button class="vp-btn-sm-reject" onclick="_vpShowRejectModal(${r.id})">
      <i class="fas fa-ban"></i> Annuler l'approbation
    </button>`;
}
function _vpShowRejectModal(id) {
  // Fermer toute modale ouverte
  document.querySelectorAll('[id^="vp-reject-modal-"]').forEach(el => el.innerHTML = '');
  const zone = document.getElementById('vp-reject-modal-' + id);
  if (!zone) return;
  const r = _videoPurchasesCache.find(x => x.id === id);
  const presets = ['Preuve invalide', 'Montant incorrect', 'Paiement non recu', 'Doublon'];
  zone.innerHTML = `
    <div class="vp-reject-modal">
      <div class="vp-reject-modal-header">
        <i class="fas fa-exclamation-triangle"></i>
        <strong>Rejeter - ${r ? (r.videoTitle || 'Video #' + r.courseId) : ''}</strong>
      </div>
      <div class="vp-reject-presets">
        ${presets.map(p => `<button class="vp-reject-preset" onclick="_vpSelectPreset(this,'vp-reject-reason-${id}')">${p}</button>`).join('')}
      </div>
      <input type="text" id="vp-reject-reason-${id}" class="vp-reject-input"
        placeholder="Raison du rejet (optionnel)" />
      <div class="vp-reject-actions">
        <button class="vp-reject-cancel" onclick="document.getElementById('vp-reject-modal-${id}').innerHTML=''">
          <i class="fas fa-times"></i> Annuler
        </button>
        <button class="vp-reject-confirm" onclick="rejectVideoPurchase(${id})">
          <i class="fas fa-ban"></i> Confirmer le rejet
        </button>
      </div>
    </div>`;
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function _vpSelectPreset(btn, inputId) {
  document.querySelectorAll('.vp-reject-preset').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const input = document.getElementById(inputId);
  if (input) input.value = btn.textContent;
}
async function approveVideoPurchase(id) {
  const r = _videoPurchasesCache.find(x => x.id === id);
  if (!r) return;
  const _ok1 = await _vpConfirm('approve', r);
  if (!_ok1) return;
  const rejectZone = document.getElementById('vp-reject-modal-' + id);
  if (rejectZone) rejectZone.innerHTML = '';
  const btn = document.getElementById('vp-btn-approve-' + id);
  if (btn) { btn.classList.add('vp-loading'); btn.innerHTML = '<i class="fas fa-spinner"></i> Traitement...'; }
  try {
    await PaganiAPI.admin.updateVideoPurchase(id, { statut: 'Approuvé' });
    r.statut = 'Approuve';
    r.treatedAt = new Date().toISOString();
    const card = document.getElementById('vp-' + id);
    if (card) {
      card.classList.remove('vp-pending', 'vp-rejected');
      card.classList.add('vp-approved', 'vp-just-approved');
      setTimeout(() => card.classList.remove('vp-just-approved'), 800);
    }
    const actionsEl = document.getElementById('vp-actions-' + id);
    const statusEl  = document.getElementById('vp-status-' + id);
    if (actionsEl) actionsEl.innerHTML = _buildVideoPurchaseActions(r);
    if (statusEl)  { statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Approuve'; statusEl.className = 'status-badge status-paid'; }
    _updateVideoPurchasesBadge();
    _vpShowToast('Acces debloque pour ' + r.userName);
  } catch(e) {
    if (btn) { btn.classList.remove('vp-loading'); btn.innerHTML = '<i class="fas fa-check"></i> Approuver et debloquer'; }
    _vpShowToast('Erreur : ' + e.message, 'error');
  }
}
async function rejectVideoPurchase(id) {
  const r = _videoPurchasesCache.find(x => x.id === id);
  if (!r) return;
  const _ok2 = await _vpConfirm('reject', r);
  if (!_ok2) return;
  const reasonInput = document.getElementById('vp-reject-reason-' + id);
  const reason = reasonInput ? reasonInput.value.trim() : '';
  const confirmBtn = document.querySelector('#vp-reject-modal-' + id + ' .vp-reject-confirm');
  if (confirmBtn) { confirmBtn.classList.add('vp-loading'); confirmBtn.innerHTML = '<i class="fas fa-spinner"></i> Traitement...'; }
  try {
    await PaganiAPI.admin.updateVideoPurchase(id, { statut: 'Rejeté', rejectReason: reason });
    r.statut = 'Rejete';
    r.rejectReason = reason;
    r.treatedAt = new Date().toISOString();
    const rejectZone = document.getElementById('vp-reject-modal-' + id);
    if (rejectZone) rejectZone.innerHTML = '';
    const card = document.getElementById('vp-' + id);
    if (card) {
      card.classList.remove('vp-pending', 'vp-approved');
      card.classList.add('vp-rejected', 'vp-just-rejected');
      setTimeout(() => card.classList.remove('vp-just-rejected'), 800);
    }
    const actionsEl = document.getElementById('vp-actions-' + id);
    const statusEl  = document.getElementById('vp-status-' + id);
    if (actionsEl) actionsEl.innerHTML = _buildVideoPurchaseActions(r);
    if (statusEl)  { statusEl.innerHTML = '<i class="fas fa-times-circle"></i> Rejete'; statusEl.className = 'status-badge status-rejected'; }
    _updateVideoPurchasesBadge();
    _vpShowToast('Demande rejetée' + (reason ? ' — ' + reason : ''), 'error');
  } catch(e) {
    if (confirmBtn) { confirmBtn.classList.remove('vp-loading'); confirmBtn.innerHTML = '<i class="fas fa-ban"></i> Confirmer le rejet'; }
    _vpShowToast('Erreur : ' + e.message, 'error');
  }
}
function openVideoPurchaseProof(id) {
  const r = _videoPurchasesCache.find(x => x.id === id);
  if (!r || !r.proof) return;
  const modal = document.getElementById('proofModal');
  const img   = document.getElementById('proofModalImg');
  const info  = document.getElementById('proofModalInfo');
  const dl    = document.getElementById('proofModalDownload');
  if (!modal || !img) return;
  if (info) info.textContent = `${r.userName} — ${r.videoTitle || 'Video'} — ${(r.amount||0).toLocaleString('fr-FR')} AR`;
  img.src = r.proof;
  if (dl) dl.href = r.proof;
  modal.style.display = 'flex';
}
function _scrollToVideoPurchaseCard(purchaseId) {
  const card = document.getElementById('vp-' + purchaseId);
  if (!card) return;
  const top = card.getBoundingClientRect().top + window.scrollY - 90;
  window.scrollTo({ top, behavior: 'smooth' });
  card.classList.add('sub-highlight');
  setTimeout(() => card.classList.remove('sub-highlight'), 3500);
}
// ===== ABONNEMENTS ADMIN =====
let _subsCache = [];
let _subsFilter = 'all';
async function renderAdminSubscriptions() {
  const container = document.getElementById('adminSubsList');
  if (!container) return;
  container.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    if (window.PaganiAPI) {
      // Charger les users si cache vide (ncessaire pour rcuprer les noms MM)
      if (!_allUsersCache.length) _allUsersCache = await PaganiAPI.admin.getUsers();
      _subsCache = await PaganiAPI.admin.getUpgradeRequests();
    }
  } catch(e) {}
  _updateSubsBadge();
  _renderFilteredSubs();
}
function _updateSubsBadge() {
  const badge = document.getElementById('subsPendingBadge');
  if (!badge) return;
  const count = _subsCache.filter(r => r.statut === 'En attente').length;
  if (count > 0) { badge.textContent = count; badge.style.display = 'inline-flex'; }
  else badge.style.display = 'none';
}
function filterSubsByStatus(status, btn) {
  _subsFilter = status;
  document.querySelectorAll('.admin-users-filters .admin-filter-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _renderFilteredSubs();
}
// Rcupre le nom MM depuis le cache utilisateurs si absent de la demande
function _getMmNameFromCache(r) {
  const user = _allUsersCache.find(u => u.id === r.userId);
  if (!user) return '—';
  // Chercher dans mmAccounts le compte correspondant a l'operateur utilise
  const acc = (user.mmAccounts || []).find(a => a.operator === r.operator && a.phone);
  if (acc && acc.name) return acc.name;
  // Fallback sur mmName racine
  if (user.mmName) return user.mmName;
  return user.name || '—';
}
function _renderFilteredSubs() {
  const container = document.getElementById('adminSubsList');
  if (!container) return;
  const list = _subsFilter === 'all' ? _subsCache : _subsCache.filter(r => r.statut === _subsFilter);
  if (!list.length) {
    container.innerHTML = '<div class="history-empty"><i class="fas fa-inbox"></i><p>Aucune demande.</p></div>';
    return;
  }
  const planColors = { Pro: 'var(--accent)', Elite: 'var(--gold)' };
  const planIcons  = { Pro: 'fas fa-crown',  Elite: 'fas fa-gem' };
  const opColors   = { 'MVola': '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
  container.innerHTML = list.map(r => {
    const statusClass = r.statut === 'En attente' ? 'status-pending'
                      : r.statut === 'Approuve'   ? 'status-paid'
                      : 'status-rejected';
    const statusIcon  = r.statut === 'En attente' ? 'fas fa-clock'
                      : r.statut === 'Approuve'   ? 'fas fa-check-circle'
                      : 'fas fa-times-circle';
    const opColor = opColors[r.operator] || 'var(--accent)';
    const user    = _allUsersCache.find(u => u.id === r.userId);
    const av = user?.avatarPhoto
      ? `<img src="${user.avatarPhoto}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0" />`
      : `<div class="avatar-circle avatar-sm" style="background:${user?.avatarColor||'#6c63ff'};flex-shrink:0">${getInitials(r.userName||'?')}</div>`;
    return `
    <div class="sub-request-card ${r.statut === 'En attente' ? 'sub-pending' : ''}" id="sub-${r.id}">
      <!-- EN-TTE -->
      <div class="sub-card-header">
        <div class="sub-card-user">
          ${av}
          <div>
            <strong>${r.userName}</strong>
            <small>${user?.email || ''}</small>
          </div>
        </div>
        <div class="sub-card-meta">
          <span class="sub-plan-badge" style="background:${planColors[r.plan]||'var(--accent)'}22;color:${planColors[r.plan]||'var(--accent)'}">
            <i class="${planIcons[r.plan]||'fas fa-crown'}"></i> ${r.plan}
          </span>
          <span class="status-badge ${statusClass}" id="sub-status-${r.id}">
            <i class="${statusIcon}"></i> ${r.statut}
          </span>
        </div>
      </div>
      <!-- DTAILS -->
      <div class="sub-card-details">
        <div class="sub-detail-item">
          <i class="fas fa-money-bill-wave" style="color:var(--accent2)"></i>
          <span><strong>${(r.amount||0).toLocaleString('fr-FR')} AR</strong><small>Montant</small></span>
        </div>
        <div class="sub-detail-item">
          <i class="fas fa-mobile-alt" style="color:${opColor}"></i>
          <span><strong>${r.operator}</strong><small>${r.phone}</small></span>
        </div>
        <div class="sub-detail-item">
          <i class="fas fa-user-tag" style="color:${opColor}"></i>
          <span><strong>${r.mmName || _getMmNameFromCache(r)}</strong><small>Nom compte MM</small></span>
        </div>
        <div class="sub-detail-item">
          <i class="fas fa-calendar-alt" style="color:var(--text2)"></i>
          <span><strong>${new Date(r.createdAt).toLocaleDateString('fr-FR')}</strong><small>${new Date(r.createdAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</small></span>
        </div>
        ${r.txRef ? `
        <div class="sub-detail-item">
          <i class="fas fa-hashtag" style="color:var(--text2)"></i>
          <span><strong>${r.txRef}</strong><small>Reference</small></span>
        </div>` : ''}
      </div>
      <!-- PREUVE -->
      <div class="sub-card-proof">
        ${r.proof
          ? `<button class="sub-proof-btn" onclick="openProofModal(${r.id})">
               <i class="fas fa-camera"></i> Voir la preuve de paiement
             </button>`
          : `<span style="font-size:0.78rem;color:var(--text2);font-style:italic">
               <i class="fas fa-image"></i> Aucune preuve jointe
             </span>`
        }
      </div>
      <!-- ZONE ACTION DYNAMIQUE -->
      <div class="sub-card-actions" id="sub-actions-${r.id}">
        ${_buildSubActions(r)}
      </div>
    </div>`;
  }).join('');
}
// Construit le HTML des actions selon l\'etat de la demande
function _buildSubActions(r) {
  if (r.statut === 'En attente') {
    return `
      <button class="sub-action-reject" onclick="openSubReject(${r.id})">
        <i class="fas fa-times"></i> Rejeter
      </button>
      <button class="sub-action-approve" onclick="openSubApprove(${r.id})">
        <i class="fas fa-check"></i> Approuver et activer le plan
      </button>`;
  }
  if (r.statut === 'Rejete') {
    return `
      <span style="font-size:0.78rem;color:var(--text2);display:flex;align-items:center;gap:0.4rem">
        <i class="fas fa-times-circle" style="color:var(--red)"></i>
        Rejete le ${r.treatedAt ? new Date(r.treatedAt).toLocaleDateString('fr-FR') : '—'}
        ${r.rejectReason ? `<em style="color:var(--red);opacity:0.8">— ${r.rejectReason}</em>` : ''}
      </span>
      <button class="sub-action-approve" style="font-size:0.78rem;padding:0.35rem 0.9rem" onclick="openSubApprove(${r.id})">
        <i class="fas fa-undo"></i> Approuver quand meme
      </button>`;
  }
  // Approuve
  return `
    <span style="font-size:0.78rem;color:var(--green);display:flex;align-items:center;gap:0.4rem">
      <i class="fas fa-check-circle"></i>
      Approuve le ${r.treatedAt ? new Date(r.treatedAt).toLocaleDateString('fr-FR') : '—'}
    </span>
    <button class="sub-action-reject" style="font-size:0.78rem;padding:0.35rem 0.9rem" onclick="openSubReject(${r.id})">
      <i class="fas fa-ban"></i> Annuler l'approbation
    </button>`;
}
// ===== MODALES INLINE APPROBATION / REJET =====
let _subActionTarget = null;
function openSubApprove(id) {
  const r = _subsCache.find(x => x.id === id);
  if (!r) return;
  _subActionTarget = id;
  const zone = document.getElementById(`sub-actions-${id}`);
  if (!zone) return;
  zone.innerHTML = `
    <div class="sub-inline-modal sub-inline-approve">
      <div class="sub-inline-header">
        <i class="fas fa-check-circle" style="color:var(--green);font-size:1.2rem"></i>
        <div>
          <strong>Confirmer l'approbation</strong>
          <p>Activer le plan <strong>${r.plan}</strong> pour <strong>${r.userName}</strong> ?<br>
          <span style="font-size:0.78rem;color:var(--text2)">L'utilisateur sera notifie immediatement.</span></p>
        </div>
      </div>
      <div class="sub-inline-actions">
        <button class="sub-inline-cancel" onclick="_cancelSubAction(${id})"><i class="fas fa-arrow-left"></i> Annuler</button>
        <button class="sub-inline-confirm approve" onclick="_confirmSubAction(${id}, 'Approuve')">
          <i class="fas fa-check"></i> Oui, activer le plan ${r.plan}
        </button>
      </div>
    </div>`;
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function openSubReject(id) {
  const r = _subsCache.find(x => x.id === id);
  if (!r) return;
  _subActionTarget = id;
  const zone = document.getElementById(`sub-actions-${id}`);
  if (!zone) return;
  zone.innerHTML = `
    <div class="sub-inline-modal sub-inline-reject">
      <div class="sub-inline-header">
        <i class="fas fa-times-circle" style="color:var(--red);font-size:1.2rem"></i>
        <div>
          <strong>Rejeter cette demande</strong>
          <p>Demande de <strong>${r.userName}</strong> — Plan <strong>${r.plan}</strong></p>
        </div>
      </div>
      <div class="sub-reject-reason-wrap">
        <label style="font-size:0.78rem;color:var(--text2);font-weight:600;display:block;margin-bottom:0.4rem">
          Raison du rejet <span style="opacity:0.6">(optionnel — envoyee a l\'utilisateur)</span>
        </label>
        <div class="sub-reject-presets">
          <button class="pay-reason-pill" onclick="_setRejectReason('Paiement non recu')">Paiement non recu</button>
          <button class="pay-reason-pill" onclick="_setRejectReason('Montant incorrect')">Montant incorrect</button>
          <button class="pay-reason-pill" onclick="_setRejectReason('Preuve invalide')">Preuve invalide</button>
          <button class="pay-reason-pill" onclick="_setRejectReason('Numero non reconnu')">Numero non reconnu</button>
        </div>
        <input type="text" id="rejectReasonInput-${id}" class="upgrade-input" placeholder="Raison personnalisee..." style="margin-top:0.5rem" />
      </div>
      <div class="sub-inline-actions">
        <button class="sub-inline-cancel" onclick="_cancelSubAction(${id})"><i class="fas fa-arrow-left"></i> Annuler</button>
        <button class="sub-inline-confirm reject" onclick="_confirmSubAction(${id}, 'Rejete')">
          <i class="fas fa-times"></i> Confirmer le rejet
        </button>
      </div>
    </div>`;
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function _setRejectReason(text) {
  const input = document.getElementById(`rejectReasonInput-${_subActionTarget}`);
  if (input) { input.value = text; input.focus(); }
}
function _cancelSubAction(id) {
  const r    = _subsCache.find(x => x.id === id);
  const zone = document.getElementById(`sub-actions-${id}`);
  if (zone && r) zone.innerHTML = _buildSubActions(r);
  _subActionTarget = null;
}
async function _confirmSubAction(id, statut) {
  const r = _subsCache.find(x => x.id === id);
  if (!r) return;
  const rejectReason = statut === 'Rejete'
    ? (document.getElementById(`rejectReasonInput-${id}`)?.value.trim() || '')
    : '';
  const zone = document.getElementById(`sub-actions-${id}`);
  if (zone) zone.innerHTML = `<div style="padding:0.5rem;color:var(--text2);font-size:0.82rem"><i class="fas fa-spinner fa-spin"></i> Traitement en cours...</div>`;
  try {
    const result = await PaganiAPI.admin.updateUpgradeRequest(id, { statut, rejectReason });
    r.statut       = statut;
    r.treatedAt    = new Date().toISOString();
    r.rejectReason = rejectReason;
    if (statut === 'Approuve') {
      const u = _allUsersCache.find(u => u.id === r.userId);
      if (u) u.plan = r.plan;
      // Rafraechir le token si c'est l\'utilisateur courant (cas rare mais possible)
      if (result._newToken && window._currentUser && window._currentUser.id === r.userId) {
        localStorage.setItem('pd_jwt', result._newToken);
        window._currentUser.plan = r.plan;
      }
    }
    _updateSubCard(r);
    _updateSubsBadge();
  } catch(e) {
    if (zone) zone.innerHTML = _buildSubActions(r);
    alert('Erreur : ' + e.message);
  }
  _subActionTarget = null;
}
// Met a jour uniquement la carte concerne sans re-render toute la liste
function _updateSubCard(r) {
  const card = document.getElementById(`sub-${r.id}`);
  if (!card) return;
  // Badge statut
  const statusEl = document.getElementById(`sub-status-${r.id}`);
  if (statusEl) {
    const statusClass = r.statut === 'Approuve' ? 'status-paid' : 'status-rejected';
    const statusIcon  = r.statut === 'Approuve' ? 'fas fa-check-circle' : 'fas fa-times-circle';
    statusEl.className = `status-badge ${statusClass}`;
    statusEl.innerHTML = `<i class="${statusIcon}"></i> ${r.statut}`;
  }
  // Bordure gauche
  card.classList.remove('sub-pending');
  // Zone actions
  const zone = document.getElementById(`sub-actions-${r.id}`);
  if (zone) {
    zone.innerHTML = _buildSubActions(r);
    // Animation flash
    zone.style.transition = 'background 0.4s';
    zone.style.background = r.statut === 'Approuve' ? 'rgba(0,212,170,0.08)' : 'rgba(255,77,109,0.06)';
    setTimeout(() => { zone.style.background = ''; }, 1200);
  }
}
function openProofModal(id) {
  const req = _subsCache.find(r => r.id === id);
  if (!req || !req.proof) return;
  const modal    = document.getElementById('proofModal');
  const img      = document.getElementById('proofModalImg');
  const info     = document.getElementById('proofModalInfo');
  const download = document.getElementById('proofModalDownload');
  img.src      = req.proof;
  download.href = req.proof;
  info.innerHTML = `
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:0.5rem">
      <span><i class="fas fa-user" style="color:var(--accent)"></i> <strong>${req.userName}</strong></span>
      <span><i class="fas fa-crown" style="color:var(--gold)"></i> Plan <strong>${req.plan}</strong></span>
      <span><i class="fas fa-money-bill-wave" style="color:var(--accent2)"></i> <strong>${(req.amount||0).toLocaleString('fr-FR')} AR</strong></span>
      <span><i class="fas fa-mobile-alt"></i> ${req.operator} — ${req.phone}</span>
    </div>`;
  modal.style.display = 'flex';
}

// ===== GESTION UTILISATEURS ADMIN =====
let _allUsersCache = [];
let _userPlanTarget = null;
let _userDeleteTarget = null;
let _userPlanFilter = 'all';
let _userSearchQuery = '';
async function renderAdminUsers() {
  const container = document.getElementById('adminAllUsers');
  if (!container) return;
  container.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    if (window.PaganiAPI) _allUsersCache = await PaganiAPI.admin.getUsers();
  } catch(e) {}
  _renderFilteredUsers();
}
function _renderFilteredUsers() {
  const container = document.getElementById('adminAllUsers');
  if (!container) return;
  let list = _allUsersCache.filter(u => u.role !== 'admin');
  if (_userPlanFilter !== 'all') list = list.filter(u => u.plan === _userPlanFilter);
  if (_userSearchQuery) {
    const q = _userSearchQuery.toLowerCase();
    list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  if (!list.length) {
    container.innerHTML = '<div class="history-empty"><i class="fas fa-users"></i><p>Aucun membre trouve.</p></div>';
    return;
  }
  const planColors = { Starter: 'var(--text2)', Pro: 'var(--accent)', Elite: 'var(--gold)' };
  container.innerHTML = list.map(u => {
    const av = u.avatarPhoto
      ? `<img src="${u.avatarPhoto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0" />`
      : `<div class="avatar-circle avatar-sm" style="background:${u.avatarColor||'#6c63ff'};flex-shrink:0">${getInitials(u.name)}</div>`;
    const statusColor = u.isActive ? 'var(--green)' : 'var(--red)';
    const statusLabel = u.isActive ? 'Actif' : 'Inactif';
    return `
      <div class="admin-user-row-full">
        <span class="admin-user-name">${av}<span>${u.name}<small>${u.email}</small></span></span>
        <span><span class="admin-plan-badge" style="background:${planColors[u.plan]||'var(--accent)'}">${u.plan}</span></span>
        <span class="green" style="font-size:0.82rem">${formatAR(u.earningsAR||0)}</span>
        <span style="font-size:0.82rem;color:var(--text2)">${u.refs||0}</span>
        <span style="font-size:0.78rem;color:var(--text2)">${new Date(u.createdAt).toLocaleDateString('fr-FR')}</span>
        <span><span class="status-badge" style="background:${statusColor}22;color:${statusColor}">${statusLabel}</span></span>
        <span class="admin-user-actions">
          <button class="admin-action-btn view" onclick="openUserCommissions(${u.id})" title="Voir commissions"><i class="fas fa-coins"></i></button>
          <button class="admin-action-btn plan" onclick="openChangePlan(${u.id})" title="Changer le plan"><i class="fas fa-crown"></i></button>
          <button class="admin-action-btn toggle" onclick="toggleUserStatus(${u.id})" title="${u.isActive?'Desactiver':'Activer'}"><i class="fas fa-${u.isActive?'ban':'check'}"></i></button>
          <button class="admin-action-btn del" onclick="openDeleteUser(${u.id})" title="Supprimer"><i class="fas fa-trash"></i></button>
        </span>
      </div>`;
  }).join('');
}
function filterAdminUsers(q) {
  _userSearchQuery = q.trim();
  _renderFilteredUsers();
}
function filterAdminUsersByPlan(plan, btn) {
  _userPlanFilter = plan;
  document.querySelectorAll('.admin-filter-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _renderFilteredUsers();
}
async function openUserCommissions(userId) {
  const user = _allUsersCache.find(u => u.id === userId);
  if (!user) return;
  const modal = document.getElementById('userCommModal');
  const title = document.getElementById('userCommModalTitle');
  const body  = document.getElementById('userCommModalBody');
  title.innerHTML = `<i class="fas fa-coins" style="color:var(--gold)"></i> Commissions — ${user.name}`;
  body.innerHTML  = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i></div>';
  modal.style.display = 'flex';
  let comms = [];
  try {
    if (window.PaganiAPI) {
      const t = localStorage.getItem('pd_jwt');
      const r = await fetch(`${API_URL}/admin/users/${userId}/commissions`, { headers: { Authorization: 'Bearer ' + t } });
      if (r.ok) comms = await r.json();
    }
  } catch(e) {}
  const total   = comms.reduce((s, c) => s + (c.montant||0), 0);
  const pending = comms.filter(c => c.statut === 'En attente').reduce((s, c) => s + (c.montant||0), 0);
  const paid    = comms.filter(c => c.statut === 'Verse').reduce((s, c) => s + (c.montant||0), 0);
  body.innerHTML = `
    <div class="user-comm-summary">
      <div class="user-comm-stat"><strong>${formatAR(total)}</strong><span>Total gagne</span></div>
      <div class="user-comm-stat"><strong style="color:var(--gold)">${formatAR(pending)}</strong><span>En attente</span></div>
      <div class="user-comm-stat"><strong style="color:var(--green)">${formatAR(paid)}</strong><span>Verse</span></div>
    </div>
    ${comms.length === 0
      ? '<div class="history-empty"><i class="fas fa-inbox"></i><p>Aucune commission.</p></div>'
      : `<div class="history-table">
          <div class="history-header" style="grid-template-columns:1fr 1.2fr 1.4fr 1fr 0.9fr">
            <span>Date</span><span>Filleul</span><span>Type</span><span>Montant</span><span>Statut</span>
          </div>
          ${comms.map(c => `
            <div class="history-row" style="grid-template-columns:1fr 1.2fr 1.4fr 1fr 0.9fr">
              <span>${new Date(c.createdAt).toLocaleDateString('fr-FR')}</span>
              <span>${c.filleulName||'—'}</span>
              <span><span class="history-type">${c.type}</span></span>
              <span class="green">${formatAR(c.montant)}</span>
              <span><span class="status-badge ${c.statut==='Verse'?'status-paid':'status-pending'}">${c.statut}</span></span>
            </div>`).join('')}
        </div>`
    }`;
}
function openChangePlan(userId) {
  const user = _allUsersCache.find(u => u.id === userId);
  if (!user) return;
  _userPlanTarget = userId;
  document.getElementById('userPlanModalName').textContent = `${user.name} — Plan actuel : ${user.plan}`;
  document.getElementById('userPlanModal').style.display = 'flex';
}
async function confirmChangePlan(plan) {
  if (!_userPlanTarget) return;
  document.getElementById('userPlanModal').style.display = 'none';
  try {
    if (window.PaganiAPI) await PaganiAPI.admin.updateUser(_userPlanTarget, { plan });
    const u = _allUsersCache.find(u => u.id === _userPlanTarget);
    if (u) u.plan = plan;
    _renderFilteredUsers();
  } catch(e) { alert('Erreur : ' + e.message); }
  _userPlanTarget = null;
}
async function toggleUserStatus(userId) {
  const user = _allUsersCache.find(u => u.id === userId);
  if (!user) return;
  const newStatus = !user.isActive;
  try {
    if (window.PaganiAPI) await PaganiAPI.admin.updateUser(userId, { isActive: newStatus });
    user.isActive = newStatus;
    _renderFilteredUsers();
  } catch(e) { alert('Erreur : ' + e.message); }
}
function openDeleteUser(userId) {
  const user = _allUsersCache.find(u => u.id === userId);
  if (!user) return;
  _userDeleteTarget = userId;
  document.getElementById('deleteUserName').textContent = `${user.name} (${user.email})`;
  document.getElementById('deleteUserConfirmBtn').onclick = confirmDeleteUser;
  document.getElementById('deleteUserModal').style.display = 'flex';
}
async function confirmDeleteUser() {
  if (!_userDeleteTarget) return;
  document.getElementById('deleteUserModal').style.display = 'none';
  try {
    const t = localStorage.getItem('pd_jwt');
    await fetch(`${API_URL}/admin/users/${_userDeleteTarget}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + t } });
    _allUsersCache = _allUsersCache.filter(u => u.id !== _userDeleteTarget);
    _renderFilteredUsers();
    await loadAdminStats();
  } catch(e) { alert('Erreur : ' + e.message); }
  _userDeleteTarget = null;
}

document.addEventListener("DOMContentLoaded", async () => {
  // Nettoyer les anciens caches locaux
  ['pd_news','pd_courses','pd_payment_accounts','pd_session'].forEach(k => localStorage.removeItem(k));
  const user = await refreshCurrentUser();
  if (window.PaganiNotif) {
    PaganiNotif.startPolling();
    if (user) PaganiNotif.refreshBadge();
    if (user && 'Notification' in window && Notification.permission === 'granted') {
      initPushNotifications();
    } else if (user && 'Notification' in window && Notification.permission === 'default') {
      setTimeout(showPushBanner, 4000);
    }
  }
  // Toujours afficher le feed et les cours (meme sans etre connect)
  if (window.PaganiAPI) {
    try { const vids = await PaganiAPI.getVideos(); if (vids && vids.length) _adminVideosCache = vids; } catch(e) {}
  }
  renderFeed();
  renderCourses();
  updateFormationsStats();
  updateNavbar(user);
  loadNavbarCustomBtn();
  // Dashboard : afficher si connect, sinon laisser loginSection visible
  const loginSection = document.getElementById("loginSection");
  if (loginSection) {
    if (user) {
      showDashboard(user);
      await updateAffiliateStats(user);
    }
    // Si pas connect, loginSection reste visible (comportement normal)
  }
  // Gestion des parametres URL
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam     = urlParams.get('tab');
  const sectionParam = urlParams.get('section');
  if (tabParam && user) {
    const tabBtn = document.querySelector(`[onclick*="switchTab('${tabParam}'"]`);
    if (tabBtn && tabBtn.style.display !== 'none') {
      switchTab(tabParam, tabBtn);
      if (tabParam === 'admin' && sectionParam) {
        setTimeout(() => {
          const subBtn = document.querySelector(`[onclick*="switchAdminSection('${sectionParam}'"]`);
          if (subBtn) switchAdminSection(sectionParam, subBtn);
          const subId = urlParams.get('sub');
          if (subId && sectionParam === 'subscriptions') {
            setTimeout(() => _scrollToSubCard(subId), 800);
          }
        }, 200);
      }
      const subId = urlParams.get('sub');
      if (subId && tabParam === 'subscription') {
        setTimeout(() => _scrollToSubCard(subId), 600);
      }
      const hash = window.location.hash;
      if (hash) {
        setTimeout(() => {
          const target = document.getElementById(hash.slice(1));
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            target.classList.add('mm-highlight');
            setTimeout(() => target.classList.remove('mm-highlight'), 2000);
          }
        }, 300);
      }
    }
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
});
// ===== VUE UTILISATEUR - MES ACHATS VIDEO =====
async function renderUserVideoPurchases() {
  const container = document.getElementById('myVideosPurchaseList');
  if (!container) return;
  container.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i></div>';
  let purchases = [];
  try { purchases = await PaganiAPI.getMyVideoPurchases(); } catch(e) {}
  const badge = document.getElementById('myVideosPendingBadge');
  if (badge) {
    const pending = purchases.filter(p => p.statut === 'En attente').length;
    badge.textContent = pending;
    badge.style.display = pending > 0 ? 'inline-flex' : 'none';
  }
  if (!purchases.length) {
    container.innerHTML = '<div class="sub-user-empty"><i class="fas fa-film"></i><p>Aucun achat vid\u00e9o pour le moment.</p><a href="formations.html" class="btn-primary" style="margin-top:0.8rem"><i class="fas fa-play"></i> Voir les formations</a></div>';
    return;
  }
  const opColors = { 'MVola': '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
  const now = Date.now();
  const pending  = purchases.filter(r => r.statut === 'En attente').length;
  const approved = purchases.filter(r => r.statut === 'Approuv\u00e9').length;
  const rejected = purchases.filter(r => r.statut === 'Rejet\u00e9' || r.statut === 'Rejete').length;
  const counterHTML = [
    '<div class="vp-section-counter">',
    pending  ? '<span class="vp-counter-pill pending"><i class="fas fa-clock"></i> ' + pending + ' en attente</span>' : '',
    approved ? '<span class="vp-counter-pill approved"><i class="fas fa-check-circle"></i> ' + approved + ' approuv\u00e9e' + (approved > 1 ? 's' : '') + '</span>' : '',
    rejected ? '<span class="vp-counter-pill rejected"><i class="fas fa-times-circle"></i> ' + rejected + ' rejet\u00e9e' + (rejected > 1 ? 's' : '') + '</span>' : '',
    '</div>'
  ].join('');
  container.innerHTML = counterHTML + purchases.map(function(r, idx) {
    const isApproved = r.statut === 'Approuv\u00e9';
    const isRejected = r.statut === 'Rejet\u00e9' || r.statut === 'Rejete';
    const isPending  = r.statut === 'En attente';
    const vpClass    = isPending ? 'vp-pending' : isApproved ? 'vp-approved' : 'vp-rejected';
    const statusClass = isPending ? 'status-pending' : isApproved ? 'status-paid' : 'status-rejected';
    const statusIcon  = isPending ? 'fas fa-clock' : isApproved ? 'fas fa-check-circle' : 'fas fa-times-circle';
    const opColor  = opColors[r.operator] || 'var(--accent)';
    const timeInfo = _vpTimeAgo(r.createdAt);
    const isNew    = isPending && (now - new Date(r.createdAt)) < 3600000;
    const mmLine = (r.phone || r.operator)
      ? '<div class="vp-detail-item"><i class="fas fa-mobile-alt" style="color:' + opColor + '"></i><span><strong>' + (r.operator || '') + (r.mmName ? ' \u2014 ' + r.mmName : '') + '</strong><small>' + (r.phone || '') + '</small></span></div>'
      : '';
    const txLine = r.txRef
      ? '<div class="vp-detail-item"><i class="fas fa-hashtag" style="color:var(--text2)"></i><span><strong>' + r.txRef + '</strong><small>R\u00e9f\u00e9rence</small></span></div>'
      : '';
    let statusMsg = '';
    if (isApproved) {
      statusMsg = '<div class="sub-user-status-msg approved"><i class="fas fa-check-circle"></i><div><strong>Acc\u00e8s d\u00e9bloqu\u00e9 !</strong><p>Vous pouvez maintenant regarder cette formation.</p></div><a href="formations.html" class="btn-primary" style="padding:0.45rem 1rem;font-size:0.82rem;white-space:nowrap"><i class="fas fa-play"></i> Regarder</a></div>';
    } else if (isPending) {
      statusMsg = '<div class="sub-user-status-msg pending"><i class="fas fa-clock"></i><div><strong>En cours de v\u00e9rification</strong><p>Votre paiement est en cours de v\u00e9rification. Acc\u00e8s activ\u00e9 sous 24h.</p></div></div>';
    } else if (isRejected) {
      statusMsg = '<div class="sub-user-status-msg rejected"><i class="fas fa-times-circle"></i><div><strong>Demande rejet\u00e9e</strong>' + (r.rejectReason ? '<p><strong>Raison :</strong> ' + r.rejectReason + '</p>' : '<p>Contactez le support.</p>') + '</div></div>';
    }
    return '<div class="vp-card ' + vpClass + '" id="myvp-' + r.id + '" style="animation-delay:' + (idx * 50) + 'ms">'
      + '<div class="vp-card-header">'
      + '<div class="vp-card-user"><div><strong>' + (r.videoTitle || 'Vid\u00e9o #' + r.courseId) + '</strong><small>' + new Date(r.createdAt).toLocaleDateString('fr-FR') + '</small></div></div>'
      + '<div class="vp-card-meta">'
      + (isNew ? '<span class="vp-new-badge">Nouveau</span>' : '')
      + '<span class="sub-plan-badge" style="background:rgba(245,158,11,0.15);color:var(--gold)"><i class="fas fa-film"></i> Vid\u00e9o</span>'
      + '<span class="status-badge ' + statusClass + '"><i class="' + statusIcon + '"></i> ' + r.statut + '</span>'
      + '<span class="vp-time-ago' + (timeInfo.urgent ? ' vp-urgent' : '') + '"><i class="fas fa-clock"></i> ' + timeInfo.text + '</span>'
      + '</div></div>'
      + '<div class="vp-card-details">'
      + '<div class="vp-detail-item"><i class="fas fa-money-bill-wave" style="color:var(--accent2)"></i><span><strong class="vp-amount-highlight">' + (r.amount || 0).toLocaleString('fr-FR') + ' AR</strong><small>Montant pay\u00e9</small></span></div>'
      + mmLine + txLine
      + '</div>'
      + statusMsg
      + '</div>';
  }).join('');
}
// ===== POLLING ADMIN - BADGE TEMPS REL =====
let _adminPollInterval = null;
function _startAdminPolling() {
  if (_adminPollInterval) return;
  _adminPollInterval = setInterval(async () => {
    const user = getUser();
    if (!user || user.role !== 'admin') { clearInterval(_adminPollInterval); _adminPollInterval = null; return; }
    try {
      const [purchases, modPurchases] = await Promise.all([
        PaganiAPI.admin.getVideoPurchases(),
        PaganiAPI.admin.getModulePurchases()
      ]);
      const prevVP = _videoPurchasesCache.filter(r => r.statut === 'En attente').length;
      const newVP  = purchases.filter(r => r.statut === 'En attente').length;
      if (newVP !== prevVP) {
        _videoPurchasesCache = purchases;
        _updateVideoPurchasesBadge();
        const section = document.getElementById('adminSection-videopurchases');
        if (section && section.style.display !== 'none') _renderFilteredVideoPurchases();
      }
      const prevMP = _modulePurchasesCache.filter(r => r.statut === 'En attente').length;
      const newMP  = modPurchases.filter(r => r.statut === 'En attente').length;
      if (newMP !== prevMP) {
        _modulePurchasesCache = modPurchases;
        _updateModulePurchasesBadge();
        const section = document.getElementById('adminSection-modulepurchases');
        if (section && section.style.display !== 'none') _renderFilteredModulePurchases();
      }
    } catch(e) {}
  }, 30000);
}
// ===== GESTION MODULES VIDEO ADMIN =====
let _modulesCache = [];
let _editingModuleId = null;
let _moduleModalFromVideo = false;

// ===== GESTION MODULES VIDEO ADMIN =====
_modulesCache = [];
_editingModuleId = null;
_moduleModalFromVideo = false;

// ===== ADMIN — ACHATS MODULES =====
let _modulePurchasesCache = [];
let _modulePurchasesFilter = 'all';
async function renderAdminModulePurchases() {
  const container = document.getElementById('adminModulePurchasesList');
  if (!container) return;
  container.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    if (!_allUsersCache.length) _allUsersCache = await PaganiAPI.admin.getUsers();
    _modulePurchasesCache = await PaganiAPI.admin.getModulePurchases();
  } catch(e) { _modulePurchasesCache = []; }
  _updateModulePurchasesBadge();
  _renderFilteredModulePurchases();
}
function _updateModulePurchasesBadge() {
  const badge = document.getElementById('modulePurchasesBadge');
  if (!badge) return;
  const count = _modulePurchasesCache.filter(r => r.statut === 'En attente').length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
}
function filterModulePurchases(status, btn) {
  _modulePurchasesFilter = status;
  document.querySelectorAll('#adminSection-modulepurchases .admin-filter-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _renderFilteredModulePurchases();
}
function _renderFilteredModulePurchases() {
  const container = document.getElementById('adminModulePurchasesList');
  if (!container) return;
  const list = _modulePurchasesFilter === 'all'
    ? _modulePurchasesCache
    : _modulePurchasesCache.filter(r => r.statut === _modulePurchasesFilter);
  const pending  = _modulePurchasesCache.filter(r => r.statut === 'En attente').length;
  const approved = _modulePurchasesCache.filter(r => r.statut === 'Approuv\u00e9').length;
  const rejected = _modulePurchasesCache.filter(r => r.statut === 'Rejet\u00e9' || r.statut === 'Rejete').length;
  const counterHTML = [
    '<div class="vp-section-counter">',
    pending  ? '<span class="vp-counter-pill pending"><i class="fas fa-clock"></i> ' + pending + ' en attente</span>' : '',
    approved ? '<span class="vp-counter-pill approved"><i class="fas fa-check-circle"></i> ' + approved + ' approuv\u00e9e' + (approved>1?'s':'') + '</span>' : '',
    rejected ? '<span class="vp-counter-pill rejected"><i class="fas fa-times-circle"></i> ' + rejected + ' rejet\u00e9e' + (rejected>1?'s':'') + '</span>' : '',
    '</div>'
  ].join('');
  if (!list.length) {
    container.innerHTML = counterHTML + '<div class="history-empty"><i class="fas fa-layer-group"></i><p>Aucun achat de module.</p></div>';
    return;
  }
  const opColors = { 'MVola': '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
  const now = Date.now();
  container.innerHTML = counterHTML + list.map(function(r, idx) {
    const statusClass = r.statut === 'En attente' ? 'status-pending' : r.statut === 'Approuv\u00e9' ? 'status-paid' : 'status-rejected';
    const statusIcon  = r.statut === 'En attente' ? 'fas fa-clock' : r.statut === 'Approuv\u00e9' ? 'fas fa-check-circle' : 'fas fa-times-circle';
    const opColor  = opColors[r.operator] || 'var(--accent)';
    const user     = _allUsersCache.find(function(u) { return u.id === r.userId; });
    const av       = (user && user.avatarPhoto)
      ? '<img src="' + user.avatarPhoto + '" style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0" />'
      : '<div class="avatar-circle avatar-sm" style="background:' + ((user && user.avatarColor) || '#6c63ff') + ';flex-shrink:0">' + getInitials(r.userName || '?') + '</div>';
    const timeInfo = _vpTimeAgo(r.createdAt);
    const isNew    = r.statut === 'En attente' && (now - new Date(r.createdAt)) < 3600000;
    const vpClass  = r.statut === 'En attente' ? 'vp-pending' : r.statut === 'Approuv\u00e9' ? 'vp-approved' : 'vp-rejected';
    const mmLine   = (r.phone || r.operator) ? '<div class="vp-detail-item"><i class="fas fa-mobile-alt" style="color:' + opColor + '"></i><span><strong>' + (r.operator || '') + (r.mmName ? ' \u2014 ' + r.mmName : '') + '</strong><small>' + (r.phone || '') + '</small></span></div>' : '';
    const txLine   = r.txRef ? '<div class="vp-detail-item"><i class="fas fa-hashtag" style="color:var(--text2)"></i><span><strong>' + r.txRef + '</strong><small>R\u00e9f\u00e9rence</small></span></div>' : '';
    const proofZone = r.proof
      ? '<img src="' + r.proof + '" class="vp-proof-thumb" onclick="openModulePurchaseProof(' + r.id + ')" title="Voir la preuve" /><button class="vp-proof-btn" onclick="openModulePurchaseProof(' + r.id + ')"><i class="fas fa-camera"></i> Voir la preuve de paiement</button>'
      : '<span style="font-size:0.78rem;color:var(--text2);font-style:italic"><i class="fas fa-image"></i> Aucune preuve jointe</span>';
    return '<div class="vp-card ' + vpClass + '" id="mpc-' + r.id + '" style="animation-delay:' + (idx * 50) + 'ms">'
      + '<div class="vp-card-header">'
      + '<div class="vp-card-user">' + av + '<div><strong>' + (r.userName || 'Utilisateur') + '</strong><small>' + ((user && user.email) || '') + '</small></div></div>'
      + '<div class="vp-card-meta">'
      + (isNew ? '<span class="vp-new-badge">Nouveau</span>' : '')
      + '<span class="sub-plan-badge" style="background:rgba(108,99,255,0.15);color:var(--accent)"><i class="fas fa-layer-group"></i> Achat module</span>'
      + '<span class="status-badge ' + statusClass + '" id="mpc-status-' + r.id + '"><i class="' + statusIcon + '"></i> ' + r.statut + '</span>'
      + '<span class="vp-time-ago' + (timeInfo.urgent ? ' vp-urgent' : '') + '"><i class="fas fa-clock"></i> ' + timeInfo.text + '</span>'
      + '</div></div>'
      + '<div class="vp-card-details">'
      + '<div class="vp-detail-item"><i class="fas fa-layer-group" style="color:var(--accent)"></i><span><strong>' + (r.moduleTitle || 'Module #' + r.moduleId) + '</strong><small>Module</small></span></div>'
      + '<div class="vp-detail-item"><i class="fas fa-money-bill-wave" style="color:var(--accent2)"></i><span><strong class="vp-amount-highlight">' + (r.amount || 0).toLocaleString('fr-FR') + ' AR</strong><small>Montant</small></span></div>'
      + mmLine
      + '<div class="vp-detail-item"><i class="fas fa-calendar-alt" style="color:var(--text2)"></i><span><strong>' + new Date(r.createdAt).toLocaleDateString('fr-FR') + '</strong><small>' + new Date(r.createdAt).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}) + '</small></span></div>'
      + txLine
      + '</div>'
      + '<div class="vp-proof-zone">' + proofZone + '</div>'
      + '<div id="mpc-reject-modal-' + r.id + '"></div>'
      + '<div class="vp-actions" id="mpc-actions-' + r.id + '">' + _buildModulePurchaseActions(r) + '</div>'
      + '</div>';
  }).join('');
}
function _buildModulePurchaseActions(r) {
  if (r.statut === 'En attente') {
    return '<button class="vp-btn-reject" id="mpc-btn-reject-' + r.id + '" onclick="_mpcShowRejectModal(' + r.id + ')"><i class="fas fa-times"></i> Rejeter</button>'
      + '<button class="vp-btn-approve" id="mpc-btn-approve-' + r.id + '" onclick="approveModulePurchase(' + r.id + ')"><i class="fas fa-check"></i> Approuver et d\u00e9bloquer</button>';
  }
  if (r.statut === 'Rejet\u00e9' || r.statut === 'Rejete') {
    return '<span class="vp-status-done rejected"><i class="fas fa-times-circle"></i> Rejet\u00e9 le ' + (r.treatedAt ? new Date(r.treatedAt).toLocaleDateString('fr-FR') : '\u2014') + (r.rejectReason ? ' <em style="opacity:0.7;font-style:italic"> \u2014 ' + r.rejectReason + '</em>' : '') + '</span>'
      + '<button class="vp-btn-sm-approve" onclick="approveModulePurchase(' + r.id + ')"><i class="fas fa-undo"></i> Approuver quand m\u00eame</button>';
  }
  return '<span class="vp-status-done approved"><i class="fas fa-check-circle"></i> Approuv\u00e9 le ' + (r.treatedAt ? new Date(r.treatedAt).toLocaleDateString('fr-FR') : '\u2014') + '</span>'
    + '<button class="vp-btn-sm-reject" onclick="_mpcShowRejectModal(' + r.id + ')"><i class="fas fa-ban"></i> Annuler l\u2019approbation</button>';
}
function _mpcShowRejectModal(id) {
  document.querySelectorAll('[id^="mpc-reject-modal-"]').forEach(function(el) { el.innerHTML = ''; });
  const zone = document.getElementById('mpc-reject-modal-' + id);
  if (!zone) return;
  const r = _modulePurchasesCache.find(function(x) { return x.id === id; });
  const presets = ['Preuve invalide', 'Montant incorrect', 'Paiement non re\u00e7u', 'Doublon'];
  zone.innerHTML = '<div class="vp-reject-modal">'
    + '<div class="vp-reject-modal-header"><i class="fas fa-exclamation-triangle"></i><strong>Rejeter \u2014 ' + (r ? (r.moduleTitle || 'Module #' + r.moduleId) : '') + '</strong></div>'
    + '<div class="vp-reject-presets">' + presets.map(function(p) { return '<button class="vp-reject-preset" onclick="_mpcSelectPreset(this,\'mpc-reject-reason-' + id + '\')">' + p + '</button>'; }).join('') + '</div>'
    + '<input type="text" id="mpc-reject-reason-' + id + '" class="vp-reject-input" placeholder="Raison du rejet (optionnel)" />'
    + '<div class="vp-reject-actions">'
    + '<button class="vp-reject-cancel" onclick="document.getElementById(\'mpc-reject-modal-' + id + '\').innerHTML=\'\'"><i class="fas fa-times"></i> Annuler</button>'
    + '<button class="vp-reject-confirm" onclick="rejectModulePurchase(' + id + ')"><i class="fas fa-ban"></i> Confirmer le rejet</button>'
    + '</div></div>';
  zone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function _mpcSelectPreset(btn, inputId) {
  document.querySelectorAll('.vp-reject-preset').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
  const input = document.getElementById(inputId);
  if (input) input.value = btn.textContent;
}
async function approveModulePurchase(id) {
  const r = _modulePurchasesCache.find(function(x) { return x.id === id; });
  if (!r) return;
  const ok = await _vpConfirm('approve', Object.assign({}, r, { videoTitle: r.moduleTitle || 'Module #' + r.moduleId, courseId: r.moduleId }));
  if (!ok) return;
  const rejectZone = document.getElementById('mpc-reject-modal-' + id);
  if (rejectZone) rejectZone.innerHTML = '';
  const btn = document.getElementById('mpc-btn-approve-' + id);
  if (btn) { btn.classList.add('vp-loading'); btn.innerHTML = '<i class="fas fa-spinner"></i> Traitement...'; }
  try {
    await PaganiAPI.admin.updateModulePurchase(id, { statut: 'Approuv\u00e9' });
    r.statut = 'Approuv\u00e9';
    r.treatedAt = new Date().toISOString();
    const card = document.getElementById('mpc-' + id);
    if (card) { card.classList.remove('vp-pending','vp-rejected'); card.classList.add('vp-approved','vp-just-approved'); setTimeout(function() { card.classList.remove('vp-just-approved'); }, 800); }
    const actionsEl = document.getElementById('mpc-actions-' + id);
    const statusEl  = document.getElementById('mpc-status-' + id);
    if (actionsEl) actionsEl.innerHTML = _buildModulePurchaseActions(r);
    if (statusEl)  { statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Approuv\u00e9'; statusEl.className = 'status-badge status-paid'; }
    _updateModulePurchasesBadge();
    _vpShowToast('\u2705 Module d\u00e9bloqu\u00e9 pour ' + r.userName);
  } catch(e) {
    if (btn) { btn.classList.remove('vp-loading'); btn.innerHTML = '<i class="fas fa-check"></i> Approuver et d\u00e9bloquer'; }
    _vpShowToast('Erreur : ' + e.message, 'error');
  }
}
async function rejectModulePurchase(id) {
  const r = _modulePurchasesCache.find(function(x) { return x.id === id; });
  if (!r) return;
  const ok = await _vpConfirm('reject', Object.assign({}, r, { videoTitle: r.moduleTitle || 'Module #' + r.moduleId, courseId: r.moduleId }));
  if (!ok) return;
  const reasonInput = document.getElementById('mpc-reject-reason-' + id);
  const reason = reasonInput ? reasonInput.value.trim() : '';
  const confirmBtn = document.querySelector('#mpc-reject-modal-' + id + ' .vp-reject-confirm');
  if (confirmBtn) { confirmBtn.classList.add('vp-loading'); confirmBtn.innerHTML = '<i class="fas fa-spinner"></i> Traitement...'; }
  try {
    await PaganiAPI.admin.updateModulePurchase(id, { statut: 'Rejeté', rejectReason: reason });
    r.statut = 'Rejet\u00e9';
    r.rejectReason = reason;
    r.treatedAt = new Date().toISOString();
    const rejectZone = document.getElementById('mpc-reject-modal-' + id);
    if (rejectZone) rejectZone.innerHTML = '';
    const card = document.getElementById('mpc-' + id);
    if (card) { card.classList.remove('vp-pending','vp-approved'); card.classList.add('vp-rejected','vp-just-rejected'); setTimeout(function() { card.classList.remove('vp-just-rejected'); }, 800); }
    const actionsEl = document.getElementById('mpc-actions-' + id);
    const statusEl  = document.getElementById('mpc-status-' + id);
    if (actionsEl) actionsEl.innerHTML = _buildModulePurchaseActions(r);
    if (statusEl)  { statusEl.innerHTML = '<i class="fas fa-times-circle"></i> Rejet\u00e9'; statusEl.className = 'status-badge status-rejected'; }
    _updateModulePurchasesBadge();
    _vpShowToast('Demande rejet\u00e9e' + (reason ? ' \u2014 ' + reason : ''), 'error');
  } catch(e) {
    if (confirmBtn) { confirmBtn.classList.remove('vp-loading'); confirmBtn.innerHTML = '<i class="fas fa-ban"></i> Confirmer le rejet'; }
    _vpShowToast('Erreur : ' + e.message, 'error');
  }
}
function openModulePurchaseProof(id) {
  const r = _modulePurchasesCache.find(function(x) { return x.id === id; });
  if (!r || !r.proof) return;
  const modal = document.getElementById('proofModal');
  const img   = document.getElementById('proofModalImg');
  const info  = document.getElementById('proofModalInfo');
  const dl    = document.getElementById('proofModalDownload');
  if (!modal || !img) return;
  if (info) info.textContent = (r.userName || '') + ' \u2014 ' + (r.moduleTitle || 'Module') + ' \u2014 ' + (r.amount || 0).toLocaleString('fr-FR') + ' AR';
  img.src = r.proof;
  if (dl) dl.href = r.proof;
  modal.style.display = 'flex';
}
async function renderAdminModules() {
  const container = document.getElementById('adminModulesList');
  if (!container) return;
  container.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i><p>Chargement...</p></div>';
  try {
    _modulesCache = await PaganiAPI.admin.getVideoModules();
  } catch(e) {
    container.innerHTML = '<div class="history-empty"><i class="fas fa-layer-group"></i><p>Erreur de chargement.</p></div>';
    return;
  }
  if (!_modulesCache.length) {
    container.innerHTML = '<div class="history-empty"><i class="fas fa-layer-group"></i><p>Aucun module créé. Cliquez sur <strong>Nouveau module</strong> pour commencer.</p></div>';
    return;
  }
  var typeBadges = {
    public: { label: 'Public', color: 'var(--green)', icon: 'fa-users' },
    admin_private: { label: 'Privé Admin', color: 'var(--red)', icon: 'fa-lock' },
    trainer_private: { label: 'Privé Formateur', color: 'var(--accent)', icon: 'fa-chalkboard-teacher' }
  };
  container.innerHTML = _modulesCache.map(function(m) {
    var color = m.color || '#6c63ff';
    var icon  = m.icon  || 'fas fa-layer-group';
    var type  = m.type  || 'public';
    var badge = typeBadges[type] || typeBadges.public;
    var isTrainer = type === 'trainer_private';
    var fmt = function(n) { return Number(n).toLocaleString('fr-FR'); };
    return '<div style="display:flex;align-items:center;gap:1rem;padding:0.9rem 1rem;background:var(--bg2);border:1px solid var(--border);border-radius:12px;margin-bottom:0.6rem">' +
      '<span style="width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;background:' + color + '22;color:' + color + '">' +
      '<i class="' + icon + '"></i></span>' +
      '<div style="flex:1;min-width:0">' +
      '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.2rem">' +
      '<strong style="font-size:0.95rem">' + m.title + '</strong>' +
      '<span style="font-size:0.72rem;font-weight:700;color:' + badge.color + ';background:' + badge.color + '18;border:1px solid ' + badge.color + '44;padding:0.15rem 0.5rem;border-radius:50px;white-space:nowrap">' +
      '<i class="fas ' + badge.icon + '"></i> ' + badge.label + '</span>' +
      (m.modulePrice ? '<span style="font-size:0.72rem;font-weight:700;color:var(--gold);background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);padding:0.15rem 0.5rem;border-radius:50px"><i class="fas fa-tag"></i> ' + fmt(m.modulePrice) + ' AR</span>' : '') +
      '</div>' +
      (m.description ? '<span style="font-size:0.78rem;color:var(--text2)">' + m.description + '</span>' : '') +
      '<span style="font-size:0.72rem;color:var(--text2);display:block;margin-top:0.2rem">Position : ' + (m.position || 0) + '</span>' +
      '</div>' +
      '<div style="display:flex;gap:0.4rem;flex-shrink:0">' +
      (isTrainer ? '<span style="font-size:0.72rem;color:var(--text2);padding:0.3rem 0.6rem" title="Module formateur - lecture seule"><i class="fas fa-eye"></i></span>' : '<button class="admin-action-btn edit" onclick="openModuleModal(' + m.id + ')" title="Modifier"><i class="fas fa-edit"></i></button>') +
      (isTrainer ? '' : '<button class="admin-action-btn del" onclick="deleteModule(' + m.id + ')" title="Supprimer"><i class="fas fa-trash"></i></button>') +
      '</div></div>';
  }).join('');
}

async function _populateModuleSelect(selectedId) {
  const sel = document.getElementById('vModuleId');
  if (!sel) return;
  let modules = _modulesCache;
  if (!modules.length) {
    try { modules = await PaganiAPI.admin.getVideoModules(); _modulesCache = modules; } catch(e) {}
  }
  // Admin ne voit que ses propres modules (public + admin_private), pas les modules formateur
  const filtered = modules.filter(m => !m.type || m.type === 'public' || m.type === 'admin_private');
  sel.innerHTML = '<option value="">-- Aucun module --</option>' +
    filtered.map(m => `<option value="${m.id}" ${m.id == selectedId ? 'selected' : ''}>${m.title}${m.type === 'admin_private' ? ' (Privé)' : ''}</option>`).join('');
}
function openModuleModal(id) {
  _moduleModalFromVideo = false;
  _editingModuleId = id || null;
  const m = id ? _modulesCache.find(x => x.id === id) : null;
  document.getElementById('moduleModalTitle').innerHTML = m
    ? '<i class="fas fa-edit"></i> Modifier le module'
    : '<i class="fas fa-plus"></i> Nouveau module';
  document.getElementById('mTitle').value    = m ? m.title       : '';
  document.getElementById('mDesc').value     = m ? m.description : '';
  document.getElementById('mIcon').value     = m ? m.icon        : 'fas fa-layer-group';
  document.getElementById('mColor').value    = m ? m.color       : '#6c63ff';
  document.getElementById('mPosition').value = m ? m.position    : 0;
  document.getElementById('mModulePrice').value = (m && m.modulePrice) ? m.modulePrice : '';
  var mtype = (m && m.type) || 'public';
  document.querySelectorAll('input[name="mType"]').forEach(function(r) { r.checked = r.value === mtype; });
  _onModuleTypeChange();
  document.getElementById('moduleModalMsg').textContent = '';
  document.getElementById('moduleModalOverlay').style.display = 'flex';
  setTimeout(() => document.getElementById('mTitle').focus(), 50);
}
function openModuleModalFromVideo() {
  _moduleModalFromVideo = true;
  openModuleModal(null);
}
function _onModuleTypeChange() {
  var sel = document.querySelector('input[name="mType"]:checked');
  var type = sel ? sel.value : 'public';
  var lblPub = document.getElementById('mTypeLabelPublic');
  var lblPrv = document.getElementById('mTypeLabelPrivate');
  if (lblPub) lblPub.style.borderColor = type === 'public' ? 'var(--green)' : 'var(--border)';
  if (lblPrv) lblPrv.style.borderColor = type === 'admin_private' ? 'var(--red)' : 'var(--border)';
}

function closeModuleModal() {
  document.getElementById('moduleModalOverlay').style.display = 'none';
  _editingModuleId = null;
  _moduleModalFromVideo = false;
}
async function saveModule() {
  const title    = document.getElementById('mTitle').value.trim();
  const desc     = document.getElementById('mDesc').value.trim();
  const icon     = document.getElementById('mIcon').value.trim() || 'fas fa-layer-group';
  const color    = document.getElementById('mColor').value || '#6c63ff';
  const position = parseInt(document.getElementById('mPosition').value) || 0;
  const mPrice   = parseInt(document.getElementById('mModulePrice')?.value) || null;
  const mTypeEl  = document.querySelector('input[name="mType"]:checked');
  const mType    = mTypeEl ? mTypeEl.value : 'public';
  const msg      = document.getElementById('moduleModalMsg');
  if (!title) { msg.textContent = 'Le titre est obligatoire.'; return; }
  msg.textContent = '';
  try {
    let saved;
    if (_editingModuleId) {
      saved = await PaganiAPI.admin.updateVideoModule(_editingModuleId, { title, description: desc, icon, color, position, modulePrice: mPrice, type: mType });
    } else {
      saved = await PaganiAPI.admin.createVideoModule({ title, description: desc, icon, color, position, modulePrice: mPrice, type: mType });
    }
    if (_editingModuleId) {
      const idx = _modulesCache.findIndex(function(m) { return m.id === _editingModuleId; });
      if (idx !== -1) _modulesCache[idx] = Object.assign({}, saved, { type: mType, modulePrice: mPrice });
    } else {
      _modulesCache.push(Object.assign({}, saved, { type: mType, modulePrice: mPrice }));
    }
    closeModuleModal();
    if (_moduleModalFromVideo) {
      await _populateModuleSelect(saved.id);
    } else {
      renderAdminModules();
    }
  } catch(e) {
    msg.textContent = 'Erreur : ' + e.message;
  }
}
async function deleteModule(id) {
  const m = _modulesCache.find(x => x.id === id);
  if (!m) return;
  const overlay = document.getElementById('deleteModuleOverlay');
  document.getElementById('deleteModuleName').textContent = m.title;
  document.getElementById('deleteModuleConfirmBtn').onclick = async () => {
    overlay.style.display = 'none';
    try {
      await PaganiAPI.admin.deleteVideoModule(id);
      _modulesCache = _modulesCache.filter(x => x.id !== id);
      renderAdminModules();
    } catch(e) { alert('Erreur : ' + e.message); }
  };
  overlay.style.display = 'flex';
}

// ===== PUBLICATION UTILISATEUR =====
let _userPostImageBase64 = '';
function _userPostCharCount(ta) {
  const panel = ta.closest('.user-post-panel');
  const info  = panel ? panel.querySelector('[id\$=\"CharInfo\"]') : document.getElementById('userPostCharInfo');
  if (info) info.textContent = ta.value.length + '/1000';
}
function previewUserPostImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Image trop grande (max 5 Mo).'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = e => {
    _userPostImageBase64 = e.target.result;
    const preview = document.getElementById('userPostImagePreview');
    const img     = document.getElementById('userPostPreviewImg');
    if (preview && img) { img.src = _userPostImageBase64; preview.style.display = 'flex'; }
  };
  reader.readAsDataURL(file);
}
function removeUserPostImage() {
  _userPostImageBase64 = '';
  const preview = document.getElementById('userPostImagePreview');
  const input   = document.getElementById('userPostImageInput');
  if (preview) preview.style.display = 'none';
  if (input)   input.value = '';
}
async function submitUserPost() {
  const user = getUser();
  if (!user) { window.location.href = 'dashboard.html'; return; }
  const ta      = document.getElementById('userPostContent');
  const content = ta ? ta.value.trim() : '';
  if (!content) return;
  const btn    = document.getElementById('userPostBtn');
  const status = document.getElementById('userPostStatus');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Publication en cours...';
  try {
    const newPost = await PaganiAPI.createUserPost({ content, image: _userPostImageBase64 });
    if (ta) ta.value = '';
    removeUserPostImage();
    if (status) { status.style.color = 'var(--green)'; status.textContent = 'Publie !'; setTimeout(() => status.textContent = '', 3000); }
    // Injecter dans le feed
    if (newPost && newPost.id) {
      const normalized = {
        ...newPost,
        likes:    Array.isArray(newPost.likes)    ? newPost.likes    : [],
        comments: Array.isArray(newPost.comments) ? newPost.comments : [],
        date:     newPost.date || newPost.createdAt || new Date().toISOString(),
      };
      _postsCache.unshift(normalized);
      const container = document.getElementById('feedPosts');
      if (container && !document.getElementById('post-' + normalized.id)) {
        const el = buildPostCard(normalized, user, false);
        el.classList.add('post-animate');
        container.insertBefore(el, container.firstChild);
      }
    }
  } catch(e) {
    if (status) { status.style.color = 'var(--red)'; status.textContent = 'Erreur : ' + e.message; }
  } finally {
    if (btn) btn.disabled = false;
  }
}
// ===== MES PUBLICATIONS (dashboard) =====
async function loadMyPosts() {
  const user = getUser();
  const container = document.getElementById('myPostsList');
  if (!container || !user) return;
  container.innerHTML = '<div class="history-empty"><i class="fas fa-spinner fa-spin"></i><p>Chargement...</p></div>';
  try {
    const posts = await PaganiAPI.getPostsByUser(user.id);
    if (!posts || !posts.length) {
      container.innerHTML = '<div class="history-empty"><i class="fas fa-newspaper"></i><p>Vous n\'avez pas encore publie.</p></div>';
      return;
    }
    // Charger les réactions en batch
    try {
      const ids = posts.map(p => p.id);
      const batchRes = await Promise.allSettled(ids.slice(0, 20).map(id => PaganiAPI.getPostReactions(id)));
      batchRes.forEach((r, i) => { if (r.status === 'fulfilled') _reactionsCache[ids[i]] = r.value; });
    } catch(e) {}
    container.innerHTML = '';
    posts.forEach(post => {
      const normalized = {
        ...post,
        likes:    Array.isArray(post.likes)    ? post.likes    : [],
        comments: Array.isArray(post.comments) ? post.comments : [],
        date:     post.date || post.createdAt  || new Date().toISOString(),
      };
      const el = buildPostCard(normalized, user, user.role === 'admin');
      // Fusionner dans _postsCache pour que openEditPostModal trouve le post
      const cIdx = _postsCache.findIndex(p => Number(p.id) === Number(normalized.id));
      if (cIdx === -1) _postsCache.push(normalized); else _postsCache[cIdx] = normalized;
      container.appendChild(el);
      _observeLazyImages(el);
    });
  } catch(e) {
    container.innerHTML = '<div class="history-empty" style="color:var(--red)"><i class="fas fa-exclamation-circle"></i><p>Erreur de chargement.</p></div>';
  }
}
// ===== PUBLICATIONS SUR LE PROFIL PUBLIC =====
let _profilePostsCache = [];

// loadUserPostsForProfile défini plus haut
// ===== PANNEAU PUBLICATION DANS L'ONGLET MES PUBLICATIONS =====
let _myPostsDashImageBase64 = '';
function _initMyPostsPanel() {
  const user = getUser();
  if (!user) return;
  const panel = document.getElementById('myPostsPublishPanel');
  if (panel) panel.style.display = 'block';
  const av = document.getElementById('myPostsAvatar');
  if (av) {
    if (user.avatarPhoto) {
      av.innerHTML = `<img src="${user.avatarPhoto}" class="avatar-photo avatar-sm" />`;
      av.style.background = 'transparent';
    } else {
      av.textContent = getInitials(user.name);
      av.style.background = getAvatarColor(user);
    }
  }
}
function previewMyPostsImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Image trop grande (max 5 Mo).'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = e => {
    _myPostsDashImageBase64 = e.target.result;
    const preview = document.getElementById('myPostsImagePreview');
    const img     = document.getElementById('myPostsPreviewImg');
    if (preview && img) { img.src = _myPostsDashImageBase64; preview.style.display = 'flex'; }
  };
  reader.readAsDataURL(file);
}
function removeMyPostsImage() {
  _myPostsDashImageBase64 = '';
  const preview = document.getElementById('myPostsImagePreview');
  const input   = document.getElementById('myPostsImageInput');
  if (preview) preview.style.display = 'none';
  if (input)   input.value = '';
}
async function submitMyPostsDashboard() {
  const user = getUser();
  if (!user) return;
  const ta      = document.getElementById('myPostsContent');
  const content = ta ? ta.value.trim() : '';
  if (!content) return;
  const btn    = document.getElementById('myPostsBtn');
  const status = document.getElementById('myPostsStatus');
  if (btn) btn.disabled = true;
  if (status) { status.style.color = 'var(--text2)'; status.textContent = 'Publication en cours...'; }
  try {
    const newPost = await PaganiAPI.createUserPost({ content, image: _myPostsDashImageBase64 });
    if (ta) ta.value = '';
    const charInfo = document.getElementById('myPostsCharInfo');
    if (charInfo) charInfo.textContent = '0/1000';
    removeMyPostsImage();
    if (status) { status.style.color = 'var(--green)'; status.textContent = 'Publie !'; setTimeout(() => status.textContent = '', 3000); }
    // Injecter dans la liste sans recharger
    if (newPost && newPost.id) {
      const normalized = {
        ...newPost,
        likes:    Array.isArray(newPost.likes)    ? newPost.likes    : [],
        comments: Array.isArray(newPost.comments) ? newPost.comments : [],
        date:     newPost.date || newPost.createdAt || new Date().toISOString(),
      };
      const container = document.getElementById('myPostsList');
      if (container) {
        // Retirer le message "aucune publication" si prsent
        const empty = container.querySelector('.history-empty');
        if (empty) empty.remove();
        const el = buildPostCard(normalized, user, false);
        el.classList.add('post-animate');
        container.insertBefore(el, container.firstChild);
        _observeLazyImages(el);
      }
      // Aussi injecter dans le feed principal si visible
      _postsCache.unshift(normalized);
    }
  } catch(e) {
    if (status) { status.style.color = 'var(--red)'; status.textContent = 'Erreur : ' + e.message; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ===== DESIGN AMLIORATIONS =====

// tape 1 : Navbar scroll effect
(function initNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// tape 8 : Bouton scroll-to-top
(function initScrollTop() {
  const btn = document.createElement('button');
  btn.id = 'scrollTopBtn';
  btn.title = 'Retour en haut';
  btn.innerHTML = '<i class="fas fa-chevron-up"></i>';
  btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  document.body.appendChild(btn);
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 300);
  }, { passive: true });
})();


// ===== RÉACTIONS SUR LES MESSAGES =====
var _RX_EMOJIS = ['❤️','😂','😮','😢','😡','👍'];
var _rxPickerMsgId = null;
var _rxPickerEl    = null;

// -- Ouvrir / fermer le picker ----------------------------------------------
function _showRxPicker(e, msgId) {
  e.stopPropagation();
  // Si déjà ouvert sur ce message ? fermer
  if (_rxPickerMsgId === msgId) { _closeRxPicker(); return; }
  _closeRxPicker();

  var row = document.querySelector('[data-msgid="' + msgId + '"]');
  if (!row) return;

  var picker = document.createElement('div');
  picker.className = 'mpx-reaction-picker';
  picker.dataset.for = msgId;

  var me = getUser();
  var myRx = _getRxForMsg(msgId);

  _RX_EMOJIS.forEach(function(emoji) {
    var btn = document.createElement('button');
    btn.className = 'mpx-rx-emoji-btn' + (myRx === emoji ? ' selected' : '');
    btn.textContent = emoji;
    btn.title = emoji;
    btn.onclick = function(ev) { ev.stopPropagation(); _toggleReaction(msgId, emoji); _closeRxPicker(); };
    picker.appendChild(btn);
  });

  var bubble = row.querySelector('.mpx-bubble');
  if (!bubble) return;
  var isMobile = window.innerWidth <= 580;
  if (isMobile) {
    // Positionner au-dessus de la bulle maintenue (comme WhatsApp/Messenger)
    document.body.appendChild(picker);
    var rect = bubble.getBoundingClientRect();
    var pickerW = 280;
    var left = rect.left + rect.width / 2 - pickerW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pickerW - 8));
    var top = rect.top - 64;
    if (top < 60) top = rect.bottom + 8;
    picker.style.position  = 'fixed';
    picker.style.left      = left + 'px';
    picker.style.top       = top + 'px';
    picker.style.right     = 'auto';
    picker.style.bottom    = 'auto';
    picker.style.transform = 'none';
    picker.style.zIndex    = '600';
  } else {
    bubble.appendChild(picker);
  }
  _rxPickerMsgId = msgId;
  _rxPickerEl    = picker;

  // Fermer au clic extérieur
  setTimeout(function() {
    document.addEventListener('click', _rxOutsideClick, true);
  }, 10);
}

function _closeRxPicker() {
  if (_rxPickerEl) {
    _rxPickerEl.classList.add('closing');
    var el = _rxPickerEl;
    setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 140);
  }
  _rxPickerEl    = null;
  _rxPickerMsgId = null;
  document.removeEventListener('click', _rxOutsideClick, true);
}

function _rxOutsideClick(ev) {
  if (_rxPickerEl && !_rxPickerEl.contains(ev.target)) _closeRxPicker();
}

// -- Cache local des réactions { msgId: { emoji: [userId, ...] } } ----------
var _rxCache = {};

function _getRxForMsg(msgId) {
  var me = getUser();
  var key = String(msgId);
  if (!me || !_rxCache[key]) return null;
  var map = _rxCache[key];
  var myId = String(me.id);
  for (var emoji in map) {
    if (map[emoji].map(String).indexOf(myId) !== -1) return emoji;
  }
  return null;
}

// -- Toggle réaction --------------------------------------------------------
async function _toggleReaction(msgId, emoji) {
  var me = getUser();
  if (!me || !_currentChatUserId) return;

  var key = String(msgId);
  var myId = String(me.id);
  if (!_rxCache[key]) _rxCache[key] = {};
  var map = _rxCache[key];

  // Retirer l'ancienne réaction de l'utilisateur si elle existe
  var prev = _getRxForMsg(key);
  if (prev) {
    map[prev] = (map[prev] || []).map(String).filter(function(id) { return id !== myId; });
    if (!map[prev].length) delete map[prev];
  }

  // Ajouter la nouvelle (sauf si c'—tait la même ? toggle off)
  if (prev !== emoji) {
    if (!map[emoji]) map[emoji] = [];
    map[emoji].push(myId);
  }

  _renderRxZone(key);

  // Appel API (étape 3 — route backend)
  try {
    var token = localStorage.getItem('pd_jwt');
    var action = (prev === emoji) ? 'remove' : 'add';
    await fetch(API_URL + '/messages/' + _currentChatUserId + '/' + msgId + '/reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ emoji: emoji, action: action })
    });
  } catch(err) {}
}

// -- Rendu de la zone réactions sous une bulle ------------------------------
function _renderRxZone(msgId) {
  var zone = document.getElementById('rx-zone-' + msgId);
  if (!zone) return;

  var map = _rxCache[String(msgId)] || {};
  var me  = getUser();
  var myId = me ? String(me.id) : null;
  var html = '';

  Object.keys(map).forEach(function(emoji) {
    var users = map[emoji];
    if (!users || !users.length) return;
    var isMine = myId && users.map(String).indexOf(myId) !== -1;
    html += '<span class="mpx-rx-badge' + (isMine ? ' mine-rx' : '') + '"'
          + ' onclick="_onRxBadgeClick(' + msgId + ',\'' + emoji + '\')"'
          + ' title="' + users.length + ' r\u00e9action(s)">'
          + '<span class="mpx-rx-badge-emoji">' + emoji + '</span>'
          + '<span class="mpx-rx-badge-count">' + users.length + '</span>'
          + '</span>';
  });

  zone.innerHTML = html;
}

function _onRxBadgeClick(msgId, emoji) {
  _toggleReaction(msgId, emoji);
}

// -- Charger les réactions depuis le serveur pour la conv ouverte -----------
async function _loadRxForConv(userId) {
  try {
    var token = localStorage.getItem('pd_jwt');
    var r = await fetch(API_URL + '/messages/' + userId + '/reactions', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!r.ok) return;
    var data = await r.json(); // { msgId: { emoji: [userId,...] } }
    _rxCache = data || {};
    // Rendre toutes les zones visibles
    Object.keys(_rxCache).forEach(function(msgId) {
      _renderRxZone(msgId);
    });
  } catch(e) {}
}

// Réaction reçue en temps r—el via SSE
function _onRxSSE(notif) {
  var msgId  = String(notif.msgId);
  var emoji  = notif.emoji;
  var userId = String(notif.userId);
  var action = notif.action || 'add';
  if (!_rxCache[msgId]) _rxCache[msgId] = {};
  var map = _rxCache[msgId];
  // Retirer l'ancienne réaction de cet utilisateur
  Object.keys(map).forEach(function(e) {
    map[e] = (map[e] || []).map(String).filter(function(id) { return id !== userId; });
    if (!map[e].length) delete map[e];
  });
  if (action !== 'remove') {
    if (!map[emoji]) map[emoji] = [];
    if (map[emoji].indexOf(userId) === -1) map[emoji].push(userId);
  }
  _renderRxZone(msgId);
}


// ── PUSH NOTIFICATIONS PWA ───────────────────────────────────────────────────
async function initPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    // Demander la permission explicitement
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const API = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || 'https://pagani-digital.onrender.com/api';
    const { key } = await fetch(API + '/push/vapid-public-key').then(r => r.json());
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(key)
      });
    }
    const token = localStorage.getItem('pd_jwt');
    await fetch(API + '/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(sub.toJSON())
    });
  } catch(e) {}
}

function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ── TOGGLE PUSH DEPUIS DASHBOARD ─────────────────────────────────────────────
async function togglePushNotif() {
  const btn = document.getElementById('pushNotifBtn');
  const status = document.getElementById('pushNotifStatus');
  const perm = Notification.permission;
  if (perm === 'denied') {
    alert('Les notifications sont bloquées. Allez dans les paramètres de votre navigateur pour les autoriser.');
    return;
  }
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  await initPushNotifications();
  updatePushNotifUI();
  if (btn) btn.disabled = false;
}

async function updatePushNotifUI() {
  const btn = document.getElementById('pushNotifBtn');
  const status = document.getElementById('pushNotifStatus');
  if (!btn || !status) return;
  const perm = Notification.permission;
  if (perm === 'granted') {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      status.textContent = 'Activées — vous recevrez des notifications';
      status.style.color = 'var(--accent2)';
      btn.innerHTML = '<i class="fas fa-bell-slash"></i> Désactiver';
      btn.onclick = disablePushNotif;
      return;
    }
  }
  if (perm === 'denied') {
    status.textContent = 'Bloquées dans les paramètres du navigateur';
    status.style.color = 'var(--red)';
    btn.innerHTML = '<i class="fas fa-ban"></i> Bloquées';
    btn.disabled = true;
    return;
  }
  status.textContent = 'Désactivées — cliquez pour recevoir des notifications';
  status.style.color = 'var(--text2)';
  btn.innerHTML = '<i class="fas fa-bell"></i> Activer';
  btn.onclick = togglePushNotif;
}

async function disablePushNotif() {
  const API = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || 'https://pagani-digital.onrender.com/api';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    const token = localStorage.getItem('pd_jwt');
    await fetch(API + '/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ endpoint: sub.endpoint })
    }).catch(() => {});
    await sub.unsubscribe();
  }
  updatePushNotifUI();
}

// ── BANNIÈRE PUSH ─────────────────────────────────────────────────────────────
function showPushBanner() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission !== 'default') return;
  if (localStorage.getItem('pd_push_banner_dismissed')) return;
  if (document.getElementById('pushBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'pushBanner';
  banner.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);z-index:9999;background:var(--bg2);border:1px solid var(--accent);border-radius:14px;padding:0.8rem 1rem;display:flex;align-items:center;gap:0.8rem;box-shadow:0 4px 24px rgba(0,0,0,0.3);max-width:360px;width:calc(100% - 2rem);animation:slideUp 0.3s ease';
  banner.innerHTML =
    '<i class="fas fa-bell" style="color:var(--accent);font-size:1.2rem;flex-shrink:0"></i>' +
    '<div style="flex:1;min-width:0">' +
      '<div style="font-weight:700;font-size:0.88rem">Activer les notifications</div>' +
      '<div style="font-size:0.75rem;color:var(--text2)">Recevez les alertes en temps réel</div>' +
    '</div>' +
    '<button onclick="acceptPushBanner()" style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:0.4rem 0.8rem;font-size:0.8rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap">Activer</button>' +
    '<button onclick="dismissPushBanner()" style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:1rem;padding:0.2rem;flex-shrink:0"><i class="fas fa-times"></i></button>';

  document.body.appendChild(banner);
}

async function acceptPushBanner() {
  const b = document.getElementById('pushBanner');
  if (b) b.remove();
  // Demander la permission directement au clic (requis par Chrome mobile)
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    localStorage.setItem('pd_push_banner_dismissed', '1');
    return;
  }
  localStorage.setItem('pd_push_banner_dismissed', '1');
  await initPushNotifications();
  updatePushNotifUI();
}

function dismissPushBanner() {
  const b = document.getElementById('pushBanner');
  if (b) b.remove();
  localStorage.setItem('pd_push_banner_dismissed', '1');
}

// ===== ACHAT MODULE =====
async function openModuleBuyModal(moduleId) {
      const user = getUser();
      if (!user) { window.location.href = 'dashboard.html'; return; }
      const mod = _modulesData.find(m => m.id == moduleId);
      if (!mod) return;

      _moduleBuyCurrentId  = mod.id;
      _moduleBuyCurrentAmt = mod.modulePrice || 0;
      _moduleBuyProofBase64 = '';

      // Charger les comptes admin si pas encore en cache
      if (!_paymentAccountsCache.length) {
        try { _paymentAccountsCache = await fetch(API_URL + '/payment-accounts').then(r => r.json()); } catch(e) {}
      }

      // Remplir l'en-tête
      const color = mod.color || '#6c63ff';
      document.getElementById('moduleBuyIcon').innerHTML = `<i class="${mod.icon||'fas fa-layer-group'}" style="color:${color}"></i>`;
      document.getElementById('moduleBuyIcon').style.background = color + '22';
      document.getElementById('moduleBuyIcon').style.borderRadius = '14px';
      document.getElementById('moduleBuyIcon').style.width = '56px';
      document.getElementById('moduleBuyIcon').style.height = '56px';
      document.getElementById('moduleBuyIcon').style.display = 'flex';
      document.getElementById('moduleBuyIcon').style.alignItems = 'center';
      document.getElementById('moduleBuyIcon').style.justifyContent = 'center';
      document.getElementById('moduleBuyTitle').textContent = mod.title;
      document.getElementById('moduleBuyDesc').textContent  = mod.description || 'Accès à toutes les vidéos de ce module.';
      document.getElementById('moduleBuyMeta').innerHTML = `
        <span><i class="fas fa-layer-group"></i> Module complet</span>
        <span><i class="fas fa-tag" style="color:var(--accent2)"></i> <strong style="color:var(--accent2)">${_moduleBuyCurrentAmt.toLocaleString('fr-FR')} AR</strong></span>`;

      // Réinitialiser les étapes
      document.getElementById('moduleBuyPayment').style.display = 'none';
      document.getElementById('moduleBuySuccess').style.display = 'none';
      document.getElementById('moduleBuyHeader').style.display  = 'block';

      // Ajouter le bouton "Acheter" dans l'en-tête si pas encore présent
      let startBtn = document.getElementById('moduleBuyStartBtn');
      if (!startBtn) {
        startBtn = document.createElement('button');
        startBtn.id = 'moduleBuyStartBtn';
        startBtn.className = 'btn-primary';
        startBtn.style.cssText = 'width:100%;padding:0.85rem;font-size:0.95rem;margin-top:1rem';
        startBtn.innerHTML = '<i class="fas fa-shopping-cart"></i> Acheter ce module — ' + _moduleBuyCurrentAmt.toLocaleString('fr-FR') + ' AR';
        document.getElementById('moduleBuyHeader').appendChild(startBtn);
      } else {
        startBtn.innerHTML = '<i class="fas fa-shopping-cart"></i> Acheter ce module — ' + _moduleBuyCurrentAmt.toLocaleString('fr-FR') + ' AR';
      }
      startBtn.onclick = _moduleBuyGoToPayment;

      // Afficher la modale
      const overlay = document.getElementById('moduleBuyOverlay');
      overlay.style.display = 'flex';
    }

    async function _moduleBuyGoToPayment() {
      const user = getUser();
      const accounts = _paymentAccountsCache.filter(a => !a.disabled && a.phone);

      // Construire les comptes MM de l'utilisateur
      let userAccounts = [];
      if (user) {
        const raw = user.mmAccounts || [];
        userAccounts = raw.filter(a => a.phone);
        if (!userAccounts.length && user.mmPhone) {
          userAccounts = [{ operator: user.mmOperator||'MVola', phone: user.mmPhone, name: user.mmName||user.name }];
        }
      }

      // Montant
      document.getElementById('moduleBuyAmountRepeat').textContent = _moduleBuyCurrentAmt.toLocaleString('fr-FR') + ' AR';
      document.getElementById('moduleBuyPayTitle').textContent = 'Paiement — ' + _moduleBuyCurrentAmt.toLocaleString('fr-FR') + ' AR';

      // Loader dans la zone admin
      document.getElementById('moduleBuyAdminTargets').innerHTML = '<div class="feed-loader"><span></span><span></span><span></span></div>';

      // Afficher les étapes
      document.getElementById('moduleBuyHeader').style.display  = 'none';
      document.getElementById('moduleBuyPayment').style.display = 'block';

      // Construire le sélecteur utilisateur
      _renderModuleBuyUserMm(user, userAccounts, accounts);

      // Afficher les comptes admin
      _renderModuleBuyAdminTargets(accounts, userAccounts.length ? userAccounts[0].operator : null);

      // Pré-remplir les champs cachés
      if (userAccounts.length) {
        _moduleBuyUserOp    = userAccounts[0].operator;
        _moduleBuyUserPhone = userAccounts[0].phone;
      }

      // Réinitialiser preuve
      _removeModuleProof();
      document.getElementById('moduleBuyMsg').textContent = '';
      document.getElementById('moduleBuyTxRef').value = '';
    }

    function _moduleBuyBackToInfo() {
      document.getElementById('moduleBuyPayment').style.display = 'none';
      document.getElementById('moduleBuyHeader').style.display  = 'block';
    }

    function closeModuleBuyModal() {
      const overlay = document.getElementById('moduleBuyOverlay');
      if (overlay) overlay.style.display = 'none';
      _moduleBuyProofBase64 = '';
    }

    function _previewModuleProof(input) {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { alert('Image trop grande (max 5 Mo).'); input.value = ''; return; }
      const reader = new FileReader();
      reader.onload = e => {
        _moduleBuyProofBase64 = e.target.result;
        document.getElementById('moduleBuyProofImg').src = _moduleBuyProofBase64;
        document.getElementById('moduleBuyProofPreview').style.display = 'block';
        document.getElementById('moduleBuyProofLabel').style.borderColor = 'var(--accent2)';
        document.getElementById('moduleBuyProofText').textContent = file.name;
      };
      reader.readAsDataURL(file);
    }

    function _removeModuleProof() {
      _moduleBuyProofBase64 = '';
      const img     = document.getElementById('moduleBuyProofImg');
      const preview = document.getElementById('moduleBuyProofPreview');
      const input   = document.getElementById('moduleBuyProofInput');
      const label   = document.getElementById('moduleBuyProofLabel');
      const text    = document.getElementById('moduleBuyProofText');
      if (img)     img.src = '';
      if (preview) preview.style.display = 'none';
      if (input)   input.value = '';
      if (label)   label.style.borderColor = 'var(--border)';
      if (text)    text.textContent = "Cliquez pour ajouter une capture d'\u00e9cran";
    }

    function _renderModuleBuyUserMm(user, userAccounts, adminAccounts) {
      const wrap   = document.getElementById('moduleBuyUserMmWrap');
      if (!wrap) return;
      const colors = { 'MVola': '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
      const opOptions = adminAccounts.length
        ? adminAccounts.map(a => `<option value="${a.operator}">${a.operator}</option>`).join('')
        : '<option value="MVola">MVola</option><option value="Orange Money">Orange Money</option><option value="Airtel Money">Airtel Money</option>';

      if (!user || !userAccounts.length) {
        wrap.innerHTML = `
          <div class="upgrade-mm-notice${!user ? '' : ' upgrade-mm-notice-warn'}">
            <i class="fas fa-${user ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${user ? 'Aucun compte Mobile Money dans votre profil. <a href="dashboard.html?tab=profile#mm-accounts">Ajoutez-en un</a>.' : 'Connectez-vous pour utiliser votre compte enregistré.'}</span>
          </div>
          <div class="upgrade-form-manual">
            <label class="upgrade-form-label">Votre opérateur</label>
            <select class="upgrade-input" onchange="_moduleBuyUserOp=this.value;_renderModuleBuyAdminTargets(_paymentAccountsCache.filter(a=>!a.disabled&&a.phone),this.value)">${opOptions}</select>
            <label class="upgrade-form-label" style="margin-top:0.5rem">Votre numéro Mobile Money</label>
            <input type="tel" class="upgrade-input" placeholder="034 XX XXX XX" oninput="_moduleBuyUserPhone=this.value" />
          </div>`;
        _moduleBuyUserOp    = adminAccounts[0]?.operator || 'MVola';
        _moduleBuyUserPhone = '';
        return;
      }

      if (userAccounts.length === 1) {
        const acc   = userAccounts[0];
        const color = colors[acc.operator] || 'var(--accent)';
        _moduleBuyUserOp    = acc.operator;
        _moduleBuyUserPhone = acc.phone;
        wrap.innerHTML = `
          <div class="upgrade-user-mm-single">
            <span class="upgrade-user-mm-icon" style="background:${color}22;color:${color}"><i class="fas fa-mobile-alt"></i></span>
            <span class="upgrade-user-mm-details">
              <strong>${acc.operator}</strong>
              <span>${acc.phone}</span>
              <span class="upgrade-user-mm-name">${acc.name}</span>
            </span>
            <span class="upgrade-user-mm-locked"><i class="fas fa-lock"></i> Votre compte</span>
          </div>`;
        return;
      }

      // Plusieurs comptes
      const defAcc = userAccounts[0];
      _moduleBuyUserOp    = defAcc.operator;
      _moduleBuyUserPhone = defAcc.phone;
      wrap.innerHTML = `
        <div class="upgrade-user-mm-selector">
          ${userAccounts.map((acc, i) => {
            const color    = colors[acc.operator] || 'var(--accent)';
            const hasAdmin = adminAccounts.some(a => a.operator === acc.operator);
            return `<label class="upgrade-user-mm-option">
              <input type="radio" name="moduleBuyUserMm" value="${i}" ${i===0?'checked':''}
                onchange="_moduleBuyUserOp='${acc.operator}';_moduleBuyUserPhone='${acc.phone}';_renderModuleBuyAdminTargets(_paymentAccountsCache.filter(a=>!a.disabled&&a.phone),'${acc.operator}')" />
              <span class="upgrade-user-mm-card ${!hasAdmin?'upgrade-mm-card-warn':''}">
                <span class="upgrade-user-mm-icon" style="background:${color}22;color:${color}"><i class="fas fa-mobile-alt"></i></span>
                <span class="upgrade-user-mm-details"><strong>${acc.operator}</strong><span>${acc.phone}</span><span class="upgrade-user-mm-name">${acc.name}</span></span>
                <span class="upgrade-user-mm-right">
                  ${hasAdmin ? '<span class="upgrade-mm-match"><i class="fas fa-check-circle"></i></span>' : '<span class="upgrade-mm-nomatch"><i class="fas fa-exclamation-circle"></i></span>'}
                  <span class="upgrade-user-mm-check"><i class="fas fa-check-circle"></i></span>
                </span>
              </span>
            </label>`;
          }).join('')}
        </div>`;
    }

    function _renderModuleBuyAdminTargets(adminAccounts, selectedOp) {
      const wrap = document.getElementById('moduleBuyAdminTargets');
      if (!wrap) return;
      const colors = { 'MVola': '#e91e8c', 'Orange Money': '#ff6600', 'Airtel Money': '#e53935' };
      const configured = adminAccounts.filter(a => a.phone && !a.disabled);

      if (!configured.length) {
        wrap.innerHTML = `<div class="upgrade-mm-no-admin"><i class="fas fa-exclamation-circle"></i> Aucun numéro de paiement configuré. Contactez l'administrateur.</div>`;
        return;
      }

      const defaultAcc = selectedOp
        ? (configured.find(a => a.operator === selectedOp) || configured[0])
        : configured[0];

      wrap.innerHTML = configured.map((acc, i) => {
        const color    = colors[acc.operator] || 'var(--accent)';
        const selected = acc.operator === defaultAcc.operator;
        return `
          <div style="${selected ? '' : 'display:none;'}margin-bottom:0.5rem">
            <div style="display:flex;align-items:center;gap:0.8rem;background:${selected ? 'rgba(0,212,170,0.07)' : 'var(--bg2)'};border:2px solid ${selected ? 'var(--accent2)' : 'var(--border)'};border-radius:12px;padding:0.85rem 1rem;${selected ? 'box-shadow:0 0 0 3px rgba(0,212,170,0.12)' : ''}">
              <span style="width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;background:${color}22;color:${color}">
                <i class="fas fa-mobile-alt"></i>
              </span>
              <span style="flex:1;display:flex;flex-direction:column;gap:0.1rem">
                <strong style="font-size:0.92rem">${acc.operator}</strong>
                <span style="font-size:1.05rem;font-weight:700;color:var(--text);letter-spacing:0.04em">${acc.phone}</span>
                <span style="font-size:0.72rem;color:var(--text2)">${acc.name}</span>
              </span>
              <span style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem;flex-shrink:0">
                ${selected ? `<span style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.72rem;font-weight:700;color:var(--accent2);background:rgba(0,212,170,0.12);border:1px solid rgba(0,212,170,0.25);padding:0.25rem 0.6rem;border-radius:50px;white-space:nowrap"><i class="fas fa-check-circle"></i> Envoyer ici</span>` : ''}
                <button onclick="_copyModulePhone('${acc.phone}',this)" style="display:inline-flex;align-items:center;gap:0.3rem;background:rgba(108,99,255,0.1);border:1px solid rgba(108,99,255,0.25);color:var(--accent);padding:0.25rem 0.7rem;border-radius:8px;cursor:pointer;font-size:0.75rem;font-family:inherit;white-space:nowrap">
                  <i class="fas fa-copy"></i> Copier
                </button>
              </span>
            </div>
          </div>`;
      }).join('');
    }

    function _copyModulePhone(phone, btn) {
      const orig = btn.innerHTML;
      const copy = () => {
        btn.innerHTML = '<i class="fas fa-check"></i> Copié !';
        btn.style.background = 'rgba(0,212,170,0.15)';
        btn.style.color = 'var(--accent2)';
        setTimeout(() => { btn.innerHTML = orig; btn.style.background = 'rgba(108,99,255,0.1)'; btn.style.color = 'var(--accent)'; }, 2000);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(phone).then(copy).catch(() => { btn.innerHTML = phone; setTimeout(() => btn.innerHTML = orig, 2000); });
      } else {
        const inp = document.createElement('input');
        inp.value = phone; inp.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(inp); inp.select(); document.execCommand('copy');
        document.body.removeChild(inp); copy();
      }
    }

    async function submitModuleBuy() {
      const msg    = document.getElementById('moduleBuyMsg');
      const txRef  = document.getElementById('moduleBuyTxRef')?.value.trim() || '';
      const proof  = _moduleBuyProofBase64;
      const phone  = _moduleBuyUserPhone;
      const operator = _moduleBuyUserOp;

      if (!proof) {
        msg.style.color = 'var(--red)';
        msg.textContent = '\u26a0\ufe0f La preuve de paiement est obligatoire.';
        const label = document.getElementById('moduleBuyProofLabel');
        if (label) {
          label.style.borderColor = 'var(--red)';
          label.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => label.style.borderColor = 'var(--border)', 3000);
        }
        return;
      }

      const btn = document.getElementById('moduleBuySubmitBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi en cours...'; }
      msg.style.color = 'var(--text2)';
      msg.textContent = 'Envoi en cours...';

      try {
        await PaganiAPI.buyModule({
          moduleId:  _moduleBuyCurrentId,
          amount:    _moduleBuyCurrentAmt,
          phone, operator, txRef, proof
        });
        _moduleBuyProofBase64 = '';
        document.getElementById('moduleBuyPayment').style.display = 'none';
        const successEl = document.getElementById('moduleBuySuccess');
        if (successEl) successEl.style.display = 'flex';
      } catch(err) {
        msg.style.color = 'var(--red)';
        const errMsgs = {
          DEJA_ACHETE:     'Vous avez d\u00e9j\u00e0 achet\u00e9 ce module.',
          NON_AUTHENTIFIE: 'Session expir\u00e9e. Veuillez vous reconnecter.',
          PREUVE_REQUISE:  'La preuve de paiement est obligatoire.',
        };
        msg.textContent = '\u274c ' + (errMsgs[err.message] || 'Erreur : ' + err.message);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> J\'ai envoy\u00e9 le paiement'; }
      }
    }





// ===== ADMIN FINANCE =====
async function loadAdminFinance() {
  const token = localStorage.getItem('pd_jwt');
  const kpiEl = document.getElementById('financeDetailKpis');
  if (kpiEl) kpiEl.innerHTML = '<div class="feed-loader"><span></span><span></span><span></span></div>';
  try {
    const data = await fetch(API_URL + '/admin/finance-summary', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.json());
    const fmt = n => Number(n).toLocaleString('fr-FR') + ' AR';
    if (kpiEl) {
      kpiEl.innerHTML = [
        { icon: 'fa-shopping-cart',      color: 'var(--accent2)', bg: 'rgba(0,212,170,0.12)',  label: 'Ventes totales',      val: fmt(data.totalSales),      sub: data.salesCount + ' vente' + (data.salesCount > 1 ? 's' : '') },
        { icon: 'fa-chalkboard-teacher', color: 'var(--gold)',    bg: 'rgba(245,158,11,0.12)', label: 'Brut formateurs',     val: fmt(data.trainerBrut),     sub: fmt(data.trainerPending) + ' en attente' },
        { icon: 'fa-users',              color: 'var(--accent)',  bg: 'rgba(108,99,255,0.12)', label: 'Commissions membres', val: fmt(data.commPending),     sub: 'en attente de versement' },
        { icon: 'fa-money-bill-wave',    color: 'var(--red)',     bg: 'rgba(255,77,109,0.12)', label: 'Retraits en attente', val: fmt(data.withdrawPending), sub: fmt(data.withdrawPaid) + ' déjà versé' },
        { icon: 'fa-hand-holding-usd',   color: '#00d4aa',        bg: 'rgba(0,212,170,0.15)',  label: 'Net admin (estimé)',  val: fmt(data.netAdmin),        sub: 'après déductions' },
      ].map(k => `
        <div class="admin-kpi" style="border-left:3px solid ${k.color}">
          <div class="admin-kpi-icon" style="background:${k.bg}"><i class="fas ${k.icon}" style="color:${k.color}"></i></div>
          <div>
            <strong style="color:${k.color}">${k.val}</strong>
            <span>${k.label}</span>
            <small style="color:var(--text2);font-size:0.7rem;display:block">${k.sub}</small>
          </div>
        </div>`).join('');
    }
    const el = id => document.getElementById(id);
    if (el('kpiTotalSales'))      el('kpiTotalSales').textContent      = fmt(data.totalSales);
    if (el('kpiTrainerBrut'))     el('kpiTrainerBrut').textContent     = fmt(data.trainerBrut);
    if (el('kpiWithdrawPending')) el('kpiWithdrawPending').textContent = fmt(data.withdrawPending);
    if (el('kpiNetAdmin'))        el('kpiNetAdmin').textContent        = fmt(data.netAdmin);
  } catch(e) {
    if (kpiEl) kpiEl.innerHTML = '<p style="color:var(--red);padding:1rem">Erreur de chargement.</p>';
  }
  await loadFinanceWithdraws();
}

async function loadFinanceWithdraws() {
  const wrap = document.getElementById('financeWithdrawsList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="feed-loader"><span></span><span></span><span></span></div>';
  const token = localStorage.getItem('pd_jwt');
  try {
    const w = await fetch(API_URL + '/admin/users', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.json());
    const withPending = w.filter(u => parseFloat(u.pendingAR || u.pending_ar || 0) > 0);
    if (!withPending.length) {
      wrap.innerHTML = '<div class="history-empty"><i class="fas fa-check-circle" style="color:var(--accent2)"></i><p>Aucun retrait en attente.</p></div>';
      return;
    }
    const fmt = n => Number(n).toLocaleString('fr-FR') + ' AR';
    const planColors = { Starter: 'var(--text2)', Pro: 'var(--accent)', Elite: 'var(--gold)' };
    wrap.innerHTML = `
      <div class="video-admin-header" style="grid-template-columns:2fr 1fr 1fr 1fr">
        <span>Membre</span><span>Plan</span><span>En attente</span><span>Déjà versé</span>
      </div>
      ${withPending.map(u => {
        const av = u.avatarPhoto
          ? `<img src="${u.avatarPhoto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover" />`
          : `<div class="avatar-circle avatar-sm" style="background:${u.avatarColor||'#6c63ff'}">${getInitials(u.name)}</div>`;
        return `
          <div class="video-admin-row" style="grid-template-columns:2fr 1fr 1fr 1fr">
            <span class="admin-user-name">${av}<span>${esc(u.name)}<small>${esc(u.email||'')}</small></span></span>
            <span><span class="admin-plan-badge" style="background:${planColors[u.plan]||'var(--accent)'}">${u.plan}</span></span>
            <span style="color:var(--gold);font-weight:700">${fmt(u.pendingAR || u.pending_ar || 0)}</span>
            <span style="color:var(--text2)">${fmt(u.paidAR || u.paid_ar || 0)}</span>
          </div>`;
      }).join('')}`;
  } catch(e) {
    wrap.innerHTML = '<p style="color:var(--red);padding:1rem">Erreur de chargement.</p>';
  }
}

async function loadFinanceCommissions() {
  const wrap = document.getElementById('financeCommissionsList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="feed-loader"><span></span><span></span><span></span></div>';
  const token = localStorage.getItem('pd_jwt');
  try {
    const users = await fetch(API_URL + '/admin/users', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.json());
    const withComm = users.filter(u => (u.earningsAR || u.earnings_ar || 0) > 0 || (u.refs || 0) > 0);
    if (!withComm.length) {
      wrap.innerHTML = '<div class="history-empty"><i class="fas fa-percent"></i><p>Aucune commission membre.</p></div>';
      return;
    }
    const fmt = n => Number(n).toLocaleString('fr-FR') + ' AR';
    const planColors = { Starter: 'var(--text2)', Pro: 'var(--accent)', Elite: 'var(--gold)' };
    wrap.innerHTML = `
      <div class="video-admin-header" style="grid-template-columns:2fr 1fr 1fr 1fr">
        <span>Membre</span><span>Plan</span><span>Filleuls</span><span>Commissions</span>
      </div>
      ${withComm.map(u => {
        const av = u.avatarPhoto
          ? `<img src="${u.avatarPhoto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover" />`
          : `<div class="avatar-circle avatar-sm" style="background:${u.avatarColor||'#6c63ff'}">${getInitials(u.name)}</div>`;
        return `
          <div class="video-admin-row" style="grid-template-columns:2fr 1fr 1fr 1fr">
            <span class="admin-user-name">${av}<span>${esc(u.name)}</span></span>
            <span><span class="admin-plan-badge" style="background:${planColors[u.plan]||'var(--accent)'}">${u.plan}</span></span>
            <span>${u.refs || 0}</span>
            <span class="green">${fmt(u.earningsAR || u.earnings_ar || 0)}</span>
          </div>`;
      }).join('')}`;
  } catch(e) {
    wrap.innerHTML = '<p style="color:var(--red);padding:1rem">Erreur de chargement.</p>';
  }
}

async function loadFinanceTrainerEarnings() {
  const wrap = document.getElementById('financeTrainerEarningsList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="feed-loader"><span></span><span></span><span></span></div>';
  const token = localStorage.getItem('pd_jwt');
  try {
    const data = await fetch(API_URL + '/admin/trainer-earnings', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(r => r.json());
    if (!data.length) {
      wrap.innerHTML = '<div class="history-empty"><i class="fas fa-coins"></i><p>Aucune commission formateur.</p></div>';
      return;
    }
    const fmt = n => Number(n).toLocaleString('fr-FR') + ' AR';
    wrap.innerHTML = `
      <div class="video-admin-header" style="grid-template-columns:1.5fr 1.5fr 1fr 1fr 1fr 0.8fr">
        <span>Formateur</span><span>Contenu</span><span>Vente</span><span>Commission</span><span>Statut</span><span>Action</span>
      </div>
      ${data.map(e => {
        const av = e.avatar_photo
          ? `<img src="${e.avatar_photo}" style="width:28px;height:28px;border-radius:50%;object-fit:cover" />`
          : `<div class="avatar-circle" style="width:28px;height:28px;min-width:28px;font-size:0.6rem;background:${e.avatar_color||'#6c63ff'}">${getInitials(e.trainer_name||'?')}</div>`;
        return `
          <div class="video-admin-row" style="grid-template-columns:1.5fr 1.5fr 1fr 1fr 1fr 0.8fr">
            <span style="display:flex;align-items:center;gap:0.5rem">${av}<span style="font-size:0.85rem">${esc(e.trainer_name||'—')}</span></span>
            <span style="font-size:0.82rem;color:var(--text2)">${esc(e.content_title||'—')}</span>
            <span class="green">${fmt(e.sale_amount)}</span>
            <span class="green">${fmt(e.commission_amount)} <small style="color:var(--text2)">(${e.commission_rate}%)</small></span>
            <span><span class="status-badge ${e.statut==='Payé'?'status-paid':'status-pending'}">${e.statut}</span></span>
            <span>${e.statut !== 'Payé'
              ? `<button onclick="markTrainerEarningPaid(${e.id},this)" style="font-size:0.72rem;background:rgba(0,212,170,0.1);color:var(--accent2);border:1px solid rgba(0,212,170,0.3);padding:0.2rem 0.6rem;border-radius:50px;cursor:pointer;font-family:inherit">Payer</button>`
              : '<i class="fas fa-check" style="color:var(--accent2)"></i>'
            }</span>
          </div>`;
      }).join('')}`;
  } catch(e) {
    wrap.innerHTML = '<p style="color:var(--red);padding:1rem">Erreur de chargement.</p>';
  }
}

async function markTrainerEarningPaid(id, btn) {
  btn.disabled = true;
  const token = localStorage.getItem('pd_jwt');
  try {
    await fetch(API_URL + '/admin/trainer-earnings/' + id + '/paid', {
      method: 'PATCH', headers: { 'Authorization': 'Bearer ' + token }
    });
    await loadFinanceTrainerEarnings();
    await loadAdminFinance();
  } catch(e) { btn.disabled = false; alert('Erreur : ' + e.message); }
}

function switchFinanceTab(tab, btn) {
  ['withdraws', 'commissions', 'trainerearnings'].forEach(t => {
    const el = document.getElementById('financeTab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#financeSubTabs .admin-filter-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (tab === 'withdraws')       loadFinanceWithdraws();
  if (tab === 'commissions')     loadFinanceCommissions();
  if (tab === 'trainerearnings') loadFinanceTrainerEarnings();
}

// Exposer globalement
window.loadAdminFinance          = loadAdminFinance;
window.loadFinanceWithdraws      = loadFinanceWithdraws;
window.loadFinanceCommissions    = loadFinanceCommissions;
window.loadFinanceTrainerEarnings= loadFinanceTrainerEarnings;
window.markTrainerEarningPaid    = markTrainerEarningPaid;
window.switchFinanceTab          = switchFinanceTab;



// Rend le texte d'un commentaire avec @mentions cliquables
function _renderCommentText(text) {
  if (!text) return '';
  return esc(text).replace(/@([A-Z\u00C0-\u024F][\w\u00C0-\u024F]*(?:\s[A-Z\u00C0-\u024F][\w\u00C0-\u024F]*)?)/g, (_, name) =>
    '<a href="javascript:void(0)" class="post-mention" onclick="_openMentionProfile(\'' + name.replace(/'/g, "\\'") + '\')">' + '@' + name + '</a>'
  );
}

// ===== MENTIONS @ =====
let _mentionUsersCache = null;

async function _getMentionUsers() {
  if (_mentionUsersCache) return _mentionUsersCache;
  try {
    const API = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
    const r = await fetch(API + '/members');
    _mentionUsersCache = await r.json();
  } catch(e) { _mentionUsersCache = []; }
  return _mentionUsersCache;
}

async function _openMentionProfile(name) {
  try {
    const users = await _getMentionUsers();
    const found = users.find(u => u.name.toLowerCase() === name.toLowerCase());
    if (found) window.location.href = 'profil.html?id=' + found.id;
  } catch(e) {}
}

function _initMentionAutocomplete(input) {
  if (!input || input._mentionInit) return;
  input._mentionInit = true;

  // Créer le dropdown une seule fois, attaché au body
  const dropdown = document.createElement('div');
  dropdown.style.cssText = [
    'position:fixed',
    'z-index:99999',
    'background:var(--bg2)',
    'border:1px solid var(--border)',
    'border-radius:10px',
    'box-shadow:0 8px 24px rgba(0,0,0,0.4)',
    'min-width:220px',
    'max-width:300px',
    'overflow:hidden',
    'display:none'
  ].join(';');
  document.body.appendChild(dropdown);

  let _mentionStart = -1;

  function _closeDropdown() {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    _mentionStart = -1;
  }

  function _positionDropdown() {
    // Positionner sous le champ input
    const rect = input.getBoundingClientRect();
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top  = (rect.bottom + 4) + 'px';
    // Si déborde en bas, afficher au-dessus
    const ddH = dropdown.offsetHeight || 200;
    if (rect.bottom + ddH + 4 > window.innerHeight) {
      dropdown.style.top = (rect.top - ddH - 4) + 'px';
    }
  }

  function _buildDropdown(users, query) {
    const filtered = users
      .filter(u => u.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 6);

    if (!filtered.length) { _closeDropdown(); return; }

    dropdown.innerHTML = '';
    filtered.forEach(u => {
      const initials = u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const av = u.avatarPhoto
        ? '<img src="' + u.avatarPhoto + '" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0" />'
        : '<div style="width:34px;height:34px;border-radius:50%;background:' + (u.avatarColor || '#6c63ff') + ';display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;color:#fff;flex-shrink:0">' + initials + '</div>';

      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:0.7rem;padding:0.6rem 0.9rem;cursor:pointer;transition:background 0.15s';
      item.innerHTML = av + '<div style="min-width:0"><div style="font-size:0.88rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(u.name) + '</div><div style="font-size:0.72rem;color:var(--text2)">' + u.plan + '</div></div>';

      item.addEventListener('mouseenter', () => item.style.background = 'rgba(108,99,255,0.1)');
      item.addEventListener('mouseleave', () => item.style.background = '');
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        _insertMention(u.name);
      });
      dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
    _positionDropdown();
  }

  function _insertMention(name) {
    const val    = input.value;
    const before = val.slice(0, _mentionStart);
    const after  = val.slice(input.selectionStart);
    input.value  = before + '@' + name + ' ' + after;
    input.focus();
    const pos = _mentionStart + name.length + 2;
    input.selectionStart = input.selectionEnd = pos;
    _closeDropdown();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  input.addEventListener('input', async function() {
    const val   = this.value;
    const caret = this.selectionStart;
    const before = val.slice(0, caret);
    const atIdx  = before.lastIndexOf('@');

    if (atIdx === -1) { _closeDropdown(); return; }

    const query = before.slice(atIdx + 1);
    // Bloquer si espace après plus de 2 mots (prénom + nom max)
    const parts = query.split(' ');
    if (parts.length > 2 || query.length > 40) { _closeDropdown(); return; }

    _mentionStart = atIdx;
    if (query.trim().length === 0) { _closeDropdown(); return; }

    const users = await _getMentionUsers();
    _buildDropdown(users, query.trim());
  });

  input.addEventListener('keydown', function(e) {
    if (dropdown.style.display === 'none') return;
    if (e.key === 'Escape') { e.preventDefault(); _closeDropdown(); }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const first = dropdown.querySelector('div');
      if (first) first.focus();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(_closeDropdown, 200);
  });

  window.addEventListener('scroll', _positionDropdown, { passive: true });
  window.addEventListener('resize', _closeDropdown);
}


// Brancher sur les champs commentaire à l'ouverture
const _origToggleComments = window.toggleComments || toggleComments;
window.toggleComments = function(postId) {
  _origToggleComments(postId);
  setTimeout(() => {
    const input = document.getElementById('comment-input-' + postId);
    if (input) _initMentionAutocomplete(input);
  }, 150);
};

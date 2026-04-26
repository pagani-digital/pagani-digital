'use strict';
// ══════════════════════════════════════════════════════════
//  GROUPES DE DISCUSSION — Frontend
//  Dépend de : app.js (getUser, getInitials, esc), api.js
// ══════════════════════════════════════════════════════════

const API_BASE = () => (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || (window.location.origin + '/api');
const _jwt     = () => localStorage.getItem('pd_jwt');

// ── État ──────────────────────────────────────────────────
let _allGroups        = [];
let _currentGroupData = null;
let _groupMessages    = [];
let _groupImageB64    = '';
let _groupReplyTo     = null;
let _newGroupMembers  = [];
let _groupSearchTimer = null;
let _addMemberTimer   = null;
let _groupOldestTs    = null;   // pour scroll infini (pagination)
let _groupLoadingMore = false;

// ══════════════════════════════════════════════════════════
//  ONGLET DM / GROUPES
// ══════════════════════════════════════════════════════════

function switchMsgTab(tab, btn) {
  window._activeTab = tab;
  document.querySelectorAll('.mpx-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const isDm = tab === 'dm';
  document.getElementById('convList').style.display   = isDm ? '' : 'none';
  document.getElementById('groupList').style.display  = isDm ? 'none' : '';
  document.getElementById('convSearchInput').placeholder = isDm ? 'Rechercher...' : 'Rechercher un groupe...';
  document.getElementById('mpxComposeBtn').title   = isDm ? 'Nouveau message' : 'Nouveau groupe';
  document.getElementById('mpxComposeBtn').onclick = isDm ? showNewMsgModal : showNewGroupModal;
  if (tab === 'groups' && _allGroups.length === 0) loadGroups();
  _closeActiveChat();
}

function _closeActiveChat() {
  if (_groupTypingHideTimer) { clearTimeout(_groupTypingHideTimer); _groupTypingHideTimer = null; }
  var el = document.getElementById('chatTypingIndicator');
  if (el) el.style.display = 'none';
  var scrollBtn = document.getElementById('scrollDownBtn');
  if (scrollBtn) { scrollBtn.style.display = 'none'; scrollBtn.classList.remove('visible'); }
  document.getElementById('chatEmpty').style.display    = 'flex';
  document.getElementById('chatMessages').style.display = 'none';
  document.getElementById('chatMessages').innerHTML     = '';
  document.getElementById('chatHeader').style.display   = 'none';
  document.getElementById('chatInputRow').style.display = 'none';
  var pl = document.getElementById('chatProfileLink');
  if (pl) { pl.innerHTML = '<i class="fas fa-user-circle"></i>'; pl.style.display = ''; }
  var sidebar = document.getElementById('mpxSidebar');
  var chat    = document.getElementById('mpxChat');
  if (sidebar) sidebar.classList.remove('msg-hidden');
  if (chat)    chat.classList.remove('msg-visible');
  document.body.classList.remove('chat-open');
  window._currentChatUserId = null;
  window._currentGroupId    = null;
  window._groupChatActive   = false;
}

// Guard : empêche tout rechargement DM quand un groupe est ouvert
// Patch sur window.openChat ET sur le polling via _currentChatUserId=null
(function() {
  var _guardNames = ['_loadChatMessages', '_pollChat', '_chatPoll', 'loadMessages', '_refreshChat', 'openChat'];
  function _patchFn(name) {
    var orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function() {
      if (window._currentGroupId || window._groupChatActive) return;
      return orig.apply(this, arguments);
    };
  }
  function _patchAll() { _guardNames.forEach(_patchFn); }
  _patchAll();
  document.addEventListener('DOMContentLoaded', function() {
    _patchAll();
    setTimeout(_patchAll, 800);
  });
})();

// ══════════════════════════════════════════════════════════
//  LISTE DES GROUPES
// ══════════════════════════════════════════════════════════

async function loadGroups() {
  const list = document.getElementById('groupList');
  list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text2)"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    const r = await fetch(API_BASE() + '/groups', { headers: { 'Authorization': 'Bearer ' + _jwt() } });
    _allGroups = await r.json();
    renderGroupList();
    _updateGroupTabBadge();
  } catch(e) {
    list.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--red);font-size:0.82rem">Erreur de chargement</div>';
  }
}

function renderGroupList() {
  window._allGroups = _allGroups;
  const list = document.getElementById('groupList');
  if (!_allGroups.length) {
    list.innerHTML = '<div style="padding:2rem 1rem;text-align:center;color:var(--text2);font-size:0.85rem"><i class="fas fa-users" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:0.8rem"></i>Aucun groupe.<br><small>Créez-en un avec le bouton +</small></div>';
    return;
  }
  list.innerHTML = _allGroups.map(function(g) {
    const unread  = parseInt(g.unread_count) || 0;
    const lastMsg = g.last_message ? g.last_message.slice(0,40) + (g.last_message.length > 40 ? '…' : '') : 'Aucun message';
    const av = g.photo
      ? '<img src="' + g.photo + '" style="width:44px;height:44px;object-fit:cover;border-radius:12px" />'
      : '<div class="mpx-group-avatar">' + g.name.split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2) + '</div>';
    return '<div class="mpx-group-item" data-gid="' + g.id + '" onclick="openGroupChat(' + g.id + ')">'
      + av
      + '<div class="mpx-group-info"><div class="mpx-group-name">' + g.name + '</div><div class="mpx-group-last">' + lastMsg + '</div></div>'
      + '<div class="mpx-group-meta">'
      + (unread > 0 ? '<span class="mpx-group-unread">' + unread + '</span>' : '')
      + '<span class="mpx-group-count"><i class="fas fa-users" style="font-size:0.65rem"></i> ' + (g.member_count || 1) + '</span>'
      + '</div></div>';
  }).join('');
}

function _updateGroupTabBadge() {
  const total = _allGroups.reduce(function(s,g){ return s + (parseInt(g.unread_count)||0); }, 0);
  const badge = document.getElementById('tabBadgeGroups');
  if (!badge) return;
  badge.textContent    = total;
  badge.style.display  = total > 0 ? 'inline-block' : 'none';
}

// ══════════════════════════════════════════════════════════
//  MODAL CRÉATION GROUPE
// ══════════════════════════════════════════════════════════

var _newGroupPhotoB64 = '';

function _previewNewGroupPhoto(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert('Image trop grande (max 2 Mo).'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    _newGroupPhotoB64 = e.target.result;
    var prev = document.getElementById('newGroupPhotoPreview');
    prev.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:cover" />';
  };
  reader.readAsDataURL(file);
}

function showNewGroupModal() {
  _newGroupPhotoB64 = '';
  document.getElementById('newGroupPhotoPreview').innerHTML = '<i class="fas fa-image" style="color:var(--text2);font-size:1.1rem"></i>';
  var inp = document.getElementById('newGroupPhotoInput');
  if (inp) inp.value = '';
  _newGroupMembers = [];
  document.getElementById('newGroupName').value         = '';
  document.getElementById('newGroupSearch').value       = '';
  document.getElementById('newGroupResults').innerHTML  = '';
  document.getElementById('newGroupSelected').innerHTML = '';
  document.getElementById('newGroupStatus').textContent = '';
  document.getElementById('newGroupModal').style.display = 'flex';
  setTimeout(function(){ document.getElementById('newGroupName').focus(); }, 50);
}

function closeNewGroupModal() {
  document.getElementById('newGroupModal').style.display = 'none';
}

async function searchGroupMembers(query) {
  const results = document.getElementById('newGroupResults');
  clearTimeout(_groupSearchTimer);
  if (!query || query.length < 2) { results.innerHTML = ''; return; }
  _groupSearchTimer = setTimeout(async function() {
    try {
      const r = await fetch(API_BASE() + '/members/search?q=' + encodeURIComponent(query), { headers: { 'Authorization': 'Bearer ' + _jwt() } });
      const users = await r.json();
      const filtered = (Array.isArray(users) ? users : [])
        .filter(function(u){ return !_newGroupMembers.find(function(m){ return m.id === u.id; }); })
        .slice(0, 6);
      if (!filtered.length) { results.innerHTML = '<div class="mpx-modal-empty">Aucun membre trouvé</div>'; return; }
      results.innerHTML = filtered.map(function(u) {
        const av = u.avatarPhoto
          ? '<img src="' + u.avatarPhoto + '" class="mpx-result-avatar" />'
          : '<div class="mpx-result-avatar mpx-result-initials" style="background:' + (u.avatarColor||'#6c63ff') + '">' + getInitials(u.name) + '</div>';
        return '<div class="mpx-result-item" onclick="addGroupMember(' + u.id + ',\'' + u.name.replace(/'/g,"\\'") + '\',\'' + (u.avatarColor||'#6c63ff') + '\',\'' + (u.avatarPhoto||'') + '\')">'
          + av + '<div class="mpx-result-info"><span class="mpx-result-name">' + u.name + '</span></div>'
          + '<i class="fas fa-plus" style="color:var(--accent);font-size:0.85rem"></i></div>';
      }).join('');
    } catch(e) {}
  }, 300);
}

function addGroupMember(id, name, color, photo) {
  if (_newGroupMembers.find(function(m){ return m.id === id; })) return;
  _newGroupMembers.push({ id, name, color, photo });
  _renderGroupMemberChips();
  document.getElementById('newGroupSearch').value = '';
  document.getElementById('newGroupResults').innerHTML = '';
}

function removeGroupMember(id) {
  _newGroupMembers = _newGroupMembers.filter(function(m){ return m.id !== id; });
  _renderGroupMemberChips();
}

function _renderGroupMemberChips() {
  document.getElementById('newGroupSelected').innerHTML = _newGroupMembers.map(function(m) {
    return '<span class="mpx-member-chip">' + m.name
      + ' <button onclick="removeGroupMember(' + m.id + ')"><i class="fas fa-times"></i></button></span>';
  }).join('');
}

async function createGroup() {
  const name   = document.getElementById('newGroupName').value.trim();
  const status = document.getElementById('newGroupStatus');
  if (!name) { status.style.color = 'var(--red)'; status.textContent = 'Le nom est obligatoire.'; return; }
  status.style.color = 'var(--text2)'; status.textContent = 'Création...';
  try {
    const r = await fetch(API_BASE() + '/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _jwt() },
      body: JSON.stringify({ name, photo: _newGroupPhotoB64 || '', memberIds: _newGroupMembers.map(function(m){ return m.id; }) })
    });
    const group = await r.json();
    if (!r.ok) { status.style.color = 'var(--red)'; status.textContent = group.error || 'Erreur'; return; }
    closeNewGroupModal();
    await loadGroups();
    switchMsgTab('groups', document.getElementById('tabBtnGroups'));
    openGroupChat(group.id);
  } catch(e) { status.style.color = 'var(--red)'; status.textContent = 'Erreur serveur.'; }
}

// ══════════════════════════════════════════════════════════
//  OUVERTURE CHAT GROUPE
// ══════════════════════════════════════════════════════════

async function openGroupChat(groupId) {
  window._currentGroupId    = groupId;
  window._currentChatUserId = null;
  window.__typingChatUserId = null;
  // Stopper TOUS les timers DM immédiatement
  if (window._chatPollingTimer)  { clearInterval(window._chatPollingTimer);  window._chatPollingTimer  = null; }
  if (window._chatPollInterval)  { clearInterval(window._chatPollInterval);  window._chatPollInterval  = null; }
  if (window._dmPollTimer)       { clearInterval(window._dmPollTimer);       window._dmPollTimer       = null; }
  if (window._msgPollTimer)      { clearInterval(window._msgPollTimer);      window._msgPollTimer      = null; }
  if (window._chatRefreshTimer)  { clearInterval(window._chatRefreshTimer);  window._chatRefreshTimer  = null; }
  // Bloquer aussi tout appel à _loadChatMessages / openChat pendant qu'un groupe est ouvert
  window._groupChatActive = true;
  _groupMessages  = [];
  _groupOldestTs  = null;
  _groupReplyTo   = null;
  _groupImageB64  = '';

  document.querySelectorAll('.mpx-group-item').forEach(function(el){
    el.classList.toggle('active', parseInt(el.dataset.gid) === groupId);
  });

  document.getElementById('chatEmpty').style.display    = 'none';
  document.getElementById('chatMessages').style.display = 'flex';
  document.getElementById('chatMessages').innerHTML     = '';
  document.getElementById('chatHeader').style.display   = 'flex';
  document.getElementById('chatInputRow').style.display = 'flex';
  // Mobile : cacher sidebar, afficher chat (identique au DM)
  var sidebar = document.getElementById('mpxSidebar');
  var chat    = document.getElementById('mpxChat');
  if (sidebar) sidebar.classList.add('msg-hidden');
  if (chat)    chat.classList.add('msg-visible');
  document.body.classList.add('chat-open');
  _clearReplyBar();

  try {
    const r = await fetch(API_BASE() + '/groups/' + groupId, { headers: { 'Authorization': 'Bearer ' + _jwt() } });
    _currentGroupData = await r.json();
  } catch(e) { return; }

  // En-tête
  const g = _currentGroupData;
  document.getElementById('chatHeaderAvatar').innerHTML = g.photo
    ? '<img src="' + g.photo + '" style="width:40px;height:40px;object-fit:cover;border-radius:12px" />'
    : '<div class="mpx-group-avatar" style="width:40px;height:40px;font-size:0.9rem">' + g.name.split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2) + '</div>';
  document.getElementById('chatHeaderName').textContent  = g.name;
  document.getElementById('chatHeaderSub').textContent   = (g.members ? g.members.length : 1) + ' membre(s)';
  document.getElementById('chatHeaderSub').style.display = 'block';

  // Charger les membres en ligne
  _updateGroupOnlineCount(g.members || []);

  // Boutons header
  const profileLink = document.getElementById('chatProfileLink');
  profileLink.removeAttribute('href');
  profileLink.style.display = 'flex';
  profileLink.style.gap = '0.2rem';
  profileLink.style.alignItems = 'center';
  profileLink.innerHTML =
    '<button class="mpx-group-action-btn" onclick="openGroupMembersModal()" title="Membres"><i class="fas fa-users"></i></button>'
    + (g.role === 'admin' ? '<button class="mpx-group-action-btn" onclick="openEditGroupModal()" title="Modifier"><i class="fas fa-edit"></i></button>' : '')
    + '<button class="mpx-group-action-btn" onclick="leaveOrDeleteGroup()" style="color:var(--red)" title="'
    + (g.role === 'admin' && g.created_by === (getUser()&&getUser().id) ? 'Supprimer' : 'Quitter')
    + '"><i class="fas fa-sign-out-alt"></i></button>';

  await _loadGroupMessages(groupId, false);

  // Bouton scroll vers le bas
  const btn = document.getElementById('scrollDownBtn');
  if (btn) { btn.style.display = 'none'; btn.classList.remove('visible'); }
  if (typeof _initChatScrollBtn === 'function') _initChatScrollBtn(document.getElementById('chatMessages'));

  // Réinitialiser badge
  const gInList = _allGroups.find(function(x){ return x.id === groupId; });
  if (gInList) { gInList.unread_count = 0; renderGroupList(); _updateGroupTabBadge(); }
}

// ── Chargement messages (initial ou pagination) ────────────
async function _loadGroupMessages(groupId, prepend) {
  const box = document.getElementById('chatMessages');
  if (!prepend) {
    // Vider complètement avant de charger (fix bug historique DM)
    box.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text2)"><i class="fas fa-spinner fa-spin"></i></div>';
    _groupMessages = [];
  }
  try {
    let url = API_BASE() + '/groups/' + groupId + '/messages?limit=30';
    if (prepend && _groupOldestTs) url += '&before=' + encodeURIComponent(_groupOldestTs);
    const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + _jwt() } });
    const msgs = await r.json();
    if (!prepend) {
      _groupMessages = msgs;
      renderGroupMessages();
      box.scrollTop = box.scrollHeight;
    } else {
      if (!msgs.length) { _groupLoadingMore = false; return; }
      const prevHeight = box.scrollHeight;
      _groupMessages = msgs.concat(_groupMessages);
      renderGroupMessages();
      box.scrollTop = box.scrollHeight - prevHeight; // maintenir position
    }
    if (msgs.length) _groupOldestTs = msgs[0].created_at;
    _groupLoadingMore = false;
  } catch(e) {
    if (!prepend) box.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--red)">Erreur de chargement</div>';
    _groupLoadingMore = false;
  }
}

// ── Scroll infini (charger plus anciens) ───────────────────
function _initGroupScrollInfinite() {
  const box = document.getElementById('chatMessages');
  box.addEventListener('scroll', function() {
    if (box.scrollTop < 60 && !_groupLoadingMore && window._currentGroupId) {
      _groupLoadingMore = true;
      _loadGroupMessages(window._currentGroupId, true);
    }
    // Bouton scroll vers le bas
    const btn = document.getElementById('scrollDownBtn');
    if (btn) {
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      btn.classList.toggle('visible', !atBottom);
    }
  });
}

// Palette de couleurs pour les noms des membres (comme Telegram)
var _GROUP_COLORS = ['#6c63ff','#00d4aa','#f59e0b','#ff4d6d','#3b82f6','#8b5cf6','#10b981','#f97316','#06b6d4','#ec4899'];
function _memberColor(userId) {
  return _GROUP_COLORS[userId % _GROUP_COLORS.length];
}



async function _updateGroupOnlineCount(members) {
  var sub = document.getElementById('chatHeaderSub');
  if (!sub) return;
  var total = members.length;
  try {
    var results = await Promise.all(members.map(function(m) {
      return fetch(API_BASE() + '/presence/' + m.user_id, { headers: { 'Authorization': 'Bearer ' + _jwt() } })
        .then(function(r){ return r.json(); })
        .catch(function(){ return { online: false }; });
    }));
    var onlineCount = results.filter(function(r){ return r.online; }).length;
    sub.innerHTML = total + ' membre(s)'
      + (onlineCount > 0
        ? ' &bull; <span style="color:var(--accent2)"><i class="fas fa-circle" style="font-size:0.5rem;vertical-align:middle"></i> ' + onlineCount + ' en ligne</span>'
        : '');
  } catch(e) {
    sub.textContent = total + ' membre(s)';
  }
}

function _groupDateLabel(dateStr) {
  const d     = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today))     return "Aujourd'hui";
  if (sameDay(d, yesterday)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function renderGroupMessages() {
  const box = document.getElementById('chatMessages');
  const me  = getUser();
  if (!_groupMessages.length) {
    box.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text2);font-size:0.85rem">Aucun message. Soyez le premier !</div>';
    return;
  }
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = _groupMessages.map(function(msg, i){
    var sep = '';
    var prevMsg = _groupMessages[i - 1];
    if (!prevMsg || _groupDateLabel(msg.created_at) !== _groupDateLabel(prevMsg.created_at)) {
      sep = '<div class="mpx-date-sep">' + _groupDateLabel(msg.created_at) + '</div>';
    }
    return sep + _buildGroupMsgHTML(msg, me);
  }).join('');
  box.querySelectorAll('.mpx-bubble[data-msgid]').forEach(function(b){ _attachBubbleLongPress(b); });
  box.querySelectorAll('.grp-row[data-msgid]').forEach(function(row){ _attachSwipeReply(row); });
  if (atBottom) box.scrollTop = box.scrollHeight;
}

function _buildGroupMsgHTML(msg, me) {
  // Message système (join/leave/kick)
  if (msg.type === 'system') {
    return '<div style="text-align:center;padding:0.4rem 1rem;font-size:0.75rem;color:var(--text2);font-style:italic">'
      + '<span style="background:var(--bg2);border:1px solid var(--border);border-radius:50px;padding:0.2rem 0.8rem">'
      + esc(msg.content) + '</span></div>';
  }
  const isOwn = me && msg.sender_id === me.id;

  // Avatar — identique au DM (mpx-bubble-av)
  const av = msg.sender_photo
    ? '<img src="' + msg.sender_photo + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover" />'
    : '<div class="avatar-circle" style="background:' + (msg.sender_color||'#6c63ff') + ';width:28px;height:28px;font-size:0.6rem;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;border-radius:50%">' + getInitials(msg.sender_name||'?') + '</div>';
  const avatarHtml = !isOwn ? '<div class="mpx-bubble-av">' + av + '</div>' : '';

  // Citation
  const quoteBlock = (msg.reply_content || msg.reply_to_id)
    ? '<div class="mpx-bubble-quote" onclick="_scrollToGroupMsg(' + (msg.reply_to_id||0) + ')">'
      + '<div class="mpx-bubble-quote-inner">'
      + '<span class="mpx-bubble-quote-name">' + esc(msg.reply_sender_name||'') + '</span>'
      + '<span class="mpx-bubble-quote-text">' + (msg.reply_content === '__IMAGE__' ? '\uD83D\uDCF7 Photo' : msg.reply_content ? esc(msg.reply_content.slice(0,80)) : '\uD83D\uDCF7 Photo') + '</span>'
      + '</div></div>'
    : '';

  // Image
  const imgBlock = msg.image
    ? '<img src="' + msg.image + '" style="max-width:220px;border-radius:10px;display:block;cursor:zoom-in" onclick="_openImgFull(this.src)" />'
    : '';

  // Nom expéditeur (autres seulement)
  const senderName = !isOwn
    ? '<div class="mpx-group-sender-name" style="color:' + _memberColor(msg.sender_id) + '">' + esc(msg.sender_name||'') + '</div>'
    : '';

  const time = _groupTimeAgo(msg.created_at);

  // Bouton répondre — même position que DM (dans .mpx-bubble-wrap, avant la bulle)
  const replyBtn = '<button class="mpx-reply-btn" title="Répondre" onclick="event.stopPropagation();_setGroupReply(' + msg.id + ')"><i class="fas fa-reply"></i></button>';

  // Trigger réaction — même position que DM (dans la bulle)
  const rxTrigger = '<button class="mpx-rx-trigger" title="Réagir" onclick="event.stopPropagation();_showGroupRxPicker(event,' + msg.id + ')"><i class="fas fa-smile"></i></button>';

  // Zone réactions — en dehors de la row, comme le DM
  const rxZone = '<div class="mpx-bubble-reactions" id="rx-zone-' + msg.id + '">' + _buildGroupReactions(msg) + '</div>';

  const swipeIcon = '<div class="mpx-swipe-icon"><i class="fas fa-reply"></i></div>';

  return '<div class="mpx-bubble-row' + (isOwn ? ' mine' : '') + ' grp-row" data-msgid="' + msg.id + '" id="gmsg-' + msg.id + '">'
    + swipeIcon
    + avatarHtml
    + '<div class="mpx-bubble-wrap">'
      + senderName
      + '<div class="mpx-bubble-wrap-inner">'
        + (isOwn ? '' : '')
        + '<div class="mpx-bubble ' + (isOwn ? 'mine' : 'theirs') + '" data-msgid="' + msg.id + '"'
          + (msg.image && !msg.content ? ' style="background:none;border:none;box-shadow:none;padding:0"' : '') + '>'
          + quoteBlock
          + (msg.content ? (typeof _renderCommentText === 'function' ? _renderCommentText(msg.content) : esc(msg.content)) : '')
          + imgBlock
          + '<span class="mpx-bubble-meta">' + time + '</span>'
          + rxTrigger
        + '</div>'
        + replyBtn
      + '</div>'
      + rxZone
    + '</div>'
  + '</div>';
}


// Scroller vers le message cité
function _scrollToGroupMsg(msgId) {
  if (!msgId) return;
  var el = document.getElementById('gmsg-' + msgId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('mpx-bubble-highlight');
  setTimeout(function(){ el.classList.remove('mpx-bubble-highlight'); }, 1500);
}

// Picker réactions groupe — utilise le même système que le DM (_showRxPicker)
function _showGroupRxPicker(e, msgId) {
  // Réutiliser _showRxPicker du DM si disponible
  if (typeof _showRxPicker === 'function') {
    // Remplacer temporairement _toggleReaction pour cibler les messages groupe
    var origToggle = window._toggleReaction;
    window._toggleReaction = function(id, emoji) {
      sendGroupReaction(id, emoji);
      // Restaurer après usage
      window._toggleReaction = origToggle;
    };
    _showRxPicker(e, msgId);
    return;
  }
  // Fallback : menu bulle
  var row = document.querySelector('[data-msgid="' + msgId + '"] .mpx-bubble');
  if (row) _showBubbleMenu(row);
}

// Ouvre le menu depuis le bouton ⋮
function _showBubbleMenuById(msgId, btn) {
  var wrap = btn.closest('.mpx-bubble-wrap');
  if (!wrap) return;
  var bubble = wrap.querySelector('.mpx-bubble');
  if (bubble) _showBubbleMenu(bubble);
}

function _buildGroupReactions(msg) {
  if (!msg.reactions || !msg.reactions.length) return '';
  const me = getUser();
  const counts = {};
  msg.reactions.forEach(function(r){ counts[r.emoji] = (counts[r.emoji]||0) + 1; });
  return Object.entries(counts).map(function(e) {
    const mine = me && msg.reactions.find(function(r){ return r.user_id === me.id && r.emoji === e[0]; });
    return '<span class="mpx-rx-chip' + (mine ? ' mine' : '') + '" onclick="sendGroupReaction(' + msg.id + ',\'' + e[0] + '\')">' + e[0] + ' ' + e[1] + '</span>';
  }).join('');
}

function _groupTimeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return "à l'instant";
  if (diff < 3600)  return 'Il y a ' + Math.floor(diff/60) + ' min';
  if (diff < 86400) return 'Il y a ' + Math.floor(diff/3600) + 'h';
  return new Date(dateStr).toLocaleDateString('fr-FR');
}

function _openImgFull(src) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:3000;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  ov.innerHTML = '<img src="' + src + '" style="max-width:95vw;max-height:90vh;border-radius:10px;object-fit:contain" />';
  ov.onclick = function(){ ov.remove(); };
  document.body.appendChild(ov);
}

// ══════════════════════════════════════════════════════════
//  MENTION AUTOCOMPLETE GROUPE
// ══════════════════════════════════════════════════════════

var _grpMentionDropdown = null;
var _grpMentionStart    = -1;

function _initGroupMentionAutocomplete(input) {
  // Supprimer l'ancien listener si existe
  if (input._grpMentionHandler) input.removeEventListener('input', input._grpMentionHandler);
  if (input._grpKeyHandler)     input.removeEventListener('keydown', input._grpKeyHandler);

  // Créer le dropdown une seule fois
  if (!_grpMentionDropdown) {
    _grpMentionDropdown = document.createElement('div');
    _grpMentionDropdown.style.cssText = 'position:fixed;z-index:99999;background:var(--bg2);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);min-width:220px;max-width:300px;overflow:hidden;display:none';
    document.body.appendChild(_grpMentionDropdown);
  }

  function _close() {
    _grpMentionDropdown.style.display = 'none';
    _grpMentionDropdown.innerHTML = '';
    _grpMentionStart = -1;
  }

  function _getMembers() {
    if (!_currentGroupData || !_currentGroupData.members) return [];
    return _currentGroupData.members.map(function(m) {
      return { id: m.user_id, name: m.name, avatarPhoto: m.avatar_photo || '', avatarColor: m.avatar_color || '#6c63ff' };
    });
  }

  function _insert(name) {
    var val    = input.value;
    var before = val.slice(0, _grpMentionStart);
    var after  = val.slice(input.selectionStart);
    input.value = before + '@' + name + ' ' + after;
    input.focus();
    var pos = _grpMentionStart + name.length + 2;
    input.selectionStart = input.selectionEnd = pos;
    _close();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function _build(query) {
    var members = _getMembers().filter(function(u) {
      return u.name.toLowerCase().includes(query.toLowerCase());
    }).slice(0, 6);
    if (!members.length) { _close(); return; }
    _grpMentionDropdown.innerHTML = '';
    members.forEach(function(u) {
      var initials = u.name.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2);
      var av = u.avatarPhoto
        ? '<img src="' + u.avatarPhoto + '" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0" />'
        : '<div style="width:34px;height:34px;border-radius:50%;background:' + u.avatarColor + ';display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;color:#fff;flex-shrink:0">' + initials + '</div>';
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:0.7rem;padding:0.6rem 0.9rem;cursor:pointer;transition:background 0.15s';
      item.innerHTML = av + '<div style="font-size:0.88rem;font-weight:700">' + esc(u.name) + '</div>';
      item.addEventListener('mouseenter', function(){ item.style.background = 'rgba(108,99,255,0.1)'; });
      item.addEventListener('mouseleave', function(){ item.style.background = ''; });
      item.addEventListener('mousedown', function(e){ e.preventDefault(); _insert(u.name); });
      _grpMentionDropdown.appendChild(item);
    });
    var rect = input.getBoundingClientRect();
    _grpMentionDropdown.style.left = rect.left + 'px';
    _grpMentionDropdown.style.top  = (rect.top - _grpMentionDropdown.offsetHeight - 4) + 'px';
    _grpMentionDropdown.style.display = 'block';
    // Repositionner après affichage
    var ddH = _grpMentionDropdown.offsetHeight;
    _grpMentionDropdown.style.top = (rect.top - ddH - 4) + 'px';
  }

  input._grpMentionHandler = function() {
    if (!window._currentGroupId) return;
    var val    = input.value;
    var caret  = input.selectionStart;
    var before = val.slice(0, caret);
    var atIdx  = before.lastIndexOf('@');
    if (atIdx === -1) { _close(); return; }
    var query = before.slice(atIdx + 1);
    if (query.split(' ').length > 2 || query.length > 40) { _close(); return; }
    _grpMentionStart = atIdx;
    if (!query.trim()) { _close(); return; }
    _build(query.trim());
  };

  input._grpKeyHandler = function(e) {
    if (_grpMentionDropdown.style.display === 'none') return;
    if (e.key === 'Escape') { _close(); }
  };

  input.addEventListener('input',   input._grpMentionHandler);
  input.addEventListener('keydown', input._grpKeyHandler);
  document.addEventListener('click', function(e) {
    if (!_grpMentionDropdown.contains(e.target)) _close();
  });
}



let _groupTypingTimer = null;
let _groupTypingHideTimer = null;

function _sendGroupTyping() {
  const gid = window._currentGroupId;
  if (!gid) return;
  const me = getUser();
  if (!me) return;
  fetch(API_BASE() + '/groups/' + gid + '/typing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _jwt() },
    body: JSON.stringify({ name: me.name })
  }).catch(function(){});
}

function _showGroupTyping(name) {
  var el  = document.getElementById('chatTypingIndicator');
  var txt = document.getElementById('chatTypingText');
  if (!el || !txt) return;
  txt.textContent = name.split(' ')[0] + ' est en train d’écrire…';
  el.style.display = 'block';
  // Masquer automatiquement après 4s si pas de nouveau signal
  clearTimeout(_groupTypingHideTimer);
  _groupTypingHideTimer = setTimeout(function() {
    el.style.display = 'none';
  }, 4000);
}



async function sendGroupMessage() {
  const gid = window._currentGroupId;
  if (!gid) return;
  const input   = document.getElementById('chatInput');
  const content = input.value.trim();
  if (!content && !_groupImageB64) return;
  input.value = '';
  const body = { content, image: _groupImageB64 || '' };
  if (_groupReplyTo) body.replyToId = _groupReplyTo.id;
  _groupImageB64 = '';
  var _savedReplyTo = _groupReplyTo;
  _groupReplyTo  = null;
  _clearReplyBar();
  document.getElementById('chatImagePreview').style.display = 'none';
  document.getElementById('chatImagePreviewImg').src = '';
  try {
    const r = await fetch(API_BASE() + '/groups/' + gid + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _jwt() },
      body: JSON.stringify(body)
    });
    const msg = await r.json();
    if (!r.ok) return;
    // Injecter les données de reply pour affichage instantané
    if (body.replyToId && _savedReplyTo) {
      msg.reply_content     = _savedReplyTo.content || (_savedReplyTo.image ? '__IMAGE__' : '');
      msg.reply_sender_name = _savedReplyTo.sender_name || '';
      msg.reply_to_id       = _savedReplyTo.id;
    }
    // Ajouter seulement si pas déjà présent (évite le doublon avec SSE)
    if (!_groupMessages.find(function(m){ return m.id === msg.id; })) {
      _groupMessages.push(msg);
      renderGroupMessages();
    }
  } catch(e) {}
}

async function sendGroupReaction(msgId, emoji) {
  const gid = window._currentGroupId;
  if (!gid) return;
  const me  = getUser();
  const msg = _groupMessages.find(function(m){ return m.id === msgId; });
  if (!msg) return;
  const existing = msg.reactions && msg.reactions.find(function(r){ return r.user_id === (me&&me.id); });
  const action   = (existing && existing.emoji === emoji) ? 'remove' : 'add';
  // Mise à jour optimiste
  if (!msg.reactions) msg.reactions = [];
  msg.reactions = msg.reactions.filter(function(r){ return r.user_id !== (me&&me.id); });
  if (action === 'add') msg.reactions.push({ emoji, user_id: me.id });
  renderGroupMessages();
  _animateReaction(msgId);
  try {
    await fetch(API_BASE() + '/groups/' + gid + '/messages/' + msgId + '/reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _jwt() },
      body: JSON.stringify({ emoji, action })
    });
  } catch(e) {}
}

async function deleteGroupMessage(msgId) {
  const gid = window._currentGroupId;
  if (!gid || !confirm('Supprimer ce message ?')) return;
  try {
    await fetch(API_BASE() + '/groups/' + gid + '/messages/' + msgId, {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + _jwt() }
    });
    _groupMessages = _groupMessages.filter(function(m){ return m.id !== msgId; });
    renderGroupMessages();
  } catch(e) {}
}

// ── Reply ──────────────────────────────────────────────────
function _setGroupReply(msgId) {
  const msg = _groupMessages.find(function(m){ return m.id === msgId; });
  if (!msg) return;
  _groupReplyTo = msg;
  document.getElementById('chatReplyName').textContent = msg.sender_name || '';
  document.getElementById('chatReplyText').textContent = msg.content ? msg.content.slice(0,60) : (msg.image ? '\uD83D\uDCF7 Photo' : '');
  var bar = document.getElementById('chatReplyBar');
  if (bar) bar.style.display = 'flex';
  document.getElementById('chatInput').focus();
}

function _clearReplyBar() {
  _groupReplyTo = null;
  const bar = document.getElementById('chatReplyBar');
  if (bar) bar.style.display = 'none';
}

// ── Image ──────────────────────────────────────────────────
function _groupPreviewImage(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Image trop grande (max 5 Mo).'); return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    _groupImageB64 = e.target.result;
    document.getElementById('chatImagePreviewImg').src = e.target.result;
    document.getElementById('chatImagePreview').style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

function _removeGroupImage() {
  _groupImageB64 = '';
  document.getElementById('chatImagePreview').style.display = 'none';
  document.getElementById('chatImagePreviewImg').src = '';
  const inp = document.getElementById('chatImageInput');
  if (inp) inp.value = '';
}

// ══════════════════════════════════════════════════════════
//  MENU CONTEXTUEL BULLE (long press / clic droit)
// ══════════════════════════════════════════════════════════

function _attachBubbleLongPress(bubble) {
  let timer = null, moved = false;
  bubble.addEventListener('touchstart', function() {
    moved = false;
    timer = setTimeout(function(){ if (!moved) _showBubbleMenu(bubble); }, 500);
  }, { passive: true });
  bubble.addEventListener('touchmove',   function(){ moved = true; clearTimeout(timer); }, { passive: true });
  bubble.addEventListener('touchend',    function(){ clearTimeout(timer); }, { passive: true });
  bubble.addEventListener('contextmenu', function(e){ e.preventDefault(); _showBubbleMenu(bubble); });
}

function _showBubbleMenu(bubble) {
  document.querySelectorAll('.mpx-bubble-menu').forEach(function(m){ m.remove(); });
  const msgId   = parseInt(bubble.dataset.msgid);
  const msg     = _groupMessages.find(function(m){ return m.id === msgId; });
  const me      = getUser();
  if (!msgId || !msg) return;
  const isOwn   = me && msg.sender_id === me.id;
  const isAdmin = _currentGroupData && _currentGroupData.role === 'admin';
  const EMOJIS  = ['❤️','😂','😮','😢','😡','👍'];
  const menu = document.createElement('div');
  menu.className = 'mpx-bubble-menu ' + (isOwn ? 'own' : '');
  menu.innerHTML =
    '<div class="mpx-bubble-menu-emojis">'
    + EMOJIS.map(function(e){
        const myReact = msg.reactions && msg.reactions.find(function(r){ return r.user_id === (me&&me.id) && r.emoji === e; });
        return '<button class="' + (myReact ? 'active' : '') + '" onclick="sendGroupReaction(' + msgId + ',\'' + e + '\');_closeBubbleMenu()">' + e + '</button>';
      }).join('')
    + '</div>'
    + '<div class="mpx-bubble-menu-actions">'
    + '<button onclick="_setGroupReply(' + msgId + ');_closeBubbleMenu()"><i class="fas fa-reply"></i> Répondre</button>'
    + ((isOwn || isAdmin) ? '<button class="danger" onclick="deleteGroupMessage(' + msgId + ');_closeBubbleMenu()"><i class="fas fa-trash"></i> Supprimer</button>' : '')
    + '</div>';
  // Positionner le menu sur la bulle
  bubble.style.position = 'relative';
  bubble.appendChild(menu);
  setTimeout(function(){
    document.addEventListener('click', function close(ev){
      if (!menu.contains(ev.target) && !ev.target.closest('.mpx-msg-actions-btn')){
        menu.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 10);
}

function _closeBubbleMenu() {
  document.querySelectorAll('.mpx-bubble-menu').forEach(function(m){ m.remove(); });
}

// ── Swipe pour répondre ───────────────────────────────────
function _attachSwipeReply(row) {
  var startX = 0, startY = 0, swiping = false, triggered = false;
  var icon = row.querySelector('.mpx-swipe-icon');
  var isOwn = row.classList.contains('mine');
  var THRESHOLD = 60;

  row.addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    swiping = false; triggered = false;
  }, { passive: true });

  row.addEventListener('touchmove', function(e) {
    var dx = e.touches[0].clientX - startX;
    var dy = Math.abs(e.touches[0].clientY - startY);
    if (dy > 20) return;
    var valid = isOwn ? dx < -20 : dx > 20;
    if (!valid) return;
    swiping = true;
    var progress = Math.min(Math.abs(dx) / THRESHOLD, 1);
    var bubble = row.querySelector('.mpx-bubble-wrap');
    if (bubble) bubble.style.transform = 'translateX(' + (isOwn ? -1 : 1) * Math.min(Math.abs(dx), THRESHOLD) * 0.6 + 'px)';
    if (icon) { icon.style.opacity = progress; icon.style.transform = 'translateY(-50%) scale(' + (0.5 + progress * 0.5) + ')'; }
    if (Math.abs(dx) >= THRESHOLD && !triggered) {
      triggered = true;
      _setGroupReply(parseInt(row.dataset.msgid));
      if (navigator.vibrate) navigator.vibrate(40);
    }
  }, { passive: true });

  row.addEventListener('touchend', function() {
    if (!swiping) return;
    var bubble = row.querySelector('.mpx-bubble-wrap');
    if (bubble) { bubble.style.transition = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)'; bubble.style.transform = 'translateX(0)'; setTimeout(function(){ bubble.style.transition = ''; }, 300); }
    if (icon) { icon.style.opacity = '0'; icon.style.transform = 'translateY(-50%) scale(0)'; }
    swiping = false;
  }, { passive: true });
}

// ── Animation réaction ────────────────────────────────────
function _animateReaction(msgId) {
  var box = document.getElementById('chatMessages');
  if (!box) return;
  var zone = box.querySelector('#rx-zone-' + msgId);
  if (!zone) return;
  var chips = zone.querySelectorAll('.mpx-rx-chip');
  chips.forEach(function(c) {
    c.classList.remove('pop');
    void c.offsetWidth;
    c.classList.add('pop');
    c.addEventListener('animationend', function(){ c.classList.remove('pop'); }, { once: true });
  });
}

// ══════════════════════════════════════════════════════════
//  MODAL MEMBRES
// ══════════════════════════════════════════════════════════

async function openGroupMembersModal() {
  if (!_currentGroupData) return;
  const g = _currentGroupData, me = getUser();

  // Charger la présence de tous les membres en parallèle
  const presenceMap = {};
  await Promise.all((g.members||[]).map(function(m) {
    return fetch(API_BASE() + '/presence/' + m.user_id, { headers: { 'Authorization': 'Bearer ' + _jwt() } })
      .then(function(r){ return r.json(); })
      .then(function(p){ presenceMap[m.user_id] = p.online; })
      .catch(function(){});
  }));

  document.getElementById('groupMembersTitle').textContent = g.name + ' — ' + (g.members||[]).length + ' membre(s)';
  document.getElementById('groupMembersList').innerHTML = (g.members||[]).map(function(m) {
    const isCreator = m.user_id === g.created_by;
    const isOnline  = !!presenceMap[m.user_id];
    const av = m.avatar_photo
      ? '<img src="' + m.avatar_photo + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover" />'
      : '<div class="avatar-circle avatar-sm" style="background:' + (m.avatar_color||'#6c63ff') + '">' + getInitials(m.name||'?') + '</div>';
    const onlineDot = isOnline
      ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent2);margin-left:0.4rem;vertical-align:middle" title="En ligne"></span>'
      : '';
    const roleLabel = '<span class="mpx-member-row-role ' + m.role + '">' + (isCreator ? 'Créateur' : m.role === 'admin' ? 'Admin' : 'Membre') + '</span>';
    let actions = '';
    if (g.role === 'admin' && m.user_id !== (me&&me.id) && !isCreator) {
      const newRole = m.role === 'admin' ? 'member' : 'admin';
      if (g.created_by === (me&&me.id)) {
        actions = '<button class="mpx-member-action" onclick="changeGroupMemberRole(' + m.user_id + ',\'' + newRole + '\')"><i class="fas fa-user-shield"></i> ' + (m.role === 'admin' ? 'Rétrograder' : 'Promouvoir') + '</button>';
      }
      actions += '<button class="mpx-member-action danger" onclick="removeGroupMemberFromGroup(' + m.user_id + ')"><i class="fas fa-user-minus"></i> Retirer</button>';
    }
    return '<div class="mpx-member-row">'
      + '<div style="position:relative;flex-shrink:0">' + av + (isOnline ? '<span style="position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;background:var(--accent2);border:2px solid var(--bg2)"></span>' : '') + '</div>'
      + '<div class="mpx-member-row-info"><div class="mpx-member-row-name">' + m.name + onlineDot + '</div>' + roleLabel + '</div>'
      + (actions ? '<div class="mpx-member-actions">' + actions + '</div>' : '')
      + '</div>';
  }).join('');

  document.getElementById('groupMembersAdminActions').style.display = g.role === 'admin' ? 'block' : 'none';
  document.getElementById('addMemberSearch').value = '';
  document.getElementById('addMemberResults').innerHTML = '';
  document.getElementById('groupMembersModal').style.display = 'flex';
}

function closeGroupMembersModal() {
  document.getElementById('groupMembersModal').style.display = 'none';
}

async function searchAddMember(query) {
  const results = document.getElementById('addMemberResults');
  clearTimeout(_addMemberTimer);
  if (!query || query.length < 2) { results.innerHTML = ''; return; }
  _addMemberTimer = setTimeout(async function() {
    try {
      const r = await fetch(API_BASE() + '/members/search?q=' + encodeURIComponent(query), { headers: { 'Authorization': 'Bearer ' + _jwt() } });
      const users = await r.json();
      const memberIds = new Set((_currentGroupData.members||[]).map(function(m){ return m.user_id; }));
      const filtered = (Array.isArray(users) ? users : []).filter(function(u){ return !memberIds.has(u.id); }).slice(0,5);
      if (!filtered.length) { results.innerHTML = '<div class="mpx-modal-empty">Aucun résultat</div>'; return; }
      results.innerHTML = filtered.map(function(u) {
        return '<div class="mpx-result-item" onclick="addMemberToGroup(' + u.id + ')">'
          + '<div class="mpx-result-info"><span class="mpx-result-name">' + u.name + '</span></div>'
          + '<i class="fas fa-plus" style="color:var(--accent)"></i></div>';
      }).join('');
    } catch(e) {}
  }, 300);
}

async function addMemberToGroup(userId) {
  const gid = window._currentGroupId;
  if (!gid) return;
  try {
    await fetch(API_BASE() + '/groups/' + gid + '/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _jwt() },
      body: JSON.stringify({ userId })
    });
    const r = await fetch(API_BASE() + '/groups/' + gid, { headers: { 'Authorization': 'Bearer ' + _jwt() } });
    _currentGroupData = await r.json();
    openGroupMembersModal();
  } catch(e) {}
}

async function removeGroupMemberFromGroup(userId) {
  const gid = window._currentGroupId;
  if (!gid || !confirm('Retirer ce membre ?')) return;
  try {
    await fetch(API_BASE() + '/groups/' + gid + '/members/' + userId, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + _jwt() } });
    const r = await fetch(API_BASE() + '/groups/' + gid, { headers: { 'Authorization': 'Bearer ' + _jwt() } });
    _currentGroupData = await r.json();
    openGroupMembersModal();
  } catch(e) {}
}

async function changeGroupMemberRole(userId, role) {
  const gid = window._currentGroupId;
  if (!gid) return;
  try {
    await fetch(API_BASE() + '/groups/' + gid + '/members/' + userId + '/role', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _jwt() },
      body: JSON.stringify({ role })
    });
    const r = await fetch(API_BASE() + '/groups/' + gid, { headers: { 'Authorization': 'Bearer ' + _jwt() } });
    _currentGroupData = await r.json();
    openGroupMembersModal();
  } catch(e) {}
}

async function leaveOrDeleteGroup() {
  const gid = window._currentGroupId, me = getUser();
  if (!gid || !_currentGroupData) return;
  const isCreator = _currentGroupData.created_by === (me&&me.id);
  if (!confirm(isCreator ? 'Supprimer ce groupe définitivement ?' : 'Quitter ce groupe ?')) return;
  try {
    const url = isCreator ? API_BASE() + '/groups/' + gid : API_BASE() + '/groups/' + gid + '/leave';
    await fetch(url, { method: isCreator ? 'DELETE' : 'POST', headers: { 'Authorization': 'Bearer ' + _jwt() } });
    _closeActiveChat();
    await loadGroups();
  } catch(e) {}
}

var _editGroupPhotoB64 = '';
var _editGroupRemovePhoto = false;

function openEditGroupModal() {
  if (!_currentGroupData) return;
  _editGroupPhotoB64 = '';
  _editGroupRemovePhoto = false;
  document.getElementById('editGroupNameInput').value = _currentGroupData.name;
  document.getElementById('editGroupStatus').textContent = '';
  var prev = document.getElementById('editGroupAvatarPreview');
  if (_currentGroupData.photo) {
    prev.innerHTML = '<img src="' + _currentGroupData.photo + '" style="width:100%;height:100%;object-fit:cover" />';
  } else {
    prev.textContent = _currentGroupData.name.split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2);
    prev.style.background = 'var(--accent)';
  }
  document.getElementById('editGroupModal').style.display = 'flex';
  setTimeout(function(){ document.getElementById('editGroupNameInput').focus(); }, 50);
}

function closeEditGroupModal() {
  document.getElementById('editGroupModal').style.display = 'none';
}

function _previewEditGroupPhoto(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert('Image trop grande (max 2 Mo).'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    _editGroupPhotoB64 = e.target.result;
    _editGroupRemovePhoto = false;
    document.getElementById('editGroupAvatarPreview').innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:cover" />';
  };
  reader.readAsDataURL(file);
}

function _removeEditGroupPhoto() {
  _editGroupPhotoB64 = '';
  _editGroupRemovePhoto = true;
  var prev = document.getElementById('editGroupAvatarPreview');
  prev.textContent = (_currentGroupData.name||'G').split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2);
  prev.style.background = 'var(--accent)';
  document.getElementById('editGroupPhotoInput').value = '';
}

async function saveEditGroup() {
  var name   = document.getElementById('editGroupNameInput').value.trim();
  var status = document.getElementById('editGroupStatus');
  if (!name) { status.style.color = 'var(--red)'; status.textContent = 'Le nom est obligatoire.'; return; }
  status.style.color = 'var(--text2)'; status.textContent = 'Enregistrement...';
  var body = { name: name };
  if (_editGroupPhotoB64)    body.photo = _editGroupPhotoB64;
  if (_editGroupRemovePhoto) body.photo = '';
  try {
    var r = await fetch(API_BASE() + '/groups/' + window._currentGroupId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _jwt() },
      body: JSON.stringify(body)
    });
    var g = await r.json();
    if (!r.ok) { status.style.color = 'var(--red)'; status.textContent = g.error || 'Erreur'; return; }
    _currentGroupData.name  = g.name;
    _currentGroupData.photo = g.photo || '';
    document.getElementById('chatHeaderName').textContent = g.name;
    var av = document.getElementById('chatHeaderAvatar');
    if (g.photo) {
      av.innerHTML = '<img src="' + g.photo + '" style="width:40px;height:40px;object-fit:cover;border-radius:12px" />';
    } else {
      av.innerHTML = '<div class="mpx-group-avatar" style="width:40px;height:40px;font-size:0.9rem">' + g.name.split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2) + '</div>';
    }
    closeEditGroupModal();
    loadGroups();
  } catch(e) { status.style.color = 'var(--red)'; status.textContent = 'Erreur serveur.'; }
}

// ══════════════════════════════════════════════════════════
//  SSE GROUPES — fix doublon : ignorer si déjà dans la liste
// ══════════════════════════════════════════════════════════

function _onGroupSSE(payload) {
  if (payload.type === 'GROUP_TYPING' && window._currentGroupId === payload.groupId) {
    _showGroupTyping(payload.name);
  }
  if (payload.type === 'GROUP_MESSAGE') {
    const g = _allGroups.find(function(x){ return x.id === payload.groupId; });
    if (g) {
      g.last_message = payload.message.type === 'system' ? payload.message.content : (payload.message.content || 'Photo');
      if (window._currentGroupId !== payload.groupId) g.unread_count = (parseInt(g.unread_count)||0) + 1;
      renderGroupList();
      _updateGroupTabBadge();
    }
    if (window._currentGroupId === payload.groupId) {
      // Ne pas ajouter si déjà présent (envoyé par nous via sendGroupMessage)
      if (!_groupMessages.find(function(m){ return m.id === payload.message.id; })) {
        // Enrichir avec les données de reply si reply_to_id présent
        var msg = payload.message;
        if (msg.reply_to_id && !msg.reply_content) {
          var quoted = _groupMessages.find(function(m){ return m.id === msg.reply_to_id; });
          if (quoted) {
            msg.reply_content     = quoted.content || (quoted.image ? '__IMAGE__' : '');
            msg.reply_sender_name = quoted.sender_name || '';
          }
        }
        _groupMessages.push(msg);
        renderGroupMessages();
      }
    }
  }
  if (payload.type === 'GROUP_REACTION' && window._currentGroupId === payload.groupId) {
    const msg = _groupMessages.find(function(m){ return m.id === payload.msgId; });
    if (msg) {
      if (!msg.reactions) msg.reactions = [];
      msg.reactions = msg.reactions.filter(function(r){ return r.user_id !== payload.userId; });
      if (payload.action !== 'remove') msg.reactions.push({ emoji: payload.emoji, user_id: payload.userId });
      renderGroupMessages();
    }
  }
  if (payload.type === 'GROUP_MSG_DELETE' && window._currentGroupId === payload.groupId) {
    _groupMessages = _groupMessages.filter(function(m){ return m.id !== payload.msgId; });
    renderGroupMessages();
  }
}
window._onGroupSSE = _onGroupSSE;

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  // Scroll infini
  _initGroupScrollInfinite();

  // Mettre à jour --mpx-input-h quand la zone de saisie change de taille
  var _inputArea = document.getElementById('chatInputRow');
  if (_inputArea && window.ResizeObserver) {
    new ResizeObserver(function() {
      var h = _inputArea.offsetHeight;
      if (h > 0) document.documentElement.style.setProperty('--mpx-input-h', h + 'px');
    }).observe(_inputArea);
  }

  // Enter → envoyer dans groupe
  const input = document.getElementById('chatInput');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && window._currentGroupId) { e.preventDefault(); sendGroupMessage(); }
    });
    input.addEventListener('input', function() {
      if (!window._currentGroupId) return;
      _sendGroupTyping();
    });
    // Activer l'autocomplete @ sur l'input groupe (membres du groupe uniquement)
    _initGroupMentionAutocomplete(input);
  }

  // Bouton image → groupe si groupe actif
  const imgInput = document.getElementById('chatImageInput');
  if (imgInput) {
    imgInput.addEventListener('change', function() {
      if (!window._currentGroupId) return; // laisser le DM gérer
      _groupPreviewImage(this.files[0]);
      this.value = '';
    });
  }

  // Bouton × image → groupe si groupe actif
  // On surcharge _removeChatImage pour les groupes
  const origRemove = window._removeChatImage;
  window._removeChatImage = function() {
    if (window._currentGroupId) { _removeGroupImage(); return; }
    if (typeof origRemove === 'function') origRemove();
  };
});

// Surcharge sendChatMessage pour intercepter les groupes
(function() {
  var _orig = null;
  var _patch = function() {
    _orig = window.sendChatMessage;
    window.sendChatMessage = function() {
      if (window._currentGroupId) { sendGroupMessage(); return; }
      if (typeof _orig === 'function') _orig();
    };
  };
  if (typeof window.sendChatMessage === 'function') {
    _patch();
  } else {
    document.addEventListener('DOMContentLoaded', _patch);
  }
})();

// Bloquer openChat (DM) si un groupe est actif
document.addEventListener('DOMContentLoaded', function() {
  var _origOpenChat = window.openChat;
  if (typeof _origOpenChat === 'function') {
    window.openChat = function() {
      if (window._currentGroupId) return;
      _origOpenChat.apply(this, arguments);
    };
  } else {
    // openChat défini plus tard dans le script inline — on patche après
    var _desc = Object.getOwnPropertyDescriptor(window, 'openChat');
    if (!_desc) {
      Object.defineProperty(window, 'openChat', {
        configurable: true,
        set: function(fn) {
          Object.defineProperty(window, 'openChat', {
            configurable: true, writable: true,
            value: function() {
              if (window._currentGroupId) return;
              fn.apply(this, arguments);
            }
          });
        }
      });
    }
  }
});

// _clearReply est appelé par le bouton × de la barre reply dans le HTML
// On s'assure qu'il efface aussi l'état groupe
var _origClearReply = window._clearReply;
window._clearReply = function() {
  _clearReplyBar();
  if (typeof _origClearReply === 'function') _origClearReply();
};

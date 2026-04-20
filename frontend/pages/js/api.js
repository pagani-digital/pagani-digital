// ============================================================
//  api.js ? Client HTTP vers le serveur Pagani Digital
// ============================================================

const API_URL = (window.PaganiConfig && window.PaganiConfig.API_BASE_URL) || 'http://localhost:3001/api';

// Token stocke dans localStorage pour persister entre les onglets
let _token = localStorage.getItem('pd_jwt') || null;

function _setToken(t) {
  _token = t;
  if (t) {
    localStorage.setItem('pd_jwt', t);
  } else {
    localStorage.removeItem('pd_jwt');
  }
}

async function _fetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = 'Bearer ' + _token;
  // Utiliser 'cors' mode pour les requ—tes cross-origin (file:// ou autre domaine)
  const fetchOptions = {
    ...options,
    headers,
    mode: 'cors',
    credentials: 'omit'
  };
  const res  = await fetch(API_URL + path, fetchOptions);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'ERREUR_SERVEUR');
  return data;
}

// ???? AUTH ??????????????????????????????????????????????????????????????????????????????????????????????????????
async function apiRegister({ name, email, password, refCode, mmPhone, mmOperator, mmName }) {
  const d = await _fetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, refCode, mmPhone, mmOperator, mmName }) });
  _setToken(d.token);
  return d.user;
}

async function apiLogin(email, password) {
  const d = await _fetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  _setToken(d.token);
  return d.user;
}

// Sync silencieux apr—s login PaganiDB
async function apiSyncLogin(email, password) {
  try { return await apiLogin(email, password); } catch { return null; }
}

function apiLogout() { _setToken(null); }

async function apiGetMe() {
  if (!_token) return null;
  try {
    const data = await _fetch('/auth/me');
    // Le serveur retourne un token rafra—chi si le plan a changé—
    if (data._token) _setToken(data._token);
    return data;
  }
  catch { _setToken(null); return null; }
}

async function apiUpdateProfile(fields) {
  const mapped = {};
  for (const [k, v] of Object.entries(fields)) {
    const snake = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    mapped[snake] = v;
  }
  return _fetch('/auth/profile', { method: 'PUT', body: JSON.stringify(mapped) });
}
async function apiChangePassword(oldPassword, newPassword) { return _fetch('/auth/changée-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) }); }
async function apiAddMmAccount(operator, phone, name) { return _fetch('/auth/mm-account', { method: 'POST', body: JSON.stringify({ operator, phone, name }) }); }

// ???? VIDEOS ??????????????????????????????????????????????????????????????????????????????????????????????????
async function apiGetVideos()              { return _fetch('/videos'); }
async function apiGetVideoToken(videoId)   { return _fetch(`/videos/${videoId}/token`); }
async function apiResolveVideoToken(token) { return _fetch(`/videos/resolve/${token}`); }

// ???? POSTS ????????????????????????????????????????????????????????????????????????????????????????????????????
async function apiGetPosts()         { return _fetch('/posts'); }
async function apiCreatePost(data)   { return _fetch('/posts', { method: 'POST', body: JSON.stringify(data) }); }
async function apiCreateUserPost(data) { return _fetch('/user-posts', { method: 'POST', body: JSON.stringify(data) }); }
async function apiDeletePost(id)     { return _fetch(`/posts/${id}`, { method: 'DELETE' }); }
async function apiEditPost(id, data)  { return _fetch(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
async function apiEditUserPost(id, data)   { return _fetch(`/user-posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
async function apiDeleteUserPost(id)       { return _fetch(`/user-posts/${id}`, { method: 'DELETE' }); }
async function apiTogglePostReaction(postId, emoji) { return _fetch(`/posts/${postId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }); }
async function apiGetPostReactions(postId)              { return _fetch(`/posts/${postId}/reactions`); }
async function apiGetPostReactionsDetail(postId) { return _fetch(`/posts/${postId}/reactions-detail`); }
async function apiToggleLike(postId) { return _fetch(`/posts/${postId}/like`, { method: 'POST' }); }
async function apiAddComment(postId, text) { return _fetch(`/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ text }) }); }
async function apiAddReply(postId, commentId, text, replyTo) { return _fetch(`/posts/${postId}/comments/${commentId}/replies`, { method: 'POST', body: JSON.stringify({ text, replyTo }) }); }
async function apiRecordShare(postId) { return _fetch(`/posts/${postId}/share`, { method: 'POST' }); }

// ???? NOTIFICATIONS ????????????????????????????????????????????????????????????????????????????????????
async function apiGetNotifications()    { return _fetch('/notifications'); }
async function apiGetUnreadCount()      { return _fetch('/notifications/unread-count'); }
async function apiMarkAllRead()         { return _fetch('/notifications/read-all', { method: 'POST' }); }

// ???? COMMISSIONS & RETRAITS ??????????????????????????????????????????????????????????????????
async function apiGetCommissions()      { return _fetch('/commissions'); }
async function apiRequestWithdraw(data) { return _fetch('/withdraws', { method: 'POST', body: JSON.stringify(data) }); }

// ???? ACHATS VID?0O UNITAIRES ????????????????????????????????????????????????????????????????????????????????????
async function apiBuyVideo(data)                  { return _fetch('/video-purchase', { method: 'POST', body: JSON.stringify(data) }); }
async function apiGetMyVideoPurchases()            { return _fetch('/my-video-purchases'); }
async function apiAdminGetVideoPurchases()         { return _fetch('/admin/video-purchases'); }
async function apiAdminUpdateVideoPurchase(id, d)  { return _fetch(`/admin/video-purchases/${id}`, { method: 'PUT', body: JSON.stringify(d) }); }
// ACHATS MODULE
async function apiBuyModule(data)                   { return _fetch('/module-purchase', { method: 'POST', body: JSON.stringify(data) }); }
async function apiGetMyModulePurchases()             { return _fetch('/my-module-purchases'); }
async function apiAdminGetModulePurchases()          { return _fetch('/admin/module-purchases'); }
async function apiAdminUpdateModulePurchase(id, d)   { return _fetch('/admin/module-purchases/' + id, { method: 'PUT', body: JSON.stringify(d) }); }
async function apiAdminGetShares()                   { return _fetch('/admin/shares'); }
// EBOOKS
async function apiGetEbooks()                        { return _fetch('/ebooks'); }
async function apiBuyEbook(data)                     { return _fetch('/ebook-purchase', { method: 'POST', body: JSON.stringify(data) }); }
async function apiGetMyEbookPurchases()              { return _fetch('/my-ebook-purchases'); }
async function apiAdminGetEbooks()                   { return _fetch('/admin/ebooks'); }
async function apiAdminCreateEbook(data)             { return _fetch('/admin/ebooks', { method: 'POST', body: JSON.stringify(data) }); }
async function apiAdminUpdateEbook(id, d)            { return _fetch(`/admin/ebooks/${id}`, { method: 'PUT', body: JSON.stringify(d) }); }
async function apiAdminDeleteEbook(id)               { return _fetch(`/admin/ebooks/${id}`, { method: 'DELETE' }); }
async function apiAdminGetEbookPurchases()           { return _fetch('/admin/ebook-purchases'); }
async function apiAdminUpdateEbookPurchase(id, d)    { return _fetch(`/admin/ebook-purchases/${id}`, { method: 'PUT', body: JSON.stringify(d) }); }
// ???? ADMIN ????????????????????????????????????????????????????????????????????????????????????????????????????
async function apiAdminGetVideos()        { return _fetch('/admin/videos'); }
async function apiAdminCreateVideo(data)  { return _fetch('/admin/videos',       { method: 'POST',   body: JSON.stringify(data) }); }
async function apiAdminUpdateVideo(id, d) { return _fetch(`/admin/videos/${id}`, { method: 'PUT',    body: JSON.stringify(d) }); }
async function apiAdminDeleteVideo(id)    { return _fetch(`/admin/videos/${id}`, { method: 'DELETE' }); }
async function apiGetVideoModules()                    { return _fetch('/video-modules'); }
async function apiAdminCreateVideoModule(data)         { return _fetch('/admin/video-modules', { method: 'POST', body: JSON.stringify(data) }); }
async function apiAdminUpdateVideoModule(id, data)     { return _fetch(`/admin/video-modules/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
async function apiAdminDeleteVideoModule(id)           { return _fetch(`/admin/video-modules/${id}`, { method: 'DELETE' }); }
async function apiAdminGetStats()         { return _fetch('/admin/stats'); }
async function apiAdminGetUsers()         { return _fetch('/admin/users'); }
async function apiAdminUpdateUser(id, d)  { return _fetch(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(d) }); }
async function apiGetPaymentAccounts()    { return _fetch('/payment-accounts'); }
async function apiAdminUpdatePaymentAccount(operator, d) { return _fetch(`/admin/payment-accounts/${encodeURIComponent(operator)}`, { method: 'PUT', body: JSON.stringify(d) }); }
async function apiGetUpgradeRequests()    { return _fetch('/admin/upgrade-requests'); }
async function apiUpdateUpgradeRequest(id, d) { return _fetch(`/admin/upgrade-requests/${id}`, { method: 'PUT', body: JSON.stringify(d) }); }
async function apiGetPublicUser(id)       { return _fetch(`/users/${id}`); }
async function apiGetPostsByUser(id)      { return _fetch(`/users/${id}/posts`); }
async function apiGetPricing()            { return _fetch('/pricing'); }
async function apiAdminUpdatePricing(d)   { return _fetch('/admin/pricing', { method: 'PUT', body: JSON.stringify(d) }); }

//  FOLLOWS
async function apiToggleFollow(userId)      { return _fetch(`/users/${userId}/follow`, { method: 'POST' }); }
async function apiGetFollowStatus(userId)   { return _fetch(`/users/${userId}/follow-status`); }
async function apiGetFollowStats(userId)    { return _fetch(`/users/${userId}/follow-stats`); }
async function apiGetFollowers(userId)      { return _fetch(`/users/${userId}/followers`); }
async function apiGetFollowing(userId)      { return _fetch(`/users/${userId}/following`); }

//  BADGES
async function apiGetMyBadges()            { return _fetch('/auth/me/badges'); }
async function apiGetUserBadges(userId)    { return _fetch(`/users/${userId}/badges`); }

//  PR—SENCE
async function apiPresencePing()           { return _fetch('/presence/ping', { method: 'POST' }); }
async function apiGetPresence(userId)      { return _fetch(`/presence/${userId}`); }
async function apiPresenceBatch(userIds)   { return _fetch('/presence/batch', { method: 'POST', body: JSON.stringify({ ids: userIds }) }); }

//  MESSAGES PRIV—S
async function apiGetConversations()           { return _fetch('/messages/conversations'); }
async function apiGetMessages(userId, limit, before) {
  let url = `/messages/${userId}?limit=${limit || 30}`;
  if (before) url += `&before=${encodeURIComponent(before)}`;
  return _fetch(url);
}
async function apiSendMessage(userId, content, image, replyToId) { return _fetch(`/messages/${userId}`, { method: 'POST', body: JSON.stringify({ content, image: image || '', replyToId: replyToId || null }) }); }
async function apiGetUnreadMessages()          { return _fetch('/messages/unread-count'); }
async function apiMarkMessagesRead(userId)      { return _fetch(`/messages/${userId}/read`, { method: 'PATCH' }); }
async function apiDeleteMessage(userId, msgId)   { return _fetch(`/messages/${userId}/${msgId}`, { method: 'DELETE' }); }
async function apiSendTyping(userId)             { return _fetch(`/typing/${userId}`, { method: 'POST' }); }
async function apiGetTyping(userId)              { return _fetch(`/typing/${userId}`); }

// ???? Export ??????????????????????????????????????????????????????????????????????????????????????????????????
window.PaganiAPI = {
  // Auth
  register:        apiRegister,
  login:           apiLogin,
  syncLogin:       apiSyncLogin,
  logout:          apiLogout,
  getMe:           apiGetMe,
  updateProfile:   apiUpdateProfile,
  changéePassword:  apiChangePassword,
  addMmAccount:    apiAddMmAccount,
  // Videos
  getVideos:         apiGetVideos,
  getVideoToken:     apiGetVideoToken,
  resolveVideoToken: apiResolveVideoToken,
  // Posts
  getPosts:       apiGetPosts,
  createPost:     apiCreatePost,
  createUserPost: apiCreateUserPost,
  deletePost:     apiDeletePost,
  editPost:       apiEditPost,
  editUserPost:   apiEditUserPost,
  deleteUserPost: apiDeleteUserPost,
  toggleLike:        apiToggleLike,
  togglePostReaction: apiTogglePostReaction,
  getPostReactions:   apiGetPostReactions,
  getPostReactionsDetail: apiGetPostReactionsDetail,
  addComment:   apiAddComment,
  addReply:     apiAddReply,
  recordShare:  apiRecordShare,
  // Notifications
  getNotifications: apiGetNotifications,
  getUnreadCount:   apiGetUnreadCount,
  markAllRead:      apiMarkAllRead,
  // Commissions
  getCommissions:  apiGetCommissions,
  requestWithdraw: apiRequestWithdraw,
  // Achats vidéo unitaires
  buyVideo:              apiBuyVideo,
  getMyVideoPurchases:   apiGetMyVideoPurchases,
  // Achats module
  buyModule:             apiBuyModule,
  getMyModulePurchases:  apiGetMyModulePurchases,
  // Ebooks
  getEbooks:             apiGetEbooks,
  buyEbook:              apiBuyEbook,
  getMyEbookPurchases:   apiGetMyEbookPurchases,
  // Admin
  admin: {
    getVideos:   apiAdminGetVideos,
    createVideo: apiAdminCreateVideo,
    updateVideo: apiAdminUpdateVideo,
    deleteVideo: apiAdminDeleteVideo,
    getVideoModules:    apiGetVideoModules,
    createVideoModule:  apiAdminCreateVideoModule,
    updateVideoModule:  apiAdminUpdateVideoModule,
    deleteVideoModule:  apiAdminDeleteVideoModule,
    getStats:    apiAdminGetStats,
    getUsers:    apiAdminGetUsers,
    updateUser:  apiAdminUpdateUser,
    getPaymentAccounts:      apiGetPaymentAccounts,
    updatePaymentAccount:    apiAdminUpdatePaymentAccount,
    getUpgradeRequests:      apiGetUpgradeRequests,
    updateUpgradeRequest:    apiUpdateUpgradeRequest,
    updatePricing:           apiAdminUpdatePricing,
    getVideoPurchases:       apiAdminGetVideoPurchases,
    updateVideoPurchase:     apiAdminUpdateVideoPurchase,
    getModulePurchases:      apiAdminGetModulePurchases,
    updateModulePurchase:    apiAdminUpdateModulePurchase,
    getShares:               apiAdminGetShares,
    getEbooks:               apiAdminGetEbooks,
    createEbook:             apiAdminCreateEbook,
    updateEbook:             apiAdminUpdateEbook,
    deleteEbook:             apiAdminDeleteEbook,
    getEbookPurchases:       apiAdminGetEbookPurchases,
    updateEbookPurchase:     apiAdminUpdateEbookPurchase,
  },
  // Profil public
  getPublicUser:   apiGetPublicUser,
  getPostsByUser:  apiGetPostsByUser,
  // Tarifs
  getPricing: apiGetPricing,
  // Messages priv—s
  getConversations:  apiGetConversations,
  getMessages:       apiGetMessages,
  sendMessage:       apiSendMessage,
  getUnreadMessages: apiGetUnreadMessages,
  markMessagesRead:  apiMarkMessagesRead,
  deleteMessage:      apiDeleteMessage,
  sendTyping:         apiSendTyping,
  getTyping:          apiGetTyping,
  // Presence
  presencePing:  apiPresencePing,
  getPresence:   apiGetPresence,
  presenceBatch: apiPresenceBatch,
  // Follows
  toggleFollow:    apiToggleFollow,
  getFollowStatus: apiGetFollowStatus,
  getFollowStats:  apiGetFollowStats,
  getFollowers:    apiGetFollowers,
  getFollowing:    apiGetFollowing,
  // Badges
  getMyBadges:     apiGetMyBadges,
  getUserBadges:   apiGetUserBadges,
};

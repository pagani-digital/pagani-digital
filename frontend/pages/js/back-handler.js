'use strict';
// ══════════════════════════════════════════════════════════
//  BACK HANDLER — Bouton retour Android / iOS
// ══════════════════════════════════════════════════════════

(function() {

  function _pushState() {
    history.pushState({ backHandler: true }, '');
  }

  // Ferme la première couche ouverte (modal, panel, chat)
  // Retourne true si quelque chose a été fermé
  function _handleBack() {

    // 1. Story viewer
    if (document.getElementById('storyViewerOverlay')) {
      if (typeof closeStoryViewer === 'function') closeStoryViewer();
      return true;
    }

    // 2. Modals visibles (par ordre de priorité)
    var modalIds = [
      'avatarPreviewModal', 'postImageOverlay', 'rxOverlay',
      'storyViewersModal', 'storyCreateModal', 'upgradeModalOverlay',
      'shareProfileModal', 'msgModal', 'followModal',
      'newGroupModal', 'groupMembersModal', 'newMsgModal'
    ];
    for (var i = 0; i < modalIds.length; i++) {
      var el = document.getElementById(modalIds[i]);
      if (el && el.style.display !== 'none' && el.style.display !== '') {
        el.style.display = 'none';
        return true;
      }
    }

    // 3. Panneau notifications ouvert
    var notifPanel = document.getElementById('notifPanel');
    if (notifPanel && notifPanel.classList.contains('open')) {
      if (typeof PaganiNotif !== 'undefined') PaganiNotif.togglePanel();
      return true;
    }

    // 4. Menu bulle groupe
    var bubbleMenus = document.querySelectorAll('.mpx-bubble-menu');
    if (bubbleMenus.length > 0) {
      bubbleMenus.forEach(function(m) { m.remove(); });
      return true;
    }

    // 5. Chat DM ouvert → revenir à la liste
    if (window._currentChatUserId) {
      if (typeof closeChatMobile === 'function') closeChatMobile();
      return true;
    }

    // 6. Chat groupe ouvert → revenir à la liste
    if (window._currentGroupId) {
      if (typeof _closeActiveChat === 'function') _closeActiveChat();
      return true;
    }

    return false;
  }

  function _onPopState() {
    if (_handleBack()) {
      // Quelque chose a été fermé → repousser l'état pour garder l'interception active
      _pushState();
    } else {
      // Rien à fermer → naviguer vers la page précédente logique
      var path = window.location.pathname;
      if (path === '/' || path.includes('index')) {
        // Déjà sur index, ne rien faire
        _pushState();
        return;
      }
      // Toutes les autres pages → index
      window.location.href = 'index.html';
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    _pushState();
    window.addEventListener('popstate', _onPopState);
  });

})();

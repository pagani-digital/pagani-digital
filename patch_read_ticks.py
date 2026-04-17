import re

f = 'frontend/js/app.js'
with open(f, 'r', encoding='utf-8') as fh:
    content = fh.read()

old = '''function _buildBubbleHTML(m, isMine, otherAv, dateSep, nextIsSame, isNew) {
  const avatarHtml = (!isMine && !nextIsSame)
    ? `<div class="mpx-bubble-av">${otherAv}</div>`
    : (!isMine ? `<div class="mpx-bubble-av" style="visibility:hidden"></div>` : '');
  const timeStr = _formatMsgTime(m.createdAt);
  const animClass = isNew ? ' mpx-bubble-new' : '';
  const imageHtml = m.image ? '<div class="mpx-bubble-img-wrap"><img src="' + m.image + '" class="mpx-bubble-img" onclick="_openMsgImage(this.src)" /></div>' : '';
  const textHtml  = m.content ? esc(m.content) : '';
  return dateSep + `<div class="mpx-bubble-row${isMine ? ' mine' : ''}${animClass}" data-msgid="${m.id}">
    ${avatarHtml}
    <div class="mpx-bubble ${isMine ? 'mine' : 'theirs'}">
      ${imageHtml}${textHtml}
      <span class="mpx-bubble-time">${timeStr}</span>
    </div>
  </div>`;
}'''

new = '''function _buildBubbleHTML(m, isMine, otherAv, dateSep, nextIsSame, isNew) {
  const avatarHtml = (!isMine && !nextIsSame)
    ? `<div class="mpx-bubble-av">${otherAv}</div>`
    : (!isMine ? `<div class="mpx-bubble-av" style="visibility:hidden"></div>` : '');
  const timeStr = _formatMsgTime(m.createdAt);
  const animClass = isNew ? ' mpx-bubble-new' : '';
  const imageHtml = m.image ? '<div class="mpx-bubble-img-wrap"><img src="' + m.image + '" class="mpx-bubble-img" onclick="_openMsgImage(this.src)" /></div>' : '';
  const textHtml  = m.content ? esc(m.content) : '';
  const tickHtml  = isMine
    ? (m.read
        ? '<span class="mpx-tick mpx-tick-read" title="Vu"><i class="fas fa-check-double"></i></span>'
        : '<span class="mpx-tick" title="Envoy\\u00e9"><i class="fas fa-check"></i></span>')
    : '';
  return dateSep + `<div class="mpx-bubble-row${isMine ? ' mine' : ''}${animClass}" data-msgid="${m.id}">
    ${avatarHtml}
    <div class="mpx-bubble ${isMine ? 'mine' : 'theirs'}">
      ${imageHtml}${textHtml}
      <span class="mpx-bubble-meta">${timeStr}${tickHtml}</span>
    </div>
  </div>`;
}'''

if old in content:
    content = content.replace(old, new, 1)
    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(content)
    print('OK: _buildBubbleHTML patched')
else:
    print('ERROR: old string not found')
    # Debug: show what's around the function
    idx = content.find('function _buildBubbleHTML')
    if idx >= 0:
        print('Function found at:', idx)
        print(repr(content[idx:idx+700]))

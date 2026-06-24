// Live chat panel. Connects lazily on first open; degrades cleanly when the
// server is unreachable (greyed input + "reconnecting"). Never blocks the game.

// 2-letter ISO country code -> regional-indicator flag emoji (''=unknown)
export function flagEmoji(cc) {
  if (!cc || typeof cc !== 'string') return '';
  cc = cc.toUpperCase().replace(/[^A-Z]/g, '');
  if (cc.length !== 2) return '';
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

export class Chat {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('chat');
    this.list = document.getElementById('chat-list');
    this.input = document.getElementById('chat-input');
    this.status = document.getElementById('chat-status');
    this.presence = document.getElementById('chat-presence');
    this.open = false;
    this._wired = false;

    document.getElementById('chat-send').addEventListener('click', () => this._send());
    document.getElementById('chat-close').addEventListener('click', () => this.toggle(false));
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') { this._send(); }
      else if (e.code === 'Escape') { this.toggle(false); }
    });
  }

  _wire() {
    if (this._wired) return;
    this._wired = true;
    const net = this.game.net;
    net.onChat((m) => this._add(m));
    net.onPresence((n) => { this.presence.textContent = n + ' online'; });
    net.onChatState((s) => this._setStatus(s));
  }

  _setStatus(s) {
    this.status.className = 'chat-status ' + s;
    this.status.textContent = s === 'online' ? '● live' : s === 'connecting' ? '● connecting' : '● offline';
    const off = s !== 'online';
    this.input.disabled = off;
    this.input.placeholder = off ? 'Reconnecting… chat offline' : 'Say something…';
  }

  _add(m) {
    const li = document.createElement('div');
    li.className = 'chat-msg' + (m.name === this.game.net.name ? ' me' : '');
    const t = new Date(m.ts || Date.now());
    const flag = flagEmoji(m.country);
    li.innerHTML = `<span class="cm-name">${flag ? flag + ' ' : ''}${this._esc(m.name)}</span><span class="cm-text">${this._esc(m.text)}</span>`;
    this.list.appendChild(li);
    while (this.list.children.length > 100) this.list.firstChild.remove();
    this.list.scrollTop = this.list.scrollHeight;
  }
  _esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  _send() {
    const text = this.input.value.trim();
    if (!text) return;
    if (this.game.net.sendChat(text)) this.input.value = '';
  }

  toggle(force) {
    this.open = force === undefined ? !this.open : force;
    this.panel.classList.toggle('hidden', !this.open);
    if (this.open) {
      this._wire();
      this.game.net.openChat('global');     // lazy connect on first open
      // free the cursor so the player can type (pauses an active match)
      if (this.game.state === 'playing' && document.pointerLockElement) document.exitPointerLock();
      setTimeout(() => this.input.focus(), 30);
    } else {
      this.input.blur();
    }
  }
}

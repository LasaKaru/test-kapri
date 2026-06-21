// Co-op lobby: host or join a room, see the roster, then deploy together.
// Degrades cleanly to "servers unavailable" with no server.
export class CoopLobby {
  constructor(game) {
    this.game = game;
    this.overlay = document.getElementById('coop');
    this.status = document.getElementById('coop-status');
    this.roster = document.getElementById('coop-roster');
    this.codeInput = document.getElementById('coop-code');
    this.deployBtn = document.getElementById('coop-deploy');

    const name = document.getElementById('coop-name');
    name.value = game.net.name;
    name.addEventListener('change', () => { game.net.setName(name.value); name.value = game.net.name; this._render(); });

    document.getElementById('coop-host').addEventListener('click', () => {
      if (!game.net.enabled) return this._noServer();
      const code = game.coop.host();
      this.codeInput.value = code;
    });
    document.getElementById('coop-join').addEventListener('click', () => {
      if (!game.net.enabled) return this._noServer();
      const code = (this.codeInput.value || '').trim().toUpperCase();
      if (code) game.coop.join(code);
    });
    document.getElementById('coop-leave').addEventListener('click', () => { game.coop.leave(); this._render(); });
    document.getElementById('coop-close').addEventListener('click', () => this.close());
    this.deployBtn.addEventListener('click', () => { this.close(); this.game.startCoop(); });

    game.coop.onRoster = (info) => this._render(info);
  }

  _noServer() { this.status.textContent = '● Servers unavailable — co-op needs a running server.'; this.status.className = 'coop-status offline'; }

  _render(info) {
    const c = this.game.coop;
    const st = this.game.net.coopState || 'offline';
    this.status.className = 'coop-status ' + st;
    if (!this.game.net.enabled) { this.status.textContent = '● Servers unavailable (offline)'; }
    else if (c.full) { this.status.textContent = '● Room full (max 4)'; }
    else if (st === 'online') { this.status.textContent = `● In room ${c.room || ''}`; }
    else if (st === 'connecting') { this.status.textContent = '● Connecting…'; }
    else { this.status.textContent = '● Not connected — Host or Join a room'; }

    const names = (info && info.peers) || [...c.peers.values()].map((a) => a.name);
    const me = this.game.net.name;
    this.roster.innerHTML = '';
    if (st === 'online') {
      const all = [me + ' (you)', ...names];
      all.forEach((n) => { const li = document.createElement('li'); li.textContent = n; this.roster.appendChild(li); });
    } else {
      this.roster.innerHTML = '<li class="coop-empty">No squad yet.</li>';
    }
    this.deployBtn.disabled = st !== 'online';
  }

  open() {
    document.getElementById('title').classList.add('hidden');
    this.overlay.classList.remove('hidden');
    document.getElementById('coop-name').value = this.game.net.name;
    this._render();
  }
  close() {
    this.overlay.classList.add('hidden');
    if (this.game.state !== 'playing') document.getElementById('title').classList.remove('hidden');
  }
}

import { PERKS, PERK_ORDER } from './meta.js';

// Perks screen: shows the XP/level bar and a grid of unlockable perks. Click a
// perk to spend a point; click "−" to refund. Persists via the Meta store.
export class PerksUI {
  constructor(game) {
    this.game = game;
    this.meta = game.meta;
    this.overlay = document.getElementById('perks');
    this.grid = document.getElementById('perks-grid');
    this._built = false;
    const close = document.getElementById('perks-close');
    if (close) close.addEventListener('click', () => this.close());
  }

  _build() {
    if (this._built) return;
    this._built = true;
    this.cards = {};
    PERK_ORDER.forEach((id) => {
      const p = PERKS[id];
      const card = document.createElement('div');
      card.className = 'perk-card';
      card.innerHTML =
        `<div class="perk-ico">${p.icon}</div>` +
        `<div class="perk-body"><div class="perk-name">${p.name}</div>` +
        `<div class="perk-desc">${p.desc}</div>` +
        `<div class="perk-pips"></div></div>` +
        `<button class="perk-minus" title="Refund">−</button>`;
      card.addEventListener('click', () => { if (this.meta.buyPerk(id)) { this.game.audio && this.game.audio.ui('click'); this._refresh(); } else { this.game.audio && this.game.audio.ui('back'); } });
      card.querySelector('.perk-minus').addEventListener('click', (e) => { e.stopPropagation(); if (this.meta.refundPerk(id)) { this.game.audio && this.game.audio.ui('back'); this._refresh(); } });
      this.grid.appendChild(card);
      this.cards[id] = card;
    });
  }

  _refresh() {
    const m = this.meta;
    const lvl = document.getElementById('perks-level');
    const pts = document.getElementById('perks-points');
    const fill = document.getElementById('perks-xp-fill');
    const xp = document.getElementById('perks-xp-text');
    if (lvl) lvl.textContent = 'LV ' + m.level;
    if (pts) pts.textContent = m.points + (m.points === 1 ? ' point' : ' points');
    if (fill) fill.style.width = (m.progress() * 100).toFixed(1) + '%';
    if (xp) xp.textContent = `${m.data.xp - m.curBase} / ${m.nextNeed - m.curBase} XP`;
    for (const id of PERK_ORDER) {
      const p = PERKS[id], card = this.cards[id];
      const rank = m.rankOf(id), unlocked = m.isUnlocked(id);
      const canBuy = unlocked && m.points > 0 && rank < p.max;
      card.classList.toggle('locked', !unlocked);
      card.classList.toggle('maxed', rank >= p.max && rank > 0);
      card.classList.toggle('buyable', canBuy);
      const pipsEl = card.querySelector('.perk-pips');
      let pips = '';
      for (let i = 0; i < p.max; i++) pips += `<i class="${i < rank ? 'on' : ''}"></i>`;
      pipsEl.innerHTML = unlocked ? pips : `<span class="perk-lock">🔒 Unlocks at LV ${p.unlock}</span>`;
      card.querySelector('.perk-minus').style.display = rank > 0 ? '' : 'none';
    }
  }

  open() { this._build(); this._refresh(); document.getElementById('title').classList.add('hidden'); this.overlay.classList.remove('hidden'); }
  close() { this.overlay.classList.add('hidden'); document.getElementById('title').classList.remove('hidden'); }
}

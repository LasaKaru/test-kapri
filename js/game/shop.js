// Between-wave shop: spend credits on resupply and permanent run perks.
const CONSUMABLES = [
  { id: 'ammo',   name: 'Ammo Resupply', icon: '❂', desc: 'Refill all weapon reserves', cost: 250,
    apply: (g) => g.weapons.addAmmo(1) },
  { id: 'armor',  name: 'Armor Pack',     icon: '🛡', desc: 'Armor to full', cost: 300,
    apply: (g) => { g.player.armor = g.player.maxArmor; } },
  { id: 'health', name: 'Med Pack',       icon: '✚', desc: 'Health to full', cost: 300,
    apply: (g) => { g.player.hp = g.player.maxHp; } },
  { id: 'frags',  name: 'Frag Grenades',  icon: '✸', desc: '+2 grenades', cost: 200,
    apply: (g) => { g.nades = Math.min(8, g.nades + 2); g.hud.setGrenades(g.nades); } },
];

const PERKS = [
  { id: 'vitality',   name: 'Vitality',      icon: '❤', desc: '+40 Max Health', cost: 600, max: 3,
    apply: (g) => { g.player.maxHp += 40; g.player.hp += 40; } },
  { id: 'armorplate', name: 'Armor Plating', icon: '🛡', desc: '+40 Max Armor', cost: 550, max: 3,
    apply: (g) => { g.player.maxArmor += 40; g.player.addArmor(40); } },
  { id: 'fasthands',  name: 'Fast Hands',    icon: '⟳', desc: '−20% reload time', cost: 700, max: 2,
    apply: (g) => { g.weapons.reloadMul *= 0.8; } },
  { id: 'adrenaline', name: 'Adrenaline',    icon: '⚡', desc: '+12% move speed', cost: 650, max: 2,
    apply: (g) => { g.player.speed *= 1.12; } },
  { id: 'lifesteal',  name: 'Lifesteal',     icon: '🩸', desc: '+4 HP per kill', cost: 800, max: 2,
    apply: (g) => { g.lifesteal += 4; } },
  { id: 'scavenger',  name: 'Scavenger',     icon: '◈', desc: '+50% credits', cost: 700, max: 2,
    apply: (g) => { g.creditMul += 0.5; } },
];

// loot -> credits when you Sell, and craft recipes that consume loot
const SELL = { hide: 40, feather: 15, fang: 60 };
const CRAFT = [
  { id: 'plate', name: 'Reinforced Plate', icon: '🛡', desc: '+30 Max Armor', req: { hide: 3 },
    apply: (g) => { g.player.maxArmor += 30; g.player.addArmor(30); } },
  { id: 'boots', name: 'Swift Boots', icon: '🥾', desc: '+10% Move Speed', req: { feather: 4 },
    apply: (g) => { g.player.speed *= 1.1; } },
  { id: 'charm', name: 'Bone Charm', icon: '🦴', desc: '+3 HP per kill', req: { fang: 2 },
    apply: (g) => { g.lifesteal += 3; } },
];
const reqText = (req) => Object.entries(req).map(([k, n]) => `${n} ${k}`).join(' · ');

export class Shop {
  constructor(game) {
    this.game = game;
    this.overlay = document.getElementById('shop');
    this.grid = document.getElementById('shop-grid');
    this.creditEl = document.getElementById('shop-credits');
    this.waveEl = document.getElementById('shop-wave');
    this.deployBtn = document.getElementById('shop-deploy');
    this.perkLevels = {};
    this._built = false;
    this.deployBtn.addEventListener('click', () => this.game._deployNextWave());
  }

  reset() { this.perkLevels = {}; }

  _build() {
    if (this._built) return;
    this._built = true;
    this.cards = [];

    const section = (title) => {
      const h = document.createElement('div');
      h.className = 'shop-section'; h.textContent = title;
      this.grid.appendChild(h);
    };
    const card = (item, isPerk) => {
      const el = document.createElement('button');
      el.className = 'shop-card';
      el.innerHTML =
        `<span class="sc-icon">${item.icon}</span>` +
        `<span class="sc-name">${item.name}</span>` +
        `<span class="sc-desc">${item.desc}</span>` +
        `<span class="sc-cost">◈ ${item.cost}</span>` +
        (isPerk ? `<span class="sc-lvl"></span>` : '');
      el.addEventListener('click', () => this._buy(item, isPerk, el));
      this.grid.appendChild(el);
      this.cards.push({ item, isPerk, el });
    };

    section('RESUPPLY');
    CONSUMABLES.forEach((c) => card(c, false));
    section('PERKS · permanent this run');
    PERKS.forEach((p) => card(p, true));

    // ---- trade & craft (uses hunted-animal loot) ----
    section('TRADE & CRAFT · from hunting');
    this.lootBar = document.createElement('div');
    this.lootBar.className = 'shop-loot';
    this.grid.appendChild(this.lootBar);

    this.tradeCards = [];
    const sell = document.createElement('button');
    sell.className = 'shop-card';
    sell.innerHTML = '<span class="sc-icon">◈</span><span class="sc-name">Sell All Loot</span>' +
      '<span class="sc-desc">Hides, feathers &amp; fangs → credits</span><span class="sc-cost sc-sell">—</span>';
    sell.addEventListener('click', () => this._sell(sell));
    this.grid.appendChild(sell);
    this.sellCard = sell;

    CRAFT.forEach((r) => {
      const el = document.createElement('button');
      el.className = 'shop-card';
      el.innerHTML = `<span class="sc-icon">${r.icon}</span><span class="sc-name">${r.name}</span>` +
        `<span class="sc-desc">${r.desc}</span><span class="sc-cost">${reqText(r.req)}</span>`;
      el.addEventListener('click', () => this._craft(r, el));
      this.grid.appendChild(el);
      this.tradeCards.push({ r, el });
    });
  }

  _lootValue() {
    const inv = this.game.inventory || {};
    return (inv.hide || 0) * SELL.hide + (inv.feather || 0) * SELL.feather + (inv.fang || 0) * SELL.fang;
  }
  _sell(el) {
    const val = this._lootValue();
    if (val <= 0) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 300); return; }
    const inv = this.game.inventory;
    inv.hide = 0; inv.feather = 0; inv.fang = 0;
    this.game._saveInventory();
    this.game.credits += val;
    this.game.audio.pickup();
    this.game.hud.setCredits(this.game.credits);
    this.game.hud.killFeed(`SOLD LOOT  +${val}◈`);
    this.refresh();
  }
  _craft(r, el) {
    const inv = this.game.inventory || {};
    const ok = Object.entries(r.req).every(([k, n]) => (inv[k] || 0) >= n);
    if (!ok) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 300); return; }
    Object.entries(r.req).forEach(([k, n]) => { inv[k] -= n; });
    this.game._saveInventory();
    r.apply(this.game);
    this.game.audio.pickup();
    this.game.hud.setHealth(this.game.player.hp, this.game.player.maxHp);
    this.game.hud.setArmor(this.game.player.armor, this.game.player.maxArmor);
    this.game.hud.killFeed(`CRAFTED ${r.name.toUpperCase()}`);
    this.refresh();
  }

  _buy(item, isPerk, el) {
    const g = this.game;
    const lvl = this.perkLevels[item.id] || 0;
    if (isPerk && lvl >= item.max) return;
    if (g.credits < item.cost) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 300); return; }
    g.credits -= item.cost;
    item.apply(g);
    if (isPerk) this.perkLevels[item.id] = lvl + 1;
    g.audio.pickup();
    g.hud.setCredits(g.credits);
    g.hud.setHealth(g.player.hp, g.player.maxHp);
    g.hud.setArmor(g.player.armor, g.player.maxArmor);
    g._syncWeaponHud();
    this.refresh();
  }

  refresh() {
    const g = this.game;
    this.creditEl.textContent = g.credits;
    for (const c of this.cards) {
      const lvl = this.perkLevels[c.item.id] || 0;
      const maxed = c.isPerk && lvl >= c.item.max;
      const afford = g.credits >= c.item.cost;
      c.el.classList.toggle('disabled', maxed || !afford);
      c.el.classList.toggle('maxed', maxed);
      if (c.isPerk) {
        const lvlEl = c.el.querySelector('.sc-lvl');
        lvlEl.textContent = maxed ? 'MAX' : `LV ${lvl}/${c.item.max}`;
      }
    }
    // trade & craft
    if (this.lootBar) {
      const inv = g.inventory || {};
      this.lootBar.innerHTML = `🍖 ${inv.meat || 0} &nbsp; 🟫 ${inv.hide || 0} hide &nbsp; 🪶 ${inv.feather || 0} &nbsp; 🦴 ${inv.fang || 0}`;
      const val = this._lootValue();
      this.sellCard.querySelector('.sc-sell').textContent = val > 0 ? `+${val}◈` : '—';
      this.sellCard.classList.toggle('disabled', val <= 0);
      for (const t of this.tradeCards) {
        const can = Object.entries(t.r.req).every(([k, n]) => (inv[k] || 0) >= n);
        t.el.classList.toggle('disabled', !can);
      }
    }
  }

  open(nextWave) {
    this._build();
    this.waveEl.textContent = nextWave;
    this.deployBtn.textContent = `Deploy to Wave ${nextWave}`;
    this.refresh();
    this.overlay.classList.remove('hidden');
  }

  close() { this.overlay.classList.add('hidden'); }
}

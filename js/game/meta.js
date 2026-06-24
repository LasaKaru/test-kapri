// Account-level meta-progression: XP, levels and unlockable perks that persist
// across runs (localStorage). Perks stack on top of the per-run class/loadout.
// Single-player only and fully self-contained — nothing here touches the net.

// Perk catalogue. Each perk has a max rank; one perk point buys one rank.
// `apply(g, rank)` layers the bonus onto the player/game at run start, exactly
// like CLASSES.apply, so it composes with classes and attachments.
export const PERKS = {
  vitality:   { name: 'Vitality',    icon: '❤', max: 3, unlock: 1,
    desc: '+15 max HP per rank',
    apply: (g, r) => { g.player.maxHp += 15 * r; g.player.hp = g.player.maxHp; } },
  adrenaline: { name: 'Adrenaline',  icon: '⚡', max: 3, unlock: 2,
    desc: 'Faster health regen, shorter delay',
    apply: (g, r) => { g.player.regenRate *= (1 + 0.22 * r); g.player.regenDelay = Math.max(1.2, g.player.regenDelay - 0.4 * r); } },
  swift:      { name: 'Swift',       icon: '🥾', max: 3, unlock: 3,
    desc: '+5% movement speed per rank',
    apply: (g, r) => { g.player.speed *= (1 + 0.05 * r); } },
  fortified:  { name: 'Fortified',   icon: '🛡', max: 2, unlock: 4,
    desc: '+25 armor capacity & start armor per rank',
    apply: (g, r) => { g.player.maxArmor += 25 * r; g.player.armor = Math.min(g.player.maxArmor, g.player.armor + 25 * r); } },
  deadeye:    { name: 'Deadeye',     icon: '🎯', max: 3, unlock: 5,
    desc: '+0.4× headshot damage per rank',
    apply: (g, r) => { g.headMul += 0.4 * r; } },
  scavenger:  { name: 'Scavenger',   icon: '💰', max: 3, unlock: 6,
    desc: '+15% credits earned per rank',
    apply: (g, r) => { g.creditMul *= (1 + 0.15 * r); } },
  ghost:      { name: 'Ghost',       icon: '👁', max: 2, unlock: 8,
    desc: 'Enemies detect you from closer range',
    apply: (g, r) => { g.stealthPerk = 0.2 * r; } },
  scholar:    { name: 'Fast Learner', icon: '📈', max: 3, unlock: 10,
    desc: '+12% XP gained per rank',
    apply: (g, r) => { g.xpMul = (g.xpMul || 1) * (1 + 0.12 * r); } },
};
export const PERK_ORDER = ['vitality', 'adrenaline', 'swift', 'fortified', 'deadeye', 'scavenger', 'ghost', 'scholar'];

// XP needed to reach level L (from level 1). A smooth quadratic curve.
function xpForLevel(L) { return Math.round(40 * (L - 1) + 18 * (L - 1) * (L - 1)); }

export class Meta {
  constructor() {
    this.data = this._load();
    this._recompute();
  }

  _load() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem('verdant_meta') || '{}') || {}; } catch (_) { d = {}; }
    d.xp = Math.max(0, d.xp | 0);
    d.perks = (d.perks && typeof d.perks === 'object') ? d.perks : {};
    return d;
  }
  _save() { try { localStorage.setItem('verdant_meta', JSON.stringify(this.data)); } catch (_) {} }

  // derive level + spent/available points from total XP and owned perks
  _recompute() {
    let lvl = 1;
    while (xpForLevel(lvl + 1) <= this.data.xp) lvl++;
    this.level = lvl;
    this.curBase = xpForLevel(lvl);
    this.nextNeed = xpForLevel(lvl + 1);
    let spent = 0;
    for (const id of PERK_ORDER) spent += Math.max(0, this.data.perks[id] | 0);
    this.spent = spent;
    this.points = Math.max(0, (lvl - 1) - spent); // 1 perk point per level after 1
  }

  // progress through the current level, 0..1
  progress() {
    const span = this.nextNeed - this.curBase;
    return span > 0 ? Math.max(0, Math.min(1, (this.data.xp - this.curBase) / span)) : 0;
  }

  // add XP; returns { gained, leveledUp, level }
  addXp(amount) {
    amount = Math.max(0, Math.round(amount));
    if (!amount) return { gained: 0, leveledUp: false, level: this.level };
    const before = this.level;
    this.data.xp += amount;
    this._recompute();
    this._save();
    return { gained: amount, leveledUp: this.level > before, level: this.level };
  }

  rankOf(id) { return Math.max(0, this.data.perks[id] | 0); }
  isUnlocked(id) { return this.level >= (PERKS[id] ? PERKS[id].unlock : 1); }

  // spend a point on a perk (respects unlock level, max rank, available points)
  buyPerk(id) {
    const p = PERKS[id]; if (!p) return false;
    if (!this.isUnlocked(id) || this.points <= 0 || this.rankOf(id) >= p.max) return false;
    this.data.perks[id] = this.rankOf(id) + 1;
    this._recompute(); this._save();
    return true;
  }
  // refund a single rank (lets players re-spec freely)
  refundPerk(id) {
    if (this.rankOf(id) <= 0) return false;
    this.data.perks[id] = this.rankOf(id) - 1;
    this._recompute(); this._save();
    return true;
  }

  // apply every owned perk to the run (called at run start, after class.apply)
  apply(g) {
    for (const id of PERK_ORDER) {
      const r = this.rankOf(id);
      if (r > 0 && PERKS[id].apply) { try { PERKS[id].apply(g, r); } catch (_) {} }
    }
  }
}

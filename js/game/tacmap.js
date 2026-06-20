// Ghost-Recon-style tactical map: relief-shaded top-down render of the actual
// battlefield (sampled from world.heightAt) with water, POIs and live units.
export class TacMap {
  constructor(game) {
    this.game = game;
    this.overlay = document.getElementById('tacmap');
    this.canvas = document.getElementById('tacmap-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.span = 300;            // world units across the view width
    this.center = { x: 0, z: -20 };
    this._relief = null;        // cached offscreen relief
    this._reliefKey = '';
    document.getElementById('tacmap-close').addEventListener('click', () => this.game._toggleMap());
    this._bind();
  }

  _bind() {
    let dragging = false, lx = 0, ly = 0;
    this.canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const k = this.span / this.canvas.clientWidth;
      this.center.x -= (e.clientX - lx) * k; this.center.z -= (e.clientY - ly) * k;
      lx = e.clientX; ly = e.clientY; this._relief = null;
    });
    this.canvas.addEventListener('pointerup', () => { dragging = false; });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.span = Math.max(150, Math.min(420, this.span * (e.deltaY > 0 ? 1.1 : 0.9)));
      this._relief = null;
    }, { passive: false });
  }

  _resize() {
    const w = this.overlay.clientWidth, h = this.overlay.clientHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h; this._relief = null;
    }
  }

  open() {
    this._resize();
    const w = this.game.world;
    document.getElementById('tacmap-region').textContent = w.map.name;
    document.getElementById('tacmap-topo').textContent = w.map.topo;
    this._relief = null;
    this.overlay.classList.remove('hidden');
  }
  close() { this.overlay.classList.add('hidden'); }

  // ---- world <-> screen ----
  _toScreen(x, z) {
    const W = this.canvas.width, H = this.canvas.height;
    const spanV = this.span * H / W;
    return { x: W / 2 + (x - this.center.x) / this.span * W, y: H / 2 + (z - this.center.z) / spanV * H };
  }

  _ramp(e) {
    const stops = [
      [0.00, [47, 61, 34]], [0.22, [74, 90, 42]], [0.45, [107, 106, 58]],
      [0.66, [106, 82, 54]], [0.85, [122, 106, 85]], [1.00, [216, 216, 204]],
    ];
    e = Math.max(0, Math.min(1, e));
    for (let i = 1; i < stops.length; i++) {
      if (e <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i];
        const t = (e - a[0]) / (b[0] - a[0]);
        return [a[1][0] + (b[1][0] - a[1][0]) * t, a[1][1] + (b[1][1] - a[1][1]) * t, a[1][2] + (b[1][2] - a[1][2]) * t];
      }
    }
    return stops[stops.length - 1][1];
  }

  _buildRelief() {
    const W = this.canvas.width, H = this.canvas.height;
    const gw = Math.min(520, Math.floor(W / 2)), gh = Math.min(340, Math.floor(H / 2));
    const off = document.createElement('canvas'); off.width = gw; off.height = gh;
    const octx = off.getContext('2d');
    const img = octx.createImageData(gw, gh);
    const data = img.data;
    const world = this.game.world;
    const m = world.map;
    const maxH = m.amp * (m.ridge > 0 ? 1.7 : 1.15) + m.lift + 1;
    const minH = -3;
    const spanV = this.span * H / W;
    const inLake = (x, z) => { for (const lk of world.lakes) if (Math.hypot(x - lk.x, z - lk.z) < lk.r * 1.05) return true; return false; };
    const dx = this.span / gw, dz = spanV / gh;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const x = this.center.x - this.span / 2 + (i + 0.5) * dx;
        const z = this.center.z - spanV / 2 + (j + 0.5) * dz;
        let r, g, bl;
        if (inLake(x, z)) {
          r = 28; g = 74; bl = 104;
        } else {
          const h = world.heightAt(x, z);
          const e = (h - minH) / (maxH - minH);
          // hillshade from height gradient (light from NW)
          const hx = world.heightAt(x + 1.5, z) - world.heightAt(x - 1.5, z);
          const hz = world.heightAt(x, z + 1.5) - world.heightAt(x, z - 1.5);
          const shade = Math.max(0.38, Math.min(1.5, 0.82 + (-hx - hz) * 0.22));
          const c = this._ramp(e);
          r = c[0] * shade; g = c[1] * shade; bl = c[2] * shade;
        }
        const o = (j * gw + i) * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    this._relief = off;
  }

  draw() {
    this._resize();
    if (!this._relief) this._buildRelief();
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._relief, 0, 0, W, H);

    // central road
    ctx.strokeStyle = 'rgba(220,210,170,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath();
    const p0 = this._toScreen(0, -160), p1 = this._toScreen(0, 160);
    ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();

    // arena ring
    const c = this._toScreen(0, 0); const rr = (this.game.world.bounds) / this.span * W;
    ctx.strokeStyle = 'rgba(188,224,74,0.25)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rr, rr * (H / W) * (W / H), 0, 0, 7); ctx.stroke();

    // POIs
    for (const poi of (this.game.world.pois || [])) {
      const s = this._toScreen(poi.x, poi.z);
      this._marker(ctx, s.x, s.y, poi.kind, poi.label);
    }

    // live units when in a match
    if (this.game.state === 'map' && this.game.waves) {
      for (const e of this.game.waves.enemies) {
        if (e.dead) continue;
        const s = this._toScreen(e.group.position.x, e.group.position.z);
        ctx.fillStyle = e.isBoss ? '#ffd54a' : '#ff3b2f';
        ctx.beginPath(); ctx.arc(s.x, s.y, e.isBoss ? 5 : 3, 0, 7); ctx.fill();
      }
      for (const it of this.game.pickups.items) {
        const s = this._toScreen(it.group.position.x, it.group.position.z);
        ctx.fillStyle = it.kind === 'health' ? '#35e06a' : it.kind === 'armor' ? '#4aa3ff' : '#ffcf4a';
        ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, 7); ctx.fill();
      }
    }

    // player marker with facing
    const ps = this._toScreen(this.game.player.position.x, this.game.player.position.z);
    ctx.save(); ctx.translate(ps.x, ps.y); ctx.rotate(-this.game.player.yaw + Math.PI);
    ctx.fillStyle = '#d8ff5e'; ctx.strokeStyle = '#0a1404'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fill(); ctx.stroke(); ctx.restore();

    // vignette
    const grd = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    // scale ruler
    const meters = Math.round(this.span * 3);
    ctx.fillStyle = 'rgba(230,243,214,0.8)'; ctx.font = '12px Orbitron, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(meters + 'm', W - 18, H / 2);
    ctx.strokeStyle = 'rgba(230,243,214,0.5)';
    ctx.beginPath(); ctx.moveTo(W - 14, H / 2 - 60); ctx.lineTo(W - 14, H / 2 + 60); ctx.stroke();
  }

  _marker(ctx, x, y, kind, label) {
    ctx.save();
    if (kind === 'mission') {
      ctx.fillStyle = '#e0322a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x - 11, y - 6); ctx.lineTo(x + 11, y - 6); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 7px Orbitron'; ctx.textAlign = 'center';
      ctx.fillText('▼', x, y - 1);
      this._label(ctx, x, y + 16, label, '#e0322a');
    } else if (kind === 'objective') {
      this._diamond(ctx, x, y, 9, '#f5a623');
      ctx.fillStyle = '#10210a'; ctx.font = 'bold 9px Orbitron'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', x, y + 0.5);
      this._label(ctx, x, y + 14, label, 'rgba(245,166,35,0.9)');
    } else if (kind === 'alert') {
      this._diamond(ctx, x, y, 8, '#f5a623');
    } else {
      ctx.fillStyle = 'rgba(120,200,255,0.9)'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  _diamond(ctx, x, y, r, color) {
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  _label(ctx, x, y, text, color) {
    ctx.font = '9px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, w, 13);
    ctx.fillStyle = '#fff'; ctx.fillText(text, x, y + 2);
  }
}

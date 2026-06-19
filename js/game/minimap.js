// Top-down radar. Rotates so the player always faces "up".
export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
    this.c = this.size / 2;
    this.range = 75; // world units from edge to edge (radius)
    this.scale = this.c / this.range;
  }

  _proj(rel, cos, sin) {
    // rel = {x, z} world offset from player; map to player-relative (right, forward)
    const right = rel.x * cos + rel.z * (-sin);
    const fwd = rel.x * (-sin) + rel.z * (-cos);
    return { sx: this.c + right * this.scale, sy: this.c - fwd * this.scale };
  }

  update(player, enemies, pickups, lakes) {
    const ctx = this.ctx, S = this.size, c = this.c;
    ctx.clearRect(0, 0, S, S);

    // backdrop
    ctx.fillStyle = 'rgba(10,20,8,0.55)';
    ctx.beginPath(); ctx.arc(c, c, c, 0, 7); ctx.fill();

    // range rings
    ctx.strokeStyle = 'rgba(188,224,74,0.18)';
    ctx.lineWidth = 1;
    for (let r = 1; r <= 2; r++) { ctx.beginPath(); ctx.arc(c, c, (c * r) / 2.2, 0, 7); ctx.stroke(); }
    // crosshair lines
    ctx.beginPath(); ctx.moveTo(c, 6); ctx.lineTo(c, S - 6); ctx.moveTo(6, c); ctx.lineTo(S - 6, c); ctx.stroke();

    const px = player.position.x, pz = player.position.z;
    const cos = Math.cos(player.yaw), sin = Math.sin(player.yaw);

    const within = (rel) => Math.hypot(rel.x, rel.z) < this.range;
    const dot = (x, z, color, size) => {
      const rel = { x: x - px, z: z - pz };
      if (!within(rel)) return;
      const { sx, sy } = this._proj(rel, cos, sin);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(sx, sy, size, 0, 7); ctx.fill();
    };

    // lakes (blue blobs)
    if (lakes) for (const lk of lakes) {
      const rel = { x: lk.x - px, z: lk.z - pz };
      const d = Math.hypot(rel.x, rel.z);
      if (d - lk.r > this.range) continue;
      const { sx, sy } = this._proj(rel, cos, sin);
      ctx.fillStyle = 'rgba(60,140,170,0.5)';
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(3, lk.r * this.scale), 0, 7); ctx.fill();
    }

    // pickups
    if (pickups) for (const it of pickups) {
      const col = it.kind === 'health' ? '#35e06a' : it.kind === 'armor' ? '#4aa3ff' : '#ffcf4a';
      dot(it.group.position.x, it.group.position.z, col, 2.5);
    }

    // enemies
    if (enemies) for (const e of enemies) {
      if (e.dead) continue;
      const col = e.type === 'brute' ? '#ff2a1a' : e.type === 'runner' ? '#ff9a4a' : '#ff5040';
      dot(e.group.position.x, e.group.position.z, col, e.type === 'brute' ? 3.5 : 2.5);
    }

    // player arrow (always centre, pointing up)
    ctx.fillStyle = '#d8ff5e';
    ctx.beginPath();
    ctx.moveTo(c, c - 7);
    ctx.lineTo(c - 5, c + 6);
    ctx.lineTo(c + 5, c + 6);
    ctx.closePath(); ctx.fill();
  }
}

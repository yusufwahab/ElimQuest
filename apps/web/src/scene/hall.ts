/**
 * The hall painter: pure Canvas 2D, no Phaser. Used by the game scene (baked once into a texture) and by the landing
 * page (drawn once into a plain <canvas>), so both show the same world without loading the game engine on the landing.
 */
/** Perspective model shared by the baked backdrop and avatar placement. Step 0 is nearest the viewer. */
export function stairGeometry(W: number, H: number, summit: number) {
  const n = Math.max(1, summit);
  const yTop = H * 0.34, yB = H * 0.94, wMax = Math.min(W * 0.94, 640);
  // Mild perspective: step spacing shrinks ~25% from bottom to top, width shrinks linearly to half.
  const f = (t: number) => t * (1.15 - 0.15 * t);
  const at = (k: number) => ({ s: 1 - (0.5 * k) / n, y: yB - (yB - yTop) * f(k / n), w: wMax * (1 - (0.5 * k) / n) });
  return { n, yTop, yB, wMax, cx: W / 2, at };
}


export function paintHall(ctx: CanvasRenderingContext2D, W: number, H: number, summit: number, lowPower: boolean): void {
  const GOLD = '#f2b858';
    const g = stairGeometry(W, H, summit);
    const { n, cx, yB, at } = g;
    const top = at(n);

    // night hall base
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, '#04101d'); base.addColorStop(0.5, '#082235'); base.addColorStop(1, '#0a2c3f');
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);

    // side walls in perspective
    for (const side of [-1, 1] as const) {
      const edgeNear = cx + side * (g.at(0).w / 2 + 10), edgeFar = cx + side * (top.w / 2 + 6);
      const outer = side < 0 ? 0 : W;
      const wall = ctx.createLinearGradient(outer, 0, cx, 0);
      wall.addColorStop(0, '#071a2a'); wall.addColorStop(1, '#0f3a4e');
      ctx.fillStyle = wall;
      ctx.beginPath(); ctx.moveTo(outer, 0); ctx.lineTo(cx + side * W * 0.2, H * 0.03); ctx.lineTo(edgeFar, top.y); ctx.lineTo(edgeNear, yB); ctx.lineTo(outer, H); ctx.closePath(); ctx.fill();
      // arched niches receding toward the vanishing point
      for (let k = 0; k < 4; k++) {
        const p = at((k + 0.6) * (n / 4.4));
        const nx = cx + side * (p.w / 2 + 34 * p.s * (H / 420) + 40 * p.s), nw = 54 * p.s * (H / 420), nh = 190 * p.s * (H / 420), ny = p.y - nh * 0.9;
        ctx.fillStyle = 'rgba(25,167,184,.10)'; ctx.strokeStyle = 'rgba(242,184,88,.28)'; ctx.lineWidth = Math.max(1, 2 * p.s);
        ctx.beginPath(); ctx.moveTo(nx - nw / 2, ny + nh); ctx.lineTo(nx - nw / 2, ny + nw / 2); ctx.arc(nx, ny + nw / 2, nw / 2, Math.PI, 0); ctx.lineTo(nx + nw / 2, ny + nh); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }

    // glowing arch with a moonlit sky
    const aw = top.w * 1.5, ah = Math.max(40, top.y - H * 0.025), ab = top.y - 4;
    const halo = ctx.createRadialGradient(cx, ab - ah * 0.5, 4, cx, ab - ah * 0.5, ah);
    halo.addColorStop(0, 'rgba(255,200,110,.55)'); halo.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, ab);
    const archPath = (inset: number) => {
      const l = cx - aw / 2 + inset, r = cx + aw / 2 - inset, t = ab - ah + inset, sh = ah * 0.38;
      ctx.beginPath(); ctx.moveTo(l, ab); ctx.lineTo(l, t + sh);
      ctx.bezierCurveTo(l, t + sh * 0.35, cx - aw * 0.12, t + sh * 0.1, cx, t); ctx.bezierCurveTo(cx + aw * 0.12, t + sh * 0.1, r, t + sh * 0.35, r, t + sh); ctx.lineTo(r, ab); ctx.closePath();
    };
    archPath(0); ctx.fillStyle = '#c98d2c'; ctx.fill();
    archPath(aw * 0.07);
    const sky = ctx.createLinearGradient(0, ab - ah, 0, ab); sky.addColorStop(0, '#0b1f4a'); sky.addColorStop(1, '#2a5a86');
    ctx.fillStyle = sky; ctx.fill();
    ctx.save(); archPath(aw * 0.07); ctx.clip();
    for (let i = 0; i < 14; i++) { ctx.fillStyle = `rgba(255,255,255,${0.35 + (i % 3) * 0.2})`; ctx.fillRect(cx - aw * 0.4 + ((i * 53) % 100) * aw * 0.008, ab - ah + ((i * 37) % 60) * ah * 0.006 + 6, 1.6, 1.6); }
    ctx.fillStyle = '#f4ead0'; ctx.beginPath(); ctx.arc(cx + aw * 0.1, ab - ah * 0.62, aw * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#16355e'; ctx.beginPath(); ctx.arc(cx + aw * 0.13, ab - ah * 0.65, aw * 0.065, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a1c33';
    for (const [dx, dw, dh] of [[-0.3, 0.1, 0.3], [-0.12, 0.08, 0.4], [0.18, 0.09, 0.34], [0.33, 0.07, 0.26]] as const) { ctx.fillRect(cx + aw * dx, ab - ah * dh, aw * dw, ah * dh); ctx.beginPath(); ctx.arc(cx + aw * (dx + dw / 2), ab - ah * dh, aw * dw / 2, Math.PI, 0); ctx.fill(); }
    ctx.restore();

    // steps, back to front
    const th = (i: number) => (at(i).y - at(i + 1).y);
    for (let i = n; i >= 0; i--) {
      const p = at(i), depth = th(i) * 0.6, bk = at(i + 0.6);
      const rh = i === 0 ? th(0) * 0.5 : (at(i - 1).y - p.y) * 0.4;
      // riser
      const riser = ctx.createLinearGradient(0, p.y, 0, p.y + rh);
      riser.addColorStop(0, '#12354a'); riser.addColorStop(1, '#091d2e');
      ctx.fillStyle = riser; ctx.fillRect(cx - p.w / 2, p.y, p.w, rh + 0.5);
      // subtle tiled pattern on the riser (cheap: a few lines)
      ctx.strokeStyle = 'rgba(25,167,184,.22)'; ctx.lineWidth = Math.max(1, 1.2 * p.s);
      const cells = Math.max(4, Math.round(p.w / (26 * p.s + 10)));
      for (let c = 1; c < cells; c++) { const x = cx - p.w / 2 + (p.w * c) / cells; ctx.beginPath(); ctx.moveTo(x, p.y + 1); ctx.lineTo(x - rh * 0.3, p.y + rh); ctx.stroke(); }
      // tread top face (trapezoid: back edge narrower)
      const tread = ctx.createLinearGradient(0, p.y - depth, 0, p.y);
      tread.addColorStop(0, i === n ? '#27506b' : '#1d4259'); tread.addColorStop(1, i === n ? '#3a6f8c' : '#2b566f');
      ctx.fillStyle = tread;
      ctx.beginPath(); ctx.moveTo(cx - bk.w / 2, p.y - depth); ctx.lineTo(cx + bk.w / 2, p.y - depth); ctx.lineTo(cx + p.w / 2, p.y); ctx.lineTo(cx - p.w / 2, p.y); ctx.closePath(); ctx.fill();
      // glowing amber lip on the front edge
      ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = lowPower ? 6 : 12 * p.s + 4;
      ctx.strokeStyle = i === n ? '#ffd98a' : GOLD; ctx.lineWidth = Math.max(1.5, 3.2 * p.s);
      ctx.beginPath(); ctx.moveTo(cx - p.w / 2, p.y); ctx.lineTo(cx + p.w / 2, p.y); ctx.stroke(); ctx.restore();
      // step number on the right of the tread (drawn in code: any step count works)
      if (i > 0) {
        const fs = Math.max(10, Math.round(30 * p.s * (H / 420)));
        ctx.font = `800 ${fs}px "Inter Variable", system-ui, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2, fs / 6); ctx.strokeStyle = 'rgba(4,16,29,.85)'; ctx.fillStyle = i === n ? '#ffd98a' : '#f7f1e5';
        const label = String(i); const tx = cx + p.w / 2 - 10 * p.s - 4, ty = p.y - depth * 0.45;
        ctx.strokeText(label, tx, ty); ctx.fillText(label, tx, ty);
      }
    }
// lanterns on both sides
    const stepEvery = Math.max(1, Math.round(n / 5));
    for (let i = 0; i <= n; i += stepEvery) {
      const p = at(i), R = 46 * p.s * (H / 420) + 6;
      for (const side of [-1, 1] as const) {
        const lx = cx + side * (p.w / 2 + 22 * p.s * (H / 420) + 8), ly = p.y - 26 * p.s * (H / 420);
        const glow = ctx.createRadialGradient(lx, ly, 1, lx, ly, R);
        glow.addColorStop(0, 'rgba(255,214,130,.85)'); glow.addColorStop(0.35, 'rgba(242,184,88,.3)'); glow.addColorStop(1, 'rgba(242,184,88,0)');
        ctx.fillStyle = glow; ctx.fillRect(lx - R, ly - R, R * 2, R * 2);
        const bw = 13 * p.s * (H / 420) + 4, bh = 22 * p.s * (H / 420) + 6;
        ctx.fillStyle = '#ffe3a3'; ctx.strokeStyle = '#8a5a14'; ctx.lineWidth = Math.max(1, 2 * p.s);
        ctx.beginPath(); ctx.roundRect(lx - bw / 2, ly - bh / 2, bw, bh, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#8a5a14'; ctx.fillRect(lx - bw / 2 - 1, ly - bh / 2 - 3, bw + 2, 3);
      }
    }
    // low mist at the foot of the stairs
    const mist = ctx.createLinearGradient(0, H * 0.84, 0, H); mist.addColorStop(0, 'rgba(7,27,45,0)'); mist.addColorStop(1, 'rgba(7,27,45,.55)');
    ctx.fillStyle = mist; ctx.fillRect(0, H * 0.84, W, H * 0.16);
}

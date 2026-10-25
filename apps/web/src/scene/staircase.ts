import Phaser from 'phaser';
import { paintHall, stairGeometry } from './hall';

/**
 * Performance-first staircase scene.
 *  - The whole hall (walls, arch, lanterns, perspective steps, numbers) is baked ONCE into one canvas texture per resize,
 *    so a frame is one background image + a handful of avatar sprites. No per-frame vector redraws.
 *  - Render-on-demand: the game loop sleeps when nothing is moving and wakes for a result, a join, or a resize.
 *  - No infinite tweens (they would keep the GPU busy). Climbs/falls are short one-shot tweens.
 *  - Canvas renders at CSS-pixel resolution (not devicePixelRatio) to save fill-rate on phones.
 */
export interface ScenePlayer { id: string; nickname: string; position: number; svg: string; isYou: boolean }
export interface SceneOptions { summit: number; reducedMotion: boolean; lowPower: boolean }
export interface SceneHandle {
  ready: Promise<void>;
  setPlayers(players: ScenePlayer[], animate: boolean): void;
  celebrate(ids: string[]): void;
  destroy(): void;
}

const GOLD_N = 0xf2b858;

function hash(s: string) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

class StairScene extends Phaser.Scene {
  private opts: SceneOptions;
  private players: ScenePlayer[] = [];
  private nodes = new Map<string, Phaser.GameObjects.Container>();
  private badges: Phaser.GameObjects.Text[] = [];
  private bg?: Phaser.GameObjects.Image;
  private loaded = new Set<string>();
  private requested = new Set<string>();
  private wantAnimate = false;
  private idle = 0;
  private onReady!: () => void;
  ready = new Promise<void>((res) => { this.onReady = res; });

  constructor(opts: SceneOptions) { super('stairs'); this.opts = opts; }

  private get maxVisible() { return this.opts.lowPower ? 12 : 28; }
  private get perStepCap() { return this.opts.lowPower ? 3 : 4; }

  create() {
    this.bake();
    this.makeRing();
    this.scale.on('resize', () => { this.bake(); this.render(false); this.wake(); });
    this.onReady();
    this.render(false);
  }

  /** Render-on-demand: sleep after ~20 idle frames; anything that changes the picture calls wake(). */
  update() {
    if (this.tweens.getTweens().length === 0) { if (++this.idle > 20 && this.game.loop.running) { this.game.loop.sleep(); this.game.canvas.dataset.asleep = '1'; } } else this.idle = 0;
  }
  wake() { this.idle = 0; if (!this.game.loop.running) { this.game.loop.wake(true); delete this.game.canvas.dataset.asleep; } }

  // ---- baked backdrop (2D canvas, once per size) ---------------------------------------------------
  private bake() {
    const W = Math.max(2, Math.round(this.scale.width)), H = Math.max(2, Math.round(this.scale.height));
    const key = 'stairs-bg';
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, W, H)!;
    const ctx = tex.getContext();
    paintHall(ctx, W, H, this.opts.summit, this.opts.lowPower);
    tex.refresh();
    if (!this.bg) this.bg = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-1000);
    this.bg.setTexture(key).setDisplaySize(W, H);
  }

  /** Soft glow ring placed under "you" (one tiny shared texture). */
  private makeRing() {
    if (this.textures.exists('ring')) return;
    const t = this.textures.createCanvas('ring', 96, 40)!;
    const c = t.getContext();
    const gr = c.createRadialGradient(48, 20, 2, 48, 20, 46);
    gr.addColorStop(0, 'rgba(60,220,235,.75)'); gr.addColorStop(0.5, 'rgba(60,220,235,.28)'); gr.addColorStop(1, 'rgba(60,220,235,0)');
    c.fillStyle = gr; c.save(); c.scale(1, 0.42); c.beginPath(); c.arc(48, 48, 46, 0, Math.PI * 2); c.fill(); c.restore();
    t.refresh();
  }

  // ---- players -------------------------------------------------------------------------------------
  private texKey(p: ScenePlayer) { return `av-${hash(p.svg)}`; }
  private ensureTexture(p: ScenePlayer) {
    const key = this.texKey(p);
    if (this.loaded.has(key) || this.textures.exists(key)) { this.loaded.add(key); return true; }
    if (!this.requested.has(key)) {
      this.requested.add(key);
      this.textures.once(`addtexture-${key}`, () => { this.loaded.add(key); this.render(this.wantAnimate); this.wake(); });
      this.textures.addBase64(key, `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(p.svg)))}`);
    }
    return false;
  }

  setPlayers(players: ScenePlayer[], animate: boolean) {
    this.players = players;
    this.wantAnimate = animate && !this.opts.reducedMotion;
    if (this.bg) this.render(this.wantAnimate);
    this.wake();
  }

  /** Draw you, the leaders, then those nearest to you; everyone else becomes a "+N" badge on their step. */
  private visible() {
    const you = this.players.find((p) => p.isYou);
    const byLead = [...this.players].sort((a, b) => b.position - a.position || a.id.localeCompare(b.id));
    const picked = new Map<string, ScenePlayer>();
    if (you) picked.set(you.id, you);
    for (const p of byLead.slice(0, Math.ceil(this.maxVisible / 2))) picked.set(p.id, p);
    if (you) for (const p of [...this.players].sort((a, b) => Math.abs(a.position - you.position) - Math.abs(b.position - you.position) || a.id.localeCompare(b.id))) { if (picked.size >= this.maxVisible) break; picked.set(p.id, p); }
    for (const p of byLead) { if (picked.size >= this.maxVisible) break; picked.set(p.id, p); }
    const perStep = new Map<number, ScenePlayer[]>();
    const hidden = new Map<number, number>();
    for (const p of [...picked.values()].sort((a, b) => Number(b.isYou) - Number(a.isYou))) {
      const arr = perStep.get(p.position) ?? [];
      if (arr.length < this.perStepCap) { arr.push(p); perStep.set(p.position, arr); } else hidden.set(p.position, (hidden.get(p.position) ?? 0) + 1);
    }
    for (const p of this.players) if (!picked.has(p.id)) hidden.set(p.position, (hidden.get(p.position) ?? 0) + 1);
    return { perStep, hidden };
  }

  private slot(step: number, idx: number, count: number, texH: number, texW: number) {
    const W = this.scale.width, H = this.scale.height;
    const g = stairGeometry(W, H, this.opts.summit);
    const k = Math.min(step, g.n);
    const p = g.at(k), nx = g.at(k + 1);
    const depth = (p.y - nx.y) * 0.6;
    const targetH = H * 0.215 * p.s + 10;
    const scale = targetH / texH;
    const aw = texW * scale;
    const gap = Math.min(aw * 1.0, (p.w * 0.78) / Math.max(1, count));
    return { x: g.cx + (idx - (count - 1) / 2) * gap, y: p.y - depth * 0.3, scale, targetH };
  }

  render(animate: boolean) {
    if (!this.bg) return;
    const { perStep, hidden } = this.visible();
    const keep = new Set<string>();
    for (const [step, list] of perStep) {
      list.forEach((p, idx) => {
        if (!this.ensureTexture(p)) return;
        keep.add(p.id);
        const fr = this.textures.getFrame(this.texKey(p));
        const to = this.slot(step, idx, list.length, fr.height, fr.width);
        let node = this.nodes.get(p.id);
        if (!node) {
          const kids: Phaser.GameObjects.GameObject[] = [];
          if (p.isYou) kids.push(this.add.image(0, 2, 'ring').setName('ring').setOrigin(0.5, 0.5));
          kids.push(this.add.image(0, 0, this.texKey(p)).setOrigin(0.5, 1).setName('img'));
          if (p.isYou) kids.push(this.add.text(0, 14, 'You', { fontFamily: 'Inter Variable, system-ui, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#071b2d', backgroundColor: '#f2b858', padding: { x: 7, y: 2 } }).setOrigin(0.5, 0).setName('tag'));
          node = this.add.container(to.x, to.y, kids);
          node.setData('step', step);
          this.nodes.set(p.id, node);
        }
        const img = node.getByName('img') as Phaser.GameObjects.Image;
        img.setScale(to.scale);
        const ring = node.getByName('ring') as Phaser.GameObjects.Image | null;
        if (ring) ring.setDisplaySize(to.targetH * 1.1, to.targetH * 0.46);
        node.setDepth(to.y + (p.isYou ? 1 : 0));
        const moved = node.getData('step') !== step;
        const prev = (node.getData('prev') as number | undefined) ?? 0;
        node.setData('step', step);
        if (animate && moved && !this.opts.reducedMotion) {
          const up = prev <= step;
          this.tweens.add({ targets: node, x: to.x, y: to.y, duration: 650, ease: up ? 'Sine.easeInOut' : 'Quad.easeIn' });
          this.tweens.add({ targets: img, scaleX: to.scale * 1.07, scaleY: to.scale * 0.94, duration: 150, yoyo: true, repeat: 1 });
        } else { this.tweens.killTweensOf(node); node.setPosition(to.x, to.y); }
        node.setData('prev', step);
      });
    }
    for (const [id, node] of this.nodes) if (!keep.has(id)) { this.tweens.killTweensOf(node); node.destroy(true); this.nodes.delete(id); }
    this.badges.forEach((t) => t.destroy());
    this.badges = [];
    const W = this.scale.width, H = this.scale.height, g = stairGeometry(W, H, this.opts.summit);
    for (const [step, n] of hidden) {
      if (!n) continue;
      const p = g.at(Math.min(step, g.n));
      this.badges.push(this.add.text(g.cx - p.w / 2 + 8, p.y - 4, `+${n}`, { fontFamily: 'Inter Variable, system-ui, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#071b2d', backgroundColor: '#f7f1e5', padding: { x: 5, y: 2 } }).setOrigin(0, 1).setDepth(10_000));
    }
    this.wake();
  }

  celebrate(ids: string[]) {
    if (this.opts.reducedMotion) return;
    for (const id of ids) { const node = this.nodes.get(id); if (node) this.tweens.add({ targets: node, y: node.y - 12, duration: 240, yoyo: true, repeat: 3, ease: 'Sine.easeOut' }); }
    this.wake();
    if (this.opts.lowPower) return;
    const W = this.scale.width, H = this.scale.height;
    for (let i = 0; i < 20; i++) {
      const c = this.add.rectangle(Phaser.Math.Between(W * 0.2, W * 0.8), -10, 5, 8, i % 2 ? GOLD_N : 0x19a7b8).setDepth(20_000);
      this.tweens.add({ targets: c, y: H * 0.8, angle: Phaser.Math.Between(-180, 180), alpha: 0, duration: Phaser.Math.Between(1100, 2000), delay: i * 40, onComplete: () => c.destroy() });
    }
  }
}

export function createStaircase(parent: HTMLElement, opts: SceneOptions): SceneHandle {
  const scene = new StairScene(opts);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#071b2d',
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 360, height: parent.clientHeight || 260 },
    scene,
    fps: { target: opts.lowPower ? 30 : 60 },
    render: { antialias: !opts.lowPower, powerPreference: 'low-power' },
    banner: false,
    audio: { noAudio: true },
    disableContextMenu: true,
  });
  const vis = () => { if (document.hidden) { game.loop.sleep(); game.canvas.dataset.asleep = '1'; } else scene.wake(); };
  document.addEventListener('visibilitychange', vis);
  return {
    ready: scene.ready,
    setPlayers: (p, a) => scene.setPlayers(p, a),
    celebrate: (ids) => scene.celebrate(ids),
    destroy() { document.removeEventListener('visibilitychange', vis); game.destroy(true); },
  };
}

import { useEffect, useRef, useState } from 'react';
import type { AvatarConfig } from '@elimquest/game-core';
import { paintHall, stairGeometry } from '../scene/hall';
import { AvatarFigure } from './Avatar';

const FRIENDS: { avatar: AvatarConfig; step: number; dx: number }[] = [
  { avatar: { body: 'amber', eyes: 'happy', glasses: 'none', headwear: 'cap', gear: 'backpack' }, step: 4, dx: -0.7 },
  { avatar: { body: 'violet', eyes: 'round', glasses: 'round', headwear: 'crown', gear: 'cape' }, step: 6, dx: 0.6 },
];

/**
 * The same hall as the game, drawn ONCE into a plain canvas (no Phaser, no animation loop) with your adventurer on the
 * first step. Redrawn only when the box is resized.
 */
export function HallHero({ avatar, className = '' }: { avatar: AvatarConfig; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = box.current; if (!el) return;
    let raf = 0;
    const draw = () => {
      const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight);
      const c = canvas.current; if (!c || w < 2 || h < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const ctx = c.getContext('2d'); if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintHall(ctx, w, h, 10, w < 640);
      setSize({ w, h });
    };
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
    ro.observe(el); draw();
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  const g = size.w ? stairGeometry(size.w, size.h, 10) : null;
  const place = (step: number, dx: number, scale: number) => {
    const p = g!.at(step);
    const h = size.h * 0.26 * p.s * scale;
    return { left: g!.cx + dx * p.w * 0.28 - h * 0.43, top: p.y - h - (g!.at(step).y - g!.at(step + 1).y) * 0.2, h };
  };
  return (
    <div ref={box} className={`relative overflow-hidden ${className}`} aria-hidden>
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      {g && FRIENDS.map((f, i) => { const p = place(f.step, f.dx, 1); return <div key={i} className="absolute" style={{ left: p.left, top: p.top }}><AvatarFigure config={f.avatar} view="back" size={Math.round(p.h * 0.86)} /></div>; })}
      {g && (() => { const p = place(1, 0, 1.15); return <div className="absolute drop-shadow-[0_0_14px_rgba(60,220,235,.55)]" style={{ left: p.left, top: p.top }}><AvatarFigure config={avatar} view="back" size={Math.round(p.h * 0.86)} className="anim-float" /></div>; })()}
    </div>
  );
}

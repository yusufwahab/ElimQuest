import { renderToStaticMarkup } from 'react-dom/server';
import type { AvatarConfig } from '@elimquest/game-core';
import { AvatarFigure } from './Avatar';

/** Static SVG markup used to build Phaser textures. Kept apart so react-dom/server only loads with the game scene. */
export function avatarSvgMarkup(config: AvatarConfig, view: 'front' | 'back' = 'back', px = 150): string {
  return renderToStaticMarkup(<AvatarFigure config={config} view={view} size={px} />);
}

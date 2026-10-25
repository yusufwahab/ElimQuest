/**
 * One short, positive "tension cue" for the room (e.g. "2 players are one step from the summit!").
 * Pure and deterministic: derived only from current positions. Never names or shames anyone.
 */
export function tensionCue(a: { positions: number[]; summit: number; you?: number | null }): string | null {
  const { positions, summit, you } = a;
  if (summit < 2) return null;
  const others = you == null ? positions : (() => { const i = positions.indexOf(you); return i < 0 ? positions : [...positions.slice(0, i), ...positions.slice(i + 1)]; })();
  const nearOthers = others.filter((p) => p === summit - 1).length;
  if (you === summit - 1) return nearOthers > 0 ? `You and ${nearOthers} other${nearOthers === 1 ? '' : 's'} are one step from the summit!` : "You're one step from the summit!";
  if (nearOthers > 0) return `${nearOthers} player${nearOthers === 1 ? ' is' : 's are'} one step from the summit!`;
  if (you != null && summit - you === 2) return "You're two steps from the summit.";
  if (you != null && you > 0) {
    const behind = others.filter((p) => p === you - 1).length;
    if (behind >= 2) return `${behind} players are right behind you.`;
  }
  const lead = Math.max(0, ...positions);
  if (lead >= summit - 3 && lead > 0) return `The summit is ${summit - lead} steps away for the leader.`;
  return null;
}

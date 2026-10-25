const RESERVED = ['host', 'admin', 'system', 'moderator', 'elimquest', 'staff', 'organiser', 'organizer'];
// Small baseline filter; matches normalised text. Extend via platform settings.
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'nigg', 'whore', 'slut', 'rape', 'nazi'];

export function normaliseNickname(raw: string): string {
  return raw
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const flatten = (s: string) =>
  s.toLowerCase().replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/[$5]/g, 's').replace(/[^a-z]/g, '');

export type NicknameCheck = { ok: true; nickname: string } | { ok: false; reason: string };

export function checkNickname(raw: string): NicknameCheck {
  const nickname = normaliseNickname(raw);
  if (nickname.length < 2) return { ok: false, reason: 'Nickname must be at least 2 characters.' };
  if (nickname.length > 20) return { ok: false, reason: 'Nickname must be 20 characters or fewer.' };
  if (/[<>&"`\\]/.test(nickname)) return { ok: false, reason: 'Nickname contains characters that are not allowed.' };
  const flat = flatten(nickname);
  // Reserved words are blocked as whole names or whole words ("Host", "Official Host", "4dm1n") but not inside
  // ordinary words ("Ghost", "Hostplayer").
  const words = nickname.split(/[\s._\-·]+/).map(flatten);
  if (RESERVED.some((r) => flat === r || flat === `the${r}` || words.includes(r))) return { ok: false, reason: 'That name is reserved.' };
  if (BLOCKED.some((b) => flat.includes(b))) return { ok: false, reason: 'Please choose a different nickname.' };
  return { ok: true, nickname };
}

/** Visible short suffix for duplicates ("Amina", "Amina·2"), without exposing identity. */
export function disambiguate(nickname: string, taken: ReadonlySet<string>): string {
  const t = new Set([...taken].map((x) => x.toLowerCase()));
  if (!t.has(nickname.toLowerCase())) return nickname;
  for (let i = 2; i < 1000; i++) {
    const cand = `${nickname.slice(0, 17)}·${i}`;
    if (!t.has(cand.toLowerCase())) return cand;
  }
  return `${nickname.slice(0, 12)}·${Date.now() % 100000}`;
}

import { describe, expect, it } from 'vitest';

import { checkChatText } from './nickname';
describe('checkChatText', () => {
  it('accepts ordinary friendly messages', () => {
    for (const t of ['Good luck everyone!', 'MashaAllah that was a hard one', 'See you at 5.30 after Asr', 'Great.Correct answer']) expect(checkChatText(t).ok).toBe(true);
  });
  it('refuses links, emails, phone numbers and abusive words but not look-alike words', () => {
    for (const t of ['join http://x.example/abc', 'visit www.site', 'mail me bob@mail.com', 'call 0801 234 5678', 'this is sh1t', 'f u c k']) expect(checkChatText(t).ok).toBe(t === 'f u c k');
    for (const t of ['I love grapes', 'Dickens wrote that', 'Class is fun', 'scrape the page']) expect(checkChatText(t).ok).toBe(true);
  });
  it('trims, strips control characters and enforces length', () => {
    expect(checkChatText('  hi\u0000   there  ')).toEqual({ ok: true, text: 'hi there' });
    expect(checkChatText('').ok).toBe(false);
    expect(checkChatText('a'.repeat(201)).ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { installKind } from './install';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Mobile/15E148 Safari/604.1';
const IPHONE_WHATSAPP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/23.1';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const ANDROID_WEBVIEW = 'Mozilla/5.0 (Linux; Android 13; SM-A135F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36';
const DESKTOP_FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0';

describe('installKind', () => {
  it('already installed wins over everything', () => {
    expect(installKind(IPHONE_SAFARI, true, true)).toBe('installed');
  });
  it('uses the browser prompt when one is available', () => {
    expect(installKind(ANDROID_CHROME, false, true)).toBe('prompt');
  });
  it('gives iPhone Safari (no prompt exists) manual steps, and iPads that look like Macs too', () => {
    expect(installKind(IPHONE_SAFARI, false, false)).toBe('ios');
    expect(installKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', false, false, true)).toBe('ios');
  });
  it('asks people inside WhatsApp / Facebook / WebView browsers to open their real browser', () => {
    expect(installKind(IPHONE_WHATSAPP, false, false)).toBe('inapp');
    expect(installKind(ANDROID_WEBVIEW, false, false)).toBe('inapp');
  });
  it('shows nothing where installing is not offered (desktop Firefox, Android Chrome without a prompt)', () => {
    expect(installKind(DESKTOP_FIREFOX, false, false)).toBe('none');
    expect(installKind(ANDROID_CHROME, false, false)).toBe('none');
  });
});

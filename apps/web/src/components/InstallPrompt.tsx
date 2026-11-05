import { useEffect, useRef, useState } from 'react';
import { bannerDismissed, dismissBanner, runInstall, useInstallKind, type InstallKind } from '../lib/install';
import { Button } from './ui';

/** Step-by-step help for phones that cannot show an install button. */
function InstallHelp({ kind, open, onClose }: { kind: InstallKind; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-labelledby="install-title" className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-ink-soft p-0 text-ivory backdrop:bg-black/70">
      <div className="grid gap-3 p-5">
        <h2 id="install-title" className="text-xl">{kind === 'inapp' ? 'Open in your browser first' : 'Add ElimQuest to your home screen'}</h2>
        {kind === 'inapp' ? (
          <ol className="grid list-decimal gap-2 pl-5 text-sm text-ivory/90">
            <li>You’re inside another app’s browser, which can’t install websites.</li>
            <li>Tap the <strong>⋯</strong> or <strong>share</strong> button and choose <strong>Open in Safari</strong> (iPhone) or <strong>Open in Chrome</strong> (Android).</li>
            <li>Then tap <strong>Install app</strong> again.</li>
          </ol>
        ) : (
          <ol className="grid list-decimal gap-2 pl-5 text-sm text-ivory/90">
            <li>Tap the <strong>Share</strong> button <span aria-hidden>(a square with an arrow)</span> at the bottom of Safari.</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong>. ElimQuest then opens full screen from your home screen.</li>
          </ol>
        )}
        <div className="mt-1 flex justify-end"><Button variant="gold" onClick={onClose}>Got it</Button></div>
      </div>
    </dialog>
  );
}

/** One-tap install (or help) for the current phone. */
function useInstallAction() {
  const kind = useInstallKind();
  const [help, setHelp] = useState(false);
  const act = async () => { if (kind === 'prompt') { const r = await runInstall(); if (r === 'help') setHelp(true); } else setHelp(true); };
  return { kind, act, helpDialog: <InstallHelp kind={kind} open={help} onClose={() => setHelp(false)} /> };
}

const available = (k: InstallKind) => k === 'prompt' || k === 'ios' || k === 'inapp';

/** Slim suggestion bar on phones and tablets. Hidden once installed; "Not now" hides it for a week. */
export function InstallBanner() {
  const { kind, act, helpDialog } = useInstallAction();
  const [hidden, setHidden] = useState(bannerDismissed);
  if (!available(kind) || hidden) return null;
  return (
    <>
      <div role="region" aria-label="Install the app" className="border-b border-teal/50 bg-teal/25 lg:hidden">
        <div className="container-page flex items-center gap-3 py-2">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink"><img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width="40" height="40" /></span>
          <p className="min-w-0 flex-1 text-sm leading-snug"><strong className="block">Get ElimQuest on your home screen</strong><span className="text-ivory/80">Opens full screen, one tap away.</span></p>
          <Button className="!min-h-11 shrink-0 !px-4 text-sm" onClick={() => void act()}>Install</Button>
          <button type="button" aria-label="Not now" onClick={() => { dismissBanner(); setHidden(true); }} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-xl text-ivory/80 hover:bg-white/10"><span aria-hidden>×</span></button>
        </div>
      </div>
      {helpDialog}
    </>
  );
}

/** A permanent "Install app" link (menu, footer) for people who dismissed the bar. */
export function InstallLink({ className = '' }: { className?: string }) {
  const { kind, act, helpDialog } = useInstallAction();
  if (!available(kind)) return null;
  return <><button type="button" className={className} onClick={() => void act()}>Install app</button>{helpDialog}</>;
}

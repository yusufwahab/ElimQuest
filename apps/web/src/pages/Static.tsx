import { Link, useLocation } from 'react-router';
import { brand } from '@elimquest/config';
import { Alert, LinkButton } from '../components/ui';

const Draft = () => <Alert tone="warn" title="Draft for owner review">This text describes how the software actually handles data. It has not been reviewed by a lawyer and makes no claim of legal compliance or certification. The owner must review and adapt it before public launch.</Alert>;

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return <article className="container-page grid max-w-3xl gap-4 py-8 [&_h2]:mt-4 [&_h2]:text-2xl [&_li]:ml-5 [&_li]:list-disc [&_p]:text-ivory/85 [&_ul]:grid [&_ul]:gap-1.5"><h1 className="text-3xl sm:text-4xl">{title}</h1>{children}</article>;
}

function Help() {
  return (
    <Page title="Help">
      <h2>Joining a game</h2><p>Enter the 6-digit room code on the home page, or open the link your host sent. You pick a nickname and an avatar; no account is needed.</p>
      <h2>The server is slow to respond</h2><p>Free hosting can put the server to sleep when it is idle. The first request may take up to a minute. Hosts should open their room a few minutes before the group arrives.</p>
      <h2>I got disconnected during a game</h2><p>Reload or reopen the room link on the same browser. You rejoin as the same player, your answer for the current round is kept, and you can’t answer twice.</p>
      <h2>Hosting</h2><p>Sign in, choose <em>Host a game</em>, and share the link, QR code or room code yourself — ElimQuest does not message your audience. The game starts only when you press Start.</p>
      <h2 id="accessibility">Accessibility</h2>
      <ul><li>Everything works with a keyboard: Tab to move, arrow keys within answer groups, Enter or Space to choose, then Submit.</li><li>Screen readers hear round changes and results, not every timer tick. The staircase has a text list of positions.</li><li>Turn on <em>Reduce motion</em> in Accessibility &amp; preferences (footer) to remove climbing animations.</li><li>Correct/incorrect is shown with words and symbols, not colour alone.</li></ul>
      <h2>Reporting a question</h2><p>After a round you can report a question that looks wrong. Reviewers check reports.</p>
      <p>Contact: {brand.supportEmail} <em>(placeholder — the owner must set a real address).</em></p>
    </Page>
  );
}

function Privacy() {
  return (
    <Page title="Privacy"><Draft />
      <h2>What we store</h2>
      <ul><li><strong>Guests:</strong> a nickname, avatar choices, your answers and scores for the game, and a random credential kept in your browser so you can reconnect. Also a random browser id (hashed on our server) used only to avoid repeating questions.</li><li><strong>Accounts:</strong> email, display name, saved results and any private question packs you create. Sign-in is handled by Supabase Auth.</li><li><strong>Hosts:</strong> game settings, and an audit log of host actions.</li></ul>
      <h2>What we don’t do</h2><ul><li>No public chat or direct messages. No advertising or sale of data. No emails to your audience.</li><li>Questions you create in a private pack are not shown to other users.</li></ul>
      <h2>Retention</h2><ul><li>Unused or cancelled rooms are deleted after 7 days; finished games after 90 days.</li><li>Solo sessions of guests are deleted after 30 days.</li><li>Account deletion requests remove your profile and saved history within 30 days.</li></ul>
      <h2>Email</h2><p>We send account emails (verification, password reset) and one confirmation to a host when they create a game.</p>
    </Page>
  );
}

function Terms() {
  return (
    <Page title="Terms of use"><Draft />
      <ul><li>ElimQuest is a learning game. Scores are for fun and say nothing about anyone’s faith or character.</li><li>Be respectful. Nicknames that are abusive or impersonate staff are refused, and hosts may remove disruptive players.</li><li>Custom question packs are provided by their authors and are not reviewed by ElimQuest.</li><li>Platform questions marked as reviewed have passed a review step; if you believe an answer is wrong, please report it.</li><li>The service is provided as-is during its pilot phase without uptime guarantees.</li></ul>
    </Page>
  );
}

export default function Static() {
  const { pathname } = useLocation();
  if (pathname === '/help') return <Help />;
  if (pathname === '/privacy') return <Privacy />;
  if (pathname === '/terms') return <Terms />;
  if (pathname === '/expired') return <Page title="This room has expired"><p>Rooms close after a period of inactivity. Ask your host for a new link, or start a game yourself.</p><div className="flex gap-3"><LinkButton to="/">Home</LinkButton><LinkButton variant="ghost" to="/games/new">Host a game</LinkButton></div></Page>;
  if (pathname === '/maintenance') return <Page title="We’ll be right back"><p>ElimQuest is undergoing maintenance. Games in progress are saved and can be resumed by the host afterwards.</p></Page>;
  return <Page title="Page not found"><p>We couldn’t find that page. Check the address, or <Link to="/" className="underline">head home</Link>.</p><div><LinkButton to="/">Home</LinkButton></div></Page>;
}

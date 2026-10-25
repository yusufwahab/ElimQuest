import { Link } from 'react-router';
import { defaultSettings, rulesSummary } from '@elimquest/game-core';
import { Alert, LinkButton } from '../components/ui';

export default function HowItWorks() {
  const rules = rulesSummary(defaultSettings());
  return (
    <div className="container-page grid max-w-4xl gap-8 py-8">
      <div><p className="eyebrow mb-2">How it works</p><h1 className="text-3xl sm:text-4xl">One staircase. One question at a time.</h1></div>
      <section aria-labelledby="join" className="grid gap-4 md:grid-cols-3">
        {[['Join', 'Open a link or type the 6-digit room code, choose a nickname and customise your avatar. No account needed to play.'], ['Answer', 'Everyone sees the same question and the same countdown. Pick an answer, then press Submit. You can change your pick until you submit.'], ['Climb', 'After the timer ends, the answer is revealed and everyone moves at once — up a step for a correct answer, down for a wrong or missing one.']].map(([t, d], i) => (
          <article key={t} className="card"><span className="mb-2 flex size-9 items-center justify-center rounded-full bg-amber font-bold text-ink" aria-hidden>{i + 1}</span><h2 id={i === 0 ? 'join' : undefined} className="text-xl">{t}</h2><p className="mt-1 text-ivory/80">{d}</p></article>
        ))}
      </section>
      <section aria-labelledby="rules" className="card"><h2 id="rules" className="mb-3 text-2xl">The rules</h2>
        <ul className="grid list-disc gap-2 pl-5 text-ivory/90">{rules.map((r) => <li key={r}>{r}</li>)}<li>You never go below the starting step. Answering at step 0 incorrectly means you stay at the start.</li><li>Correct answers stay hidden until the round closes. Nobody sees anyone else’s pick early.</li></ul>
        <p className="mt-3 text-sm text-ivory/70">The default is 20 questions, a 10-step summit and 30 seconds each; hosts can change these. Summit height and question count are separate settings so a long game does not require a perfect run.</p></section>
      <section aria-labelledby="modes" className="grid gap-4 md:grid-cols-2">
        <article className="card"><h2 id="modes" className="text-xl">Competing host</h2><p className="mt-1 text-ivory/80">The host plays too. They choose topics and settings but never see the questions in advance, and can’t change scores once the game starts.</p></article>
        <article className="card"><h2 className="text-xl">Audience host</h2><p className="mt-1 text-ivory/80">An organiser runs the quiz for a group without playing. They can pause between rounds, make announcements, and void a faulty question — every action is logged.</p></article>
      </section>
      <section className="grid gap-3" aria-labelledby="limits"><h2 id="limits" className="text-2xl">Limits, honestly</h2>
        <Alert tone="info">A room holds up to 150 players, and the platform runs a limited number of rooms at once. Larger rooms need load-testing before we promise they’ll be smooth.</Alert>
        <Alert tone="info">Games never start automatically. The host starts when ready — even for a scheduled gathering time.</Alert></section>
      <div className="flex flex-wrap gap-3"><LinkButton to="/practice">Try it solo</LinkButton><LinkButton variant="ghost" to="/">Join a game</LinkButton><Link to="/topics" className="inline-flex min-h-11 items-center underline">Explore topics</Link></div>
    </div>
  );
}

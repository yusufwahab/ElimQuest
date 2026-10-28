import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { bandOfLevel } from '@elimquest/game-core';
import { api } from '../../lib/api';
import { Alert, EmptyState, ErrorState, PageLoading, Select } from '../../components/ui';

interface Day { day: string; visitors: number; pageviews: number; signups: number; signins: number; signinFailed: number; active: number; gamesOpened: number; gamesFinished: number; players: number; answers: number; practice: number; practiceReached: number }
interface Report {
  days: number; from: string; generatedAt: string; trackingSince: string | null; series: Day[];
  totals: Omit<Day, 'day' | 'active'>;
  activeUsers: { today: number; week: number; month: number };
  top: { pages: { key: string; n: number }[]; referrers: { key: string; n: number }[]; devices: { key: string; n: number }[]; browsers: { key: string; n: number }[] };
  platform: { accounts: number; roles: Record<string, number>; gamesByPhase: Record<string, number>; liveRooms: number; avgPlayersPerFinishedGame: number | null; answersAllTime: number; accuracyAllTime: number | null };
}
interface QRow { id: string; text: string; level: number; category: string; status: string; answered: number; correct: number; pct: number; reports: number; isFixture: boolean }

const nf = new Intl.NumberFormat();
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const ROLE: Record<string, string> = { member: 'Players & hosts', content_reviewer: 'Admins (content reviewers)', super_admin: 'Super admins' };

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <li className="card !p-4">
      <p className="text-xs uppercase tracking-wider text-ivory/70">{label}</p>
      <p className="font-display text-3xl tabular-nums">{typeof value === 'number' ? nf.format(value) : value}</p>
      {sub && <p className="mt-0.5 text-xs text-ivory/70">{sub}</p>}
    </li>
  );
}

/** One-series daily bar chart: thin bars, rounded data ends on the baseline, quiet grid, hover/focus read-out and a table view. */
function DayBars({ title, rows, pick, unit }: { title: string; rows: Day[]; pick: (d: Day) => number; unit: string }) {
  const [hot, setHot] = useState<number | null>(null);
  const W = 360, H = 150, L = 30, B = 22, T = 8;
  const vals = rows.map(pick);
  const max = Math.max(1, ...vals);
  const nice = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const bw = (W - L) / Math.max(1, rows.length);
  const bar = Math.max(2, Math.min(14, bw - 2));
  const y = (v: number) => T + (H - T - B) * (1 - v / nice);
  const total = vals.reduce((a, b) => a + b, 0);
  const u = (n: number) => (n === 1 ? unit.replace(/s$/, '') : unit);
  const ticks = nice >= 4 ? [0, 0.5, 1] : [0, 1];
  const shown = hot != null ? `${fmtDay(rows[hot]!.day)}: ${nf.format(vals[hot]!)} ${u(vals[hot]!)}` : `${nf.format(total)} ${u(total)} in this period`;
  return (
    <section className="card grid gap-2 !p-4" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-lg">{title}</h3><p className="text-sm tabular-nums text-ivory/85" aria-live="polite">{shown}</p></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${nf.format(total)} ${unit} over ${rows.length} days. Table below.`} className="h-auto w-full text-teal-bright" onMouseLeave={() => setHot(null)}>
        {ticks.map((f) => (
          <g key={f}><line x1={L} x2={W} y1={y(nice * f)} y2={y(nice * f)} className="stroke-white/10" strokeWidth={1} /><text x={L - 6} y={y(nice * f) + 4} textAnchor="end" className="fill-ivory/75 text-[11px]">{nf.format(Math.round(nice * f))}</text></g>
        ))}
        {rows.map((r, i) => {
          const v = vals[i]!, x = L + i * bw + (bw - bar) / 2, h = Math.max(v > 0 ? 2 : 0, H - B - y(v));
          return (
            <g key={r.day}>
              {v > 0 && <path d={`M${x},${H - B} v${-(h - Math.min(4, h))} q0,${-Math.min(4, h)} ${Math.min(4, bar / 2)},${-Math.min(4, h)} h${bar - 2 * Math.min(4, bar / 2)} q${Math.min(4, bar / 2)},0 ${Math.min(4, bar / 2)},${Math.min(4, h)} v${h - Math.min(4, h)} z`} fill="currentColor" opacity={hot == null || hot === i ? 1 : 0.55} />}
              <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" onMouseEnter={() => setHot(i)} onFocus={() => setHot(i)} />
            </g>
          );
        })}
        <text x={L} y={H - 5} className="fill-ivory/75 text-[11px]">{fmtDay(rows[0]!.day)}</text>
        <text x={W} y={H - 5} textAnchor="end" className="fill-ivory/75 text-[11px]">{fmtDay(rows[rows.length - 1]!.day)}</text>
      </svg>
      <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 text-ivory/80">Show as a table</summary>
        <div className="max-h-56 overflow-auto"><table className="w-full text-left"><caption className="sr-only">{title} by day</caption><thead className="text-xs uppercase tracking-wider text-ivory/70"><tr><th className="p-1">Day</th><th className="p-1">{unit}</th></tr></thead>
          <tbody>{[...rows].reverse().map((r) => <tr key={r.day} className="border-t border-line"><td className="p-1">{fmtDay(r.day)}</td><td className="p-1 tabular-nums">{nf.format(pick(r))}</td></tr>)}</tbody></table></div>
      </details>
    </section>
  );
}

/** Ranked list with proportional bars (share of the list total). */
function Ranked({ title, rows, empty }: { title: string; rows: { key: string; n: number }[]; empty: string }) {
  const total = rows.reduce((a, r) => a + r.n, 0);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="card grid content-start gap-2 !p-4" aria-label={title}>
      <h3 className="text-lg">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-ivory/70">{empty}</p> : (
        <ul className="grid gap-1.5 text-sm">{rows.map((r) => (
          <li key={r.key} className="grid gap-0.5">
            <div className="flex justify-between gap-3"><span className="min-w-0 truncate">{r.key}</span><span className="shrink-0 tabular-nums text-ivory/85">{nf.format(r.n)} <span className="text-ivory/65">· {total ? Math.round((r.n / total) * 100) : 0}%</span></span></div>
            <div className="h-1.5 rounded-full bg-white/10" aria-hidden><div className="h-full rounded-full bg-teal-bright" style={{ width: `${(r.n / max) * 100}%` }} /></div>
          </li>
        ))}</ul>
      )}
    </section>
  );
}

function QuestionQuality() {
  const [sort, setSort] = useState('hardest');
  const [min, setMin] = useState('5');
  const q = useQuery({ queryKey: ['admin-qq', sort, min], queryFn: () => api<{ questions: QRow[]; note: string }>('GET', `/api/admin/stats/questions?sort=${sort}&min=${min}&limit=30`) });
  return (
    <section className="grid gap-3" aria-labelledby="qq-h">
      <h2 id="qq-h" className="text-2xl">Question quality</h2>
      <p className="text-sm text-ivory/80">Which questions players get right or wrong. A question almost everyone misses may have a wrong answer key — check it first. Questions almost everyone gets right may be too easy for their difficulty band.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Show" value={sort} onChange={(e) => setSort(e.target.value)}><option value="hardest">Hardest first (lowest % correct)</option><option value="easiest">Easiest first (highest % correct)</option><option value="reported">Most reported</option><option value="most">Most answered</option></Select>
        <Select label="Only questions answered at least" value={min} onChange={(e) => setMin(e.target.value)}>{['1', '5', '10', '25', '50'].map((n) => <option key={n} value={n}>{n} times</option>)}</Select>
      </div>
      {q.isPending ? <PageLoading /> : q.isError ? <ErrorState error={q.error} /> : q.data.questions.length === 0 ? <EmptyState title="Not enough answers yet">Once games have been played, questions with at least {min} answers appear here.</EmptyState> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm"><caption className="sr-only">Question quality</caption>
          <thead className="text-xs uppercase tracking-wider text-ivory/70"><tr><th className="p-2">Question</th><th className="p-2">Topic</th><th className="p-2">Difficulty</th><th className="p-2">Answered</th><th className="p-2">% correct</th><th className="p-2">Reports</th></tr></thead>
          <tbody>{q.data.questions.map((x) => (
            <tr key={x.id} className="border-t border-line align-top">
              <td className="max-w-md p-2"><Link className="underline" to={`/admin/questions/${x.id}`}>{x.text}</Link>{x.isFixture && <span className="ml-2 rounded bg-amber/20 px-1.5 text-xs text-amber">fixture</span>}</td>
              <td className="p-2">{x.category}</td><td className="p-2">{bandOfLevel(x.level).name}</td><td className="p-2 tabular-nums">{nf.format(x.answered)}</td>
              <td className="p-2 tabular-nums font-semibold">{x.pct}%{x.pct <= 25 && x.answered >= 10 ? <span className="ml-1.5 rounded bg-danger/20 px-1.5 text-xs text-danger">check answer</span> : x.pct >= 95 && x.answered >= 10 ? <span className="ml-1.5 rounded bg-amber/20 px-1.5 text-xs text-amber">very easy</span> : null}</td>
              <td className="p-2 tabular-nums">{x.reports}</td>
            </tr>))}</tbody></table></div>
      )}
      <p className="text-xs text-ivory/65">{q.data?.note ?? 'From scored multiplayer rounds only.'}</p>
    </section>
  );
}

export function StatsPage() {
  const [days, setDays] = useState('30');
  const q = useQuery({ queryKey: ['admin-stats', days], queryFn: () => api<Report>('GET', `/api/admin/stats?days=${days}`), refetchInterval: 60_000 });
  if (q.isPending) return <PageLoading />;
  if (q.isError) return <ErrorState error={q.error} />;
  const r = q.data, t = r.totals, p = r.platform;
  const phases = Object.entries(p.gamesByPhase);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl">Usage statistics</h1>
        <div className="w-48"><Select label="Period" value={days} onChange={(e) => setDays(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></Select></div>
      </div>
      <Alert tone="info" title="Real counts only, collected privately">
        Visits are counted without cookies, and no IP address or browser details are stored. Visitors who send “Do Not Track” and staff pages are not counted. Days are in UTC. {r.trackingSince ? `Visit counting began on ${fmtDay(r.trackingSince)}; earlier days show zero.` : 'Visit counting starts now — numbers fill in as people use the site.'}
      </Alert>

      <section className="grid gap-3" aria-labelledby="sum-h">
        <h2 id="sum-h" className="text-2xl">Summary <span className="text-base font-normal text-ivory/70">· last {r.days} days</span></h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Tile label="Visitors" value={t.visitors} sub="Unique per day, added up" />
          <Tile label="Page views" value={t.pageviews} />
          <Tile label="Sign-ups" value={t.signups} sub={`${nf.format(p.accounts)} accounts in total`} />
          <Tile label="Sign-ins" value={t.signins} sub="New login sessions" />
          <Tile label="Failed sign-ins" value={t.signinFailed} sub="Reported by the app" />
          <Tile label="Active accounts" value={r.activeUsers.today} sub={`today · ${nf.format(r.activeUsers.week)} this week · ${nf.format(r.activeUsers.month)} this month`} />
          <Tile label="Games opened" value={t.gamesOpened} sub={`${nf.format(t.gamesFinished)} finished · ${nf.format(p.liveRooms)} live now`} />
          <Tile label="Players joined" value={t.players} sub={p.avgPlayersPerFinishedGame != null ? `${p.avgPlayersPerFinishedGame} per finished game (all time)` : undefined} />
          <Tile label="Questions answered" value={t.answers} sub="In multiplayer games" />
          <Tile label="Solo climbs" value={t.practice} sub={`${nf.format(t.practiceReached)} reached the summit`} />
        </ul>
      </section>

      <section className="grid gap-3 lg:grid-cols-2" aria-label="Charts">
        <DayBars title="Visitors per day" rows={r.series} pick={(d) => d.visitors} unit="visitors" />
        <DayBars title="Page views per day" rows={r.series} pick={(d) => d.pageviews} unit="page views" />
        <DayBars title="Sign-ups per day" rows={r.series} pick={(d) => d.signups} unit="sign-ups" />
        <DayBars title="Sign-ins per day" rows={r.series} pick={(d) => d.signins} unit="sign-ins" />
        <DayBars title="Active accounts per day" rows={r.series} pick={(d) => d.active} unit="accounts" />
        <DayBars title="Failed sign-ins per day" rows={r.series} pick={(d) => d.signinFailed} unit="failed sign-ins" />
        <DayBars title="Games opened per day" rows={r.series} pick={(d) => d.gamesOpened} unit="games" />
        <DayBars title="Questions answered per day" rows={r.series} pick={(d) => d.answers} unit="answers" />
      </section>

      <section className="grid gap-3" aria-labelledby="vis-h">
        <h2 id="vis-h" className="text-2xl">Who visits</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Ranked title="Most visited pages" rows={r.top.pages} empty="No visits recorded yet." />
          <Ranked title="Where visitors come from" rows={r.top.referrers} empty="No visits recorded yet." />
          <Ranked title="Devices" rows={r.top.devices} empty="No visits recorded yet." />
          <Ranked title="Browsers" rows={r.top.browsers} empty="No visits recorded yet." />
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="plat-h">
        <h2 id="plat-h" className="text-2xl">Accounts & games</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <section className="card grid content-start gap-2 !p-4"><h3 className="text-lg">Accounts by role</h3>
            <ul className="grid gap-1 text-sm">{Object.entries(p.roles).map(([k, n]) => <li key={k} className="flex justify-between"><span>{ROLE[k] ?? k}</span><span className="tabular-nums">{nf.format(n)}</span></li>)}</ul></section>
          <section className="card grid content-start gap-2 !p-4"><h3 className="text-lg">Games, all time</h3>
            {phases.length === 0 ? <p className="text-sm text-ivory/70">No games yet.</p> : <ul className="grid gap-1 text-sm">{phases.map(([k, n]) => <li key={k} className="flex justify-between"><span className="capitalize">{k.replace('_', ' ')}</span><span className="tabular-nums">{nf.format(n)}</span></li>)}</ul>}
            <p className="text-xs text-ivory/70">{nf.format(p.answersAllTime)} multiplayer answers{p.accuracyAllTime != null ? ` · ${p.accuracyAllTime}% correct overall` : ''}</p></section>
        </div>
      </section>

      <QuestionQuality />

      <p className="text-sm text-ivory/75">Who signed in and when is in the <Link className="underline" to="/admin/audit">Audit log</Link> (switch to “Sign-ins”). Updated {new Date(r.generatedAt).toLocaleTimeString()}.</p>
    </div>
  );
}

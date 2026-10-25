import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CategoryArt } from '../components/art';
import { Alert, EmptyState, ErrorState, LinkButton, PageLoading, Select } from '../components/ui';

interface Topic { id: string; slug: string; name: string; description: string; questionCount: number; levels: { level: number; count: number }[] }

export default function Topics() {
  const { slug } = useParams();
  const topicsQ = useQuery({ queryKey: ['topics'], queryFn: () => api<{ topics: Topic[] }>('GET', '/api/topics', undefined, { auth: false }) });
  const cfgQ = useQuery({ queryKey: ['config'], queryFn: () => api<{ fixturesEnabled: boolean }>('GET', '/api/config', undefined, { auth: false }) });
  const levelsQ = useQuery({ queryKey: ['levels'], queryFn: () => api<{ levels: { level: number; title: string; rubric: string }[] }>('GET', '/api/levels', undefined, { auth: false }) });
  const [minLevel, setMin] = useState(1);
  if (topicsQ.isPending) return <PageLoading label="Loading topics…" />;
  if (topicsQ.isError) return <ErrorState error={topicsQ.error} onRetry={() => topicsQ.refetch()} />;
  const topics = topicsQ.data.topics;
  const fixtures = cfgQ.data?.fixturesEnabled;
  const banner = fixtures && <Alert tone="warn" title="Development content">These questions are unreviewed test fixtures. A production install shows only reviewed, published questions.</Alert>;

  if (slug) {
    const t = topics.find((x) => x.slug === slug);
    if (!t) return <div className="container-page py-12"><EmptyState title="Topic not found" action={<LinkButton to="/topics">All topics</LinkButton>} /></div>;
    return (
      <div className="container-page grid gap-6 py-8">
        <nav aria-label="Breadcrumb" className="text-sm"><Link className="underline" to="/topics">Topics</Link> / {t.name}</nav>
        <div className="overflow-hidden rounded-2xl border border-line md:grid md:grid-cols-2">
          <CategoryArt slug={t.slug} className="h-44 w-full md:h-full" />
          <div className="grid content-center gap-3 bg-ink-soft p-6">
            <h1 className="text-3xl sm:text-4xl">{t.name}</h1>
            <p className="text-ivory/85">{t.description}</p>
            <p className="text-sm text-ivory/70">{t.questionCount} published question{t.questionCount === 1 ? '' : 's'} available.</p>
            <div className="mt-1 flex flex-wrap gap-3"><LinkButton to={`/practice?topic=${t.slug}`}>Practise this topic</LinkButton><LinkButton variant="teal" to={`/games/new?topic=${t.slug}`}>Host a game</LinkButton></div>
          </div>
        </div>
        {banner}
        <section aria-labelledby="lv"><h2 id="lv" className="mb-3 text-2xl">Difficulty levels</h2>
          <p className="mb-3 text-sm text-ivory/75">Levels run 1 (foundations) to 10 (mastery) and describe depth of knowledge and reasoning steps. The questions chosen for a live game stay hidden until each round.</p>
          {t.levels.length ? <ul className="grid gap-2 sm:grid-cols-2">{t.levels.map((l) => { const d = levelsQ.data?.levels.find((x) => x.level === l.level); return <li key={l.level} className="card !p-4"><p className="font-semibold">Level {l.level}{d ? ` · ${d.title}` : ''} <span className="font-normal text-ivory/70">— {l.count} question{l.count === 1 ? '' : 's'}</span></p>{d && <p className="mt-1 text-sm text-ivory/75">{d.rubric}</p>}</li>; })}</ul> : <EmptyState title="No questions published yet" />}
        </section>
      </div>
    );
  }

  const shown = topics.filter((t) => t.levels.some((l) => l.level >= minLevel));
  return (
    <div className="container-page grid gap-6 py-8">
      <div><p className="eyebrow mb-2">Explore topics</p><h1 className="text-3xl sm:text-4xl">Choose your path of knowledge</h1></div>
      {banner}
      <div className="max-w-xs"><Select label="Show topics with questions at level…" value={minLevel} onChange={(e) => setMin(Number(e.target.value))} hint="Filters topics that have at least one question at or above this level.">
        {Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>{i === 0 ? 'Any level' : `Level ${i + 1} or higher`}</option>)}
      </Select></div>
      {shown.length === 0 ? <EmptyState title="No topics match" action={<LinkButton to="/topics" variant="ghost" onClick={() => setMin(1)}>Reset filter</LinkButton>}>There are no published questions at that level yet.</EmptyState> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => (
            <li key={t.id} className="card flex flex-col overflow-hidden !p-0">
              <Link to={`/topics/${t.slug}`} className="block" aria-hidden="true" tabIndex={-1}><CategoryArt slug={t.slug} className="h-32 w-full" /></Link>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h2 className="text-xl"><Link className="inline-flex min-h-11 items-center" to={`/topics/${t.slug}`}>{t.name}</Link></h2>
                <p className="flex-1 text-sm text-ivory/80">{t.description}</p>
                <p className="text-xs text-ivory/70">{t.questionCount} questions · levels {t.levels.length ? `${t.levels[0]!.level}–${t.levels.at(-1)!.level}` : 'none yet'}</p>
                <div className="flex flex-wrap gap-2"><LinkButton variant="ghost" className="!min-h-10 !px-4 text-sm" to={`/practice?topic=${t.slug}`}>Practise</LinkButton><LinkButton variant="ghost" className="!min-h-10 !px-4 text-sm" to={`/games/new?topic=${t.slug}`}>Host</LinkButton></div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

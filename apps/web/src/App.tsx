import { Suspense, lazy, type ReactNode, useEffect } from 'react';
import { trackPageview } from './lib/track';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { SiteLayout } from './components/Layout';
import { PageLoading } from './components/ui';
import { useAuth } from './lib/auth';

const Home = lazy(() => import('./pages/Home'));
const Topics = lazy(() => import('./pages/Topics'));
const HowItWorks = lazy(() => import('./pages/HowItWorks'));
const Auth = lazy(() => import('./pages/Auth'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const GameWizard = lazy(() => import('./pages/GameWizard'));
const SharePage = lazy(() => import('./pages/SharePage'));
const Join = lazy(() => import('./pages/Join'));
const RoomLayout = lazy(() => import('./pages/room/RoomLayout'));
const Lobby = lazy(() => import('./pages/room/Lobby'));
const Play = lazy(() => import('./pages/room/Play'));
const HostControls = lazy(() => import('./pages/room/HostControls'));
const Results = lazy(() => import('./pages/Results'));
const Practice = lazy(() => import('./pages/Practice'));
const Packs = lazy(() => import('./pages/Packs'));
const Account = lazy(() => import('./pages/Account'));
const Admin = lazy(() => import('./pages/admin/Admin'));
const Static = lazy(() => import('./pages/Static'));

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: loc.pathname + loc.search }} />;
  return <>{children}</>;
}

export function App() {
  const loc = useLocation();
  useEffect(() => { trackPageview(loc.pathname); }, [loc.pathname]);
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="topics" element={<Topics />} />
          <Route path="topics/:slug" element={<Topics />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          {['sign-in', 'sign-up', 'forgot-password', 'reset-password', 'auth/callback'].map((p) => <Route key={p} path={p} element={<Auth />} />)}
          <Route path="dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="games/new" element={<GameWizard />} />
          <Route path="games/:id/edit" element={<Protected><GameWizard /></Protected>} />
          <Route path="games/:id/share" element={<Protected><SharePage /></Protected>} />
          <Route path="join" element={<Join />} />
          <Route path="join/:code" element={<Join />} />
          <Route path="games/:id/results" element={<Results />} />
          <Route path="practice" element={<Practice />} />
          <Route path="practice/:id/play" element={<Practice />} />
          <Route path="practice/:id/results" element={<Practice />} />
          <Route path="packs/*" element={<Protected><Packs /></Protected>} />
          <Route path="account" element={<Account />} />
          <Route path="admin/*" element={<Protected><Admin /></Protected>} />
          {['help', 'privacy', 'terms', 'expired', 'maintenance'].map((p) => <Route key={p} path={p} element={<Static />} />)}
          <Route path="*" element={<Static />} />
        </Route>
        {/* Room routes share one live connection and use their own chrome. */}
        <Route path="rooms/:code" element={<RoomLayout />}>
          <Route path="lobby" element={<Lobby />} />
          <Route path="play" element={<Play />} />
          <Route path="host" element={<HostControls />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

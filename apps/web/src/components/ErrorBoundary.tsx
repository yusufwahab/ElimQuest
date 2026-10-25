import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('UI error', error.message, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-3xl">Something went wrong</h1>
        <p className="text-ivory/80">The page hit an unexpected problem. Your game progress is saved on the server — reloading will bring you back.</p>
        <button className="btn btn-gold" onClick={() => location.reload()}>Reload</button>
        <a className="underline" href="/">Go home</a>
      </div>
    );
  }
}

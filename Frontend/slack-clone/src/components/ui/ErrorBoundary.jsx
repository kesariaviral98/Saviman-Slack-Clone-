import { Component } from 'react';

// ── Fallback UIs ──────────────────────────────────────────────────────────────

function FullPageFallback({ error, onReset }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-raised px-6">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Something went wrong</h1>
        <p className="text-gray-500 mb-6 text-sm">
          An unexpected error occurred. You can try reloading the page or going back.
        </p>
        {import.meta.env.DEV && error && (
          <pre className="text-left bg-gray-100 text-red-600 text-xs rounded p-3 mb-6 overflow-auto max-h-40">
            {error.message}
          </pre>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={onReset}
            className="bg-sidebar-bg hover:bg-sidebar-hover text-white font-medium px-5 py-2 rounded transition-colors text-sm"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.assign('/workspaces')}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-5 py-2 rounded transition-colors text-sm"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}

function InlineFallback({ error, onReset }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <p className="text-gray-500 font-medium mb-1">This section crashed</p>
      {import.meta.env.DEV && error && (
        <p className="text-red-500 text-xs mb-3 max-w-xs truncate">{error.message}</p>
      )}
      <button
        onClick={onReset}
        className="text-sm text-sidebar-bg hover:underline"
      >
        Try again
      </button>
    </div>
  );
}

// ── ErrorBoundary class ───────────────────────────────────────────────────────

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    const { children, fallback, fullPage } = this.props;

    if (error) {
      if (fallback) return fallback(error, this.reset);
      if (fullPage) return <FullPageFallback error={error} onReset={this.reset} />;
      return <InlineFallback error={error} onReset={this.reset} />;
    }

    return children;
  }
}

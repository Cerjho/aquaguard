import React from 'react';
import logger from '../utils/logger';

function ErrorFallback({ error }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#05080f] p-6">
      <div className="max-w-lg w-full rounded border border-rose-500/50 bg-[#0a0f18] shadow-[0_8px_32px_rgba(244,63,94,0.15)] p-6 text-center">
        <h1 className="text-xl font-mono font-bold tracking-[0.2em] text-slate-200 uppercase">SYSTEM FAILURE</h1>
        <p className="mt-2 text-[10px] font-mono tracking-widest text-slate-400 uppercase">
          THE DASHBOARD ENCOUNTERED AN UNEXPECTED ERROR. PLEASE REFRESH THE PAGE OR RE-AUTHENTICATE.
        </p>
        {error ? (
          <pre className="mt-4 text-left text-[10px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded p-3 overflow-auto">
            {String(error.message || error)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      // Keep stack details visible in development builds.
      logger.error('React Error Boundary:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

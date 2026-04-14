import React from 'react';
import logger from '../utils/logger';

function ErrorFallback({ error }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-100 p-6">
      <div className="max-w-lg w-full rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">
          The dashboard encountered an unexpected error. Please refresh the page or sign in again.
        </p>
        {error ? (
          <pre className="mt-4 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 overflow-auto">
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

import { Component } from 'react';

/**
 * Catches render errors in a page so one broken component does not blank the
 * whole app, and reports the error (e.g. to Audit Logs -> System Errors).
 *
 * Props:
 *  - onError(error, { source, operation }): called once per caught error
 *  - resetKey: change this (e.g. activePage) to clear the error when navigating
 *  - darkMode: boolean for styling
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    try {
      this.props.onError?.(error, {
        source: 'ErrorBoundary',
        operation: `page: ${this.props.resetKey || 'unknown'}`,
      });
    } catch (e) {
      console.error('ErrorBoundary onError failed:', e);
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const dark = this.props.darkMode;
    return (
      <div
        className={`max-w-xl mx-auto mt-16 p-6 rounded-xl border text-center ${
          dark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        <h2 className="text-base font-bold">This page ran into a problem</h2>
        <p className={`text-sm mt-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
          You can try again, or open another page from the sidebar.
        </p>
        <p className="font-mono text-xs mt-3 text-rose-500 break-words">
          {String(this.state.error?.message || this.state.error).slice(0, 200)}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
        >
          Try again
        </button>
      </div>
    );
  }
}

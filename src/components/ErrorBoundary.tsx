import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
          <div className="text-center max-w-md animate-fade-in-up">
            <div className="w-16 h-16 bg-[var(--errorLight)] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-[var(--error)] text-2xl font-bold">!</span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text)] mb-2 font-heading">Something went wrong</h1>
            <p className="text-[var(--textSecondary)] mb-6">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 gradient-button text-white rounded-[10px] hover:shadow-card transition-all active:scale-[0.98]"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

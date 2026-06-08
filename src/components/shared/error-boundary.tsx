'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
  }

  reset = () => this.setState({ hasError: false, message: '' });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 py-12 px-6 text-center gap-4">
          <AlertTriangle className="h-10 w-10 text-red-400" />
          <div>
            <p className="font-semibold text-red-700">Something went wrong</p>
            <p className="text-sm text-red-600 mt-1 max-w-sm">{this.state.message}</p>
          </div>
          <Button variant="outline" size="sm" onClick={this.reset}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Component, ErrorInfo, ReactNode } from "react";
import { ShieldAlert, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  name: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`ErrorBoundary caught an error in component [${this.props.name}]:`, error, errorInfo);
  }

  private handleRetry = () => {
    const errorMsg = this.state.error?.message || '';
    const isChunkLoadError = 
      /Failed to fetch dynamically imported module/i.test(errorMsg) ||
      /Failed to load module script/i.test(errorMsg) ||
      /Expected a JavaScript-or-Wasm module script/i.test(errorMsg);

    if (isChunkLoadError) {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: null });
    }
  };

  public render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || '';
      const isChunkLoadError = 
        /Failed to fetch dynamically imported module/i.test(errorMsg) ||
        /Failed to load module script/i.test(errorMsg) ||
        /Expected a JavaScript-or-Wasm module script/i.test(errorMsg);

      return (
        <div className="p-6 rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-900/30 flex flex-col items-center justify-center text-center gap-4 min-h-[300px]">
          <ShieldAlert className="w-12 h-12 text-red-500 animate-pulse" />
          <div>
            <h3 className="font-semibold text-red-900 dark:text-red-400">Something went wrong in {this.props.name}</h3>
            <p className="text-sm text-red-700 dark:text-red-500 mt-1">
              {isChunkLoadError
                ? 'A new version of the app may be available or a script failed to load.'
                : 'This specific feature failed to load, but the rest of the application is running.'}
            </p>
          </div>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-all shadow-sm cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            {isChunkLoadError ? 'Reload page' : 'Try again'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

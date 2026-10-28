import { Component, ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

// Without this, any exception thrown while rendering unmounts the whole tree and
// leaves an empty screen until a manual refresh — which is how a single stored
// row missing a field turned every search into a blank page. Wrapped around the
// routes (inside Layout), so the header and menu survive; App keys it on the
// route, so navigating to another page clears the error.

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="max-w-md mx-auto mt-16 p-6 rounded-2xl glass border border-red-400/30 text-center" dir="rtl">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h2 className="text-white font-bold text-lg mb-1">משהו השתבש בעמוד הזה</h2>
        <p className="text-white/60 text-sm mb-4">הנתונים שלך לא נפגעו. אפשר לנסות שוב או לטעון מחדש.</p>
        <pre className="text-[11px] text-red-300/80 bg-black/30 rounded-lg p-2 mb-4 whitespace-pre-wrap break-words text-left" dir="ltr">
          {error.message}
        </pre>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => this.setState({ error: null })}
            className="h-9 px-4 rounded-xl border border-white/15 bg-white/5 text-white/80 hover:bg-white/10 text-sm"
          >
            נסה שוב
          </button>
          <button
            onClick={() => window.location.reload()}
            className="h-9 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm flex items-center gap-1.5"
          >
            <RotateCw className="w-4 h-4" /> טען מחדש
          </button>
        </div>
      </div>
    );
  }
}

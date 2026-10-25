import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
};

type State = { error: Error | null };

/** Keeps the rest of the app visible when a view throws while rendering. */
export class StudioErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    const message = this.state.error.message || String(this.state.error);
    return (
      <div
        style={{
          padding: 28,
          minHeight: "100%",
          color: "#e7e5e0",
          background: "#12141a"
        }}
      >
        <p style={{ color: "#f87171", margin: "0 0 12px", fontSize: 16 }}>
          {this.props.fallbackTitle ?? "Something on this screen failed."}
        </p>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 13,
            color: "#e7e5e0",
            margin: "0 0 16px"
          }}
        >
          {message}
        </pre>
        <button
          type="button"
          style={{
            background: "transparent",
            border: "none",
            color: "#9ca3af",
            padding: 0,
            fontSize: 14
          }}
          onClick={() => {
            this.setState({ error: null });
            this.props.onReset?.();
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}


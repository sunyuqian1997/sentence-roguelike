import React from 'react';

function DefaultFallback() {
  return (
    <div role="alert" data-react-runtime-error="true">
      界面暂时无法加载。
    </div>
  );
}

export class ReactRuntimeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      this.props.onError?.(error, {
        phase: 'render',
        componentStack: info.componentStack,
      });
    } catch (reportingError) {
      console.error('[react-runtime] error reporter failed', reportingError);
    }
  }

  componentDidUpdate(previousProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset() {
    this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { fallback } = this.props;
    if (typeof fallback === 'function') {
      return fallback({ error, reset: this.reset });
    }
    if (fallback !== undefined) return fallback;
    return <DefaultFallback />;
  }
}

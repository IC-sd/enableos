import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('EnableOS view failed', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="recovery-screen"><div><p className="eyebrow">安全恢复</p><h1>这个视图没有正常打开</h1><p>数据仍保存在浏览器中。你可以重新加载界面；若问题持续，可进入设置导出备份。</p><details><summary>查看错误信息</summary><pre>{this.state.error.message}</pre></details><button className="primary-button" onClick={() => window.location.reload()}>重新加载</button></div></div>;
  }
}

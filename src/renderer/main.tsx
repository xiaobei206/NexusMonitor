import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import WidgetCalendarWindow from './widget-calendar';
import './styles.css';
import './music-player.css';

const params = new URLSearchParams(window.location.search);
const isCalendarWindow = params.get('widget-calendar') === '1';
if (params.get('widget') === '1') document.documentElement.classList.add('widget-root');
if (isCalendarWindow) document.documentElement.classList.add('calendar-root');

type BoundaryState = { error: Error | null };
class RendererErrorBoundary extends React.Component<React.PropsWithChildren, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): BoundaryState { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('NexusMonitor renderer crashed while rendering', error, info.componentStack); }
  render() {
    if (this.state.error) return <main style={{minHeight:'100vh',boxSizing:'border-box',padding:'36px',background:'#0a1018',color:'#e8f1f8',fontFamily:'Segoe UI, sans-serif'}}>
      <h1 style={{color:'#ff7d87'}}>NexusMonitor 界面渲染失败</h1>
      <p>应用已捕获渲染异常，避免只显示空白底色。请保存下方错误信息用于修复。</p>
      <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',padding:'18px',background:'#121d29',borderRadius:'10px'}}>{this.state.error.stack || this.state.error.message}</pre>
    </main>;
    return this.props.children;
  }
}
function MainRendererReadySignal() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('widget') || new URLSearchParams(window.location.search).has('usb-display') || isCalendarWindow) return;
    let first = 0;
    let second = 0;
    first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => window.nexus.notifyMainRendererReady());
    });
    return () => { window.cancelAnimationFrame(first); if (second) window.cancelAnimationFrame(second); };
  }, []);
  return null;
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><><RendererErrorBoundary>{isCalendarWindow ? <WidgetCalendarWindow/> : <App/>}</RendererErrorBoundary><MainRendererReadySignal/></></React.StrictMode>,
);

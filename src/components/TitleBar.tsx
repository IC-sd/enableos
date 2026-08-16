import { CloudOff, Search, ShieldCheck, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';

export function TitleBar({ onSearch }: { onSearch: () => void }) {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return (
    <header className="titlebar field-masthead">
      <div className="titlebar-drag" aria-label="EnableOS">
        <strong>EnableOS</strong>
        <span className="masthead-slash">/</span>
        <span className="titlebar-subtitle">本地优先的工作空间</span>
      </div>
      <div className="browser-status">
        <button className="titlebar-search" onClick={onSearch}><Search size={14} /><span>搜索所有记录</span><kbd>Ctrl /</kbd></button>
        <span className="privacy-status"><ShieldCheck size={14} />浏览器本地优先</span>
        <span className={online ? 'online' : 'offline'}>{online ? <Wifi size={14} /> : <CloudOff size={14} />}{online ? 'ONLINE' : 'OFFLINE'}</span>
      </div>
    </header>
  );
}

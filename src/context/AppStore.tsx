import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Activity, AppDatabase } from '../../shared/models';
import { desktop } from '../lib/bridge';

interface ToastState {
  message: string;
  kind: 'success' | 'error' | 'info';
}

interface AppStoreValue {
  database: AppDatabase | null;
  loading: boolean;
  loadError: string;
  mutate: (recipe: (database: AppDatabase) => AppDatabase) => void;
  replaceDatabase: (database: AppDatabase) => boolean;
  addActivity: (activity: Activity) => void;
  toast: ToastState | null;
  notify: (message: string, kind?: ToastState['kind']) => void;
  isReadOnly: boolean;
  storagePersistent: boolean | null;
  lastSavedAt: string;
  requestPersistentStorage: () => Promise<boolean>;
  takeControl: () => void;
  reloadFromDisk: () => Promise<void>;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [database, setDatabase] = useState<AppDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const loadedRef = useRef(false);
  const pendingSaveRef = useRef<AppDatabase | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const readOnlyRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const tabIdRef = useRef(crypto.randomUUID());
  const leaseKey = 'enableos-writer-lease';

  const setReaderMode = useCallback((value: boolean) => {
    readOnlyRef.current = value;
    setIsReadOnly(value);
  }, []);

  const writeLease = useCallback(() => {
    localStorage.setItem(leaseKey, JSON.stringify({ tabId: tabIdRef.current, expiresAt: Date.now() + 9_000 }));
  }, []);

  const readLease = useCallback((): { tabId?: string; expiresAt?: number } | null => {
    try { return JSON.parse(localStorage.getItem(leaseKey) || 'null') as { tabId?: string; expiresAt?: number } | null; }
    catch { return null; }
  }, []);

  const acquireLease = useCallback((force = false) => {
    const current = readLease();
    const available = force || !current?.tabId || current.tabId === tabIdRef.current || Number(current.expiresAt) < Date.now();
    if (available) writeLease();
    setReaderMode(!available);
    return available;
  }, [readLease, setReaderMode, writeLease]);

  const reloadFromDisk = useCallback(async () => {
    const data = await desktop.data.load();
    pendingSaveRef.current = null;
    setDatabase(data);
    setLastSavedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    let alive = true;
    acquireLease(false);
    if ('storage' in navigator && navigator.storage.persisted) {
      void navigator.storage.persisted().then((value) => { if (alive) setStoragePersistent(value); }).catch(() => { if (alive) setStoragePersistent(null); });
    }
    desktop.data.load().then((data) => {
      if (!alive) return;
      setDatabase(data);
      loadedRef.current = true;
      setLoading(false);
    }).catch((error) => {
      if (alive) { setLoadError(error instanceof Error ? error.message : '无法读取浏览器数据'); setLoading(false); }
    });
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('enableos-workspace-sync') : null;
    channelRef.current = channel;
    channel?.addEventListener('message', (event: MessageEvent<{ type?: string; tabId?: string }>) => {
      if (event.data.tabId === tabIdRef.current) return;
      if (event.data.type === 'saved' && readOnlyRef.current) void reloadFromDisk();
      if (event.data.type === 'control-taken') setReaderMode(true);
      if (event.data.type === 'writer-released') acquireLease(false);
    });
    const reconcileLease = () => {
      const current = readLease();
      if (current?.tabId && current.tabId !== tabIdRef.current && Number(current.expiresAt) >= Date.now()) setReaderMode(true);
      else if (readOnlyRef.current) acquireLease(false);
      else writeLease();
    };
    const leaseTimer = window.setInterval(() => {
      reconcileLease();
    }, 3_000);
    const onStorage = (event: StorageEvent) => { if (event.key === leaseKey) reconcileLease(); };
    const release = () => {
      try {
        const lease = JSON.parse(localStorage.getItem(leaseKey) || 'null') as { tabId?: string } | null;
        if (lease?.tabId === tabIdRef.current) localStorage.removeItem(leaseKey);
      } catch { /* malformed leases are treated as expired */ }
      channel?.postMessage({ type: 'writer-released', tabId: tabIdRef.current });
    };
    window.addEventListener('beforeunload', release);
    window.addEventListener('storage', onStorage);
    return () => {
      alive = false;
      window.clearInterval(leaseTimer);
      window.removeEventListener('beforeunload', release);
      window.removeEventListener('storage', onStorage);
      release();
      channel?.close();
      channelRef.current = null;
    };
  }, [acquireLease, readLease, reloadFromDisk, setReaderMode, writeLease]);

  useEffect(() => {
    if (!database) return;
    const mode = database.settings.theme;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => { document.documentElement.dataset.theme = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode; };
    applyTheme();
    document.documentElement.dataset.compact = String(database.settings.compactMode);
    if (mode === 'system') media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [database?.settings.theme, database?.settings.compactMode]);

  const persist = useCallback((next: AppDatabase) => {
    if (readOnlyRef.current) return;
    pendingSaveRef.current = null;
    const save = () => desktop.data.save(next);
    const locks = (navigator as Navigator & { locks?: { request<T>(name: string, callback: () => Promise<T>): Promise<T> } }).locks;
    const operation = locks?.request ? locks.request('enableos-database-write', save) : save();
    void operation.then(() => {
      const savedAt = new Date().toISOString();
      setLastSavedAt(savedAt);
      channelRef.current?.postMessage({ type: 'saved', tabId: tabIdRef.current, savedAt });
    }).catch((error) => {
      setToast({ message: `本地保存失败：${error instanceof Error ? error.message : '未知错误'}`, kind: 'error' });
    });
  }, []);

  const scheduleSave = useCallback((next: AppDatabase) => {
    pendingSaveRef.current = next;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => { saveTimerRef.current = null; persist(next); }, 180);
  }, [persist]);

  useEffect(() => {
    const flush = (force = false) => {
      if ((!force && document.visibilityState !== 'hidden') || !pendingSaveRef.current) return;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      persist(pendingSaveRef.current);
    };
    const onVisibility = () => flush(false);
    const onPageHide = () => flush(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', onPageHide); flush(true); };
  }, [persist]);

  const mutate = useCallback((recipe: (current: AppDatabase) => AppDatabase) => {
    if (readOnlyRef.current) {
      setToast({ message: '另一个标签页正在编辑；当前页为只读，避免互相覆盖。', kind: 'info' });
      return;
    }
    setDatabase((current) => {
      if (!current) return current;
      const next = recipe(current);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const replaceDatabase = useCallback((next: AppDatabase) => {
    if (readOnlyRef.current) {
      setToast({ message: '当前标签页为只读，未覆盖工作区数据。', kind: 'info' });
      return false;
    }
    loadedRef.current = true;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    pendingSaveRef.current = null;
    setDatabase(next);
    persist(next);
    return true;
  }, [persist]);

  const addActivity = useCallback((item: Activity) => {
    mutate((current) => ({ ...current, activities: [item, ...current.activities].slice(0, 5000) }));
  }, [mutate]);

  const notify = useCallback((message: string, kind: ToastState['kind'] = 'success') => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ message, kind });
    toastTimerRef.current = window.setTimeout(() => { setToast(null); toastTimerRef.current = null; }, 2600);
  }, []);

  const requestPersistentStorage = useCallback(async () => {
    if (!navigator.storage?.persist) return false;
    const granted = await navigator.storage.persist();
    setStoragePersistent(granted);
    notify(granted ? '浏览器已允许长期保留此工作区数据' : '浏览器未授予长期保留；请定期导出加密备份', granted ? 'success' : 'info');
    return granted;
  }, [notify]);

  const takeControl = useCallback(() => {
    acquireLease(true);
    channelRef.current?.postMessage({ type: 'control-taken', tabId: tabIdRef.current });
    notify('当前标签页已取得编辑权；其他标签页将切换为只读。', 'success');
  }, [acquireLease, notify]);

  const value = useMemo(() => ({ database, loading, loadError, mutate, replaceDatabase, addActivity, toast, notify, isReadOnly, storagePersistent, lastSavedAt, requestPersistentStorage, takeControl, reloadFromDisk }), [database, loading, loadError, mutate, replaceDatabase, addActivity, toast, notify, isReadOnly, storagePersistent, lastSavedAt, requestPersistentStorage, takeControl, reloadFromDisk]);
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used inside AppStoreProvider');
  return value;
}

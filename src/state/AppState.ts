// ScreenVault — AppState — Tiny reactive pub/sub store

import { AppStatus, RecordingSession, StorageAccount, UploadProgress } from '../types';
import { ChromeStorageAdapter } from '../chrome-api/ChromeStorageAdapter';

type StateKey = 'status' | 'activeSession' | 'accounts' | 'uploadProgress';

type StateShape = {
  status: AppStatus;
  activeSession: RecordingSession | null;
  accounts: StorageAccount[];
  uploadProgress: UploadProgress | null;
};

class AppState {
  private state: StateShape = {
    status: 'idle',
    activeSession: null,
    accounts: [],
    uploadProgress: null
  };

  private listeners = new Map<StateKey, Set<(value: unknown) => void>>();
  private storage = new ChromeStorageAdapter();

  get<K extends StateKey>(key: K): StateShape[K] {
    return this.state[key];
  }

  set<K extends StateKey>(key: K, value: StateShape[K]): void {
    this.state[key] = value;
    
    // Notify subscribers
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach(cb => cb(value));
    }

    // Auto-persist specific keys
    if (key === 'status' || key === 'activeSession') {
      this.storage.set(key, value).catch(() => {}); // silent fail on persistence
    }
  }

  subscribe<K extends StateKey>(key: K, cb: (value: StateShape[K]) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    
    // Type checking bypass for generalized storage
    const listenersSet = this.listeners.get(key)!;
    const typedCb = cb as (value: unknown) => void;
    
    listenersSet.add(typedCb);

    return () => {
      listenersSet.delete(typedCb);
    };
  }

  async hydrate(): Promise<void> {
    try {
      const storedStatus = await this.storage.get<AppStatus>('status');
      if (storedStatus) this.state.status = storedStatus;

      const storedSession = await this.storage.get<RecordingSession>('activeSession');
      if (storedSession) this.state.activeSession = storedSession;

      // Reset invalid states
      if (this.state.status === 'recording' && !this.state.activeSession) {
        this.state.status = 'idle';
      }
    } catch {
      // Ignored
    }
  }
}

export const appState = new AppState();

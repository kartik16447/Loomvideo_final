// ScreenVault — SyncAdapter — Extensibility Stub

import { RecordingSession } from '../types';

export interface SyncAdapter {
  syncSession(session: RecordingSession): Promise<void>;
  getSessionHistory(limit?: number): Promise<RecordingSession[]>;
  deleteSession(id: string): Promise<void>;
}

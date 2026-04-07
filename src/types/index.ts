// ScreenVault — Shared Types — Defines core interfaces and types used across all modules.

import { SerializedError } from './errors';

export type AppStatus =
  | 'idle'
  | 'tab-select'
  | 'recording'
  | 'processing'
  | 'uploading'
  | 'success'
  | 'error';

export interface RecordingTarget {
  type: 'tab' | 'window' | 'screen';
  tabId?: number;
  tabTitle?: string;
  tabFavicon?: string;
}

export interface RecordingSession {
  id: string;                    // crypto.randomUUID()
  startedAt: number;             // unix ms
  target: RecordingTarget;
  status: AppStatus;
  durationMs?: number;
  fileSizeBytes?: number;
  uploadUrl?: string;
  uploadedToAccountId?: string;
  error?: SerializedError;       // plain object (AppError is not serializable via postMessage)
}

export interface StorageAccount {
  id: string;
  provider: 'google-drive' | 's3' | 'dropbox' | 'r2';
  email: string;
  displayName: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  lastUsedAt?: number;
  uploadSuccessCount: number;
  uploadFailureCount: number;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  accountId?: string;
  error?: SerializedError;
}

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  accountId: string;
}

export interface RouterDecision {
  account: StorageAccount;
  reason: string;
}

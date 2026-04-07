// ScreenVault — StorageAdapter — Interface Contract

import { StorageAccount, UploadProgress, UploadResult } from '../types';

export interface IStorageAdapter {
  /**
   * Upload a blob. Report progress via onProgress.
   * Must return a publicly shareable URL on success.
   */
  upload(
    file: Blob,
    fileName: string,
    accountId: string,
    onProgress: (progress: UploadProgress) => void
  ): Promise<UploadResult>;

  /** Return free bytes. Return 0 on any error — never throw. */
  getAvailableSpaceBytes(account: StorageAccount): Promise<number>;

  /** Fetch quota from provider and update account object in-place. */
  refreshQuota(account: StorageAccount): Promise<void>;

  /** Return false if token is expired AND refresh fails. Never throw. */
  isAvailable(account: StorageAccount): Promise<boolean>;

  /** Silently refresh OAuth token. Return updated account. */
  refreshToken(account: StorageAccount): Promise<StorageAccount>;
}

// ScreenVault — DropboxAdapter — Phase 3 stub

import { StorageAccount, UploadProgress, UploadResult } from '../../types';
import { IStorageAdapter } from '../StorageAdapter';

export class DropboxAdapter implements IStorageAdapter {
  async upload(file: Blob, fileName: string, accountId: string, onProgress: (progress: UploadProgress) => void): Promise<UploadResult> {
    return { success: false, error: { code: 'UPLOAD_NETWORK_ERROR', message: 'Not implemented', recoverable: false } };
  }
  async getAvailableSpaceBytes(account: StorageAccount): Promise<number> { return 0; }
  async refreshQuota(account: StorageAccount): Promise<void> {}
  async isAvailable(account: StorageAccount): Promise<boolean> { return false; }
  async refreshToken(account: StorageAccount): Promise<StorageAccount> { return account; }
}

// ScreenVault — MockStorageAdapter — For testing and local development

import { StorageAccount, UploadProgress, UploadResult } from '../../types';
import { IStorageAdapter } from '../StorageAdapter';

export interface MockOptions {
  simulateFailure?: boolean;
  simulatedDelayMs?: number;
  fakeUrl?: string;
}

export class MockStorageAdapter implements IStorageAdapter {
  constructor(private options: MockOptions = {}) {}

  async upload(
    file: Blob,
    fileName: string,
    accountId: string,
    onProgress: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const totalBytes = file.size || 1024; // fallback for empty blobs
    const delay = this.options.simulatedDelayMs ?? 2000;
    const chunks = 10;
    const chunkDelay = delay / chunks;

    for (let i = 1; i <= chunks; i++) {
      await new Promise((r) => setTimeout(r, chunkDelay));
      
      onProgress({
        uploadedBytes: (totalBytes / chunks) * i,
        totalBytes,
        percent: i * 10,
        accountId,
      });

      if (this.options.simulateFailure && i === chunks / 2) {
        return { 
          success: false, 
          error: { code: 'UPLOAD_NETWORK_ERROR', message: 'Simulated failure in mock adapter', recoverable: true } 
        };
      }
    }

    return {
      success: true,
      url: chrome.runtime.getURL('dist/ui/player/player.html'),
      accountId,
    };
  }

  async getAvailableSpaceBytes(account: StorageAccount): Promise<number> {
    // Return 10GB free
    return 10 * 1024 * 1024 * 1024;
  }

  async refreshQuota(account: StorageAccount): Promise<void> {
    account.storageQuotaBytes = 15 * 1024 * 1024 * 1024;
    account.storageUsedBytes = 5 * 1024 * 1024 * 1024;
  }

  async isAvailable(account: StorageAccount): Promise<boolean> {
    return !this.options.simulateFailure;
  }

  async refreshToken(account: StorageAccount): Promise<StorageAccount> {
    return account;
  }
}

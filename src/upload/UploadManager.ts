// ScreenVault — UploadManager — Orchestrates upload lifecycle

import { RecordingSession, UploadProgress, UploadResult } from '../types';
import { AppError } from '../types/errors';
import { IStorageAdapter } from '../storage/StorageAdapter';
import { AccountManager } from '../accounts/AccountManager';
import { SmartUploadRouter } from '../router/SmartUploadRouter';
import { logger } from '../logger/logger';

export class UploadManager {
  constructor(
    private accountManager: AccountManager,
    private router: SmartUploadRouter,
    private adapters: Record<string, IStorageAdapter>
  ) {}

  async upload(
    blob: Blob,
    session: RecordingSession,
    onProgress: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    logger.info('UploadManager', 'UPLOAD_START', { sessionId: session.id, sizeBytes: blob.size });

    try {
      const accounts = await this.accountManager.getAccounts();
      if (accounts.length === 0) {
        throw new AppError('UPLOAD_NO_ACCOUNTS', 'No connected accounts', false);
      }

      // Phase 1: Simple routing
      const decision = this.router.route(accounts, blob.size);
      logger.info('UploadManager', 'ROUTING_DECISION', { accountId: decision.account.id, reason: decision.reason });

      const dateStr = new Date(session.startedAt).toISOString().split('T')[0];
      const fileName = `screenvault-${session.id.slice(0, 8)}-${dateStr}.webm`;

      // Phase 1: Linear upload (no retry loop here yet)
      const adapter = this.adapters[decision.account.provider] || this.adapters['google-drive'];
      if (!adapter) throw new AppError('UPLOAD_NETWORK_ERROR', 'No adapter for provider', false);
      
      const result = await adapter.upload(blob, fileName, decision.account.id, onProgress);
      
      if (result.success) {
        decision.account.uploadSuccessCount++;
        decision.account.lastUsedAt = Date.now();
        await this.accountManager.updateAccount(decision.account);
      } else {
        decision.account.uploadFailureCount++;
        await this.accountManager.updateAccount(decision.account);
      }

      return result;
    } catch (e: any) {
      logger.error('UploadManager', 'UPLOAD_ERROR', { error: e.message });
      if (e instanceof AppError) {
        return { success: false, error: e.toJSON() };
      }
      return { success: false, error: new AppError('UPLOAD_NETWORK_ERROR', e.message, true).toJSON() };
    }
  }
}

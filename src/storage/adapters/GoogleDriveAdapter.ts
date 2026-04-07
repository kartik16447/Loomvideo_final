// ScreenVault — GoogleDriveAdapter — Direct upload to Google Drive

import { StorageAccount, UploadProgress, UploadResult } from '../../types';
import { IStorageAdapter } from '../StorageAdapter';
import { IIdentityAdapter } from '../../chrome-api/ChromeIdentityAdapter';
import { logger } from '../../logger/logger';

export class GoogleDriveAdapter implements IStorageAdapter {
  constructor(private identityAdapter: IIdentityAdapter) {}

  async upload(
    file: Blob,
    fileName: string,
    accountId: string,
    onProgress: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    logger.info('GoogleDriveAdapter', 'UPLOAD_STARTED', { fileName, size: file.size, accountId });

    try {
      const token = await this.identityAdapter.getAuthToken({ interactive: false });
      
      const metadata = {
        name: fileName,
        mimeType: file.type || 'video/webm'
      };

      const boundary = '-------screenvault_boundary_3141592653589';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";

      onProgress({ uploadedBytes: 0, totalBytes: file.size, percent: 0, accountId });

      const fileBuffer = await file.arrayBuffer();

      const blobData = new Blob([
        delimiter,
        'Content-Type: application/json; charset=UTF-8\r\n\r\n',
        JSON.stringify(metadata),
        delimiter,
        'Content-Type: ' + metadata.mimeType + '\r\n\r\n',
        fileBuffer,
        close_delim
      ], { type: 'multipart/related; boundary=' + boundary });

      // PHASE 2: resumable uploads for large limits
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: blobData
      });

      if (response.status === 401) {
        await this.identityAdapter.removeCachedAuthToken(token);
        logger.warn('GoogleDriveAdapter', 'TOKEN_EXPIRED', { token: token.substring(0, 8) + '...' });
        return { success: false, error: { code: 'UPLOAD_TOKEN_EXPIRED', message: 'Token expired', recoverable: true } };
      }

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      onProgress({ uploadedBytes: file.size, totalBytes: file.size, percent: 100, accountId });

      const result = await response.json();
      const fileId = result.id;

      // Set permissions to anyone reader
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'anyone', role: 'reader' })
      });

      // Fetch shareable link
      const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const fileData = await fileResponse.json();

      logger.info('GoogleDriveAdapter', 'UPLOAD_COMPLETE', { fileId, accountId });

      return {
        success: true,
        url: fileData.webViewLink,
        accountId
      };

    } catch (error: any) {
      logger.error('GoogleDriveAdapter', 'UPLOAD_ERROR', { message: error.message });
      return {
        success: false,
        error: { code: 'UPLOAD_NETWORK_ERROR', message: error.message, recoverable: true }
      };
    }
  }

  async getAvailableSpaceBytes(account: StorageAccount): Promise<number> {
    logger.debug('GoogleDriveAdapter', 'GET_SPACE', { accountId: account.id });
    try {
      const token = await this.identityAdapter.getAuthToken({ interactive: false });
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return 0;
      
      const data = await response.json();
      const quota = data.storageQuota;
      if (!quota) return 0;
      
      return parseInt(quota.limit, 10) - parseInt(quota.usage, 10);
    } catch {
      return 0;
    }
  }

  async refreshQuota(account: StorageAccount): Promise<void> {
    try {
      const token = await this.identityAdapter.getAuthToken({ interactive: false });
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const quota = data.storageQuota;
        if (quota) {
          account.storageQuotaBytes = parseInt(quota.limit, 10) || 0;
          account.storageUsedBytes = parseInt(quota.usage, 10) || 0;
        }
      }
    } catch (e) {
      logger.error('GoogleDriveAdapter', 'REFRESH_QUOTA_FAILED', { accountId: account.id });
    }
  }

  async isAvailable(account: StorageAccount): Promise<boolean> {
    try {
      await this.identityAdapter.getAuthToken({ interactive: false });
      return true;
    } catch {
      return false;
    }
  }

  async refreshToken(account: StorageAccount): Promise<StorageAccount> {
    try {
      const token = await this.identityAdapter.getAuthToken({ interactive: false });
      account.accessToken = token;
    } catch (e) {
      logger.warn('GoogleDriveAdapter', 'REFRESH_TOKEN_FAILED', { accountId: account.id });
    }
    return account;
  }
}

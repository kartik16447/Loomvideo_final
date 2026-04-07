// ScreenVault — AccountManager — Manages connected cloud accounts

import { StorageAccount } from '../types';
import { IChromeStorageAdapter } from '../chrome-api/ChromeStorageAdapter';
import { IIdentityAdapter } from '../chrome-api/ChromeIdentityAdapter';
import { IStorageAdapter } from '../storage/StorageAdapter';
import { logger } from '../logger/logger';

export class AccountManager {
  constructor(
    private chromeStorage: IChromeStorageAdapter,
    private identityAdapter: IIdentityAdapter,
    private cloudStorageAdapter: IStorageAdapter
  ) {}

  async connectAccount(): Promise<StorageAccount> {
    logger.info('AccountManager', 'CONNECT_START');
    
    const token = await this.identityAdapter.getAuthToken({ interactive: true });
    const profile = await this.identityAdapter.getProfileUserInfo();
    
    if (!profile.email) {
      throw new Error('Could not get profile email from Chrome Identity');
    }

    const accountId = `google-drive-${profile.id || profile.email}`;

    const newAccount: StorageAccount = {
      id: accountId,
      provider: 'google-drive',
      email: profile.email,
      displayName: profile.email.split('@')[0] || profile.email,
      accessToken: token,
      refreshToken: '', // Handled seamlessly by chrome.identity in Phase 1
      tokenExpiresAt: Date.now() + 3600 * 1000,
      storageQuotaBytes: 0,
      storageUsedBytes: 0,
      uploadSuccessCount: 0,
      uploadFailureCount: 0
    };

    // Phase 1: Call refreshQuota synchronously
    await this.cloudStorageAdapter.refreshQuota(newAccount);
    
    await this.updateAccount(newAccount);
    logger.info('AccountManager', 'CONNECT_SUCCESS', { accountId });
    return newAccount;
  }

  async connectMockAccount(): Promise<StorageAccount> {
    logger.info('AccountManager', 'CONNECT_MOCK');
    const mockId = `mock-${Math.floor(Math.random()*1000)}`;
    const mock: StorageAccount = {
      id: mockId,
      provider: 'mock' as any, // Bypass enum for debug
      email: 'debug@screenvault.local',
      displayName: 'Mock Debug User',
      accessToken: 'fake-token',
      refreshToken: 'fake-refresh',
      tokenExpiresAt: Date.now() + 99999999,
      storageQuotaBytes: 15 * 1024 * 1024 * 1024,
      storageUsedBytes: 1 * 1024 * 1024 * 1024,
      uploadSuccessCount: 0,
      uploadFailureCount: 0
    };
    await this.updateAccount(mock);
    return mock;
  }

  async disconnectAccount(id: string): Promise<void> {
    logger.info('AccountManager', 'DISCONNECT', { id });
    const accounts = await this.getAccounts();
    const filtered = accounts.filter(a => a.id !== id);
    await this.chromeStorage.set('accounts', filtered);
  }

  async getAccounts(): Promise<StorageAccount[]> {
    const accounts = await this.chromeStorage.get<StorageAccount[]>('accounts');
    return accounts || [];
  }

  async getAccountById(id: string): Promise<StorageAccount | null> {
    const accounts = await this.getAccounts();
    return accounts.find(a => a.id === id) || null;
  }

  async updateAccount(account: StorageAccount): Promise<void> {
    const accounts = await this.getAccounts();
    const index = accounts.findIndex(a => a.id === account.id);
    
    if (index >= 0) {
      accounts[index] = account;
    } else {
      accounts.push(account);
    }
    
    await this.chromeStorage.set('accounts', accounts);
  }

  async refreshAllQuotas(): Promise<void> {
    logger.info('AccountManager', 'REFRESH_QUOTAS_START');
    const accounts = await this.getAccounts();
    for (const acc of accounts) {
      await this.cloudStorageAdapter.refreshQuota(acc);
      await this.updateAccount(acc);
    }
  }
}

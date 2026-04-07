// ScreenVault — AccountBadge — Generates DOM for a connected account row

import { StorageAccount } from '../../types';

export function createAccountBadge(account: StorageAccount): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'account-item';
  
  let freeText = "Quota unknown";
  if (account.storageQuotaBytes > 0) {
    const freeBytes = account.storageQuotaBytes - account.storageUsedBytes;
    const freeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);
    freeText = `${freeGB} GB free`;
  }

  div.innerHTML = `
    <div class="account-status-dot"></div>
    <div class="account-email">${account.email}</div>
    <div class="account-space">${freeText}</div>
  `;
  
  return div;
}

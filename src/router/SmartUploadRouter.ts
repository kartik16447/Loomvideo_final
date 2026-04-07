// ScreenVault — SmartUploadRouter — Phase 1 Stub

import { StorageAccount, RouterDecision } from '../types';
import { AppError } from '../types/errors';

export class SmartUploadRouter {
  // PHASE 1 STUB: Return the first available account.
  // PHASE 2: Implement full scoring algorithm based on reliability, freeScore, recencyBonus.
  route(accounts: StorageAccount[], fileSizeBytes: number): RouterDecision {
    if (!accounts || accounts.length === 0) {
      throw new AppError('ROUTER_NO_ELIGIBLE_ACCOUNTS', 'No accounts available', false);
    }
    return {
      account: accounts[0]!,
      reason: "Phase 1 Bypass: Returning first available account."
    };
  }
}

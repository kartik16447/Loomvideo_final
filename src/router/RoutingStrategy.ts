// ScreenVault — RoutingStrategy — Extensibility Stub

import { StorageAccount } from '../types';

export interface RoutingContext {
  userRegion?: string;
  networkType?: 'wifi' | 'cellular' | 'ethernet';
  prioritizeCost?: boolean;
}

export interface RoutingStrategy {
  name: string;
  score(account: StorageAccount, fileSizeBytes: number, context: RoutingContext): number;
}

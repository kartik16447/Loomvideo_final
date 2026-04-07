// ScreenVault — CompressionModule — Pass-through for Phase 1

import { logger } from '../logger/logger';

export interface ICompressionModule {
  compress(blob: Blob, sessionId: string): Promise<Blob>;
}

export class CompressionModule implements ICompressionModule {
  async compress(blob: Blob, sessionId: string): Promise<Blob> {
    // PHASE 1: Pass-through
    // PHASE 3 upgrade: Implement FFmpeg WASM / AV1 transcoding here
    logger.info('CompressionModule', 'SKIP_COMPRESSION_PHASE1', { sessionId, sizeBytes: blob.size });
    return blob;
  }
}

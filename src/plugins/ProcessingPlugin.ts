// ScreenVault — ProcessingPlugin — Extensibility Stub

import { RecordingSession } from '../types';

export interface ProcessingPlugin {
  name: string;
  version: string;
  process(blob: Blob, session: RecordingSession): Promise<Blob>;
}

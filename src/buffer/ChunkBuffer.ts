// ScreenVault — ChunkBuffer — Phase 3 stub

export interface IChunkBuffer {
  write(sessionId: string, index: number, chunk: Blob): Promise<void>;
  readAll(sessionId: string): Promise<Blob[]>;
  assembleBlob(sessionId: string, mimeType: string): Promise<Blob>;
  getTotalSizeBytes(sessionId: string): Promise<number>;
  clear(sessionId: string): Promise<void>;
}

export class ChunkBuffer implements IChunkBuffer {
  // PHASE 3: Replace in-memory Map with IndexedDB writes for large recordings
  private memoryMap = new Map<string, Blob[]>();

  async write(sessionId: string, index: number, chunk: Blob): Promise<void> {
    if (!this.memoryMap.has(sessionId)) {
      this.memoryMap.set(sessionId, []);
    }
    this.memoryMap.get(sessionId)![index] = chunk;
  }

  async readAll(sessionId: string): Promise<Blob[]> {
    return this.memoryMap.get(sessionId) || [];
  }

  async assembleBlob(sessionId: string, mimeType: string): Promise<Blob> {
    const chunks = await this.readAll(sessionId);
    return new Blob(chunks, { type: mimeType });
  }

  async getTotalSizeBytes(sessionId: string): Promise<number> {
    const chunks = await this.readAll(sessionId);
    return chunks.reduce((acc, chunk) => acc + chunk.size, 0);
  }

  async clear(sessionId: string): Promise<void> {
    this.memoryMap.delete(sessionId);
  }
}

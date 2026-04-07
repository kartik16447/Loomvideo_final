// ScreenVault — RecorderModule — Screen + mic capture (Offscreen only)

import { RecordingTarget } from '../types';
import { RecorderConfig, DEFAULT_CONFIG } from './RecorderConfig';
import { ITabsAdapter } from '../chrome-api/ChromeTabsAdapter';
import { logger } from '../logger/logger';

export class RecorderModule {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startTime: number = 0;
  private stopResolve: ((blob: Blob) => void) | null = null;

  constructor(private tabsAdapter: ITabsAdapter) {}

  async start(target: RecordingTarget, config: RecorderConfig = DEFAULT_CONFIG): Promise<void> {
    logger.info('RecorderModule', 'START', { target });
    
    let screenStream: MediaStream;
    const audioContext = new globalThis.AudioContext();

    try {
      if (target.type === 'tab') {
        if (!target.tabId) throw new Error('tabId is required for tab recording');
        const streamId = await this.tabsAdapter.getMediaStreamId(target.tabId);
        screenStream = await navigator.mediaDevices.getUserMedia({
          video: {
            mandatory: {
              chromeMediaSource: 'tab',
              chromeMediaSourceId: streamId
            }
          } as any
        });
      } else {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: config.frameRate },
          audio: true // Attempt to get system audio
        });
      }

      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e: any) {
        logger.warn('RecorderModule', 'MIC_UNAVAILABLE', { error: e.message });
      }

      const destination = audioContext.createMediaStreamDestination();

      if (screenStream.getAudioTracks().length > 0) {
        audioContext.createMediaStreamSource(screenStream).connect(destination);
      }

      if (micStream && micStream.getAudioTracks().length > 0) {
        audioContext.createMediaStreamSource(micStream).connect(destination);
      }

      const combinedTracks = [
        ...screenStream.getVideoTracks(),
        ...destination.stream.getAudioTracks()
      ];

      const mergedStream = new MediaStream(combinedTracks);

      this.mediaRecorder = new MediaRecorder(mergedStream, {
        mimeType: config.mimeType,
        videoBitsPerSecond: config.videoBitsPerSecond,
        audioBitsPerSecond: config.audioBitsPerSecond
      });

      this.chunks = [];
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data);
          logger.debug('RecorderModule', 'CHUNK_RECEIVED', { size: e.data.size, totalChunks: this.chunks.length });
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: config.mimeType });
        logger.info('RecorderModule', 'RECORDING_STOPPED', { 
            totalChunks: this.chunks.length, 
            finalSize: blob.size,
            mimeType: blob.type 
        });
        if (this.stopResolve) {
          this.stopResolve(blob);
          this.stopResolve = null;
        }
      };

      this.mediaRecorder.start(config.timesliceMs);
      this.startTime = Date.now();
      logger.info('RecorderModule', 'MEDIA_RECORDER_STARTED');

    } catch (e: any) {
      logger.error('RecorderModule', 'START_FAILED', { error: e.message });
      throw e;
    }
  }

  async stop(): Promise<Blob> {
    logger.info('RecorderModule', 'STOP');
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      throw new Error('Not recording');
    }

    return new Promise((resolve) => {
      this.stopResolve = resolve;
      this.mediaRecorder!.stop();
      this.mediaRecorder!.stream.getTracks().forEach(t => t.stop());
    });
  }

  getElapsedMs(): number {
    return this.startTime ? Date.now() - this.startTime : 0;
  }
}

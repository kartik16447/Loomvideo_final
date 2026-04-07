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

  constructor(private tabsAdapter: ITabsAdapter) {
    logger.debug('RecorderModule', 'INSTANTIATED');
  }

  async start(target: RecordingTarget, config: RecorderConfig = DEFAULT_CONFIG, streamId?: string): Promise<void> {
    logger.info('RecorderModule', 'START_CALLED', {
      targetType: target.type,
      hasStreamId: !!streamId,
      streamIdPrefix: streamId?.substring(0, 20),
      mimeType: config.mimeType,
      videoBitsPerSecond: config.videoBitsPerSecond,
      frameRate: config.frameRate,
    });

    let screenStream: MediaStream | null = null;
    const audioContext = new globalThis.AudioContext();
    logger.debug('RecorderModule', 'AUDIO_CONTEXT_STATE', { state: audioContext.state });

    try {
      if (streamId) {
        logger.info('RecorderModule', 'ATTEMPTING_CASCADED_CAPTURE', { streamId: streamId.substring(0, 30) });
        
        const tryCapture = async (sourceType: 'desktop' | 'tab', withAudio: boolean) => {
          logger.debug('RecorderModule', `TRYING_CAPTURE_MODE:${sourceType}`, { withAudio });
          
          // Hybrid constraints: Pass both modern (top-level) and legacy (mandatory) formats
          // This is a "Hammer strategy" to catch all Chrome versions
          const constraints: any = {
            video: {
              chromeMediaSource: sourceType,
              chromeMediaSourceId: streamId,
              mandatory: {
                chromeMediaSource: sourceType,
                chromeMediaSourceId: streamId
              }
            } as any
          };

          if (withAudio) {
            constraints.audio = {
              chromeMediaSource: sourceType,
              chromeMediaSourceId: streamId,
              mandatory: {
                chromeMediaSource: sourceType,
                chromeMediaSourceId: streamId
              }
            } as any;
          }
          
          try {
            return await navigator.mediaDevices.getUserMedia(constraints);
          } catch (e: any) {
             logger.warn('RecorderModule', `GUM_EXCEPTION:${sourceType}`, { 
               name: e.name, 
               message: e.message, 
               withAudio 
             });
             throw e;
          }
        };

        // Try Sequence:
        // 1. Desktop mode (Full Screen/Window) with Audio
        // 2. Desktop mode Video only
        // 3. Tab mode (Chrome Tab selected in picker) with Audio
        // 4. Tab mode Video only
        try {
          screenStream = await tryCapture('desktop', true);
          logger.info('RecorderModule', 'CAPTURE_SUCCESS:DESKTOP_AV');
        } catch (e1) {
          logger.warn('RecorderModule', 'CAPTURE_FAIL:DESKTOP_AV', { error: (e1 as Error).message });
          try {
            screenStream = await tryCapture('desktop', false);
            logger.info('RecorderModule', 'CAPTURE_SUCCESS:DESKTOP_VIDEO_ONLY');
          } catch (e2) {
            logger.warn('RecorderModule', 'CAPTURE_FAIL:DESKTOP_VIDEO', { error: (e2 as Error).message });
            try {
              screenStream = await tryCapture('tab', true);
              logger.info('RecorderModule', 'CAPTURE_SUCCESS:TAB_AV');
            } catch (e3) {
              logger.warn('RecorderModule', 'CAPTURE_FAIL:TAB_AV', { error: (e3 as Error).message });
              try {
                screenStream = await tryCapture('tab', false);
                logger.info('RecorderModule', 'CAPTURE_SUCCESS:TAB_VIDEO_ONLY');
              } catch (e4) {
                logger.error('RecorderModule', 'CAPTURE_ALL_MODES_FAILED', { error: (e4 as Error).message });
                throw e4; // Re-throw last failure
              }
            }
          }
        }
      } else if (target.type === 'tab') {
        logger.info('RecorderModule', 'PATH:TAB_CAPTURE', { tabId: target.tabId });
        if (!target.tabId) throw new Error('tabId is required for tab recording');
        const internalStreamId = await this.tabsAdapter.getMediaStreamId(target.tabId);
        logger.debug('RecorderModule', 'TAB_STREAM_ID_ACQUIRED', { internalStreamId: internalStreamId.substring(0,20) });
        screenStream = await navigator.mediaDevices.getUserMedia({
          video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: internalStreamId } } as any
        });
        logger.info('RecorderModule', 'TAB_STREAM_OK', {
          videoTracks: screenStream.getVideoTracks().length,
          audioTracks: screenStream.getAudioTracks().length,
        });

      } else {
        logger.info('RecorderModule', 'PATH:DISPLAY_MEDIA_FALLBACK');
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: config.frameRate },
          audio: true
        });
        logger.info('RecorderModule', 'DISPLAY_MEDIA_OK', {
          videoTracks: screenStream.getVideoTracks().length,
          audioTracks: screenStream.getAudioTracks().length,
        });
      }

      if (!screenStream) throw new Error('Failed to acquire screen stream — null returned');

      // Ensure AudioContext is running
      if (audioContext.state === 'suspended') {
        logger.debug('RecorderModule', 'RESUMING_AUDIO_CONTEXT');
        await audioContext.resume();
      }
      logger.debug('RecorderModule', 'AUDIO_CONTEXT_READY', { state: audioContext.state });

      // Mic
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        logger.info('RecorderModule', 'MIC_ACQUIRED', { tracks: micStream.getAudioTracks().length });
      } catch (e: any) {
        logger.warn('RecorderModule', 'MIC_UNAVAILABLE', { error: e.message });
      }

      const destination = audioContext.createMediaStreamDestination();

      const screenAudioTracks = screenStream.getAudioTracks();
      const micAudioTracks = micStream?.getAudioTracks() ?? [];
      logger.debug('RecorderModule', 'AUDIO_ROUTING', {
        screenAudioTracks: screenAudioTracks.length,
        micAudioTracks: micAudioTracks.length,
      });

      if (screenAudioTracks.length > 0) {
        audioContext.createMediaStreamSource(screenStream).connect(destination);
      }
      if (micStream && micAudioTracks.length > 0) {
        audioContext.createMediaStreamSource(micStream).connect(destination);
      }

      const combinedTracks = [
        ...screenStream.getVideoTracks(),
        ...destination.stream.getAudioTracks()
      ];
      logger.debug('RecorderModule', 'COMBINED_TRACKS', { videoTracks: screenStream.getVideoTracks().length, audioOutTracks: destination.stream.getAudioTracks().length });

      const mergedStream = new MediaStream(combinedTracks);

      // Check codec support
      const isSupported = MediaRecorder.isTypeSupported(config.mimeType);
      logger.debug('RecorderModule', 'CODEC_SUPPORT', { mimeType: config.mimeType, supported: isSupported });

      this.mediaRecorder = new MediaRecorder(mergedStream, {
        mimeType: config.mimeType,
        videoBitsPerSecond: config.videoBitsPerSecond,
        audioBitsPerSecond: config.audioBitsPerSecond
      });

      logger.info('RecorderModule', 'MEDIA_RECORDER_CREATED', {
        state: this.mediaRecorder.state,
        mimeType: this.mediaRecorder.mimeType,
      });

      this.chunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data);
          logger.debug('RecorderModule', 'CHUNK_RECEIVED', {
            chunkSize: e.data.size,
            totalChunks: this.chunks.length,
            totalBytes: this.chunks.reduce((s, b) => s + b.size, 0)
          });
        } else {
          logger.warn('RecorderModule', 'EMPTY_CHUNK', { size: e.data?.size ?? 0 });
        }
      };

      this.mediaRecorder.onerror = (e: Event) => {
        logger.error('RecorderModule', 'MEDIA_RECORDER_ERROR', { error: String(e) });
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: config.mimeType });
        logger.info('RecorderModule', 'RECORDER_STOPPED', {
          totalChunks: this.chunks.length,
          finalBlobSize: blob.size,
          mimeType: blob.type,
        });
        if (blob.size === 0) {
          logger.error('RecorderModule', 'ZERO_BYTE_BLOB', { chunks: this.chunks.length });
        }
        if (this.stopResolve) {
          this.stopResolve(blob);
          this.stopResolve = null;
        }
      };

      this.mediaRecorder.start(config.timesliceMs);
      this.startTime = Date.now();
      logger.info('RecorderModule', 'MEDIA_RECORDER_STARTED', {
        timesliceMs: config.timesliceMs,
        state: this.mediaRecorder.state,
      });

    } catch (e: any) {
      logger.error('RecorderModule', 'START_FAILED', { error: e.message, stack: e.stack });
      throw e;
    }
  }

  async stop(): Promise<Blob> {
    logger.info('RecorderModule', 'STOP_CALLED', {
      recorderState: this.mediaRecorder?.state ?? 'null',
      chunksCollected: this.chunks.length,
      elapsedMs: this.getElapsedMs(),
    });

    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      logger.error('RecorderModule', 'STOP_FAILED_NOT_RECORDING', { state: this.mediaRecorder?.state });
      throw new Error('Not recording');
    }

    return new Promise((resolve) => {
      this.stopResolve = resolve;
      this.mediaRecorder!.stop();
      this.mediaRecorder!.stream.getTracks().forEach(t => {
        logger.debug('RecorderModule', 'TRACK_STOPPED', { kind: t.kind, label: t.label });
        t.stop();
      });
    });
  }

  getElapsedMs(): number {
    return this.startTime ? Date.now() - this.startTime : 0;
  }
}

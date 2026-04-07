// ScreenVault — Offscreen Document — Dedicated MediaRecorder environment

import { RecorderModule } from '../recorder/RecorderModule';
import { ChromeTabsAdapter } from '../chrome-api/ChromeTabsAdapter';
import { DEFAULT_CONFIG } from '../recorder/RecorderConfig';
import { logger } from '../logger/logger';

logger.info('Offscreen', 'OFFSCREEN_LOADED');

const tabsAdapter = new ChromeTabsAdapter();
const recorder = new RecorderModule(tabsAdapter);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  logger.debug('Offscreen', `MSG_IN:${message.type}`, { hasStreamId: !!message.streamId });

  (async () => {
    switch (message.type) {
      case 'START_RECORDING':
        try {
          logger.info('Offscreen', 'START_RECORDING_RECEIVED', {
            targetType: message.recordingTarget?.type,
            hasStreamId: !!message.streamId,
            streamIdPrefix: message.streamId?.substring(0, 20)
          });
          await recorder.start(message.recordingTarget, message.config || DEFAULT_CONFIG, message.streamId);
          logger.info('Offscreen', 'START_RECORDING_SUCCESS');
          sendResponse({ success: true });
        } catch (e: any) {
          logger.error('Offscreen', 'START_RECORDING_FAILED', { error: e.message, stack: e.stack });
          sendResponse({ success: false, error: e.message });
        }
        break;

      case 'STOP_RECORDING':
        try {
          logger.info('Offscreen', 'STOP_RECORDING_RECEIVED');
          const blob = await recorder.stop();
          logger.info('Offscreen', 'RECORDER_STOPPED', { blobSize: blob.size, mimeType: blob.type });

          const buffer = await blob.arrayBuffer();
          logger.info('Offscreen', 'BUFFER_CONVERTED', { byteLength: buffer.byteLength });
          
          // Send blob ArrayBuffer back to Service Worker
          chrome.runtime.sendMessage({
            type: 'RECORDING_COMPLETE',
            buffer: ArrayBuffer.isView(buffer) ? buffer.buffer : buffer,
            mimeType: blob.type,
            size: blob.size
          });
          
          logger.info('Offscreen', 'RECORDING_COMPLETE_SENT');
          sendResponse({ success: true });
        } catch (e: any) {
          logger.error('Offscreen', 'STOP_RECORDING_FAILED', { error: e.message, stack: e.stack });
          sendResponse({ success: false, error: e.message });
        }
        break;
      
      default:
        logger.warn('Offscreen', 'UNKNOWN_MESSAGE', { type: message.type });
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  })();

  return true; // Keep channel alive for async
});

// ScreenVault — Offscreen Document — Dedicated MediaRecorder environment

import { RecorderModule } from '../recorder/RecorderModule';
import { ChromeTabsAdapter } from '../chrome-api/ChromeTabsAdapter';
import { DEFAULT_CONFIG } from '../recorder/RecorderConfig';
import { logger } from '../logger/logger';

const tabsAdapter = new ChromeTabsAdapter();
const recorder = new RecorderModule(tabsAdapter);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  (async () => {
    switch (message.type) {
      case 'START_RECORDING':
        try {
          await recorder.start(message.recordingTarget, message.config || DEFAULT_CONFIG, message.streamId);
          sendResponse({ success: true });
        } catch (e: any) {
          logger.error('Offscreen', 'START_ERROR', { error: e.message });
          sendResponse({ success: false, error: e.message });
        }
        break;

      case 'STOP_RECORDING':
        try {
          const blob = await recorder.stop();
          const buffer = await blob.arrayBuffer();
          
          // Send blob ArrayBuffer back to Service Worker
          chrome.runtime.sendMessage({
            type: 'RECORDING_COMPLETE',
            buffer: ArrayBuffer.isView(buffer) ? buffer.buffer : buffer,
            mimeType: blob.type,
            size: blob.size
          });
          
          sendResponse({ success: true });
        } catch (e: any) {
          logger.error('Offscreen', 'STOP_ERROR', { error: e.message });
          sendResponse({ success: false, error: e.message });
        }
        break;
      
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  })();

  return true; // Keep channel alive for async
});

// ScreenVault — Service Worker — Background Orchestrator
import { appState } from '../state/AppState';
import { ChromeActionAdapter } from '../chrome-api/ChromeActionAdapter';
import { ChromeTabsAdapter } from '../chrome-api/ChromeTabsAdapter';
import { CompressionModule } from '../compression/CompressionModule';
import { UploadManager } from '../upload/UploadManager';
import { AccountManager } from '../accounts/AccountManager';
import { SmartUploadRouter } from '../router/SmartUploadRouter';
import { GoogleDriveAdapter } from '../storage/adapters/GoogleDriveAdapter';
import { MockStorageAdapter } from '../storage/adapters/MockStorageAdapter';
import { ChromeIdentityAdapter } from '../chrome-api/ChromeIdentityAdapter';
import { ChromeStorageAdapter } from '../chrome-api/ChromeStorageAdapter';
import { RecordingSession, RecordingTarget } from '../types';
import { AppError } from '../types/errors';
import { logger } from '../logger/logger';

const actionAdapter = new ChromeActionAdapter();
const tabsAdapter = new ChromeTabsAdapter();
const compressionModule = new CompressionModule();
const identityAdapter = new ChromeIdentityAdapter();
const storageAdapter = new ChromeStorageAdapter();

const googleDriveAdapter = new GoogleDriveAdapter(identityAdapter);
const mockStorageAdapter = new MockStorageAdapter();
const accountManager = new AccountManager(storageAdapter, identityAdapter, googleDriveAdapter);
const router = new SmartUploadRouter();
const uploadManager = new UploadManager(accountManager, router, {
  'google-drive': googleDriveAdapter,
  'mock': mockStorageAdapter
});

let badgeInterval: ReturnType<typeof setInterval> | null = null;
let lastBuffer: ArrayBuffer | null = null;
let lastMimeType: string | null = null;

async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });

  if (existingContexts.length > 0) return;

  try {
    await chrome.offscreen.createDocument({
      url: 'dist/offscreen.html',
      reasons: [
        chrome.offscreen.Reason.USER_MEDIA,
        chrome.offscreen.Reason.DISPLAY_MEDIA
      ],
      justification: 'Recording screen and microphone required for core functionality'
    });
    // Brief delay to ensure offscreen script is loaded
    await new Promise(r => setTimeout(r, 200));
  } catch (e: any) {
    logger.error('ServiceWorker', 'OFFSCREEN_CREATE_FAILED', { error: e.message });
    throw e;
  }
}

function startBadgeTimer(startTime: number) {
  if (badgeInterval) clearInterval(badgeInterval);
  actionAdapter.setBadgeBackgroundColor('#ef4444');
  
  badgeInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const sec = Math.floor((elapsed / 1000) % 60);
    const min = Math.floor(elapsed / 60000);
    const mm = min.toString().padStart(2, '0');
    const ss = sec.toString().padStart(2, '0');
    actionAdapter.setBadgeText(`${mm}:${ss}`);
  }, 1000);
}

function stopBadgeTimer() {
  if (badgeInterval) clearInterval(badgeInterval);
  badgeInterval = null;
  actionAdapter.setBadgeText('');
}

async function handleRecordingComplete(buffer: ArrayBuffer, mimeType: string, size: number) {
  logger.info('ServiceWorker', 'RECORDING_COMPLETE_RECEIVED', { sizeBytes: size, mimeType, bufferByteLength: buffer?.byteLength });
  stopBadgeTimer();
  lastBuffer = buffer;
  lastMimeType = mimeType;
  
  const blob = new Blob([buffer], { type: mimeType });
  const session = appState.get('activeSession');
  if (!session) {
    logger.error('ServiceWorker', 'NO_ACTIVE_SESSION_ON_COMPLETE');
    return;
  }

  logger.info('ServiceWorker', 'PROCESSING_START', { sessionId: session.id, fileSizeBytes: size });
  session.status = 'processing';
  session.fileSizeBytes = size;
  appState.set('activeSession', session);
  appState.set('status', 'processing');

  try {
    logger.info('ServiceWorker', 'COMPRESSION_START', { sessionId: session.id });
    const compressedBlob = await compressionModule.compress(blob, session.id);
    logger.info('ServiceWorker', 'COMPRESSION_DONE', { original: size, compressed: compressedBlob.size });
    
    session.status = 'uploading';
    appState.set('activeSession', session);
    appState.set('status', 'uploading');

    logger.info('ServiceWorker', 'UPLOAD_START', { sessionId: session.id });
    const result = await uploadManager.upload(compressedBlob, session, (progress) => {
      logger.debug('ServiceWorker', 'UPLOAD_PROGRESS', { percent: progress.percent, uploaded: progress.uploadedBytes });
      appState.set('uploadProgress', progress);
    });

    if (result.success) {
      logger.info('ServiceWorker', 'UPLOAD_SUCCESS', { url: result.url, accountId: result.accountId });
      session.status = 'success';
      session.uploadUrl = result.url;
      session.uploadedToAccountId = result.accountId;
    } else {
      logger.error('ServiceWorker', 'UPLOAD_FAILED', { error: result.error });
      session.status = 'error';
      session.error = result.error;
    }
  } catch (e: any) {
    logger.error('ServiceWorker', 'PIPELINE_ERROR', { error: e.message, stack: e.stack });
    session.status = 'error';
    session.error = new AppError('COMPRESSION_FAILED', e.message, false).toJSON();
  }

  appState.set('activeSession', session);
  appState.set('status', session.status);
  logger.info('ServiceWorker', 'SESSION_FINAL_STATUS', { status: session.status });
  
  chrome.offscreen.closeDocument().catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RECORDING_COMPLETE') {
    logger.info('ServiceWorker', 'MSG_IN:RECORDING_COMPLETE', { size: message.size, mimeType: message.mimeType, bufferByteLength: message.buffer?.byteLength });
    handleRecordingComplete(message.buffer, message.mimeType, message.size);
    return;
  }

  logger.debug('ServiceWorker', `MSG_IN:${message.type}`, { from: sender?.id || 'popup', keys: Object.keys(message) });

  (async () => {
    try {
      switch (message.type) {
        case 'GET_STATE':
          await appState.hydrate();
          sendResponse({
            status: appState.get('status'),
            activeSession: appState.get('activeSession'),
            accounts: await accountManager.getAccounts(),
            uploadProgress: appState.get('uploadProgress')
          });
          break;

        case 'START_RECORDING':
          const target: RecordingTarget = message.target;
          const sessionId = crypto.randomUUID();
          logger.info('ServiceWorker', 'START_RECORDING', { type: target.type, hasStreamId: !!(target as any).streamId, sessionId });
          
          const newSession: RecordingSession = {
            id: sessionId,
            startedAt: Date.now(),
            target,
            status: 'recording'
          };

          try {
            logger.info('ServiceWorker', 'OFFSCREEN_SETUP_START');
            await setupOffscreenDocument();
            logger.info('ServiceWorker', 'OFFSCREEN_SETUP_DONE');
            // Tiny extra delay to ensure MacOS bridge is warm
            await new Promise(r => setTimeout(r, 100));
          } catch (e: any) {
            logger.error('ServiceWorker', 'OFFSCREEN_SETUP_FAILED', { error: e.message });
            sendResponse({ success: false, error: 'Failed to initialize recording environment: ' + e.message });
            return;
          }
          
          appState.set('activeSession', newSession);
          appState.set('status', 'recording');

          logger.info('ServiceWorker', 'SENDING_TO_OFFSCREEN', { streamIdPrefix: (target as any).streamId?.substring(0,20) });
          chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'START_RECORDING',
            recordingTarget: target,
            streamId: (target as any).streamId 
          }, response => {
            if (chrome.runtime.lastError || !response?.success) {
              const error = chrome.runtime.lastError?.message || response?.error || 'Failed to start recording';
              logger.error('ServiceWorker', 'OFFSCREEN_START_FAILED', { error });
              appState.set('status', 'idle');
              appState.set('activeSession', null);
              sendResponse({ success: false, error });
            } else {
              logger.info('ServiceWorker', 'OFFSCREEN_START_SUCCESS', { sessionId });
              startBadgeTimer(newSession.startedAt);
              sendResponse({ success: true, sessionId });
            }
          });
          break;

        case 'CANCEL_RECORDING':
          logger.info('ServiceWorker', 'CANCEL_RECORDING');
          chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_RECORDING' });
          appState.set('status', 'idle');
          appState.set('activeSession', null);
          stopBadgeTimer();
          sendResponse({ success: true });
          break;

        case 'STOP_RECORDING':
          logger.info('ServiceWorker', 'STOP_RECORDING_FORWARDED');
          chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_RECORDING' });
          sendResponse({ success: true });
          break;

        case 'GET_ACCOUNTS':
          const accounts = await accountManager.getAccounts();
          logger.debug('ServiceWorker', 'GET_ACCOUNTS', { count: accounts.length });
          sendResponse({ accounts });
          break;

        case 'CONNECT_ACCOUNT':
          logger.info('ServiceWorker', 'CONNECT_ACCOUNT_START');
          const account = await accountManager.connectAccount();
          logger.info('ServiceWorker', 'CONNECT_ACCOUNT_DONE', { id: account?.id });
          sendResponse({ account });
          break;

        case 'CONNECT_MOCK_ACCOUNT':
          logger.info('ServiceWorker', 'CONNECT_MOCK_ACCOUNT_START');
          const mock = await accountManager.connectMockAccount();
          logger.info('ServiceWorker', 'CONNECT_MOCK_ACCOUNT_DONE', { id: mock?.id });
          sendResponse({ account: mock });
          break;

        case 'DISCONNECT_ACCOUNT':
          await accountManager.disconnectAccount(message.accountId);
          sendResponse({ success: true });
          break;

        case 'GET_RECORDING_BUFFER':
          logger.debug('ServiceWorker', 'GET_RECORDING_BUFFER', { hasBuffer: !!lastBuffer, bufferSize: lastBuffer?.byteLength });
          sendResponse({ buffer: lastBuffer, mimeType: lastMimeType });
          break;

        case 'GET_LOGS':
          sendResponse({ logs: logger.getLogs() });
          break;

        default:
          logger.warn('ServiceWorker', 'UNKNOWN_MESSAGE', { type: message.type });
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (e: any) {
      logger.error('ServiceWorker', 'MSG_HANDLER_EXCEPTION', { type: message.type, error: e.message, stack: e.stack });
      sendResponse({ success: false, error: e.message });
    }
  })();

  return true; 
});

// Setup tab removed cleanup
tabsAdapter.onTabRemoved((tabId) => {
  const session = appState.get('activeSession');
  if (session && session.status === 'recording' && session.target.type === 'tab' && session.target.tabId === tabId) {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_RECORDING' });
  }
});

tabsAdapter.onTabUpdated((tabId, info) => {
  const session = appState.get('activeSession');
  if (session && session.status === 'recording' && session.target.type === 'tab' && session.target.tabId === tabId && info.title) {
    session.target.tabTitle = info.title;
    appState.set('activeSession', session);
  }
});

// Resiliency: recover running recording on reload
appState.hydrate().then(async () => {
  const session = appState.get('activeSession');
  if (session && session.status === 'recording') {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
    });
    if (existingContexts.length > 0) {
      startBadgeTimer(session.startedAt);
    } else {
      session.status = 'error';
      session.error = new AppError('OFFSCREEN_INIT_FAILED', 'Recording interrupted by service worker reload', false).toJSON();
      appState.set('activeSession', session);
      appState.set('status', 'error');
    }
  }
});

// Broadcast state to all tabs for Content Script (Floating Tray)
function broadcastState() {
  const state = {
    status: appState.get('status'),
    activeSession: appState.get('activeSession')
  };
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'STATE_UPDATE', state }).catch(() => {
          // Ignore tabs where content script isn't loaded (e.g. chrome://)
        });
      }
    });
  });
}

appState.subscribe('status', broadcastState);
appState.subscribe('activeSession', broadcastState);

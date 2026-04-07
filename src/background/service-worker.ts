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

  await chrome.offscreen.createDocument({
    url: 'dist/offscreen.html', // path relative to MV3 root when built
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Recording screen and microphone required for core functionality'
  });
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
  stopBadgeTimer();
  lastBuffer = buffer;
  lastMimeType = mimeType;
  
  const blob = new Blob([buffer], { type: mimeType });
  const session = appState.get('activeSession');
  if (!session) return;

  session.status = 'processing';
  session.fileSizeBytes = size;
  appState.set('activeSession', session);
  appState.set('status', 'processing');

  try {
    const compressedBlob = await compressionModule.compress(blob, session.id);
    
    session.status = 'uploading';
    appState.set('activeSession', session);
    appState.set('status', 'uploading');

    const result = await uploadManager.upload(compressedBlob, session, (progress) => {
      appState.set('uploadProgress', progress);
    });

    if (result.success) {
      session.status = 'success';
      session.uploadUrl = result.url;
      session.uploadedToAccountId = result.accountId;
    } else {
      session.status = 'error';
      session.error = result.error;
    }
  } catch (e: any) {
    session.status = 'error';
    session.error = new AppError('COMPRESSION_FAILED', e.message, false).toJSON();
  }

  appState.set('activeSession', session);
  appState.set('status', session.status);
  
  chrome.offscreen.closeDocument().catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RECORDING_COMPLETE') {
    handleRecordingComplete(message.buffer, message.mimeType, message.size);
    return;
  }

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
          
          const newSession: RecordingSession = {
            id: sessionId,
            startedAt: Date.now(),
            target,
            status: 'recording'
          };

          await setupOffscreenDocument();
          
          appState.set('activeSession', newSession);
          appState.set('status', 'recording');

          chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'START_RECORDING',
            recordingTarget: target
          }, response => {
            if (!response?.success) {
              appState.set('status', 'idle');
              appState.set('activeSession', null);
              sendResponse({ success: false, error: response?.error || 'Failed to start recording' });
            } else {
              startBadgeTimer(newSession.startedAt);
              sendResponse({ success: true, sessionId });
            }
          });
          break;

        case 'STOP_RECORDING':
          chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_RECORDING' });
          sendResponse({ success: true });
          break;

        case 'GET_ACCOUNTS':
          const accounts = await accountManager.getAccounts();
          sendResponse({ accounts });
          break;

        case 'CONNECT_ACCOUNT':
          const account = await accountManager.connectAccount();
          sendResponse({ account });
          break;

        case 'CONNECT_MOCK_ACCOUNT':
          const mock = await accountManager.connectMockAccount();
          sendResponse({ account: mock });
          break;

        case 'DISCONNECT_ACCOUNT':
          await accountManager.disconnectAccount(message.accountId);
          sendResponse({ success: true });
          break;

        case 'GET_RECORDING_BUFFER':
          sendResponse({ buffer: lastBuffer, mimeType: lastMimeType });
          break;

        case 'GET_LOGS':
          sendResponse({ logs: logger.getLogs() });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (e: any) {
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

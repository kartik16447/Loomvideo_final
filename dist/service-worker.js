// src/chrome-api/ChromeStorageAdapter.ts
var ChromeStorageAdapter = class {
  async get(key) {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
  }
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  }
  async remove(key) {
    await chrome.storage.local.remove(key);
  }
};

// src/state/AppState.ts
var AppState = class {
  state = {
    status: "idle",
    activeSession: null,
    accounts: [],
    uploadProgress: null
  };
  listeners = /* @__PURE__ */ new Map();
  storage = new ChromeStorageAdapter();
  get(key) {
    return this.state[key];
  }
  set(key, value) {
    this.state[key] = value;
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      keyListeners.forEach((cb) => cb(value));
    }
    if (key === "status" || key === "activeSession") {
      this.storage.set(key, value).catch(() => {
      });
    }
  }
  subscribe(key, cb) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, /* @__PURE__ */ new Set());
    }
    const listenersSet = this.listeners.get(key);
    const typedCb = cb;
    listenersSet.add(typedCb);
    return () => {
      listenersSet.delete(typedCb);
    };
  }
  async hydrate() {
    try {
      const storedStatus = await this.storage.get("status");
      if (storedStatus) this.state.status = storedStatus;
      const storedSession = await this.storage.get("activeSession");
      if (storedSession) this.state.activeSession = storedSession;
      if (this.state.status === "recording" && !this.state.activeSession) {
        this.state.status = "idle";
      }
    } catch {
    }
  }
};
var appState = new AppState();

// src/chrome-api/ChromeActionAdapter.ts
var ChromeActionAdapter = class {
  async setBadgeText(text) {
    await chrome.action.setBadgeText({ text });
  }
  async setBadgeBackgroundColor(color) {
    await chrome.action.setBadgeBackgroundColor({ color });
  }
  async setIcon(path) {
    await chrome.action.setIcon({ path: { "16": path, "48": path, "128": path } });
  }
};

// src/chrome-api/ChromeTabsAdapter.ts
var ChromeTabsAdapter = class {
  async queryAllTabs() {
    return await chrome.tabs.query({});
  }
  async getMediaStreamId(tabId) {
    return new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
        if (!streamId) {
          reject(new Error("Failed to get media stream ID for tab."));
        } else {
          resolve(streamId);
        }
      });
    });
  }
  onTabRemoved(callback) {
    chrome.tabs.onRemoved.addListener(callback);
  }
  onTabUpdated(callback) {
    chrome.tabs.onUpdated.addListener(callback);
  }
};

// src/logger/logger.ts
var DEBUG_MODE = true;
var COLORS = {
  debug: "#6B7280",
  info: "#3B82F6",
  warn: "#F59E0B",
  error: "#EF4444"
};
var Logger = class {
  logBuffer = [];
  maxBufferSize = 1e3;
  startTime = Date.now();
  log(level, module, action, data, sessionId) {
    if (!DEBUG_MODE && level === "debug") return;
    const entry = {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      module,
      action,
      sessionId,
      data
    };
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) this.logBuffer.shift();
    const elapsed = `+${((Date.now() - this.startTime) / 1e3).toFixed(2)}s`;
    const prefix = `[SV:${module}] [${elapsed}]`;
    try {
      if (level === "error") {
        console.error(`%c${prefix} ${action}`, `color: ${COLORS[level]}; font-weight: bold`, data ?? "");
      } else if (level === "warn") {
        console.warn(`%c${prefix} ${action}`, `color: ${COLORS[level]}`, data ?? "");
      } else if (level === "debug") {
        console.log(`%c${prefix} ${action}`, `color: ${COLORS[level]}`, data ?? "");
      } else {
        console.log(`%c${prefix} ${action}`, `color: ${COLORS[level]}; font-weight: bold`, data ?? "");
      }
      console.debug(JSON.stringify(entry));
    } catch (e) {
      console.log(`{LOG_FAILED}`);
    }
  }
  getLogs() {
    return [...this.logBuffer];
  }
  clearLogs() {
    this.logBuffer = [];
  }
  dumpLogs() {
    console.group("%c[ScreenVault] \u2014 Full Log Dump", "font-weight: bold; font-size: 14px;");
    this.logBuffer.forEach((e) => {
      console.log(`%c[${e.level.toUpperCase()}] [${e.module}] ${e.action}`, `color:${COLORS[e.level]}`, e.data ?? "", `| ${e.ts}`);
    });
    console.groupEnd();
  }
  debug(module, action, data, sessionId) {
    this.log("debug", module, action, data, sessionId);
  }
  info(module, action, data, sessionId) {
    this.log("info", module, action, data, sessionId);
  }
  warn(module, action, data, sessionId) {
    this.log("warn", module, action, data, sessionId);
  }
  error(module, action, data, sessionId) {
    this.log("error", module, action, data, sessionId);
  }
};
var logger = new Logger();
globalThis.SV_LOGGER = logger;

// src/compression/CompressionModule.ts
var CompressionModule = class {
  async compress(blob, sessionId) {
    logger.info("CompressionModule", "SKIP_COMPRESSION_PHASE1", { sessionId, sizeBytes: blob.size });
    return blob;
  }
};

// src/types/errors.ts
var AppError = class _AppError extends Error {
  constructor(code, message, recoverable, context) {
    super(message);
    this.code = code;
    this.recoverable = recoverable;
    this.context = context;
    this.name = "AppError";
  }
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      context: this.context
    };
  }
  static from(e) {
    return new _AppError(e.code, e.message, e.recoverable, e.context);
  }
};

// src/upload/UploadManager.ts
var UploadManager = class {
  constructor(accountManager2, router2, adapters) {
    this.accountManager = accountManager2;
    this.router = router2;
    this.adapters = adapters;
  }
  async upload(blob, session, onProgress) {
    logger.info("UploadManager", "UPLOAD_START", { sessionId: session.id, sizeBytes: blob.size });
    try {
      const accounts = await this.accountManager.getAccounts();
      if (accounts.length === 0) {
        throw new AppError("UPLOAD_NO_ACCOUNTS", "No connected accounts", false);
      }
      const decision = this.router.route(accounts, blob.size);
      logger.info("UploadManager", "ROUTING_DECISION", { accountId: decision.account.id, reason: decision.reason });
      const dateStr = new Date(session.startedAt).toISOString().split("T")[0];
      const fileName = `screenvault-${session.id.slice(0, 8)}-${dateStr}.webm`;
      const adapter = this.adapters[decision.account.provider] || this.adapters["google-drive"];
      if (!adapter) throw new AppError("UPLOAD_NETWORK_ERROR", "No adapter for provider", false);
      const result = await adapter.upload(blob, fileName, decision.account.id, onProgress);
      if (result.success) {
        decision.account.uploadSuccessCount++;
        decision.account.lastUsedAt = Date.now();
        await this.accountManager.updateAccount(decision.account);
      } else {
        decision.account.uploadFailureCount++;
        await this.accountManager.updateAccount(decision.account);
      }
      return result;
    } catch (e) {
      logger.error("UploadManager", "UPLOAD_ERROR", { error: e.message });
      if (e instanceof AppError) {
        return { success: false, error: e.toJSON() };
      }
      return { success: false, error: new AppError("UPLOAD_NETWORK_ERROR", e.message, true).toJSON() };
    }
  }
};

// src/accounts/AccountManager.ts
var AccountManager = class {
  constructor(chromeStorage, identityAdapter2, cloudStorageAdapter) {
    this.chromeStorage = chromeStorage;
    this.identityAdapter = identityAdapter2;
    this.cloudStorageAdapter = cloudStorageAdapter;
  }
  async connectAccount() {
    logger.info("AccountManager", "CONNECT_START");
    const token = await this.identityAdapter.getAuthToken({ interactive: true });
    const profile = await this.identityAdapter.getProfileUserInfo();
    if (!profile.email) {
      throw new Error("Could not get profile email from Chrome Identity");
    }
    const accountId = `google-drive-${profile.id || profile.email}`;
    const newAccount = {
      id: accountId,
      provider: "google-drive",
      email: profile.email,
      displayName: profile.email.split("@")[0] || profile.email,
      accessToken: token,
      refreshToken: "",
      // Handled seamlessly by chrome.identity in Phase 1
      tokenExpiresAt: Date.now() + 3600 * 1e3,
      storageQuotaBytes: 0,
      storageUsedBytes: 0,
      uploadSuccessCount: 0,
      uploadFailureCount: 0
    };
    await this.cloudStorageAdapter.refreshQuota(newAccount);
    await this.updateAccount(newAccount);
    logger.info("AccountManager", "CONNECT_SUCCESS", { accountId });
    return newAccount;
  }
  async connectMockAccount() {
    logger.info("AccountManager", "CONNECT_MOCK");
    const mockId = `mock-${Math.floor(Math.random() * 1e3)}`;
    const mock = {
      id: mockId,
      provider: "mock",
      // Bypass enum for debug
      email: "debug@screenvault.local",
      displayName: "Mock Debug User",
      accessToken: "fake-token",
      refreshToken: "fake-refresh",
      tokenExpiresAt: Date.now() + 99999999,
      storageQuotaBytes: 15 * 1024 * 1024 * 1024,
      storageUsedBytes: 1 * 1024 * 1024 * 1024,
      uploadSuccessCount: 0,
      uploadFailureCount: 0
    };
    await this.updateAccount(mock);
    return mock;
  }
  async disconnectAccount(id) {
    logger.info("AccountManager", "DISCONNECT", { id });
    const accounts = await this.getAccounts();
    const filtered = accounts.filter((a) => a.id !== id);
    await this.chromeStorage.set("accounts", filtered);
  }
  async getAccounts() {
    const accounts = await this.chromeStorage.get("accounts");
    return accounts || [];
  }
  async getAccountById(id) {
    const accounts = await this.getAccounts();
    return accounts.find((a) => a.id === id) || null;
  }
  async updateAccount(account) {
    const accounts = await this.getAccounts();
    const index = accounts.findIndex((a) => a.id === account.id);
    if (index >= 0) {
      accounts[index] = account;
    } else {
      accounts.push(account);
    }
    await this.chromeStorage.set("accounts", accounts);
  }
  async refreshAllQuotas() {
    logger.info("AccountManager", "REFRESH_QUOTAS_START");
    const accounts = await this.getAccounts();
    for (const acc of accounts) {
      await this.cloudStorageAdapter.refreshQuota(acc);
      await this.updateAccount(acc);
    }
  }
};

// src/router/SmartUploadRouter.ts
var SmartUploadRouter = class {
  // PHASE 1 STUB: Return the first available account.
  // PHASE 2: Implement full scoring algorithm based on reliability, freeScore, recencyBonus.
  route(accounts, fileSizeBytes) {
    if (!accounts || accounts.length === 0) {
      throw new AppError("ROUTER_NO_ELIGIBLE_ACCOUNTS", "No accounts available", false);
    }
    return {
      account: accounts[0],
      reason: "Phase 1 Bypass: Returning first available account."
    };
  }
};

// src/storage/adapters/GoogleDriveAdapter.ts
var GoogleDriveAdapter = class {
  constructor(identityAdapter2) {
    this.identityAdapter = identityAdapter2;
  }
  async upload(file, fileName, accountId, onProgress) {
    logger.info("GoogleDriveAdapter", "UPLOAD_STARTED", { fileName, size: file.size, accountId });
    try {
      const token = await this.identityAdapter.getAuthToken({ interactive: false });
      const metadata = {
        name: fileName,
        mimeType: file.type || "video/webm"
      };
      const boundary = "-------screenvault_boundary_3141592653589";
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";
      onProgress({ uploadedBytes: 0, totalBytes: file.size, percent: 0, accountId });
      const fileBuffer = await file.arrayBuffer();
      const blobData = new Blob([
        delimiter,
        "Content-Type: application/json; charset=UTF-8\r\n\r\n",
        JSON.stringify(metadata),
        delimiter,
        "Content-Type: " + metadata.mimeType + "\r\n\r\n",
        fileBuffer,
        close_delim
      ], { type: "multipart/related; boundary=" + boundary });
      const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body: blobData
      });
      if (response.status === 401) {
        await this.identityAdapter.removeCachedAuthToken(token);
        logger.warn("GoogleDriveAdapter", "TOKEN_EXPIRED", { token: token.substring(0, 8) + "..." });
        return { success: false, error: { code: "UPLOAD_TOKEN_EXPIRED", message: "Token expired", recoverable: true } };
      }
      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }
      onProgress({ uploadedBytes: file.size, totalBytes: file.size, percent: 100, accountId });
      const result = await response.json();
      const fileId = result.id;
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ type: "anyone", role: "reader" })
      });
      const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const fileData = await fileResponse.json();
      logger.info("GoogleDriveAdapter", "UPLOAD_COMPLETE", { fileId, accountId });
      return {
        success: true,
        url: fileData.webViewLink,
        accountId
      };
    } catch (error) {
      logger.error("GoogleDriveAdapter", "UPLOAD_ERROR", { message: error.message });
      return {
        success: false,
        error: { code: "UPLOAD_NETWORK_ERROR", message: error.message, recoverable: true }
      };
    }
  }
  async getAvailableSpaceBytes(account) {
    logger.debug("GoogleDriveAdapter", "GET_SPACE", { accountId: account.id });
    try {
      const token = await this.identityAdapter.getAuthToken({ interactive: false });
      const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) return 0;
      const data = await response.json();
      const quota = data.storageQuota;
      if (!quota) return 0;
      return parseInt(quota.limit, 10) - parseInt(quota.usage, 10);
    } catch {
      return 0;
    }
  }
  async refreshQuota(account) {
    try {
      const token = await this.identityAdapter.getAuthToken({ interactive: false });
      const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const quota = data.storageQuota;
        if (quota) {
          account.storageQuotaBytes = parseInt(quota.limit, 10) || 0;
          account.storageUsedBytes = parseInt(quota.usage, 10) || 0;
        }
      }
    } catch (e) {
      logger.error("GoogleDriveAdapter", "REFRESH_QUOTA_FAILED", { accountId: account.id });
    }
  }
  async isAvailable(account) {
    try {
      await this.identityAdapter.getAuthToken({ interactive: false });
      return true;
    } catch {
      return false;
    }
  }
  async refreshToken(account) {
    try {
      const token = await this.identityAdapter.getAuthToken({ interactive: false });
      account.accessToken = token;
    } catch (e) {
      logger.warn("GoogleDriveAdapter", "REFRESH_TOKEN_FAILED", { accountId: account.id });
    }
    return account;
  }
};

// src/storage/adapters/MockStorageAdapter.ts
var MockStorageAdapter = class {
  constructor(options = {}) {
    this.options = options;
  }
  async upload(file, fileName, accountId, onProgress) {
    const totalBytes = file.size || 1024;
    const delay = this.options.simulatedDelayMs ?? 2e3;
    const chunks = 10;
    const chunkDelay = delay / chunks;
    for (let i = 1; i <= chunks; i++) {
      await new Promise((r) => setTimeout(r, chunkDelay));
      onProgress({
        uploadedBytes: totalBytes / chunks * i,
        totalBytes,
        percent: i * 10,
        accountId
      });
      if (this.options.simulateFailure && i === chunks / 2) {
        return {
          success: false,
          error: { code: "UPLOAD_NETWORK_ERROR", message: "Simulated failure in mock adapter", recoverable: true }
        };
      }
    }
    return {
      success: true,
      url: chrome.runtime.getURL("dist/ui/player/player.html"),
      accountId
    };
  }
  async getAvailableSpaceBytes(account) {
    return 10 * 1024 * 1024 * 1024;
  }
  async refreshQuota(account) {
    account.storageQuotaBytes = 15 * 1024 * 1024 * 1024;
    account.storageUsedBytes = 5 * 1024 * 1024 * 1024;
  }
  async isAvailable(account) {
    return !this.options.simulateFailure;
  }
  async refreshToken(account) {
    return account;
  }
};

// src/chrome-api/ChromeIdentityAdapter.ts
var ChromeIdentityAdapter = class {
  async getAuthToken(options) {
    const result = await chrome.identity.getAuthToken(options);
    if (!result.token) {
      throw new Error("No authentication token returned by Chrome");
    }
    return result.token;
  }
  async removeCachedAuthToken(token) {
    await chrome.identity.removeCachedAuthToken({ token });
  }
  async getProfileUserInfo() {
    return await chrome.identity.getProfileUserInfo();
  }
};

// src/background/service-worker.ts
var actionAdapter = new ChromeActionAdapter();
var tabsAdapter = new ChromeTabsAdapter();
var compressionModule = new CompressionModule();
var identityAdapter = new ChromeIdentityAdapter();
var storageAdapter = new ChromeStorageAdapter();
var googleDriveAdapter = new GoogleDriveAdapter(identityAdapter);
var mockStorageAdapter = new MockStorageAdapter();
var accountManager = new AccountManager(storageAdapter, identityAdapter, googleDriveAdapter);
var router = new SmartUploadRouter();
var uploadManager = new UploadManager(accountManager, router, {
  "google-drive": googleDriveAdapter,
  "mock": mockStorageAdapter
});
var badgeInterval = null;
var lastBuffer = null;
var lastMimeType = null;
async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });
  if (existingContexts.length > 0) return;
  try {
    await chrome.offscreen.createDocument({
      url: "dist/offscreen.html",
      reasons: [
        chrome.offscreen.Reason.USER_MEDIA,
        chrome.offscreen.Reason.DISPLAY_MEDIA
      ],
      justification: "Recording screen and microphone required for core functionality"
    });
    await new Promise((r) => setTimeout(r, 200));
  } catch (e) {
    logger.error("ServiceWorker", "OFFSCREEN_CREATE_FAILED", { error: e.message });
    throw e;
  }
}
function startBadgeTimer(startTime) {
  if (badgeInterval) clearInterval(badgeInterval);
  actionAdapter.setBadgeBackgroundColor("#ef4444");
  badgeInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const sec = Math.floor(elapsed / 1e3 % 60);
    const min = Math.floor(elapsed / 6e4);
    const mm = min.toString().padStart(2, "0");
    const ss = sec.toString().padStart(2, "0");
    actionAdapter.setBadgeText(`${mm}:${ss}`);
  }, 1e3);
}
function stopBadgeTimer() {
  if (badgeInterval) clearInterval(badgeInterval);
  badgeInterval = null;
  actionAdapter.setBadgeText("");
}
async function handleRecordingComplete(buffer, mimeType, size) {
  logger.info("ServiceWorker", "RECORDING_COMPLETE_RECEIVED", { sizeBytes: size, mimeType, bufferByteLength: buffer?.byteLength });
  stopBadgeTimer();
  lastBuffer = buffer;
  lastMimeType = mimeType;
  const blob = new Blob([buffer], { type: mimeType });
  const session = appState.get("activeSession");
  if (!session) {
    logger.error("ServiceWorker", "NO_ACTIVE_SESSION_ON_COMPLETE");
    return;
  }
  logger.info("ServiceWorker", "PROCESSING_START", { sessionId: session.id, fileSizeBytes: size });
  session.status = "processing";
  session.fileSizeBytes = size;
  appState.set("activeSession", session);
  appState.set("status", "processing");
  try {
    logger.info("ServiceWorker", "COMPRESSION_START", { sessionId: session.id });
    const compressedBlob = await compressionModule.compress(blob, session.id);
    logger.info("ServiceWorker", "COMPRESSION_DONE", { original: size, compressed: compressedBlob.size });
    session.status = "uploading";
    appState.set("activeSession", session);
    appState.set("status", "uploading");
    logger.info("ServiceWorker", "UPLOAD_START", { sessionId: session.id });
    const result = await uploadManager.upload(compressedBlob, session, (progress) => {
      logger.debug("ServiceWorker", "UPLOAD_PROGRESS", { percent: progress.percent, uploaded: progress.uploadedBytes });
      appState.set("uploadProgress", progress);
    });
    if (result.success) {
      logger.info("ServiceWorker", "UPLOAD_SUCCESS", { url: result.url, accountId: result.accountId });
      session.status = "success";
      session.uploadUrl = result.url;
      session.uploadedToAccountId = result.accountId;
    } else {
      logger.error("ServiceWorker", "UPLOAD_FAILED", { error: result.error });
      session.status = "error";
      session.error = result.error;
    }
  } catch (e) {
    logger.error("ServiceWorker", "PIPELINE_ERROR", { error: e.message, stack: e.stack });
    session.status = "error";
    session.error = new AppError("COMPRESSION_FAILED", e.message, false).toJSON();
  }
  appState.set("activeSession", session);
  appState.set("status", session.status);
  logger.info("ServiceWorker", "SESSION_FINAL_STATUS", { status: session.status });
  chrome.offscreen.closeDocument().catch(() => {
  });
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RECORDING_COMPLETE") {
    logger.info("ServiceWorker", "MSG_IN:RECORDING_COMPLETE", { size: message.size, mimeType: message.mimeType, bufferByteLength: message.buffer?.byteLength });
    handleRecordingComplete(message.buffer, message.mimeType, message.size);
    return;
  }
  logger.debug("ServiceWorker", `MSG_IN:${message.type}`, { from: sender?.id || "popup", keys: Object.keys(message) });
  (async () => {
    try {
      switch (message.type) {
        case "GET_STATE":
          await appState.hydrate();
          sendResponse({
            status: appState.get("status"),
            activeSession: appState.get("activeSession"),
            accounts: await accountManager.getAccounts(),
            uploadProgress: appState.get("uploadProgress")
          });
          break;
        case "START_RECORDING":
          const target = message.target;
          const sessionId = crypto.randomUUID();
          logger.info("ServiceWorker", "START_RECORDING", { type: target.type, hasStreamId: !!target.streamId, sessionId });
          const newSession = {
            id: sessionId,
            startedAt: Date.now(),
            target,
            status: "recording"
          };
          try {
            logger.info("ServiceWorker", "OFFSCREEN_SETUP_START");
            await setupOffscreenDocument();
            logger.info("ServiceWorker", "OFFSCREEN_SETUP_DONE");
            await new Promise((r) => setTimeout(r, 100));
          } catch (e) {
            logger.error("ServiceWorker", "OFFSCREEN_SETUP_FAILED", { error: e.message });
            sendResponse({ success: false, error: "Failed to initialize recording environment: " + e.message });
            return;
          }
          appState.set("activeSession", newSession);
          appState.set("status", "recording");
          logger.info("ServiceWorker", "SENDING_TO_OFFSCREEN", { streamIdPrefix: target.streamId?.substring(0, 20) });
          chrome.runtime.sendMessage({
            target: "offscreen",
            type: "START_RECORDING",
            recordingTarget: target,
            streamId: target.streamId
          }, (response) => {
            if (chrome.runtime.lastError || !response?.success) {
              const error = chrome.runtime.lastError?.message || response?.error || "Failed to start recording";
              logger.error("ServiceWorker", "OFFSCREEN_START_FAILED", { error });
              appState.set("status", "idle");
              appState.set("activeSession", null);
              sendResponse({ success: false, error });
            } else {
              logger.info("ServiceWorker", "OFFSCREEN_START_SUCCESS", { sessionId });
              startBadgeTimer(newSession.startedAt);
              sendResponse({ success: true, sessionId });
            }
          });
          break;
        case "CANCEL_RECORDING":
          logger.info("ServiceWorker", "CANCEL_RECORDING");
          chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_RECORDING" });
          appState.set("status", "idle");
          appState.set("activeSession", null);
          stopBadgeTimer();
          sendResponse({ success: true });
          break;
        case "STOP_RECORDING":
          logger.info("ServiceWorker", "STOP_RECORDING_FORWARDED");
          chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_RECORDING" });
          sendResponse({ success: true });
          break;
        case "GET_ACCOUNTS":
          const accounts = await accountManager.getAccounts();
          logger.debug("ServiceWorker", "GET_ACCOUNTS", { count: accounts.length });
          sendResponse({ accounts });
          break;
        case "CONNECT_ACCOUNT":
          logger.info("ServiceWorker", "CONNECT_ACCOUNT_START");
          const account = await accountManager.connectAccount();
          logger.info("ServiceWorker", "CONNECT_ACCOUNT_DONE", { id: account?.id });
          sendResponse({ account });
          break;
        case "CONNECT_MOCK_ACCOUNT":
          logger.info("ServiceWorker", "CONNECT_MOCK_ACCOUNT_START");
          const mock = await accountManager.connectMockAccount();
          logger.info("ServiceWorker", "CONNECT_MOCK_ACCOUNT_DONE", { id: mock?.id });
          sendResponse({ account: mock });
          break;
        case "DISCONNECT_ACCOUNT":
          await accountManager.disconnectAccount(message.accountId);
          sendResponse({ success: true });
          break;
        case "GET_RECORDING_BUFFER":
          logger.debug("ServiceWorker", "GET_RECORDING_BUFFER", { hasBuffer: !!lastBuffer, bufferSize: lastBuffer?.byteLength });
          sendResponse({ buffer: lastBuffer, mimeType: lastMimeType });
          break;
        case "GET_LOGS":
          sendResponse({ logs: logger.getLogs() });
          break;
        default:
          logger.warn("ServiceWorker", "UNKNOWN_MESSAGE", { type: message.type });
          sendResponse({ success: false, error: "Unknown message type" });
      }
    } catch (e) {
      logger.error("ServiceWorker", "MSG_HANDLER_EXCEPTION", { type: message.type, error: e.message, stack: e.stack });
      sendResponse({ success: false, error: e.message });
    }
  })();
  return true;
});
tabsAdapter.onTabRemoved((tabId) => {
  const session = appState.get("activeSession");
  if (session && session.status === "recording" && session.target.type === "tab" && session.target.tabId === tabId) {
    chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_RECORDING" });
  }
});
tabsAdapter.onTabUpdated((tabId, info) => {
  const session = appState.get("activeSession");
  if (session && session.status === "recording" && session.target.type === "tab" && session.target.tabId === tabId && info.title) {
    session.target.tabTitle = info.title;
    appState.set("activeSession", session);
  }
});
appState.hydrate().then(async () => {
  const session = appState.get("activeSession");
  if (session && session.status === "recording") {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
    });
    if (existingContexts.length > 0) {
      startBadgeTimer(session.startedAt);
    } else {
      session.status = "error";
      session.error = new AppError("OFFSCREEN_INIT_FAILED", "Recording interrupted by service worker reload", false).toJSON();
      appState.set("activeSession", session);
      appState.set("status", "error");
    }
  }
});
function broadcastState() {
  const state = {
    status: appState.get("status"),
    activeSession: appState.get("activeSession")
  };
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "STATE_UPDATE", state }).catch(() => {
        });
      }
    });
  });
}
appState.subscribe("status", broadcastState);
appState.subscribe("activeSession", broadcastState);

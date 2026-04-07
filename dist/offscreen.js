// src/recorder/RecorderConfig.ts
var DEFAULT_CONFIG = {
  videoBitsPerSecond: 1e6,
  frameRate: 15,
  audioBitsPerSecond: 128e3,
  mimeType: "video/webm;codecs=vp9,opus",
  timesliceMs: 1e3
};

// src/logger/logger.ts
var DEBUG_MODE = true;
var Logger = class {
  logBuffer = [];
  maxBufferSize = 500;
  log(level, module, action, data, sessionId) {
    if (!DEBUG_MODE && level === "debug") {
      return;
    }
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
    try {
      console.log(JSON.stringify(entry));
    } catch (e) {
      console.log(`{"ts":"${(/* @__PURE__ */ new Date()).toISOString()}","level":"error","module":"Logger","action":"LOG_FAILED"}`);
    }
  }
  getLogs() {
    return [...this.logBuffer];
  }
  clearLogs() {
    this.logBuffer = [];
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

// src/recorder/RecorderModule.ts
var RecorderModule = class {
  constructor(tabsAdapter2) {
    this.tabsAdapter = tabsAdapter2;
  }
  mediaRecorder = null;
  chunks = [];
  startTime = 0;
  stopResolve = null;
  async start(target, config = DEFAULT_CONFIG, streamId) {
    logger.info("RecorderModule", "START", { target, hasStreamId: !!streamId });
    let screenStream = null;
    const audioContext = new globalThis.AudioContext();
    try {
      if (streamId) {
        logger.info("RecorderModule", "ATTEMPTING_GET_USER_MEDIA", { streamId });
        try {
          screenStream = await navigator.mediaDevices.getUserMedia({
            video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: streamId } },
            audio: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: streamId } }
          });
          logger.info("RecorderModule", "GET_USER_MEDIA_FULL_SUCCESS");
        } catch (e) {
          logger.warn("RecorderModule", "GET_USER_MEDIA_AUDIO_FAILED", { error: e.message });
          screenStream = await navigator.mediaDevices.getUserMedia({
            video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: streamId } }
          });
          logger.info("RecorderModule", "GET_USER_MEDIA_VIDEO_ONLY_SUCCESS");
        }
      } else if (target.type === "tab") {
        if (!target.tabId) throw new Error("tabId is required for tab recording");
        const internalStreamId = await this.tabsAdapter.getMediaStreamId(target.tabId);
        screenStream = await navigator.mediaDevices.getUserMedia({
          video: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: internalStreamId } }
        });
      } else {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: config.frameRate },
          audio: true
        });
      }
      if (!screenStream) throw new Error("Failed to acquire screen stream");
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      let micStream = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        logger.warn("RecorderModule", "MIC_UNAVAILABLE", { error: e.message });
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
          logger.debug("RecorderModule", "CHUNK_RECEIVED", { size: e.data.size, totalChunks: this.chunks.length });
        }
      };
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: config.mimeType });
        logger.info("RecorderModule", "RECORDING_STOPPED", {
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
      logger.info("RecorderModule", "MEDIA_RECORDER_STARTED");
    } catch (e) {
      logger.error("RecorderModule", "START_FAILED", { error: e.message });
      throw e;
    }
  }
  async stop() {
    logger.info("RecorderModule", "STOP");
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
      throw new Error("Not recording");
    }
    return new Promise((resolve) => {
      this.stopResolve = resolve;
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    });
  }
  getElapsedMs() {
    return this.startTime ? Date.now() - this.startTime : 0;
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

// src/offscreen/offscreen.ts
var tabsAdapter = new ChromeTabsAdapter();
var recorder = new RecorderModule(tabsAdapter);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return false;
  (async () => {
    switch (message.type) {
      case "START_RECORDING":
        try {
          await recorder.start(message.recordingTarget, message.config || DEFAULT_CONFIG, message.streamId);
          sendResponse({ success: true });
        } catch (e) {
          logger.error("Offscreen", "START_ERROR", { error: e.message });
          sendResponse({ success: false, error: e.message });
        }
        break;
      case "STOP_RECORDING":
        try {
          const blob = await recorder.stop();
          const buffer = await blob.arrayBuffer();
          chrome.runtime.sendMessage({
            type: "RECORDING_COMPLETE",
            buffer: ArrayBuffer.isView(buffer) ? buffer.buffer : buffer,
            mimeType: blob.type,
            size: blob.size
          });
          sendResponse({ success: true });
        } catch (e) {
          logger.error("Offscreen", "STOP_ERROR", { error: e.message });
          sendResponse({ success: false, error: e.message });
        }
        break;
      default:
        sendResponse({ success: false, error: "Unknown message type" });
    }
  })();
  return true;
});

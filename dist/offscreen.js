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

// src/recorder/RecorderModule.ts
var RecorderModule = class {
  constructor(tabsAdapter2) {
    this.tabsAdapter = tabsAdapter2;
    logger.debug("RecorderModule", "INSTANTIATED");
  }
  mediaRecorder = null;
  chunks = [];
  startTime = 0;
  stopResolve = null;
  async start(target, config = DEFAULT_CONFIG, streamId) {
    logger.info("RecorderModule", "START_CALLED", {
      targetType: target.type,
      hasStreamId: !!streamId,
      streamIdPrefix: streamId?.substring(0, 20),
      mimeType: config.mimeType,
      videoBitsPerSecond: config.videoBitsPerSecond,
      frameRate: config.frameRate
    });
    let screenStream = null;
    const audioContext = new globalThis.AudioContext();
    logger.debug("RecorderModule", "AUDIO_CONTEXT_STATE", { state: audioContext.state });
    try {
      if (streamId) {
        logger.info("RecorderModule", "ATTEMPTING_CASCADED_CAPTURE", { streamId: streamId.substring(0, 30) });
        const tryCapture = async (sourceType, withAudio) => {
          logger.debug("RecorderModule", `TRYING_CAPTURE_MODE:${sourceType}`, { withAudio });
          const constraints = {
            video: {
              chromeMediaSource: sourceType,
              chromeMediaSourceId: streamId,
              mandatory: {
                chromeMediaSource: sourceType,
                chromeMediaSourceId: streamId
              }
            }
          };
          if (withAudio) {
            constraints.audio = {
              chromeMediaSource: sourceType,
              chromeMediaSourceId: streamId,
              mandatory: {
                chromeMediaSource: sourceType,
                chromeMediaSourceId: streamId
              }
            };
          }
          try {
            return await navigator.mediaDevices.getUserMedia(constraints);
          } catch (e) {
            logger.warn("RecorderModule", `GUM_EXCEPTION:${sourceType}`, {
              name: e.name,
              message: e.message,
              withAudio
            });
            throw e;
          }
        };
        try {
          screenStream = await tryCapture("desktop", true);
          logger.info("RecorderModule", "CAPTURE_SUCCESS:DESKTOP_AV");
        } catch (e1) {
          logger.warn("RecorderModule", "CAPTURE_FAIL:DESKTOP_AV", { error: e1.message });
          try {
            screenStream = await tryCapture("desktop", false);
            logger.info("RecorderModule", "CAPTURE_SUCCESS:DESKTOP_VIDEO_ONLY");
          } catch (e2) {
            logger.warn("RecorderModule", "CAPTURE_FAIL:DESKTOP_VIDEO", { error: e2.message });
            try {
              screenStream = await tryCapture("tab", true);
              logger.info("RecorderModule", "CAPTURE_SUCCESS:TAB_AV");
            } catch (e3) {
              logger.warn("RecorderModule", "CAPTURE_FAIL:TAB_AV", { error: e3.message });
              try {
                screenStream = await tryCapture("tab", false);
                logger.info("RecorderModule", "CAPTURE_SUCCESS:TAB_VIDEO_ONLY");
              } catch (e4) {
                logger.error("RecorderModule", "CAPTURE_ALL_MODES_FAILED", { error: e4.message });
                throw e4;
              }
            }
          }
        }
      } else if (target.type === "tab") {
        logger.info("RecorderModule", "PATH:TAB_CAPTURE", { tabId: target.tabId });
        if (!target.tabId) throw new Error("tabId is required for tab recording");
        const internalStreamId = await this.tabsAdapter.getMediaStreamId(target.tabId);
        logger.debug("RecorderModule", "TAB_STREAM_ID_ACQUIRED", { internalStreamId: internalStreamId.substring(0, 20) });
        screenStream = await navigator.mediaDevices.getUserMedia({
          video: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: internalStreamId } }
        });
        logger.info("RecorderModule", "TAB_STREAM_OK", {
          videoTracks: screenStream.getVideoTracks().length,
          audioTracks: screenStream.getAudioTracks().length
        });
      } else {
        logger.info("RecorderModule", "PATH:DISPLAY_MEDIA_FALLBACK");
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: config.frameRate },
          audio: true
        });
        logger.info("RecorderModule", "DISPLAY_MEDIA_OK", {
          videoTracks: screenStream.getVideoTracks().length,
          audioTracks: screenStream.getAudioTracks().length
        });
      }
      if (!screenStream) throw new Error("Failed to acquire screen stream \u2014 null returned");
      if (audioContext.state === "suspended") {
        logger.debug("RecorderModule", "RESUMING_AUDIO_CONTEXT");
        await audioContext.resume();
      }
      logger.debug("RecorderModule", "AUDIO_CONTEXT_READY", { state: audioContext.state });
      let micStream = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        logger.info("RecorderModule", "MIC_ACQUIRED", { tracks: micStream.getAudioTracks().length });
      } catch (e) {
        logger.warn("RecorderModule", "MIC_UNAVAILABLE", { error: e.message });
      }
      const destination = audioContext.createMediaStreamDestination();
      const screenAudioTracks = screenStream.getAudioTracks();
      const micAudioTracks = micStream?.getAudioTracks() ?? [];
      logger.debug("RecorderModule", "AUDIO_ROUTING", {
        screenAudioTracks: screenAudioTracks.length,
        micAudioTracks: micAudioTracks.length
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
      logger.debug("RecorderModule", "COMBINED_TRACKS", { videoTracks: screenStream.getVideoTracks().length, audioOutTracks: destination.stream.getAudioTracks().length });
      const mergedStream = new MediaStream(combinedTracks);
      const isSupported = MediaRecorder.isTypeSupported(config.mimeType);
      logger.debug("RecorderModule", "CODEC_SUPPORT", { mimeType: config.mimeType, supported: isSupported });
      this.mediaRecorder = new MediaRecorder(mergedStream, {
        mimeType: config.mimeType,
        videoBitsPerSecond: config.videoBitsPerSecond,
        audioBitsPerSecond: config.audioBitsPerSecond
      });
      logger.info("RecorderModule", "MEDIA_RECORDER_CREATED", {
        state: this.mediaRecorder.state,
        mimeType: this.mediaRecorder.mimeType
      });
      this.chunks = [];
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data);
          logger.debug("RecorderModule", "CHUNK_RECEIVED", {
            chunkSize: e.data.size,
            totalChunks: this.chunks.length,
            totalBytes: this.chunks.reduce((s, b) => s + b.size, 0)
          });
        } else {
          logger.warn("RecorderModule", "EMPTY_CHUNK", { size: e.data?.size ?? 0 });
        }
      };
      this.mediaRecorder.onerror = (e) => {
        logger.error("RecorderModule", "MEDIA_RECORDER_ERROR", { error: String(e) });
      };
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: config.mimeType });
        logger.info("RecorderModule", "RECORDER_STOPPED", {
          totalChunks: this.chunks.length,
          finalBlobSize: blob.size,
          mimeType: blob.type
        });
        if (blob.size === 0) {
          logger.error("RecorderModule", "ZERO_BYTE_BLOB", { chunks: this.chunks.length });
        }
        if (this.stopResolve) {
          this.stopResolve(blob);
          this.stopResolve = null;
        }
      };
      this.mediaRecorder.start(config.timesliceMs);
      this.startTime = Date.now();
      logger.info("RecorderModule", "MEDIA_RECORDER_STARTED", {
        timesliceMs: config.timesliceMs,
        state: this.mediaRecorder.state
      });
    } catch (e) {
      logger.error("RecorderModule", "START_FAILED", { error: e.message, stack: e.stack });
      throw e;
    }
  }
  async stop() {
    logger.info("RecorderModule", "STOP_CALLED", {
      recorderState: this.mediaRecorder?.state ?? "null",
      chunksCollected: this.chunks.length,
      elapsedMs: this.getElapsedMs()
    });
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
      logger.error("RecorderModule", "STOP_FAILED_NOT_RECORDING", { state: this.mediaRecorder?.state });
      throw new Error("Not recording");
    }
    return new Promise((resolve) => {
      this.stopResolve = resolve;
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((t) => {
        logger.debug("RecorderModule", "TRACK_STOPPED", { kind: t.kind, label: t.label });
        t.stop();
      });
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
logger.info("Offscreen", "OFFSCREEN_LOADED");
var tabsAdapter = new ChromeTabsAdapter();
var recorder = new RecorderModule(tabsAdapter);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return false;
  logger.debug("Offscreen", `MSG_IN:${message.type}`, { hasStreamId: !!message.streamId });
  (async () => {
    switch (message.type) {
      case "START_RECORDING":
        try {
          logger.info("Offscreen", "START_RECORDING_RECEIVED", {
            targetType: message.recordingTarget?.type,
            hasStreamId: !!message.streamId,
            streamIdPrefix: message.streamId?.substring(0, 20)
          });
          await recorder.start(message.recordingTarget, message.config || DEFAULT_CONFIG, message.streamId);
          logger.info("Offscreen", "START_RECORDING_SUCCESS");
          sendResponse({ success: true });
        } catch (e) {
          logger.error("Offscreen", "START_RECORDING_FAILED", { error: e.message, stack: e.stack });
          sendResponse({ success: false, error: e.message });
        }
        break;
      case "STOP_RECORDING":
        try {
          logger.info("Offscreen", "STOP_RECORDING_RECEIVED");
          const blob = await recorder.stop();
          logger.info("Offscreen", "RECORDER_STOPPED", { blobSize: blob.size, mimeType: blob.type });
          const buffer = await blob.arrayBuffer();
          logger.info("Offscreen", "BUFFER_CONVERTED", { byteLength: buffer.byteLength });
          chrome.runtime.sendMessage({
            type: "RECORDING_COMPLETE",
            buffer: ArrayBuffer.isView(buffer) ? buffer.buffer : buffer,
            mimeType: blob.type,
            size: blob.size
          });
          logger.info("Offscreen", "RECORDING_COMPLETE_SENT");
          sendResponse({ success: true });
        } catch (e) {
          logger.error("Offscreen", "STOP_RECORDING_FAILED", { error: e.message, stack: e.stack });
          sendResponse({ success: false, error: e.message });
        }
        break;
      default:
        logger.warn("Offscreen", "UNKNOWN_MESSAGE", { type: message.type });
        sendResponse({ success: false, error: "Unknown message type" });
    }
  })();
  return true;
});

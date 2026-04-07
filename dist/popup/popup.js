// src/ui/components/TabCard.ts
function createTabCard(title, url, faviconUrl, onClick) {
  const btn = document.createElement("button");
  btn.className = "tab-card";
  let domain = url;
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
  }
  const safeTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  btn.innerHTML = `
    ${faviconUrl ? `<img src="${faviconUrl}" class="tab-icon">` : `<div class="tab-icon" style="background:#333;"></div>`}
    <div class="tab-title">${safeTitle}</div>
    <div class="tab-domain">${domain}</div>
  `;
  btn.addEventListener("click", onClick);
  return btn;
}

// src/ui/components/AccountBadge.ts
function createAccountBadge(account) {
  const div = document.createElement("div");
  div.className = "account-item";
  let freeText = "Quota unknown";
  if (account.storageQuotaBytes > 0) {
    const freeBytes = account.storageQuotaBytes - account.storageUsedBytes;
    const freeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(1);
    freeText = `${freeGB} GB free`;
  }
  div.innerHTML = `
    <div class="account-status-dot"></div>
    <div class="account-email">${account.email}</div>
    <div class="account-space">${freeText}</div>
  `;
  return div;
}

// src/ui/components/ProgressBar.ts
function updateProgressBar(fillElement, textElement, percent) {
  fillElement.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  textElement.textContent = `${Math.floor(percent)}%`;
}

// src/ui/components/RecordButton.ts
function formatTimer(elapsedMs) {
  const sec = Math.floor(elapsedMs / 1e3 % 60);
  const min = Math.floor(elapsedMs / 6e4);
  const h = Math.floor(min / 60);
  const mm = (min % 60).toString().padStart(2, "0");
  const ss = sec.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// src/ui/popup/popup.ts
var PopupController = class {
  screens = {
    idle: document.getElementById("screen-idle"),
    tabSelect: document.getElementById("screen-tab-select"),
    recording: document.getElementById("screen-recording"),
    uploading: document.getElementById("screen-uploading"),
    success: document.getElementById("screen-success"),
    error: document.getElementById("screen-error")
  };
  tabs = [];
  lastSessionId = null;
  downloadUrlFromFallback = null;
  async init() {
    this.bindEvents();
    await this.refreshState();
  }
  bindEvents() {
    document.getElementById("btn-new-recording").addEventListener("click", async () => {
      const state = await this.sendMessage("GET_STATE");
      if (!state.accounts || state.accounts.length === 0) {
        const connect = await this.sendMessage("CONNECT_ACCOUNT");
        if (!connect.account) return;
      }
      this.showScreen("tabSelect");
      this.loadTabs();
    });
    document.getElementById("btn-add-account").addEventListener("click", async () => {
      const resp = await this.sendMessage("CONNECT_ACCOUNT");
      if (resp.account) {
        this.refreshState();
      }
    });
    document.getElementById("btn-connect-mock").addEventListener("click", async () => {
      const resp = await this.sendMessage("CONNECT_MOCK_ACCOUNT");
      if (resp.account) {
        this.refreshState();
      }
    });
    globalThis.SV_DEBUG = {
      getState: () => this.sendMessage("GET_STATE").then(console.table),
      getLogs: () => this.sendMessage("GET_LOGS").then(console.table),
      reset: () => chrome.storage.local.clear().then(() => location.reload())
    };
    document.getElementById("btn-back").addEventListener("click", () => {
      this.showScreen("idle");
    });
    document.getElementById("btn-record-screen").addEventListener("click", () => {
      this.startRecording({ type: "screen" });
    });
    document.getElementById("btn-record-window").addEventListener("click", () => {
      this.startRecording({ type: "window" });
    });
    const filterInput = document.getElementById("tab-filter");
    filterInput.addEventListener("input", () => {
      this.renderTabs(filterInput.value);
    });
    document.getElementById("btn-stop-recording").addEventListener("click", () => {
      this.sendMessage("STOP_RECORDING");
    });
    document.getElementById("btn-cancel-upload").addEventListener("click", () => {
      this.showScreen("idle");
    });
    document.getElementById("btn-copy-link").addEventListener("click", async () => {
      const state = await this.sendMessage("GET_STATE");
      if (state.activeSession?.uploadUrl) {
        this.copyToClipboard(state.activeSession.uploadUrl);
      }
    });
    document.getElementById("btn-open-link").addEventListener("click", async () => {
      const state = await this.sendMessage("GET_STATE");
      if (state.activeSession?.uploadUrl) {
        chrome.tabs.create({ url: state.activeSession.uploadUrl });
      }
    });
    document.getElementById("btn-save-disk").addEventListener("click", async () => {
      const res = await this.sendMessage("GET_RECORDING_BUFFER");
      if (res.buffer) {
        const blob = new Blob([res.buffer], { type: res.mimeType });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({ url, filename: `screenvault-${Date.now()}.webm` });
      }
    });
    document.getElementById("btn-retry").addEventListener("click", () => {
      this.showScreen("idle");
    });
    setInterval(() => this.refreshState(), 1e3);
  }
  async loadTabs() {
    this.tabs = await chrome.tabs.query({});
    this.renderTabs("");
  }
  renderTabs(filterBase) {
    const list = document.getElementById("tabs-list");
    list.innerHTML = "";
    const filter = filterBase.toLowerCase();
    const filtered = this.tabs.filter((t) => t.title?.toLowerCase().includes(filter) || t.url?.toLowerCase().includes(filter));
    filtered.slice(0, 50).forEach((tab) => {
      const card = createTabCard(tab.title || "Untitled", tab.url || "", tab.favIconUrl, () => {
        this.startRecording({
          type: "tab",
          tabId: tab.id,
          tabTitle: tab.title,
          tabFavicon: tab.favIconUrl
        });
      });
      list.appendChild(card);
    });
  }
  async startRecording(target) {
    if (target.type === "screen" || target.type === "window") {
      chrome.desktopCapture.chooseDesktopMedia(["screen", "window", "tab"], (streamId) => {
        if (!streamId) {
          this.showError("Screen capture permission denied");
          return;
        }
        this.sendStartRecording({ ...target, streamId });
      });
    } else {
      this.sendStartRecording(target);
    }
  }
  async sendStartRecording(target) {
    const res = await this.sendMessage("START_RECORDING", { target });
    if (res.success) {
      this.showScreen("recording");
      setTimeout(() => window.close(), 1500);
    } else {
      this.showError(res.error || "Recording failed to start");
    }
  }
  copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
    });
  }
  showScreen(screenKey) {
    Object.values(this.screens).forEach((s) => s.classList.remove("active"));
    const target = this.screens[screenKey];
    if (target) {
      target.classList.add("active");
    }
  }
  showError(reason) {
    this.showScreen("error");
    document.getElementById("error-reason").textContent = reason;
  }
  async refreshState() {
    const state = await this.sendMessage("GET_STATE");
    if (!state.status || state.status === "idle") {
      if (!this.screens.tabSelect.classList.contains("active")) {
        this.showScreen("idle");
      }
      const accList = document.getElementById("accounts-list");
      accList.innerHTML = "";
      if (state.accounts) {
        document.getElementById("account-count").textContent = state.accounts.length.toString();
        state.accounts.forEach((acc) => {
          accList.appendChild(createAccountBadge(acc));
        });
      }
    } else if (state.status === "recording") {
      this.showScreen("recording");
      const session = state.activeSession;
      if (session) {
        document.getElementById("recording-target-title").textContent = session.target.tabTitle || "Screen or Window";
        document.getElementById("recording-timer").textContent = formatTimer(Date.now() - session.startedAt);
      }
    } else if (state.status === "processing" || state.status === "uploading") {
      this.showScreen("uploading");
      if (state.uploadProgress) {
        updateProgressBar(
          document.getElementById("upload-progress-fill"),
          document.getElementById("upload-percent"),
          state.uploadProgress.percent
        );
      }
    } else if (state.status === "success") {
      this.showScreen("success");
      const session = state.activeSession;
      if (session && session.id !== this.lastSessionId) {
        this.lastSessionId = session.id;
        if (session.uploadUrl) this.copyToClipboard(session.uploadUrl);
      }
      if (session) {
        const mb = ((session.fileSizeBytes || 0) / (1024 * 1024)).toFixed(1);
        document.getElementById("success-details").textContent = `${session.uploadedToAccountId || "Cloud"} \xB7 ${mb} MB`;
      }
    } else if (state.status === "error") {
      this.showError(state.activeSession?.error?.message || "Unknown error");
    }
  }
  sendMessage(type, payload = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, ...payload }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(res || { success: false });
        }
      });
    });
  }
};
document.addEventListener("DOMContentLoaded", () => {
  const popup = new PopupController();
  popup.init();
});

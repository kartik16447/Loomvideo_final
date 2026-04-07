// src/content/content.ts
var trayRoot = null;
var timerInterval = null;
function createTray(startTime) {
  if (trayRoot) return;
  const root = document.createElement("div");
  root.id = "screenvault-tray-root";
  const flex = document.createElement("div");
  flex.className = "sv-flex";
  const indicator = document.createElement("div");
  indicator.style.display = "flex";
  indicator.style.alignItems = "center";
  const dot = document.createElement("div");
  dot.className = "sv-pulse";
  const timer = document.createElement("div");
  timer.className = "sv-timer";
  timer.textContent = "00:00:00";
  indicator.appendChild(dot);
  indicator.appendChild(timer);
  const handle = document.createElement("div");
  handle.className = "sv-drag-handle";
  handle.innerHTML = "\u22EE";
  flex.appendChild(indicator);
  const stopBtn = document.createElement("button");
  stopBtn.className = "sv-stop-btn";
  stopBtn.innerHTML = '<span class="sv-square">\u25A0</span> Stop Recording';
  stopBtn.onclick = () => {
    chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
    removeTray();
  };
  root.appendChild(flex);
  root.appendChild(stopBtn);
  root.appendChild(handle);
  document.documentElement.appendChild(root);
  trayRoot = root;
  timerInterval = setInterval(() => {
    if (!trayRoot) return;
    const elapsed = Date.now() - startTime;
    const sec = Math.floor(elapsed / 1e3 % 60);
    const min = Math.floor(elapsed / 6e4);
    const h = Math.floor(min / 60);
    const mm = (min % 60).toString().padStart(2, "0");
    const ss = sec.toString().padStart(2, "0");
    timer.textContent = h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }, 1e3);
}
function removeTray() {
  if (trayRoot && trayRoot.parentNode) {
    trayRoot.parentNode.removeChild(trayRoot);
  }
  trayRoot = null;
  if (timerInterval) clearInterval(timerInterval);
}
chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
  if (chrome.runtime.lastError) return;
  if (state?.status === "recording" && state.activeSession) {
    createTray(state.activeSession.startedAt);
  }
});
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE_UPDATE") {
    if (message.state.status === "recording" && message.state.activeSession) {
      createTray(message.state.activeSession.startedAt);
    } else {
      removeTray();
    }
  }
});

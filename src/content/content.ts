// ScreenVault — Content Script
let trayRoot: HTMLElement | null = null;
let timerInterval: ReturnType<typeof setInterval> | null = null;

function createTray(startTime: number) {
  if (trayRoot) return;

  const root = document.createElement('div');
  root.id = 'screenvault-tray-root';

  // Drag Handle
  const handle = document.createElement('div');
  handle.className = 'sv-drag-handle';
  handle.innerHTML = '⋮⋮';

  // Timer Group
  const timerGroup = document.createElement('div');
  timerGroup.className = 'sv-timer-group';
  
  const dot = document.createElement('div');
  dot.className = 'sv-pulse';
  
  const timer = document.createElement('div');
  timer.className = 'sv-timer';
  timer.textContent = '00:00';
  
  timerGroup.appendChild(dot);
  timerGroup.appendChild(timer);

  // Buttons Group
  const btnGroup = document.createElement('div');
  btnGroup.className = 'sv-btn-group';

  // Stop Button
  const stopBtn = document.createElement('button');
  stopBtn.className = 'sv-icon-btn sv-stop';
  stopBtn.title = "Stop & Save";
  stopBtn.innerHTML = '<div class="sv-square"></div>';
  stopBtn.onclick = () => {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    removeTray();
  };

  // Cancel Button
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'sv-icon-btn sv-cancel';
  cancelBtn.title = "Cancel";
  cancelBtn.innerHTML = '✕';
  cancelBtn.onclick = () => {
    chrome.runtime.sendMessage({ type: 'CANCEL_RECORDING' });
    removeTray();
  };

  btnGroup.appendChild(stopBtn);
  btnGroup.appendChild(cancelBtn);

  // Assemble
  root.appendChild(handle);
  root.appendChild(timerGroup);
  
  const divider = document.createElement('div');
  divider.className = 'sv-divider';
  root.appendChild(divider);
  
  root.appendChild(btnGroup);

  document.documentElement.appendChild(root);
  trayRoot = root;

  timerInterval = setInterval(() => {
    if (!trayRoot) return;
    const elapsed = Date.now() - startTime;
    const sec = Math.floor((elapsed / 1000) % 60);
    const min = Math.floor(elapsed / 60000);
    const mm = min.toString().padStart(2, '0');
    const ss = sec.toString().padStart(2, '0');
    timer.textContent = `${mm}:${ss}`;
  }, 1000);
}

function removeTray() {
  if (trayRoot && trayRoot.parentNode) {
    trayRoot.parentNode.removeChild(trayRoot);
  }
  trayRoot = null;
  if (timerInterval) clearInterval(timerInterval);
}

function isContextValid() {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

// Initial Sync
if (isContextValid()) {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (chrome.runtime.lastError) return;
    if (state?.status === 'recording' && state.activeSession) {
      createTray(state.activeSession.startedAt);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!isContextValid()) return;
    if (message.type === 'STATE_UPDATE') {
      if (message.state.status === 'recording' && message.state.activeSession) {
        createTray(message.state.activeSession.startedAt);
      } else {
        removeTray();
      }
    }
  });
}

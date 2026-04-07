
# ScreenVault — Chrome Extension Screen Recorder
## Master Engineering Prompt v2 (AI Editor Optimized)

---

## ROLE & CONTEXT

You are a **Senior Staff Engineer** building a production-grade Chrome extension called **ScreenVault**
— a Loom-like screen + mic recorder with automatic, zero-friction cloud upload.

**Target runtime**: Chrome Extension Manifest V3
**Language**: TypeScript (strict mode, zero `any`)
**UI Aesthetic**: Dark, refined, minimal — think Linear meets Vercel. No gradients. No rounded pill buttons.
Sharp `6px` borders, monospace accents, purposeful whitespace.
**Build tool**: esbuild

---

## ⚠ PRIORITY ORDER — READ THIS FIRST

> **Do not sacrifice simplicity for completeness.**
> The system must work end-to-end before it is optimized.
> A working MVP beats a perfect skeleton.

**Priority 1** — Record → Upload → Shareable link works, end-to-end.
**Priority 2** — Multi-account support + smart routing works.
**Priority 3** — Performance, buffering, retries are optimized.

**Rule**: If a feature introduces significant complexity (IndexedDB buffering, resumable uploads,
chunked streaming), implement it as a **clearly marked stub** first. Do not block Phase 1 on Phase 2 work.

---

## SUCCESS METRICS

Every architectural decision must optimize for these:

| Metric | Target |
|---|---|
| Stop → shareable link | < 5 seconds |
| Recording start latency | < 500ms |
| Upload success rate | > 98% |
| Popup open time | < 100ms |
| Max recording duration | 60 minutes |
| CPU during recording (M1 Mac) | < 5% |

---

## ABSOLUTE RULES

1. **Never** put Google Drive logic outside `GoogleDriveAdapter.ts`.
2. **Never** mix UI code with business logic — zero DOM calls inside services.
3. **Never** hardcode provider names in the core system.
4. **Never** call `chrome.*` APIs directly inside business logic — wrap every Chrome API in a thin interface so modules are testable outside the extension context.
5. **Never** store tokens in `chrome.storage.sync` — use `chrome.storage.local` only.
6. **Never** ask the user which account to upload to — the router decides silently.
7. **Always** use the centralized `logger` utility — no bare `console.log` anywhere.
8. On tab navigation or extension popup re-open, **recording must continue uninterrupted**.

---

## IMPLEMENTATION PHASES

### PHASE 1 — MVP (implement fully, ship first)
- [ ] Types, errors, logger
- [ ] Chrome API wrappers (testability layer)
- [ ] RecorderModule (screen + mic, tab/screen/window)
- [ ] CompressionModule (in-memory, WebM/VP9)
- [ ] StorageAdapter interface + MockStorageAdapter
- [ ] GoogleDriveAdapter (single-account, simple multipart upload)
- [ ] AccountManager (single account, connect/disconnect)
- [ ] UploadManager (no retry, no chunks — just upload)
- [ ] AppState store
- [ ] Service worker + offscreen document
- [ ] Popup UI (all 6 screens)
- [ ] Tab picker
- [ ] Recording badge

### PHASE 2 — Multi-account + Routing (implement after Phase 1 works)
- [ ] Multi-account support in AccountManager (up to 5 accounts)
- [ ] SmartUploadRouter (scoring + fallback)
- [ ] GoogleDriveAdapter upgrade: resumable uploads (scaffold in Phase 1, complete here)
- [ ] Retry logic in UploadManager
- [ ] Token refresh

### PHASE 3 — Performance (scaffold in Phase 1, implement here)
- [ ] ChunkBuffer (IndexedDB for recordings > 5 min)
- [ ] Upload progress streaming
- [ ] Memory pressure relief
- [ ] S3Adapter stub → implementation
- [ ] DropboxAdapter stub

> **For Phase 2 and 3 items**: During Phase 1, create the file with the correct interface and
> a `// PHASE 2` or `// PHASE 3` comment on the stub body. Do not leave the system broken —
> stubs must be valid TypeScript that compiles and returns safe default values.

---

## FOLDER STRUCTURE

Generate exactly this. No deviations.

```
screenvault/
├── manifest.json
├── tsconfig.json
├── package.json
│
├── src/
│   ├── types/
│   │   ├── index.ts                  # All shared types & interfaces
│   │   └── errors.ts                 # Typed error classes + ErrorCode enum
│   │
│   ├── logger/
│   │   └── logger.ts                 # Centralized structured logger — IMPLEMENT FULLY
│   │
│   ├── chrome-api/                   # TESTABILITY LAYER — wraps all chrome.* calls
│   │   ├── ChromeStorageAdapter.ts   # Wraps chrome.storage.local
│   │   ├── ChromeIdentityAdapter.ts  # Wraps chrome.identity
│   │   ├── ChromeTabsAdapter.ts      # Wraps chrome.tabs + chrome.tabCapture
│   │   └── ChromeActionAdapter.ts    # Wraps chrome.action (badge)
│   │
│   ├── recorder/
│   │   ├── RecorderModule.ts         # Screen + mic capture — IMPLEMENT FULLY
│   │   └── RecorderConfig.ts         # Bitrate, FPS, codec defaults
│   │
│   ├── compression/
│   │   └── CompressionModule.ts      # In-memory WebM pass-through MVP, Phase 3 upgrades
│   │
│   ├── storage/
│   │   ├── StorageAdapter.ts         # Interface ONLY — no implementation here
│   │   └── adapters/
│   │       ├── GoogleDriveAdapter.ts # IMPLEMENT FULLY (Phase 1: multipart, Phase 2: resumable)
│   │       ├── MockStorageAdapter.ts # IMPLEMENT FULLY — for testing
│   │       ├── S3Adapter.ts          # PHASE 3 stub
│   │       └── DropboxAdapter.ts     # PHASE 3 stub
│   │
│   ├── accounts/
│   │   ├── AccountManager.ts         # Phase 1: single account. Phase 2: multi-account
│   │   └── TokenRefresher.ts         # Phase 2 — stub in Phase 1
│   │
│   ├── router/
│   │   └── SmartUploadRouter.ts      # Phase 2 — Phase 1 stub just returns first account
│   │
│   ├── upload/
│   │   └── UploadManager.ts          # Phase 1: simple upload. Phase 2: retry + fallback
│   │
│   ├── buffer/
│   │   └── ChunkBuffer.ts            # Phase 3 — stub interface in Phase 1
│   │
│   ├── state/
│   │   └── AppState.ts               # Tiny pub/sub store — IMPLEMENT FULLY
│   │
│   ├── background/
│   │   └── service-worker.ts         # MV3 service worker — IMPLEMENT FULLY
│   │
│   ├── offscreen/
│   │   ├── offscreen.html
│   │   └── offscreen.ts              # MediaRecorder lives ONLY here — IMPLEMENT FULLY
│   │
│   └── ui/
│       ├── popup/
│       │   ├── popup.html
│       │   ├── popup.ts              # IMPLEMENT FULLY
│       │   └── popup.css             # IMPLEMENT FULLY — all 6 screens
│       └── components/
│           ├── RecordButton.ts
│           ├── ProgressBar.ts
│           ├── TabCard.ts
│           └── AccountBadge.ts
│
└── dist/
```

---

## MODULE SPECIFICATIONS

### `src/logger/logger.ts` — Centralized Structured Logger ✅ IMPLEMENT FULLY

```typescript
// Every log must be structured. No bare strings.
// Format: { ts, level, module, action, sessionId?, data? }

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;          // ISO timestamp
  level: LogLevel;
  module: string;      // e.g. 'RecorderModule', 'GoogleDriveAdapter'
  action: string;      // e.g. 'START_RECORDING', 'UPLOAD_COMPLETE'
  sessionId?: string;
  data?: Record<string, unknown>;
}

// Requirements:
// - DEBUG_MODE controlled by a single const at top of file
//   Set DEBUG_MODE = true in development, false in production
// - When DEBUG_MODE is false: suppress 'debug' level logs entirely
// - logger.debug / logger.info / logger.warn / logger.error
// - Each method signature: (module: string, action: string, data?: object, sessionId?: string)
// - Output via console.log(JSON.stringify(entry)) — structured only
// - Export a singleton: export const logger = new Logger()
// - Never throw — logging must never crash the app
```

---

### `src/chrome-api/` — Chrome API Wrappers ✅ IMPLEMENT FULLY

Every wrapper must expose a plain TypeScript interface so business logic modules can be unit-tested by injecting a mock instead of the real Chrome API.

```typescript
// ChromeStorageAdapter.ts
interface IStorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}
// Implement with chrome.storage.local
// Mock: implement with a plain in-memory Map for tests

// ChromeIdentityAdapter.ts
interface IIdentityAdapter {
  getAuthToken(options: { interactive: boolean }): Promise<string>;
  removeCachedAuthToken(token: string): Promise<void>;
  getProfileUserInfo(): Promise<{ email: string; id: string }>;
}

// ChromeTabsAdapter.ts
interface ITabsAdapter {
  queryAllTabs(): Promise<chrome.tabs.Tab[]>;
  getMediaStreamId(tabId: number): Promise<string>;
  onTabRemoved(callback: (tabId: number) => void): void;
  onTabUpdated(callback: (tabId: number, info: chrome.tabs.TabChangeInfo) => void): void;
}

// ChromeActionAdapter.ts
interface IActionAdapter {
  setBadgeText(text: string): Promise<void>;
  setBadgeBackgroundColor(color: string): Promise<void>;
  setIcon(path: string): Promise<void>;
}
```

---

### `src/types/index.ts` — Shared Types ✅ IMPLEMENT FULLY

```typescript
export type AppStatus =
  | 'idle'
  | 'tab-select'
  | 'recording'
  | 'processing'
  | 'uploading'
  | 'success'
  | 'error';

export interface RecordingTarget {
  type: 'tab' | 'window' | 'screen';
  tabId?: number;
  tabTitle?: string;
  tabFavicon?: string;
}

export interface RecordingSession {
  id: string;                    // crypto.randomUUID()
  startedAt: number;             // unix ms
  target: RecordingTarget;
  status: AppStatus;
  durationMs?: number;
  fileSizeBytes?: number;
  uploadUrl?: string;
  uploadedToAccountId?: string;
  error?: SerializedError;       // plain object (AppError is not serializable via postMessage)
}

export interface StorageAccount {
  id: string;
  provider: 'google-drive' | 's3' | 'dropbox' | 'r2';
  email: string;
  displayName: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  lastUsedAt?: number;
  uploadSuccessCount: number;
  uploadFailureCount: number;
}

export interface UploadResult {
  success: boolean;
  url?: string;
  accountId?: string;
  error?: SerializedError;
}

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  accountId: string;
}

export interface RouterDecision {
  account: StorageAccount;
  reason: string;
}

// Use this instead of AppError when crossing message boundaries (postMessage, chrome.runtime)
export interface SerializedError {
  code: string;
  message: string;
  recoverable: boolean;
  context?: Record<string, unknown>;
}
```

---

### `src/types/errors.ts` — Typed Error System ✅ IMPLEMENT FULLY

```typescript
export type ErrorCode =
  | 'RECORDING_PERMISSION_DENIED'
  | 'RECORDING_STREAM_LOST'
  | 'RECORDING_MIC_UNAVAILABLE'
  | 'COMPRESSION_FAILED'
  | 'UPLOAD_NO_ACCOUNTS'
  | 'UPLOAD_ALL_ACCOUNTS_FAILED'
  | 'UPLOAD_QUOTA_EXCEEDED'
  | 'UPLOAD_TOKEN_EXPIRED'
  | 'UPLOAD_NETWORK_ERROR'
  | 'ROUTER_NO_ELIGIBLE_ACCOUNTS'
  | 'TAB_CAPTURE_FAILED'
  | 'OFFSCREEN_INIT_FAILED';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly recoverable: boolean,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON(): SerializedError {
    return {
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      context: this.context,
    };
  }

  static from(e: SerializedError): AppError {
    return new AppError(e.code as ErrorCode, e.message, e.recoverable, e.context);
  }
}
```

---

### `src/recorder/RecorderModule.ts` ✅ IMPLEMENT FULLY

```typescript
// Lives in offscreen.ts — RecorderModule is imported and instantiated there ONLY.

interface RecorderConfig {
  videoBitsPerSecond: 1_000_000 | 1_500_000;
  frameRate: 15 | 20;
  audioBitsPerSecond: 128_000;
  mimeType: 'video/webm;codecs=vp9,opus';
  timesliceMs: 1000;
}

// Default config:
const DEFAULT_CONFIG: RecorderConfig = {
  videoBitsPerSecond: 1_000_000,
  frameRate: 15,
  audioBitsPerSecond: 128_000,
  mimeType: 'video/webm;codecs=vp9,opus',
  timesliceMs: 1000,
};

// The recorder must:
// 1. Accept a RecordingTarget
// 2. For type 'tab': receive mediaStreamId (from service worker) → navigator.getUserMedia({ video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } })
// 3. For type 'screen'/'window': getDisplayMedia({ video: { frameRate }, audio: true })
// 4. Mix mic audio via AudioContext: createMediaStreamSource(micStream) → createMediaStreamDestination() → merge with screen stream
// 5. Emit chunks via EventEmitter pattern: on('chunk', (chunk: Blob, index: number) => void)
// 6. Collect chunks in a local array
// 7. on stop(): new Blob(chunks, { type: mimeType }) → emit on('complete', blob)
// 8. Expose: start(target, config?), stop(), getElapsedMs(): number
// 9. No chrome.* calls — accept ITabsAdapter as constructor injection
```

---

### `src/compression/CompressionModule.ts` — Phase 1: Pass-through ✅ IMPLEMENT

```typescript
// PHASE 1: Return the input blob unchanged (WebM from MediaRecorder is already compressed).
// Add a comment block at top explaining the Phase 3 upgrade path to FFmpeg WASM / AV1.
// Interface must be:

interface ICompressionModule {
  compress(blob: Blob, sessionId: string): Promise<Blob>;
}

// Phase 1 implementation: return blob as-is, log compression skip.
// Phase 3: swap body only — interface stays identical.
```

---

### `src/storage/StorageAdapter.ts` — Interface Contract ✅ IMPLEMENT FULLY

```typescript
// This file contains ONLY the interface. Zero implementation.
// All core system modules depend on this interface, never on a concrete adapter.

export interface IStorageAdapter {
  /**
   * Upload a blob. Report progress via onProgress.
   * Must return a publicly shareable URL on success.
   */
  upload(
    file: Blob,
    fileName: string,
    accountId: string,
    onProgress: (progress: UploadProgress) => void
  ): Promise<UploadResult>;

  /** Return free bytes. Return 0 on any error — never throw. */
  getAvailableSpaceBytes(account: StorageAccount): Promise<number>;

  /** Fetch quota from provider and update account object in-place. */
  refreshQuota(account: StorageAccount): Promise<void>;

  /** Return false if token is expired AND refresh fails. Never throw. */
  isAvailable(account: StorageAccount): Promise<boolean>;

  /** Silently refresh OAuth token. Return updated account. */
  refreshToken(account: StorageAccount): Promise<StorageAccount>;
}
```

---

### `src/storage/adapters/MockStorageAdapter.ts` ✅ IMPLEMENT FULLY

```typescript
// Used in unit tests and local development without a real Google account.
// Simulates a realistic upload with progress callbacks.
// Constructor accepts options: { simulateFailure?: boolean, simulatedDelayMs?: number, fakeUrl?: string }
// getAvailableSpaceBytes: returns 10GB
// upload: fires onProgress in 10% increments with setTimeout, then resolves with fakeUrl
// isAvailable: returns true (unless simulateFailure)
// Must be usable with zero Chrome APIs — plain TypeScript only
```

---

### `src/storage/adapters/GoogleDriveAdapter.ts` ✅ IMPLEMENT FULLY

```typescript
// Phase 1: Simple multipart upload (works for files < 5MB, sufficient for short recordings)
// Phase 2: Upgrade to resumable upload (mark the upgrade point clearly with // PHASE 2 comments)

// Phase 1 implementation must:
// 1. Accept IIdentityAdapter (injected) — never call chrome.identity directly
// 2. POST to https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart
// 3. Build multipart/related body: metadata part + media part
// 4. After upload: POST to drive/v3/files/{id}/permissions { type: 'anyone', role: 'reader' }
// 5. GET drive/v3/files/{id}?fields=webViewLink → return as shareable URL
// 6. refreshQuota: GET drive/v3/about?fields=storageQuota → parse limit, usage
// 7. On 401: call identityAdapter.removeCachedAuthToken(token) then retry once
// 8. Never log the access token — log only the first 8 chars + '...' for debugging
// 9. All errors must be caught and returned as UploadResult { success: false, error }
// 10. Use logger for every significant action

// Phase 2 stub (leave as comment block):
// - Use uploadType=resumable, chunk in 5MB pieces, track resumable session URI
// - Retry individual chunks on 5xx
```

---

### `src/accounts/AccountManager.ts` ✅ IMPLEMENT FULLY

```typescript
// Phase 1: supports one account.
// Phase 2: supports up to 5 accounts (array — no structural change needed).

// Depends on: IStorageAdapter (IIdentityAdapter injected), IStorageAdapter (chrome storage)

class AccountManager {
  // connectAccount(): opens OAuth flow, fetches profile, creates StorageAccount,
  //   calls refreshQuota(), saves to chrome.storage.local
  // disconnectAccount(id: string): removes from storage
  // getAccounts(): Promise<StorageAccount[]>
  // getAccountById(id: string): Promise<StorageAccount | null>
  // updateAccount(account: StorageAccount): persists to storage
  // refreshAllQuotas(): calls refreshQuota for each account (Phase 2: parallel)
}
```

---

### `src/router/SmartUploadRouter.ts`

```typescript
// PHASE 1 STUB: Return the first available account. Log that routing is bypassed.
// PHASE 2: Implement full scoring algorithm below.

// Phase 2 scoring (implement in Phase 2, document now):
//   reliability  = successCount / (successCount + failureCount + 1)
//   freeScore    = accountFreeBytes / maxFreeBytes   // normalized 0–1 across eligible accounts
//   recencyBonus = lastUsedAt > Date.now() - 7_DAYS ? 0.1 : 0
//   score        = (reliability * 0.5) + (freeScore * 0.4) + recencyBonus
//
// Filter first: remove accounts where freeBytes < fileSizeBytes * 1.2
// Sort by score descending
// Return RouterDecision { account, reason: "google-drive/alice@gmail.com — 87% reliable, 14.2GB free" }
// If no eligible accounts: throw AppError('ROUTER_NO_ELIGIBLE_ACCOUNTS', ..., recoverable: false)

// Phase 2 also implements uploadWithFallback():
//   Try accounts in score order
//   On failure: mark failure on account (increment failureCount), try next
//   Never throw — always return UploadResult
```

---

### `src/upload/UploadManager.ts` ✅ IMPLEMENT FULLY

```typescript
// Phase 1: Linear upload — no retry, no chunks.
// Phase 2: Retry once on failure, use router fallback.

class UploadManager {
  // upload(blob: Blob, session: RecordingSession, onProgress: (p: UploadProgress) => void): Promise<UploadResult>
  //
  // Phase 1 flow:
  //   1. Get accounts from AccountManager
  //   2. If none → return error UploadResult
  //   3. Pick first account (router stub)
  //   4. Call adapter.upload(blob, fileName, accountId, onProgress)
  //   5. Return result
  //
  // Phase 2 adds:
  //   - router.uploadWithFallback()
  //   - retry logic (1 retry per account, exponential backoff: 1s, 2s)
  //
  // fileName format: 'screenvault-{sessionId}-{YYYY-MM-DD}.webm'
}
```

---

### `src/state/AppState.ts` ✅ IMPLEMENT FULLY

```typescript
// Tiny reactive pub/sub store. Zero frameworks.
// Persists 'status' and 'activeSession' to chrome.storage.local automatically via injected IStorageAdapter.
// On init: hydrates from chrome.storage.local.

type StateKey = 'status' | 'activeSession' | 'accounts' | 'uploadProgress';

type StateShape = {
  status: AppStatus;
  activeSession: RecordingSession | null;
  accounts: StorageAccount[];
  uploadProgress: UploadProgress | null;
};

class AppState {
  private state: StateShape;
  private listeners: Map<StateKey, Set<(value: unknown) => void>>;

  get<K extends StateKey>(key: K): StateShape[K];
  set<K extends StateKey>(key: K, value: StateShape[K]): void; // persists + notifies
  subscribe<K extends StateKey>(key: K, cb: (value: StateShape[K]) => void): () => void; // returns unsubscribe
  async hydrate(): Promise<void>; // load from chrome.storage.local on startup
}

export const appState = new AppState();
```

---

### `src/background/service-worker.ts` ✅ IMPLEMENT FULLY

```typescript
// The service worker is the ONLY module that writes to chrome.storage.local directly.
// All other modules send messages to it via chrome.runtime.sendMessage.

// Message API (implement a typed message dispatcher):
type Message =
  | { type: 'GET_STATE' }
  | { type: 'START_RECORDING'; target: RecordingTarget }
  | { type: 'STOP_RECORDING' }
  | { type: 'GET_ACCOUNTS' }
  | { type: 'CONNECT_ACCOUNT' }
  | { type: 'DISCONNECT_ACCOUNT'; accountId: string }
  | { type: 'GET_UPLOAD_PROGRESS' };

// On START_RECORDING:
//   1. Create offscreen document if not exists (chrome.offscreen.createDocument)
//   2. If target.type === 'tab': call chrome.tabCapture.getMediaStreamId({ targetTabId })
//      Pass streamId to offscreen document via chrome.runtime.sendMessage
//   3. If target.type === 'screen': send START message to offscreen, let it call getDisplayMedia
//   4. Save RecordingSession to chrome.storage.local under key 'activeSession'
//   5. Start badge timer: setInterval every 1000ms → chrome.action.setBadgeText(MM:SS)
//
// On STOP_RECORDING:
//   1. Send STOP to offscreen document
//   2. Receive blob via message from offscreen (as ArrayBuffer, reassemble as Blob)
//   3. Update session status to 'processing'
//   4. Run CompressionModule.compress(blob)
//   5. Update status to 'uploading'
//   6. Run UploadManager.upload(compressed, session, onProgress)
//   7. Update session with result (url or error)
//   8. Clear badge
//   9. Save final session to storage
//
// RELOAD SURVIVAL:
//   - On service worker startup: check chrome.storage.local for 'activeSession'
//   - If activeSession.status === 'recording': check chrome.offscreen.hasDocument()
//   - If offscreen exists: re-attach (resume badge timer, reconnect message channel)
//   - If offscreen missing: session was lost — mark as error, surface in UI
//
// Tab event listeners:
//   - chrome.tabs.onRemoved: if removed tab === recording target → trigger STOP_RECORDING
//   - chrome.tabs.onUpdated: if navigated tab === recording target → update tabTitle in session, DO NOT stop
```

---

### `src/offscreen/offscreen.ts` ✅ IMPLEMENT FULLY

```typescript
// MediaRecorder lives HERE and ONLY HERE.
// Communicates with service worker via chrome.runtime.sendMessage / onMessage.

// Messages it receives:
//   { type: 'START_TAB_RECORDING', streamId: string, config: RecorderConfig }
//   { type: 'START_SCREEN_RECORDING', config: RecorderConfig }
//   { type: 'STOP_RECORDING' }

// On START_*:
//   1. Instantiate RecorderModule with appropriate target
//   2. Listen for 'chunk' events — push to local chunks array
//   3. Set chunk count in memory (Phase 3: flush to IndexedDB if chunks.length * avgSize > 200MB)

// On STOP_RECORDING:
//   1. Call recorder.stop()
//   2. Wait for 'complete' event → get final blob
//   3. Convert blob to ArrayBuffer (blob.arrayBuffer())
//   4. Send back to service worker: { type: 'RECORDING_COMPLETE', buffer: ArrayBuffer, mimeType: string, size: number }
//   5. Use transferable objects for ArrayBuffer to avoid memory copy
```

---

### Tab Selection — UX Flow

**This is implemented entirely in the popup. No new windows.**

Flow:
1. User clicks "New Recording" → popup transitions to Screen 2 (tab picker)
2. Popup calls `GET_ACCOUNTS` → if no accounts connected, show connect prompt first
3. `chrome.tabs.query({})` → render tab list
4. User clicks a tab card or "Entire Screen" / "Application Window"
5. Popup sends `{ type: 'START_RECORDING', target }` to service worker
6. Popup transitions to Screen 3 (recording active) for 1.5s, then closes
7. Service worker continues — badge shows elapsed time

Tab picker UI requirements:
- Max visible: 6 tabs, then scroll
- Each card: 48px tall — favicon (16px) + title (truncated, 200px max) + domain (secondary color)
- "Entire Screen" and "Application Window" pinned at top with icons, separated by a divider
- Filter input at top: filters by title + URL in real-time as user types
- Keyboard support: arrow keys navigate, Enter selects, Escape returns to idle
- No tab is auto-selected — user must explicitly click

---

### `src/ui/popup/popup.css` ✅ IMPLEMENT FULLY — ALL 6 SCREENS

**Design tokens:**
```css
:root {
  --bg:           #0a0a0a;
  --surface:      #111111;
  --surface-hover:#161616;
  --border:       #1f1f1f;
  --border-focus: #333333;
  --accent-red:   #ef4444;
  --accent-red-dim:#7f1d1d;
  --text-primary: #f5f5f5;
  --text-secondary:#666666;
  --text-dim:     #3a3a3a;
  --success:      #22c55e;
  --warning:      #f59e0b;
  --font-ui:      'Geist', 'Inter', system-ui, sans-serif;
  --font-mono:    'Berkeley Mono', 'JetBrains Mono', monospace;
  --radius:       6px;
  --transition:   150ms ease;
}
```

Import fonts from CDN in popup.html:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<!-- Geist via bunny.net or fontsource CDN -->
```

**Popup dimensions**: `width: 360px`, `min-height: 120px`, `max-height: 560px`

**CSS requirements:**
- All screen transitions: `opacity + transform` at `150ms ease` — no layout shifts
- Recording dot animation: `@keyframes pulse` — scale 1 → 1.3 → 1 at 1.5s interval
- Progress bar: `@keyframes shimmer` — subtle left-to-right shine on the filled portion
- Account badges: 8px colored dot (provider color) left of email
- Tab cards: `background: var(--surface)`, hover `var(--surface-hover)`, `border-radius: var(--radius)`
- No box-shadow anywhere — use borders only
- Focus states: `outline: 1px solid var(--border-focus)` — no browser default blue ring
- Scrollbar in tab list: `width: 4px`, `background: var(--border)`

**All 6 screens must be CSS classes on a single root container — toggle visibility via JS, no re-render.**

---

### Screen Wireframes (implement exactly)

**Screen 1 — Idle**
```
┌─────────────────────────────────────┐
│  ScreenVault               ⚙  [+]  │
├─────────────────────────────────────┤
│                                     │
│  [●  New Recording            ›]   │  ← full-width, red pulsing dot
│                                     │
├─────────────────────────────────────┤
│  Connected  ·  2 accounts           │
│  ● alice@gmail.com     14.2 GB free │  ← green dot = online
│  ● work@company.com     8.1 GB free │
└─────────────────────────────────────┘
```

**Screen 2 — Tab Picker**
```
┌─────────────────────────────────────┐
│  ←  Choose what to record          │
├─────────────────────────────────────┤
│  🖥  Entire Screen                  │
│  ▣   Application Window            │
├─────────────────────────────────────┤
│  [🔍 Filter tabs...              ]  │
│                                     │
│  [fav] GitHub · screenvault/src     │
│  [fav] Notion · Engineering Wiki   │
│  [fav] Linear · Issues             │
│  [fav] localhost:3000              │
└─────────────────────────────────────┘
```

**Screen 3 — Recording (shown 1.5s then popup closes)**
```
┌─────────────────────────────────────┐
│  ● Recording now           00:00:02 │  ← pulsing red dot, live timer
│  GitHub · screenvault/src           │
├─────────────────────────────────────┤
│  [■  Stop & Upload              ]   │
└─────────────────────────────────────┘
```

**Screen 4 — Processing/Uploading**
```
┌─────────────────────────────────────┐
│  Uploading...                       │
│  ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░  58%       │
│  alice@gmail.com                    │
│                                     │
│  [■  Cancel                     ]   │
└─────────────────────────────────────┘
```

**Screen 5 — Success**
```
┌─────────────────────────────────────┐
│  ✓ Link copied to clipboard         │
│                                     │
│  [  Copy again  ]  [  Open  ]       │
│                                     │
│  alice@gmail.com · 45s · 12.4 MB   │
└─────────────────────────────────────┘
```
Auto-copy link to clipboard immediately on entering this screen.

**Screen 6 — Error**
```
┌─────────────────────────────────────┐
│  ⚠  Upload failed                   │
│  No accounts available              │  ← show specific reason
│                                     │
│  [  Save to disk  ]                 │
│  [  Retry        ]                  │
└─────────────────────────────────────┘
```
"Save to disk" triggers `chrome.downloads.download({ url: blobUrl, filename: 'screenvault-...' })`.

---

### Recording Badge

While recording:
- `chrome.action.setBadgeBackgroundColor({ color: '#ef4444' })`
- `chrome.action.setBadgeText({ text: 'MM:SS' })` — update every second
- Badge text: `'00:12'`, `'01:04'`, `'59:59'`
- On stop: `chrome.action.setBadgeText({ text: '' })`

---

### `src/buffer/ChunkBuffer.ts` — Phase 3 Stub

```typescript
// PHASE 3 — Do not implement in Phase 1.
// Provide only the interface and a stub that stores chunks in memory (no IndexedDB).
// Mark clearly: // PHASE 3: Replace in-memory array with IndexedDB writes

interface IChunkBuffer {
  write(sessionId: string, index: number, chunk: Blob): Promise<void>;
  readAll(sessionId: string): Promise<Blob[]>;
  assembleBlob(sessionId: string, mimeType: string): Promise<Blob>;
  getTotalSizeBytes(sessionId: string): Promise<number>;
  clear(sessionId: string): Promise<void>;
}

// Phase 1 stub: store in Map<sessionId, Blob[]>
// Phase 3: open IDB, store in object store keyed by sessionId + index
```

---

## MANIFEST V3

```json
{
  "manifest_version": 3,
  "name": "ScreenVault",
  "version": "1.0.0",
  "description": "Record your screen and share instantly",
  "permissions": [
    "tabCapture",
    "tabs",
    "storage",
    "identity",
    "offscreen",
    "scripting",
    "activeTab",
    "downloads"
  ],
  "host_permissions": [
    "https://www.googleapis.com/*",
    "https://oauth2.googleapis.com/*"
  ],
  "background": {
    "service_worker": "dist/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "dist/popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ]
  }
}
```

---

## EXTENSIBILITY STUBS (interfaces only, no implementation needed)

```typescript
// src/plugins/ProcessingPlugin.ts
// Future: AI subtitles, summaries, noise reduction
export interface ProcessingPlugin {
  name: string;
  version: string;
  process(blob: Blob, session: RecordingSession): Promise<Blob>;
}

// src/router/RoutingStrategy.ts
// Future: cost-based, speed-based, geo-aware routing
export interface RoutingStrategy {
  name: string;
  score(account: StorageAccount, fileSizeBytes: number, context: RoutingContext): number;
}
export interface RoutingContext {
  userRegion?: string;
  networkType?: 'wifi' | 'cellular' | 'ethernet';
  prioritizeCost?: boolean;
}

// src/sync/SyncAdapter.ts
// Future: backend sync for team accounts and session history
export interface SyncAdapter {
  syncSession(session: RecordingSession): Promise<void>;
  getSessionHistory(limit?: number): Promise<RecordingSession[]>;
  deleteSession(id: string): Promise<void>;
}
```

---

## TESTABILITY CHECKLIST

Every module must satisfy:

- [ ] Can be instantiated with injected mock dependencies (no `new chrome.xxx` inside constructors)
- [ ] `MockStorageAdapter` is the primary testing target for upload logic
- [ ] `MockChromeStorageAdapter` wraps a `Map` for state tests
- [ ] `RecorderModule` can be tested by injecting a fake `MediaStream`
- [ ] `SmartUploadRouter` can be tested with an array of `StorageAccount` objects — no Chrome APIs needed
- [ ] `AppState` can be instantiated with a mock storage adapter — hydrates from it in tests
- [ ] All service worker message handlers are extractable as pure async functions

---

## DELIVERABLES — GENERATION ORDER

Generate in this exact order (each file must compile before the next):

**Batch 1 — Foundation**
1. `package.json` + `tsconfig.json` + `manifest.json`
2. `src/types/index.ts`
3. `src/types/errors.ts`
4. `src/logger/logger.ts`

**Batch 2 — Chrome API Wrappers**
5. `src/chrome-api/ChromeStorageAdapter.ts`
6. `src/chrome-api/ChromeIdentityAdapter.ts`
7. `src/chrome-api/ChromeTabsAdapter.ts`
8. `src/chrome-api/ChromeActionAdapter.ts`

**Batch 3 — Core Business Logic**
9. `src/storage/StorageAdapter.ts` (interface)
10. `src/storage/adapters/MockStorageAdapter.ts`
11. `src/storage/adapters/GoogleDriveAdapter.ts`
12. `src/storage/adapters/S3Adapter.ts` (stub)
13. `src/recorder/RecorderConfig.ts`
14. `src/recorder/RecorderModule.ts`
15. `src/compression/CompressionModule.ts`
16. `src/buffer/ChunkBuffer.ts` (Phase 3 stub)

**Batch 4 — Orchestration**
17. `src/accounts/AccountManager.ts`
18. `src/accounts/TokenRefresher.ts` (Phase 2 stub)
19. `src/router/SmartUploadRouter.ts` (Phase 1: first-account stub)
20. `src/upload/UploadManager.ts`
21. `src/state/AppState.ts`

**Batch 5 — Extension Runtime**
22. `src/offscreen/offscreen.html`
23. `src/offscreen/offscreen.ts`
24. `src/background/service-worker.ts`

**Batch 6 — UI**
25. `src/ui/popup/popup.html`
26. `src/ui/popup/popup.css`
27. `src/ui/components/RecordButton.ts`
28. `src/ui/components/ProgressBar.ts`
29. `src/ui/components/TabCard.ts`
30. `src/ui/components/AccountBadge.ts`
31. `src/ui/popup/popup.ts`

**Batch 7 — Extensibility**
32. `src/plugins/ProcessingPlugin.ts`
33. `src/router/RoutingStrategy.ts`
34. `src/sync/SyncAdapter.ts`

---

## FINAL IMPLEMENTATION NOTES

- Every file header: `// ScreenVault — [ModuleName] — [one-line purpose]`
- Every async function catches its own errors and returns typed results — no unhandled rejections
- The offscreen document is the **only** place `MediaRecorder` is instantiated
- The service worker is the **only** place `chrome.storage.local` is written
- The popup is the **only** place DOM is mutated
- `chrome.identity` is called **only** via `ChromeIdentityAdapter`
- TypeScript strict mode: `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess` — zero `any`
- Phase markers in code: `// PHASE 2: [description]` and `// PHASE 3: [description]`
- Logger in every module: first line of every significant function logs entry with module + action
- No `console.log` except inside `logger.ts` itself

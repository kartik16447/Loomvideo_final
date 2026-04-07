// ScreenVault — Logger — Centralized Structured Logger with Full Debug Instrumentation

const DEBUG_MODE = true;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  level: LogLevel;
  module: string;
  action: string;
  sessionId?: string;
  data?: Record<string, unknown>;
}

// Color coding for console readability
const COLORS: Record<LogLevel, string> = {
  debug: '#6B7280',
  info:  '#3B82F6',
  warn:  '#F59E0B',
  error: '#EF4444',
};

class Logger {
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 1000;
  private startTime = Date.now();

  private log(level: LogLevel, module: string, action: string, data?: Record<string, unknown>, sessionId?: string) {
    if (!DEBUG_MODE && level === 'debug') return;

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      module,
      action,
      sessionId,
      data,
    };

    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxBufferSize) this.logBuffer.shift();

    const elapsed = `+${((Date.now() - this.startTime) / 1000).toFixed(2)}s`;
    const prefix = `[SV:${module}] [${elapsed}]`;

    try {
      // Rich console output with colors (works in DevTools)
      if (level === 'error') {
        console.error(`%c${prefix} ${action}`, `color: ${COLORS[level]}; font-weight: bold`, data ?? '');
      } else if (level === 'warn') {
        console.warn(`%c${prefix} ${action}`, `color: ${COLORS[level]}`, data ?? '');
      } else if (level === 'debug') {
        console.log(`%c${prefix} ${action}`, `color: ${COLORS[level]}`, data ?? '');
      } else {
        console.log(`%c${prefix} ${action}`, `color: ${COLORS[level]}; font-weight: bold`, data ?? '');
      }

      // Also emit as structured JSON for SV_LOGGER.getLogs()
      console.debug(JSON.stringify(entry));
    } catch (e) {
      console.log(`{LOG_FAILED}`);
    }
  }

  getLogs(): LogEntry[] { return [...this.logBuffer]; }
  clearLogs(): void { this.logBuffer = []; }
  dumpLogs(): void {
    console.group('%c[ScreenVault] — Full Log Dump', 'font-weight: bold; font-size: 14px;');
    this.logBuffer.forEach(e => {
      console.log(`%c[${e.level.toUpperCase()}] [${e.module}] ${e.action}`, `color:${COLORS[e.level]}`, e.data ?? '', `| ${e.ts}`);
    });
    console.groupEnd();
  }

  debug(module: string, action: string, data?: Record<string, unknown>, sessionId?: string) { this.log('debug', module, action, data, sessionId); }
  info(module: string, action: string, data?: Record<string, unknown>, sessionId?: string)  { this.log('info',  module, action, data, sessionId); }
  warn(module: string, action: string, data?: Record<string, unknown>, sessionId?: string)  { this.log('warn',  module, action, data, sessionId); }
  error(module: string, action: string, data?: Record<string, unknown>, sessionId?: string) { this.log('error', module, action, data, sessionId); }
}

export const logger = new Logger();
(globalThis as any).SV_LOGGER = logger;

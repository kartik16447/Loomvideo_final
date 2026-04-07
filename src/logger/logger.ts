// ScreenVault — Logger — Centralized Structured Logger

const DEBUG_MODE = true; // Set to false in production

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;          // ISO timestamp
  level: LogLevel;
  module: string;      // e.g. 'RecorderModule', 'GoogleDriveAdapter'
  action: string;      // e.g. 'START_RECORDING', 'UPLOAD_COMPLETE'
  sessionId?: string;
  data?: Record<string, unknown>;
}

class Logger {
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 500;

  private log(level: LogLevel, module: string, action: string, data?: Record<string, unknown>, sessionId?: string) {
    if (!DEBUG_MODE && level === 'debug') {
      return; 
    }

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

    try {
      console.log(JSON.stringify(entry));
    } catch (e) {
      console.log(`{"ts":"${new Date().toISOString()}","level":"error","module":"Logger","action":"LOG_FAILED"}`);
    }
  }

  getLogs(): LogEntry[] { return [...this.logBuffer]; }
  clearLogs(): void { this.logBuffer = []; }

  debug(module: string, action: string, data?: Record<string, unknown>, sessionId?: string) { this.log('debug', module, action, data, sessionId); }
  info(module: string, action: string, data?: Record<string, unknown>, sessionId?: string) { this.log('info', module, action, data, sessionId); }
  warn(module: string, action: string, data?: Record<string, unknown>, sessionId?: string) { this.log('warn', module, action, data, sessionId); }
  error(module: string, action: string, data?: Record<string, unknown>, sessionId?: string) { this.log('error', module, action, data, sessionId); }
}

export const logger = new Logger();
(globalThis as any).SV_LOGGER = logger; // For console debugging

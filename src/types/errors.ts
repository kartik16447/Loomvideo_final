// ScreenVault — Errors — Typed Error System

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

export interface SerializedError {
  code: string;
  message: string;
  recoverable: boolean;
  context?: Record<string, unknown>;
}

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

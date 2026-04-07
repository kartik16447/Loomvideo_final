// ScreenVault — RecorderConfig — Bitrate, FPS, codec defaults

export interface RecorderConfig {
  videoBitsPerSecond: 1_000_000 | 1_500_000;
  frameRate: 15 | 20;
  audioBitsPerSecond: 128_000;
  mimeType: 'video/webm;codecs=vp9,opus';
  timesliceMs: 1000;
}

export const DEFAULT_CONFIG: RecorderConfig = {
  videoBitsPerSecond: 1_000_000,
  frameRate: 15,
  audioBitsPerSecond: 128_000,
  mimeType: 'video/webm;codecs=vp9,opus',
  timesliceMs: 1000,
};

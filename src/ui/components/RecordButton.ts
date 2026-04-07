// ScreenVault — RecordButton — UI helper

export function formatTimer(elapsedMs: number): string {
  const sec = Math.floor((elapsedMs / 1000) % 60);
  const min = Math.floor(elapsedMs / 60000);
  const h = Math.floor(min / 60);
  const mm = (min % 60).toString().padStart(2, '0');
  const ss = sec.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ScreenVault — ProgressBar — UI helper

export function updateProgressBar(fillElement: HTMLElement, textElement: HTMLElement, percent: number) {
  fillElement.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  textElement.textContent = `${Math.floor(percent)}%`;
}

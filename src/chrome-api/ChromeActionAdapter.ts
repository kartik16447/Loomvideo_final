// ScreenVault — ChromeActionAdapter — Wraps chrome.action

export interface IActionAdapter {
  setBadgeText(text: string): Promise<void>;
  setBadgeBackgroundColor(color: string): Promise<void>;
  setIcon(path: string): Promise<void>;
}

export class ChromeActionAdapter implements IActionAdapter {
  async setBadgeText(text: string): Promise<void> {
    await chrome.action.setBadgeText({ text });
  }

  async setBadgeBackgroundColor(color: string): Promise<void> {
    await chrome.action.setBadgeBackgroundColor({ color });
  }

  async setIcon(path: string): Promise<void> {
    await chrome.action.setIcon({ path: { "16": path, "48": path, "128": path } });
  }
}

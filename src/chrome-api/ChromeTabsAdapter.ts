// ScreenVault — ChromeTabsAdapter — Wraps chrome.tabs and chrome.tabCapture

export interface ITabsAdapter {
  queryAllTabs(): Promise<chrome.tabs.Tab[]>;
  getMediaStreamId(tabId: number): Promise<string>;
  onTabRemoved(callback: (tabId: number) => void): void;
  onTabUpdated(callback: (tabId: number, info: chrome.tabs.TabChangeInfo) => void): void;
}

export class ChromeTabsAdapter implements ITabsAdapter {
  async queryAllTabs(): Promise<chrome.tabs.Tab[]> {
    return await chrome.tabs.query({});
  }

  async getMediaStreamId(tabId: number): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
        if (!streamId) {
          reject(new Error('Failed to get media stream ID for tab.'));
        } else {
          resolve(streamId);
        }
      });
    });
  }

  onTabRemoved(callback: (tabId: number) => void): void {
    chrome.tabs.onRemoved.addListener(callback);
  }

  onTabUpdated(callback: (tabId: number, info: chrome.tabs.TabChangeInfo) => void): void {
    chrome.tabs.onUpdated.addListener(callback);
  }
}

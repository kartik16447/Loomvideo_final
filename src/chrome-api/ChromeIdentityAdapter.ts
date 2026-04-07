// ScreenVault — ChromeIdentityAdapter — Wraps chrome.identity for testability

export interface IIdentityAdapter {
  getAuthToken(options: { interactive: boolean }): Promise<string>;
  removeCachedAuthToken(token: string): Promise<void>;
  getProfileUserInfo(): Promise<{ email: string; id: string }>;
}

export class ChromeIdentityAdapter implements IIdentityAdapter {
  async getAuthToken(options: { interactive: boolean }): Promise<string> {
    const result = await chrome.identity.getAuthToken(options);
    if (!result.token) {
      throw new Error('No authentication token returned by Chrome');
    }
    return result.token;
  }

  async removeCachedAuthToken(token: string): Promise<void> {
    await chrome.identity.removeCachedAuthToken({ token });
  }

  async getProfileUserInfo(): Promise<{ email: string; id: string }> {
    return await chrome.identity.getProfileUserInfo();
  }
}

export interface Settings {
  clearSiteData: boolean;
  openAfterSwitch: boolean;
}

export const DEFAULT_SETTINGS: Settings = { clearSiteData: false, openAfterSwitch: true };

export interface UsageWindow {
  usedPercent: number;
  windowMinutes?: number;
  resetsAt?: number;
}

export interface ResetCredit {
  id: string;
  expiresAt?: number;
}

export interface UsageSnapshot {
  session?: UsageWindow;
  weekly?: UsageWindow;
  resetCredits?: number;
  // Only present after a manual refresh; the automatic path skips the extra request.
  resetCreditDetails?: ResetCredit[];
  fetchedAt: number;
}

// A ChatGPT access token, readable only while the account's cookie is installed.
export interface AccountAuth {
  accessToken: string;
  accountId?: string;
  name?: string;
  email?: string;
  expiresAt: number;
}

export interface SavedAccount {
  id: string;
  name: string;
  email?: string;
  token: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
  auth?: AccountAuth;
  usage?: UsageSnapshot;
}

// `auth` holds a bearer credential, so it never reaches the popup; the popup only
// needs to know whether a refresh is still possible.
export type AccountSummary = Omit<SavedAccount, 'token' | 'auth'> & { canRefreshUsage: boolean };
export interface Vault {
  version: 1;
  accounts: SavedAccount[];
  settings: Settings;
}
export interface TabContext {
  tabId: number;
  windowId: number;
  storeId: string;
  incognito: boolean;
  hostname: string;
  isChatGPT: boolean;
}

export interface AppState {
  accounts: AccountSummary[];
  settings: Settings;
  context: TabContext;
  hasSession: boolean;
  activeAccountId?: string;
}

export type Command =
  | { type: 'state' }
  | { type: 'save'; input: string; name: string; tabId: number }
  | { type: 'capture'; name: string; tabId: number }
  | { type: 'login'; input: string; name: string; remember: boolean; tabId: number }
  | { type: 'switch'; id: string; tabId: number }
  | { type: 'rename'; id: string; name: string; tabId: number }
  | { type: 'delete'; id: string; tabId: number }
  | { type: 'settings'; settings: Settings; tabId: number }
  | { type: 'logout'; tabId: number }
  | { type: 'open'; tabId: number }
  | { type: 'usage'; details: boolean; tabId: number };

export type Response =
  { ok: true; state: AppState; message?: string } | { ok: false; error: string };

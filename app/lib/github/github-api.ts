/**
 * GitHub API Service.
 * Handles all GitHub API interactions for pushing code.
 * Supports server-side token storage for security.
 */

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  email: string | null;
}

export interface CreateRepoOptions {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
}

export interface PushResult {
  success: boolean;
  message: string;
  repoUrl?: string;
  commitSha?: string;
}

export interface FileToCommit {
  path: string;
  content: string;
}

export interface ServerAuthStatus {
  authenticated: boolean;
  hasServerToken: boolean;
  user?: GitHubUser;
  error?: string;
}

export interface SaveTokenResult {
  success: boolean;
  message?: string;
  error?: string;
  user?: { login: string; avatar_url: string };
  warning?: string;
}

class GitHubAPI {
  private _isAuthenticated: boolean = false;
  private _serverUser: GitHubUser | null = null;

  /** Check if server-side token is configured and valid. */
  async checkServerAuth(): Promise<ServerAuthStatus> {
    try {
      const response = await fetch('/api/github');
      const data: ServerAuthStatus = await response.json();

      this._isAuthenticated = data.authenticated;

      if (data.user) {
        this._serverUser = data.user;
      }

      return data;
    } catch (error) {
      console.error('Failed to check server auth:', error);

      return { authenticated: false, hasServerToken: false };
    }
  }

  /** Save token to server (stored in .env.local file). */
  async saveToken(token: string): Promise<SaveTokenResult> {
    try {
      const response = await fetch('/api/github-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', token }),
      });

      const result: SaveTokenResult = await response.json();

      if (result.success && result.user) {
        this._isAuthenticated = true;
        this._serverUser = {
          login: result.user.login,
          avatar_url: result.user.avatar_url,
          id: 0,
          name: null,
          email: null,
        };
      }

      return result;
    } catch (error) {
      console.error('Failed to save token:', error);

      return { success: false, error: 'Failed to save token' };
    }
  }

  /** Clear the stored token. */
  async clearStoredToken(): Promise<void> {
    try {
      await fetch('/api/github-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
    } catch (error) {
      console.error('Failed to clear token:', error);
    }

    this._isAuthenticated = false;
    this._serverUser = null;
  }

  /** Validate a token without saving it. */
  async validateToken(token: string): Promise<{ valid: boolean; user?: { login: string; avatar_url: string } }> {
    try {
      const response = await fetch('/api/github-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate', token }),
      });

      return await response.json();
    } catch {
      return { valid: false };
    }
  }

  /** Get cached server user (if authenticated via server token). */
  getServerUser(): GitHubUser | null {
    return this._serverUser;
  }

  isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  clearToken() {
    this._isAuthenticated = false;
    this._serverUser = null;
  }

  private async _serverRequest<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
    const response = await fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });

    const data: { success?: boolean; data?: T; error?: string } = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || 'GitHub API error');
    }

    return data.data as T;
  }

  async getUser(): Promise<GitHubUser> {
    if (this._serverUser) {
      return this._serverUser;
    }

    return this._serverRequest<GitHubUser>('getUser');
  }

  async listRepos(perPage: number = 30, page: number = 1): Promise<GitHubRepo[]> {
    return this._serverRequest<GitHubRepo[]>('listRepos', { perPage, page });
  }

  async createRepo(options: CreateRepoOptions): Promise<GitHubRepo> {
    return this._serverRequest<GitHubRepo>('createRepo', {
      name: options.name,
      description: options.description,
      isPrivate: options.private,
    });
  }

  async pushFiles(
    owner: string,
    repo: string,
    files: FileToCommit[],
    commitMessage: string = 'Update from MigrateX',
    branch: string = 'main',
  ): Promise<PushResult> {
    const response = await fetch('/api/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'pushFiles',
        payload: { owner, repo, files, commitMessage, branch },
      }),
    });

    const result: PushResult = await response.json();

    return result;
  }

  /** Alias for backwards compatibility. */
  async pushFilesToEmptyRepo(
    owner: string,
    repo: string,
    files: FileToCommit[],
    commitMessage: string = 'Initial commit from MigrateX',
    branch: string = 'main',
  ): Promise<PushResult> {
    return this.pushFiles(owner, repo, files, commitMessage, branch);
  }

  async isRepoEmpty(_owner: string, _repo: string): Promise<boolean> {
    // server handles this internally now
    return false;
  }

  /** @deprecated use saveToken instead. */
  setToken(_token: string) {
    console.warn('setToken is deprecated. Use saveToken() instead.');
  }

  getToken(): string | null {
    return null;
  }
}

export const githubAPI = new GitHubAPI();

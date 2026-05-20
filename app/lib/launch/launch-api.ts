/**
 * Contentstack Launch API Client.
 * Handles deployment to Contentstack Launch.
 * Reference: https://www.contentstack.com/docs/developers/apis/launch-api.
 */

export interface LaunchProject {
  uid: string;
  name: string;
  environments?: LaunchEnvironment[];
}

export interface LaunchEnvironment {
  uid: string;
  name: string;
  url?: string;
}

export interface LaunchDeployment {
  uid: string;
  status: string;
  url?: string;
}

export interface LaunchCredentialsStatus {
  configured: boolean;
  hasCredentials: boolean;
  error?: string;
}

export interface CreateProjectOptions {
  name: string;
  repoUrl: string;
  branch?: string;
  buildCommand?: string;
  outputDirectory?: string;
  frameworkPreset?: string;
  environmentVariables?: Array<{ key: string; value: string }>;
  githubToken?: string;
}

export interface SaveCredentialsResult {
  success: boolean;
  message?: string;
  error?: string;
}

class LaunchAPI {
  private _isConfigured: boolean = false;

  /** Check if Launch credentials are configured. */
  async checkCredentials(): Promise<LaunchCredentialsStatus> {
    try {
      const response = await fetch('/api/launch');
      const data: LaunchCredentialsStatus = await response.json();

      this._isConfigured = data.configured;

      return data;
    } catch (error) {
      console.error('Failed to check Launch credentials:', error);

      return { configured: false, hasCredentials: false };
    }
  }

  /** Save Launch credentials (Auth Token and Organization UID). */
  async saveCredentials(authtoken: string, organizationUid: string): Promise<SaveCredentialsResult> {
    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveCredentials',
          payload: { authtoken, organization_uid: organizationUid },
        }),
      });

      const result: SaveCredentialsResult = await response.json();

      if (result.success) {
        this._isConfigured = true;
      }

      return result;
    } catch (error) {
      console.error('Failed to save Launch credentials:', error);

      return { success: false, error: 'Failed to save credentials' };
    }
  }

  /** Clear stored credentials. */
  async clearCredentials(): Promise<void> {
    try {
      await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clearCredentials' }),
      });
    } catch (error) {
      console.error('Failed to clear credentials:', error);
    }

    this._isConfigured = false;
  }

  /** Check if configured. */
  isConfigured(): boolean {
    return this._isConfigured;
  }

  /** Create a new Launch project from a GitHub repository. */
  async createProject(
    options: CreateProjectOptions,
  ): Promise<{ success: boolean; project?: LaunchProject; error?: string }> {
    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createProject',
          payload: options,
        }),
      });

      const result: { success?: boolean; project?: LaunchProject; error?: string } = await response.json();

      if (!response.ok || result.error) {
        return { success: false, error: result.error || 'Failed to create project' };
      }

      return { success: true, project: result.project };
    } catch (error) {
      console.error('Failed to create Launch project:', error);

      return { success: false, error: error instanceof Error ? error.message : 'Failed to create project' };
    }
  }

  /** Get list of projects. */
  async getProjects(): Promise<LaunchProject[]> {
    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getProjects' }),
      });

      const result: { success?: boolean; projects?: LaunchProject[] } = await response.json();

      return result.projects || [];
    } catch (error) {
      console.error('Failed to get projects:', error);

      return [];
    }
  }

  /** Trigger a deployment. */
  async triggerDeployment(
    projectUid: string,
    environmentUid: string,
  ): Promise<{ success: boolean; deployment?: LaunchDeployment; error?: string }> {
    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'triggerDeployment',
          payload: { projectUid, environmentUid },
        }),
      });

      const result: { success?: boolean; deployment?: LaunchDeployment; error?: string } = await response.json();

      if (!response.ok || result.error) {
        return { success: false, error: result.error || 'Failed to trigger deployment' };
      }

      return { success: true, deployment: result.deployment };
    } catch (error) {
      console.error('Failed to trigger deployment:', error);

      return { success: false, error: error instanceof Error ? error.message : 'Failed to trigger deployment' };
    }
  }

  /** Get deployment status. */
  async getDeploymentStatus(
    projectUid: string,
    environmentUid: string,
    deploymentUid: string,
  ): Promise<LaunchDeployment | null> {
    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getDeploymentStatus',
          payload: { projectUid, environmentUid, deploymentUid },
        }),
      });

      const result: { success?: boolean; deployment?: LaunchDeployment } = await response.json();

      return result.deployment || null;
    } catch (error) {
      console.error('Failed to get deployment status:', error);

      return null;
    }
  }

  /** Update environment with new settings or environment variables. */
  async updateEnvironment(
    projectUid: string,
    environmentUid: string,
    options: {
      buildCommand?: string;
      outputDirectory?: string;
      serverCommand?: string;
      frameworkPreset?: string;
      environmentVariables?: Array<{ key: string; value: string }>;
      envFileContent?: string;
      description?: string;
      autoDeployOnPush?: boolean;
    },
  ): Promise<{ success: boolean; environment?: LaunchEnvironment; error?: string }> {
    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateEnvironment',
          payload: { projectUid, environmentUid, ...options },
        }),
      });

      const result: { success?: boolean; environment?: LaunchEnvironment; error?: string } = await response.json();

      if (!response.ok || result.error) {
        return { success: false, error: result.error || 'Failed to update environment' };
      }

      return { success: true, environment: result.environment };
    } catch (error) {
      console.error('Failed to update environment:', error);

      return { success: false, error: error instanceof Error ? error.message : 'Failed to update environment' };
    }
  }

  /** Get all environments for a project. */
  async getEnvironments(projectUid: string): Promise<LaunchEnvironment[]> {
    try {
      const response = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getEnvironments',
          payload: { projectUid },
        }),
      });

      const result: { success?: boolean; environments?: LaunchEnvironment[] } = await response.json();

      return result.environments || [];
    } catch (error) {
      console.error('Failed to get environments:', error);

      return [];
    }
  }
}

export const launchAPI = new LaunchAPI();

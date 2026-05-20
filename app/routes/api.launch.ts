import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/node';
import { getInMemoryToken } from './api.github-token';

/**
 * Contentstack Launch API route.
 * Handles deployment to Contentstack Launch using the Launch API.
 * Reference: https://www.contentstack.com/docs/developers/apis/launch-api#create-a-project.
 */

interface LaunchEnv {
  AUTH_TOKEN?: string;
  ORGANIZATION_UID?: string;
  GITHUB_TOKEN?: string;
}

// in-memory token storage for launch credentials
let inMemoryAuthToken: string | null = null;
let inMemoryOrgUid: string | null = null;

export function getInMemoryLaunchCredentials(): { authtoken: string | null; organization_uid: string | null } {
  return { authtoken: inMemoryAuthToken, organization_uid: inMemoryOrgUid };
}

/**
 * Get Launch credentials from multiple sources (priority order):
 * 1. In-memory storage (set via API)
 * 2. Node.js environment variables (process.env)
 * 3. Process environment variables (.env.local via Vite/Node)
 */
function getLaunchCredentials(env: LaunchEnv): { authtoken: string | null; organization_uid: string | null } {
  // try multiple sources: in-memory -> cloudflare env -> process.env
  const authtoken =
    inMemoryAuthToken || env.AUTH_TOKEN || (typeof process !== 'undefined' ? process.env.AUTH_TOKEN : null) || null;

  const organizationUid =
    inMemoryOrgUid ||
    env.ORGANIZATION_UID ||
    (typeof process !== 'undefined' ? process.env.ORGANIZATION_UID : null) ||
    null;

  return { authtoken, organization_uid: organizationUid };
}

const LAUNCH_API_BASE = 'https://launch-api.contentstack.com';

/*
 * Parse .env file content into key-value pairs for Launch API.
 * Handles standard .env file format with comments and empty lines.
 */
function parseEnvFileContent(content: string): Array<{ key: string; value: string }> {
  const envVars: Array<{ key: string; value: string }> = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // find the first = sign (key can't have =, but value can)
    const equalIndex = trimmedLine.indexOf('=');

    if (equalIndex === -1) {
      continue;
    }

    const key = trimmedLine.substring(0, equalIndex).trim();
    let value = trimmedLine.substring(equalIndex + 1).trim();

    // remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // skip if key is empty
    if (!key) {
      continue;
    }

    envVars.push({ key, value });
  }

  return envVars;
}

/*
 * Valid framework presets for Launch API.
 * Reference: https://www.contentstack.com/docs/developers/apis/launch-api#create-a-project
 */
const VALID_FRAMEWORK_PRESETS = [
  'GATSBY',
  'NEXTJS',
  'OTHER',
  'CRA',
  'CSR',
  'ANGULAR',
  'REMIX',
  'NUXT',
  'VUEJS',
] as const;

type FrameworkPreset = (typeof VALID_FRAMEWORK_PRESETS)[number];

/*
 * Map common framework names to valid Launch API presets.
 * Normalizes various framework name formats to the expected uppercase values.
 */
function normalizeFrameworkPreset(preset: string | undefined): FrameworkPreset {
  if (!preset) {
    return 'OTHER';
  }

  const normalized = preset.toUpperCase().trim();

  // direct match with valid presets
  if (VALID_FRAMEWORK_PRESETS.includes(normalized as FrameworkPreset)) {
    return normalized as FrameworkPreset;
  }

  // common aliases/variations mapping
  const frameworkMap: Record<string, FrameworkPreset> = {
    NEXT: 'NEXTJS',
    'NEXT.JS': 'NEXTJS',
    REACT: 'CRA',
    'CREATE-REACT-APP': 'CRA',
    VUE: 'VUEJS',
    'VUE.JS': 'VUEJS',
    'NUXT.JS': 'NUXT',
    'ANGULAR.JS': 'ANGULAR',
    'GATSBY.JS': 'GATSBY',
    STATIC: 'CSR',
    HTML: 'CSR',
    VANILLA: 'CSR',
    ASTRO: 'OTHER',
    VITE: 'OTHER',
    SVELTE: 'OTHER',
    SVELTEKIT: 'OTHER',
    '11TY': 'OTHER',
    ELEVENTY: 'OTHER',
  };

  return frameworkMap[normalized] || 'OTHER';
}

async function launchRequest<T>(
  authtoken: string,
  organization_uid: string,
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${LAUNCH_API_BASE}${endpoint}`;

  console.log('Launch API Request:', {
    url,
    method: options.method || 'GET',
    body: options.body ? JSON.parse(options.body as string) : undefined,
  });

  const response = await fetch(url, {
    ...options,
    headers: {
      authtoken,
      organization_uid,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const responseText = await response.text();

  console.log('Launch API Response:', {
    status: response.status,
    statusText: response.statusText,
    body: responseText,
  });

  if (!response.ok) {
    let errorMessage = `Launch API error: ${response.status}`;

    try {
      const errorData = JSON.parse(responseText) as {
        error_message?: string;
        message?: string;
        error?: string;
        errors?: Record<string, string[]>;
      };

      if (errorData.errors) {
        // format validation errors
        const errorMessages = Object.entries(errorData.errors)
          .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
          .join('; ');
        errorMessage = errorMessages || errorMessage;
      } else {
        errorMessage = errorData.error_message || errorData.message || errorData.error || errorMessage;
      }
    } catch {
      // if response is not JSON, use the raw text
      if (responseText) {
        errorMessage = responseText;
      }
    }

    throw new Error(errorMessage);
  }

  return responseText ? JSON.parse(responseText) : ({} as T);
}

// GET /api/launch - Check if Launch credentials are configured
export async function loader({ context }: LoaderFunctionArgs) {
  const env = process.env as unknown as LaunchEnv;
  const { authtoken, organization_uid } = getLaunchCredentials(env);

  if (!authtoken || !organization_uid) {
    return json({ configured: false, hasCredentials: false });
  }

  // verify credentials by trying to list projects
  try {
    await launchRequest(authtoken, organization_uid, '/projects?limit=1');

    return json({ configured: true, hasCredentials: true });
  } catch (error) {
    console.error('Launch credentials validation failed:', error);

    return json({ configured: false, hasCredentials: true, error: 'Invalid credentials' });
  }
}

// POST /api/launch - Handle Launch operations
export async function action({ context, request }: ActionFunctionArgs) {
  const env = process.env as unknown as LaunchEnv;

  try {
    const body = await request.json<{
      action: string;
      payload?: Record<string, unknown>;
    }>();

    switch (body.action) {
      case 'saveCredentials': {
        const { authtoken, organization_uid } = body.payload || {};

        if (!authtoken || !organization_uid) {
          return json({ success: false, error: 'Auth Token and Organization UID are required' }, { status: 400 });
        }

        // validate credentials
        try {
          await launchRequest(authtoken as string, organization_uid as string, '/projects?limit=1');
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Invalid credentials';

          return json({ success: false, error: `Invalid credentials: ${errorMsg}` }, { status: 400 });
        }

        // store in memory
        inMemoryAuthToken = authtoken as string;
        inMemoryOrgUid = organization_uid as string;

        return json({ success: true, message: 'Launch credentials saved successfully' });
      }

      case 'clearCredentials': {
        inMemoryAuthToken = null;
        inMemoryOrgUid = null;

        return json({ success: true, message: 'Credentials cleared' });
      }

      case 'createProject': {
        const { authtoken, organization_uid } = getLaunchCredentials(env);

        if (!authtoken || !organization_uid) {
          return json({ error: 'Launch credentials not configured' }, { status: 401 });
        }

        const { name, repoUrl, branch, buildCommand, outputDirectory, frameworkPreset, environmentVariables } =
          body.payload || {};

        // get GitHub token from server-side storage or env
        const githubToken = getInMemoryToken() || env.GITHUB_TOKEN;

        if (!name || !repoUrl) {
          return json({ error: 'Project name and repository URL are required' }, { status: 400 });
        }

        // extract owner and repo from GitHub URL
        const repoUrlStr = String(repoUrl);
        const urlMatch = repoUrlStr.match(/github\.com\/([^\/]+)\/([^\/]+)/);

        if (!urlMatch) {
          return json({ error: 'Invalid GitHub repository URL' }, { status: 400 });
        }

        const [, owner, repoName] = urlMatch;
        const cleanRepoName = repoName.replace(/\.git$/, '');

        // normalize framework preset to valid Launch API value
        const normalizedPreset = normalizeFrameworkPreset(frameworkPreset as string | undefined);

        console.log('Framework preset normalization:', {
          original: frameworkPreset,
          normalized: normalizedPreset,
        });

        // create project using Git Provider - structure per Launch API docs
        // Reference: https://www.contentstack.com/docs/developers/apis/launch-api#create-a-project
        const projectData = {
          name: String(name),
          description: 'Deployed from MigrateX',
          projectType: 'GITPROVIDER',
          repository: {
            repositoryName: `${owner}/${cleanRepoName}`,
            username: owner,
            repositoryUrl: repoUrlStr,
            gitProviderMetadata: {
              gitProvider: 'GitHub',
            },
          },
          environment: {
            name: 'Production',
            frameworkPreset: normalizedPreset,
            buildCommand: String(buildCommand || 'npm run build'),
            outputDirectory: String(outputDirectory || 'dist'),
            gitBranch: String(branch || 'main'),
            environmentVariables: environmentVariables || [],
            autoDeployOnPush: true,
          },
        };

        console.log('Creating Launch project with data:', JSON.stringify(projectData, null, 2));

        const project = await launchRequest<{
          uid: string;
          name: string;
          environments: Array<{ uid: string; name: string; url?: string }>;
        }>(authtoken, organization_uid, '/projects', {
          method: 'POST',
          body: JSON.stringify(projectData),
        });

        return json({
          success: true,
          project: {
            uid: project.uid,
            name: project.name,
            environments: project.environments,
          },
        });
      }

      case 'getProjects': {
        const { authtoken, organization_uid } = getLaunchCredentials(env);

        if (!authtoken || !organization_uid) {
          return json({ error: 'Launch credentials not configured' }, { status: 401 });
        }

        const projectsResponse = await launchRequest<{
          projects: Array<{
            uid: string;
            name: string;
            projectType?: string;
            createdAt?: string;
            updatedAt?: string;
          }>;
        }>(authtoken, organization_uid, '/projects');

        // fetch environments for each project
        const projectsWithEnvs = await Promise.all(
          projectsResponse.projects.map(async (project) => {
            try {
              const envsResponse = await launchRequest<{
                environments: Array<{
                  uid: string;
                  name: string;
                  deploymentUrl?: string;
                  url?: string;
                }>;
              }>(authtoken, organization_uid, `/projects/${project.uid}/environments`);

              return {
                ...project,
                environments:
                  envsResponse.environments?.map((env) => ({
                    uid: env.uid,
                    name: env.name,
                    url: env.deploymentUrl || env.url,
                  })) || [],
              };
            } catch {
              // if we can't fetch environments, return project without them
              return { ...project, environments: [] };
            }
          }),
        );

        return json({ success: true, projects: projectsWithEnvs });
      }

      case 'triggerDeployment': {
        const { authtoken, organization_uid } = getLaunchCredentials(env);

        if (!authtoken || !organization_uid) {
          return json({ error: 'Launch credentials not configured' }, { status: 401 });
        }

        const { projectUid, environmentUid } = body.payload || {};

        if (!projectUid || !environmentUid) {
          return json({ error: 'Project UID and Environment UID are required' }, { status: 400 });
        }

        const projId = String(projectUid);
        const envId = String(environmentUid);

        const deployment = await launchRequest<{
          uid: string;
          status: string;
        }>(authtoken, organization_uid, `/projects/${projId}/environments/${envId}/deployments`, {
          method: 'POST',
          body: JSON.stringify({}),
        });

        return json({
          success: true,
          deployment: {
            uid: deployment.uid,
            status: deployment.status,
          },
        });
      }

      case 'getDeploymentStatus': {
        const { authtoken, organization_uid } = getLaunchCredentials(env);

        if (!authtoken || !organization_uid) {
          return json({ error: 'Launch credentials not configured' }, { status: 401 });
        }

        const { projectUid, environmentUid, deploymentUid } = body.payload || {};

        if (!projectUid || !environmentUid || !deploymentUid) {
          return json({ error: 'Project, Environment, and Deployment UIDs are required' }, { status: 400 });
        }

        const projId = String(projectUid);
        const envId = String(environmentUid);
        const deplId = String(deploymentUid);

        const deployment = await launchRequest<{
          uid: string;
          status: string;
          url?: string;
        }>(authtoken, organization_uid, `/projects/${projId}/environments/${envId}/deployments/${deplId}`);

        return json({
          success: true,
          deployment,
        });
      }

      case 'createEnvironment': {
        /*
         * Create a new environment in a Launch project.
         * Reference: https://www.contentstack.com/docs/developers/apis/launch-api#create-an-environment
         */
        const { authtoken, organization_uid } = getLaunchCredentials(env);

        if (!authtoken || !organization_uid) {
          return json({ error: 'Launch credentials not configured' }, { status: 401 });
        }

        const {
          projectUid,
          name,
          branch,
          buildCommand,
          outputDirectory,
          serverCommand,
          frameworkPreset,
          environmentVariables,
          envFileContent,
          description,
          autoDeployOnPush,
        } = body.payload || {};

        if (!projectUid || !name) {
          return json({ error: 'Project UID and environment name are required' }, { status: 400 });
        }

        // parse environment variables from .env file content if provided
        let envVars: Array<{ key: string; value: string }> = [];

        if (environmentVariables && Array.isArray(environmentVariables)) {
          envVars = environmentVariables as Array<{ key: string; value: string }>;
        }

        // parse .env.local file content if provided
        if (envFileContent && typeof envFileContent === 'string') {
          const parsedEnvVars = parseEnvFileContent(envFileContent as string);
          envVars = [...envVars, ...parsedEnvVars];
        }

        // normalize framework preset
        const normalizedPreset = normalizeFrameworkPreset(frameworkPreset as string | undefined);

        const environmentData = {
          name: String(name),
          description: description ? String(description) : `Environment created from MigrateX`,
          frameworkPreset: normalizedPreset,
          buildCommand: String(buildCommand || 'npm run build'),
          outputDirectory: String(outputDirectory || 'dist'),
          serverCommand: serverCommand ? String(serverCommand) : undefined,
          gitBranch: String(branch || 'main'),
          environmentVariables: envVars,
          autoDeployOnPush: autoDeployOnPush !== false,
        };

        // remove undefined values
        const cleanedData = Object.fromEntries(Object.entries(environmentData).filter(([, v]) => v !== undefined));

        console.log('Creating Launch environment with data:', JSON.stringify(cleanedData, null, 2));

        const projId = String(projectUid);

        const environment = await launchRequest<{
          uid: string;
          name: string;
          deploymentUrl?: string;
          url?: string;
        }>(authtoken, organization_uid, `/projects/${projId}/environments`, {
          method: 'POST',
          body: JSON.stringify(cleanedData),
        });

        return json({
          success: true,
          environment: {
            uid: environment.uid,
            name: environment.name,
            url: environment.deploymentUrl || environment.url,
          },
        });
      }

      case 'updateEnvironment': {
        /*
         * Update an existing environment in a Launch project.
         * Reference: https://www.contentstack.com/docs/developers/apis/launch-api#update-an-environment
         */
        const { authtoken, organization_uid } = getLaunchCredentials(env);

        if (!authtoken || !organization_uid) {
          return json({ error: 'Launch credentials not configured' }, { status: 401 });
        }

        const {
          projectUid,
          environmentUid,
          buildCommand,
          outputDirectory,
          serverCommand,
          frameworkPreset,
          environmentVariables,
          envFileContent,
          description,
          autoDeployOnPush,
        } = body.payload || {};

        if (!projectUid || !environmentUid) {
          return json({ error: 'Project UID and Environment UID are required' }, { status: 400 });
        }

        // parse environment variables
        let envVars: Array<{ key: string; value: string }> | undefined;

        if (environmentVariables && Array.isArray(environmentVariables)) {
          envVars = environmentVariables as Array<{ key: string; value: string }>;
        }

        // parse .env.local file content if provided
        if (envFileContent && typeof envFileContent === 'string') {
          const parsedEnvVars = parseEnvFileContent(envFileContent as string);
          envVars = envVars ? [...envVars, ...parsedEnvVars] : parsedEnvVars;
        }

        const updateData: Record<string, unknown> = {};

        if (description !== undefined) {
          updateData.description = String(description);
        }

        if (frameworkPreset !== undefined) {
          updateData.frameworkPreset = normalizeFrameworkPreset(frameworkPreset as string);
        }

        if (buildCommand !== undefined) {
          updateData.buildCommand = String(buildCommand);
        }

        if (outputDirectory !== undefined) {
          updateData.outputDirectory = String(outputDirectory);
        }

        if (serverCommand !== undefined) {
          updateData.serverCommand = String(serverCommand);
        }

        if (envVars !== undefined) {
          updateData.environmentVariables = envVars;
        }

        if (autoDeployOnPush !== undefined) {
          updateData.autoDeployOnPush = Boolean(autoDeployOnPush);
        }

        console.log('Updating Launch environment with data:', JSON.stringify(updateData, null, 2));

        const projId = String(projectUid);
        const envId = String(environmentUid);

        const environment = await launchRequest<{
          uid: string;
          name: string;
          deploymentUrl?: string;
          url?: string;
        }>(authtoken, organization_uid, `/projects/${projId}/environments/${envId}`, {
          method: 'PUT',
          body: JSON.stringify(updateData),
        });

        return json({
          success: true,
          environment: {
            uid: environment.uid,
            name: environment.name,
            url: environment.deploymentUrl || environment.url,
          },
        });
      }

      case 'getEnvironments': {
        /*
         * Get all environments for a Launch project.
         * Reference: https://www.contentstack.com/docs/developers/apis/launch-api#get-all-environments
         */
        const { authtoken, organization_uid } = getLaunchCredentials(env);

        if (!authtoken || !organization_uid) {
          return json({ error: 'Launch credentials not configured' }, { status: 401 });
        }

        const { projectUid } = body.payload || {};

        if (!projectUid) {
          return json({ error: 'Project UID is required' }, { status: 400 });
        }

        const projId = String(projectUid);

        const response = await launchRequest<{
          environments: Array<{
            uid: string;
            name: string;
            deploymentUrl?: string;
            url?: string;
            frameworkPreset?: string;
            buildCommand?: string;
            outputDirectory?: string;
          }>;
        }>(authtoken, organization_uid, `/projects/${projId}/environments`);

        return json({
          success: true,
          environments:
            response.environments?.map((env) => ({
              uid: env.uid,
              name: env.name,
              url: env.deploymentUrl || env.url,
              frameworkPreset: env.frameworkPreset,
              buildCommand: env.buildCommand,
              outputDirectory: env.outputDirectory,
            })) || [],
        });
      }

      default:
        return json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Launch API error:', error);

    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Launch API error',
      },
      { status: 500 },
    );
  }
}

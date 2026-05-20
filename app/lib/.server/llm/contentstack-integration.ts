import type { ContentstackConfig, ContentstackSchema } from '~/types/contentstack';
import { transformContentstackSchemas, validateContentModels } from './content-models-transformer';
import { getSystemPrompt } from './prompts';
import { WORK_DIR } from '~/utils/constants';

/**
 * Prepare system prompt with Contentstack integration
 * This function transforms Contentstack schemas and generates the complete system prompt
 */
export async function prepareContentstackPrompt(
  contentstackSchemas: ContentstackSchema[],
  contentstackConfig: ContentstackConfig,
  workDir: string = WORK_DIR,
  aiCompletionFunction?: (prompt: string) => Promise<string>
): Promise<string> {
  // Transform schemas to compact format (with optional AI)
  const contentModelsJSON = await transformContentstackSchemas(
    contentstackSchemas,
    aiCompletionFunction
  );

  // Validate the transformation
  if (!validateContentModels(contentModelsJSON)) {
    throw new Error('Invalid content models generated from Contentstack schemas');
  }

  // Generate system prompt with content models and config
  return getSystemPrompt(contentModelsJSON, contentstackConfig, workDir);
}

/**
 * Create Contentstack configuration from environment variables or parameters
 */
export function createContentstackConfig(params: {
  apiKey: string;
  deliveryToken: string;
  environment: string;
  region?: string;
  branch?: string;
  livePreview?: boolean;
  previewToken?: string;
  previewHost?: string;
  appHost?: string;
}): ContentstackConfig {
  const config: ContentstackConfig = {
    apiKey: params.apiKey,
    deliveryToken: params.deliveryToken,
    environment: params.environment,
  };

  if (params.region) {
    config.region = params.region;
  }

  if (params.branch) {
    config.branch = params.branch;
  }

  if (params.livePreview) {
    config.livePreview = true;
    config.previewToken = params.previewToken;
    config.previewHost = params.previewHost;
    config.appHost = params.appHost;
  }

  return config;
}

export function validateContentstackConfig(config: ContentstackConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.apiKey || config.apiKey.trim() === '') {
    errors.push('API Key is required');
  }

  if (!config.deliveryToken || config.deliveryToken.trim() === '') {
    errors.push('Delivery Token is required');
  }

  if (!config.environment || config.environment.trim() === '') {
    errors.push('Environment is required');
  }

  if (config.livePreview) {
    if (!config.previewToken) {
      errors.push('Preview Token is required when Live Preview is enabled');
    }

    if (!config.previewHost) {
      errors.push('Preview Host is required when Live Preview is enabled');
    }

    if (!config.appHost) {
      errors.push('App Host is required when Live Preview is enabled');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function parseContentstackRegion(region?: string): string {
  if (!region) return 'us';

  const regionMap: Record<string, string> = {
    us: 'us',
    eu: 'eu',
    'azure-na': 'azure-na',
    'azure-eu': 'azure-eu',
    'gcp-na': 'gcp-na',
  };

  const normalizedRegion = region.toLowerCase();

  return regionMap[normalizedRegion] || 'us';
}

export function generateEnvFileContent(config: ContentstackConfig): string {
  const lines = [
    `CONTENTSTACK_API_KEY=${config.apiKey}`,
    `CONTENTSTACK_DELIVERY_TOKEN=${config.deliveryToken}`,
    `CONTENTSTACK_ENVIRONMENT=${config.environment}`,
    `CONTENTSTACK_REGION=${config.region || 'us'}`,
    `CONTENTSTACK_BRANCH=${config.branch || 'main'}`,
  ];

  if (config.livePreview) {
    lines.push(`CONTENTSTACK_LIVE_PREVIEW=true`);
    lines.push(`CONTENTSTACK_PREVIEW_TOKEN=${config.previewToken}`);
    lines.push(`CONTENTSTACK_PREVIEW_HOST=${config.previewHost}`);
    lines.push(`CONTENTSTACK_APP_HOST=${config.appHost}`);
  } else {
    lines.push(`CONTENTSTACK_LIVE_PREVIEW=false`);
  }

  return lines.join('\n');
}

export function createAICompletionFunction(
  completionFn: (prompt: string) => Promise<string>,
): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    try {
      return await completionFn(prompt);
    } catch (error) {
      console.error('AI completion error:', error);
      throw error;
    }
  };
}

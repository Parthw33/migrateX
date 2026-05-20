import { type ActionFunctionArgs, json } from '@remix-run/node';

/**
 * API route for Contentstack operations.
 * Creates environment and delivery token for the migration process.
 */

const CONTENTSTACK_API_BASE = 'https://api.contentstack.io/v3';

interface ContentstackResponse {
  environment?: {
    name: string;
    uid: string;
    urls: Array<{ locale: string; url: string }>;
  };
  token?: {
    name: string;
    token: string;
    uid: string;
  };
  error_message?: string;
  error_code?: number;
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { stackApiKey, action: actionType } = body as {
      stackApiKey: string;
      action: 'setup' | 'create-environment' | 'create-delivery-token';
    };

    if (!stackApiKey) {
      return json({ error: 'Stack API Key is required' }, { status: 400 });
    }

    // get auth token from environment
    const authToken = process.env.AUTH_TOKEN;

    if (!authToken) {
      return json({ error: 'AUTH_TOKEN not configured on server' }, { status: 500 });
    }

    const headers = {
      api_key: stackApiKey,
      authtoken: authToken,
      'Content-Type': 'application/json',
    };

    // handle full setup (create both environment and delivery token)
    if (actionType === 'setup') {
      const result = await setupStack(headers, stackApiKey);

      return json(result);
    }

    // handle individual actions
    if (actionType === 'create-environment') {
      const envResult = await createEnvironment(headers);

      return json(envResult);
    }

    if (actionType === 'create-delivery-token') {
      const tokenResult = await createDeliveryToken(headers);

      return json(tokenResult);
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Contentstack API error:', error);

    return json(
      {
        error: 'Failed to connect to Contentstack API',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

async function createEnvironment(headers: Record<string, string>): Promise<{
  success: boolean;
  environment?: { name: string; uid: string };
  error?: string;
  alreadyExists?: boolean;
}> {
  try {
    const response = await fetch(`${CONTENTSTACK_API_BASE}/environments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        environment: {
          name: 'dev',
          urls: [
            {
              locale: 'en-us',
              url: 'http://example.com/',
            },
          ],
        },
      }),
    });

    const data = (await response.json()) as ContentstackResponse;

    if (!response.ok) {
      // check if environment already exists
      if (data.error_message?.includes('already exists') || data.error_code === 115) {
        return {
          success: true,
          environment: { name: 'dev', uid: 'existing' },
          alreadyExists: true,
        };
      }

      return {
        success: false,
        error: data.error_message || `API returned status ${response.status}`,
      };
    }

    return {
      success: true,
      environment: data.environment
        ? {
            name: data.environment.name,
            uid: data.environment.uid,
          }
        : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create environment',
    };
  }
}

async function createDeliveryToken(headers: Record<string, string>): Promise<{
  success: boolean;
  deliveryToken?: { name: string; token: string; uid: string };
  error?: string;
}> {
  try {
    const response = await fetch(`${CONTENTSTACK_API_BASE}/stacks/delivery_tokens`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        token: {
          name: 'Delivery Token for MigrateX',
          description: 'This is a delivery token created by MigrateX.',
          scope: [
            {
              module: 'environment',
              acl: {
                read: true,
              },
              environments: ['dev'],
            },
            {
              module: 'branch',
              acl: {
                read: true,
              },
              branches: ['main'],
            },
          ],
        },
      }),
    });

    const data = (await response.json()) as ContentstackResponse;

    if (!response.ok) {
      return {
        success: false,
        error: data.error_message || `API returned status ${response.status}`,
      };
    }

    return {
      success: true,
      deliveryToken: data.token
        ? {
            name: data.token.name,
            token: data.token.token,
            uid: data.token.uid,
          }
        : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create delivery token',
    };
  }
}

async function setupStack(
  headers: Record<string, string>,
  stackApiKey: string,
): Promise<{
  success: boolean;
  stackApiKey: string;
  environment?: { name: string; uid: string };
  deliveryToken?: { name: string; token: string; uid: string };
  environmentAlreadyExists?: boolean;
  error?: string;
}> {
  // step 1: create environment
  const envResult = await createEnvironment(headers);

  if (!envResult.success && !envResult.alreadyExists) {
    return {
      success: false,
      stackApiKey,
      error: `Failed to create environment: ${envResult.error}`,
    };
  }

  // step 2: create delivery token
  const tokenResult = await createDeliveryToken(headers);

  if (!tokenResult.success) {
    return {
      success: false,
      stackApiKey,
      environment: envResult.environment,
      environmentAlreadyExists: envResult.alreadyExists,
      error: `Failed to create delivery token: ${tokenResult.error}`,
    };
  }

  return {
    success: true,
    stackApiKey,
    environment: envResult.environment,
    environmentAlreadyExists: envResult.alreadyExists,
    deliveryToken: tokenResult.deliveryToken,
  };
}

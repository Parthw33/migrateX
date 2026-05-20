import { type ActionFunctionArgs } from '@remix-run/node';
import * as fs from 'fs/promises';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/.server/llm/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import { transformContentstackSchemas } from '~/lib/.server/llm/content-models-transformer';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

const getAllContentTypes = async (apiKey: string, token: string) => {
  try {
    if (!apiKey || !token) {
      console.warn('Missing API key or auth token for Contentstack');
      return [];
    }

    const res = await fetch('https://api.contentstack.io/v3/content_types', {
      headers: { api_key: apiKey, authtoken: token },
    });

    if (!res.ok) {
      console.warn(`Contentstack API returned status ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { content_types?: unknown[] };

    return data.content_types || [];
  } catch (error) {
    console.error('Error fetching content types:', error);
    return [];
  }
};

interface ChatRequestBody {
  messages: Messages;
  contentstackApiKey?: string;
  contentstackDeliveryToken?: string;
  contentstackEnvironment?: string;
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  const body = await request.json<ChatRequestBody>();
  const { messages, contentstackApiKey, contentstackDeliveryToken, contentstackEnvironment } = body;

  const stream = new SwitchableStream();

  // get auth token from environment
  const authToken = process.env.AUTH_TOKEN || '';

  // use credentials from sessionStorage (passed via request body) or fall back to defaults
  const contentstackConfig: any = {
    apiKey: contentstackApiKey,
    deliveryToken: contentstackDeliveryToken,
    environment: contentstackEnvironment || 'dev',
    region: 'na',
    branch: 'main',
    livePreview: true,
    previewToken: 'cs5eaed62bc746c69212eb9a97',
    previewHost: 'rest-preview.contentstack.com',
    appHost: 'app.contentstack.com',
    authToken: authToken || '',
  };

  const data = await getAllContentTypes(contentstackConfig.apiKey, contentstackConfig.authToken);

  const analysisDataPath =
    '/Users/parth.wattamwar/Documents/Marketplace-Apps/migrate-x/ct-entry/output/content_types/comprehensive-analysis.md';

  const themeDataPath =
    '/Users/parth.wattamwar/Documents/Marketplace-Apps/migrate-x/ct-entry/crawler-output/migratex-gatsby-starter-app.contentstackapps.com/theme.json';

  const sitemapDataPath =
    '/Users/parth.wattamwar/Documents/Marketplace-Apps/migrate-x/ct-entry/crawler-output/migratex-gatsby-starter-app.contentstackapps.com/sitemap.json';

  let analysisData = '';
  let themeData = '';
  let sitemapData = '';

  try {
    analysisData = await fs.readFile(analysisDataPath, 'utf-8');
    console.info('📄 Analysis file loaded successfully');
  } catch (error) {
    console.error('Failed to read analysis file:', error);
  }

  try {
    themeData = await fs.readFile(themeDataPath, 'utf-8');
    console.info('📄 Theme file loaded successfully');
  } catch (error) {
    console.error('Failed to read theme file:', error);
  }

  try {
    sitemapData = await fs.readFile(sitemapDataPath, 'utf-8');
    console.info('📄 Sitemap file loaded successfully');
  } catch (error) {
    console.error('Failed to read sitemap file:', error);
  }

  // placeholder content models transformation (no schemas provided yet)
  const contentModelsJSON = await transformContentstackSchemas(data, async () => '[]');

  try {
    const options: StreamingOptions = {
      toolChoice: 'none',
      onFinish: async ({ text: content, finishReason }) => {
        if (finishReason !== 'length') {
          return stream.close();
        }

        if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
          throw Error('Cannot continue message: Maximum segments reached');
        }

        const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

        console.log(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

        messages.push({ role: 'assistant', content });
        messages.push({ role: 'user', content: CONTINUE_PROMPT });

        const result = await streamText(
          messages,
          process.env as unknown as Env,
          contentModelsJSON,
          contentstackConfig,
          options,
          analysisData,
          themeData,
          sitemapData,
        );

        return stream.switchSource(result.toAIStream());
      },
    };

    const result = await streamText(
      messages,
      process.env as unknown as Env,
      contentModelsJSON,
      contentstackConfig,
      options,
      analysisData,
      themeData,
      sitemapData,
    );

    stream.switchSource(result.toAIStream());

    return new Response(stream.readable, {
      status: 200,
      headers: {
        contentType: 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.log(error);

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}

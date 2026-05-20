import { type ActionFunctionArgs, json } from '@remix-run/node';

/**
 * Proxy API route for the crawl service.
 * This avoids CORS issues by making server-to-server requests.
 */

const CRAWL_BASE_URL = 'http://localhost:5002';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const {
      websiteUrl,
      maxPages = 50,
      maxDepth,
      depth = 4,
    } = body as {
      websiteUrl: string;
      maxPages?: number;
      maxDepth?: number;
      depth?: number;
    };

    if (!websiteUrl) {
      return json({ error: 'websiteUrl is required' }, { status: 400 });
    }

    // make request to the crawl service
    const crawlResponse = await fetch(`${CRAWL_BASE_URL}/crawl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        websiteUrl,
        maxPages,
        maxDepth: maxDepth ?? depth,
      }),
    });

    if (!crawlResponse.ok) {
      const errorText = await crawlResponse.text();
      console.error('Crawl error:', errorText);

      return json(
        { error: `Crawl service returned status ${crawlResponse.status}`, details: errorText },
        { status: crawlResponse.status },
      );
    }

    // check if response is streaming
    const contentType = crawlResponse.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream') || contentType.includes('application/x-ndjson')) {
      // for streaming responses, we need to forward the stream
      // but Remix doesn't support streaming responses well, so we collect and return
      const text = await crawlResponse.text();

      return new Response(text, {
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }

    // try to parse as JSON first
    const responseText = await crawlResponse.text();

    try {
      const data = JSON.parse(responseText);

      return json({ success: true, data });
    } catch {
      // return as plain text if not JSON
      return new Response(responseText, {
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }
  } catch (error) {
    console.error('Crawl proxy error:', error);

    return json(
      {
        error: 'Failed to connect to crawl service',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

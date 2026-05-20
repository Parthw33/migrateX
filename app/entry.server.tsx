import { PassThrough } from 'node:stream';
import type { AppLoadContext, EntryContext } from '@remix-run/node';
import { createReadableStreamFromReadable } from '@remix-run/node';
import { RemixServer } from '@remix-run/react';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
import { renderHeadToString } from 'remix-island';
import { Head } from './root';
import { themeStore } from '~/lib/stores/theme';

const ABORT_DELAY = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  _loadContext: AppLoadContext,
) {
  const callbackName = isbot(request.headers.get('user-agent') ?? '') ? 'onAllReady' : 'onShellReady';
  const head = renderHeadToString({ request, remixContext, Head });

  return new Promise<Response>((resolve, reject) => {
    let didError = false;

    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} abortDelay={ABORT_DELAY} />,
      {
        [callbackName]() {
          // Output stream that the Response will consume
          const output = new PassThrough();

          // React writes to this intermediate stream
          const reactStream = new PassThrough();

          // Write HTML prefix into output
          output.write(
            `<!DOCTYPE html><html lang="en" data-theme="${themeStore.value}"><head>${head}</head><body><div id="root" class="w-full h-full">`,
          );

          // Forward react content into output, then append closing tags
          reactStream.pipe(output, { end: false });
          reactStream.on('end', () => {
            output.write('</div></body></html>');
            output.end();
          });

          // Kick React rendering into reactStream
          pipe(reactStream);

          responseHeaders.set('Content-Type', 'text/html');
          responseHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
          responseHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

          resolve(
            new Response(createReadableStreamFromReadable(output), {
              headers: responseHeaders,
              status: didError ? 500 : responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          didError = true;
          console.error(error);
        },
      },
    );

    setTimeout(abort, ABORT_DELAY);
  });
}

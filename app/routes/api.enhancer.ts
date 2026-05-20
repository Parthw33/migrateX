import { type ActionFunctionArgs } from '@remix-run/node';
import { StreamingTextResponse, convertToCoreMessages, parseStreamPart, streamText as aiStreamText } from 'ai';
import { getAPIKey } from '~/lib/.server/llm/api-key';
import { getAnthropicModel } from '~/lib/.server/llm/model';
import { MAX_TOKENS } from '~/lib/.server/llm/constants';
import { stripIndents } from '~/utils/stripIndent';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function action(args: ActionFunctionArgs) {
  return enhancerAction(args);
}

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  const { message } = await request.json<{ message: string }>();

  try {
    const userContent = stripIndents`
      I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

      IMPORTANT: Only respond with the improved prompt and nothing else!

      <original_prompt>
        ${message}
      </original_prompt>
    `;

    const result = await aiStreamText({
      model: getAnthropicModel(getAPIKey()),
      system:
        'You rewrite user prompts to be clearer and more actionable. Output only the improved prompt text, no preamble.',
      maxTokens: MAX_TOKENS,
      headers: {
        'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15',
      },
      messages: convertToCoreMessages([{ role: 'user', content: userContent }]),
    });

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const processedChunk = decoder
          .decode(chunk)
          .split('\n')
          .filter((line) => line !== '')
          .map(parseStreamPart)
          .map((part) => part.value)
          .join('');

        controller.enqueue(encoder.encode(processedChunk));
      },
    });

    const transformedStream = result.toAIStream().pipeThrough(transformStream);

    return new StreamingTextResponse(transformedStream);
  } catch (error) {
    console.log(error);

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}

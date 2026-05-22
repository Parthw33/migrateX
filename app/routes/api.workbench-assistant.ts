/**
 * POST /api/workbench-assistant
 *
 * Streaming AI chat endpoint for the /generate-website workbench. The client
 * (the new shadcn/assistant-ui ChatPanel) drives it with Vercel AI SDK's
 * `useChat` hook, so the request body shape matches `ai`'s default
 * (`{ messages: UIMessage[], data?: { … } }`).
 *
 * `data` is the optional context payload from the client — current job id,
 * file count, latest pipeline status — that we splice into the system prompt
 * so the model can answer questions about *this* migration concretely.
 */

import { type ActionFunctionArgs } from '@remix-run/node';
import { streamText, convertToCoreMessages, type CoreMessage } from 'ai';
import { getAPIKey } from '~/lib/.server/llm/api-key';
import { getAnthropicModel } from '~/lib/.server/llm/model';

interface AssistantRequestBody {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  data?: {
    jobId?: string;
    websiteUrl?: string;
    projectName?: string;
    fileCount?: number;
    phase?: string;
    websiteStatus?: string;
    latestPipelineMessage?: string;
    recentFiles?: string[];
  };
}

function buildSystemPrompt(ctx: AssistantRequestBody['data']): string {
  const lines: string[] = [
    "You are the MigrateX workbench assistant. You help users monitor and understand the website-generation pipeline for their migration job.",
    "",
    "Style guide:",
    "- Be concise. Two or three short paragraphs is usually plenty.",
    "- Render lists and code blocks with proper Markdown syntax (\\`\\`\\`lang).",
    "- When users ask about pipeline state, refer to the live job context below.",
    "- If asked to *do* something destructive (delete, redeploy, retry), explain that they should use the explicit buttons on the workbench (Sync, Retry, Build) rather than the chat.",
  ];

  if (ctx) {
    lines.push('', 'Current job context:');
    if (ctx.projectName) lines.push(`- Project name: ${ctx.projectName}`);
    if (ctx.jobId) lines.push(`- Job ID: ${ctx.jobId}`);
    if (ctx.websiteUrl) lines.push(`- Source URL: ${ctx.websiteUrl}`);
    if (ctx.phase) lines.push(`- Live-poll phase: ${ctx.phase}`);
    if (ctx.websiteStatus) lines.push(`- Website status: ${ctx.websiteStatus}`);
    if (typeof ctx.fileCount === 'number') lines.push(`- Files in workbench: ${ctx.fileCount}`);
    if (ctx.latestPipelineMessage) lines.push(`- Latest pipeline message: ${ctx.latestPipelineMessage}`);
    if (ctx.recentFiles?.length) {
      lines.push('- Recent files:');
      for (const f of ctx.recentFiles.slice(0, 20)) lines.push(`  - ${f}`);
    }
  }

  return lines.join('\n');
}

export async function action({ request }: ActionFunctionArgs) {
  let body: AssistantRequestBody;
  try {
    body = (await request.json()) as AssistantRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages[] is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  let apiKey: string;
  try {
    apiKey = getAPIKey();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Missing API key' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const system = buildSystemPrompt(body.data);

  const result = await streamText({
    model: getAnthropicModel(apiKey),
    system,
    maxTokens: 1024,
    messages: convertToCoreMessages(messages as Parameters<typeof convertToCoreMessages>[0]) as CoreMessage[],
  });

  return result.toDataStreamResponse();
}

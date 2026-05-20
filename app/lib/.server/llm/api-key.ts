export function getAPIKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  return key;
}

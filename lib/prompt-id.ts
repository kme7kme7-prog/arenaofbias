// Old arena numbers and canonical public task IDs share the same URL-safe contract.
export function isPromptId(value: unknown): value is string {
  return typeof value === 'string' && /^(?:\d{3}|[a-z][a-z0-9-]{0,63})$/.test(value);
}

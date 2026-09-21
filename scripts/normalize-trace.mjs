const text = (value) => typeof value === 'string' ? value : JSON.stringify(value ?? '');
const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const sum = (items, key) => items.length && items.every((m) => m[key] !== null)
  ? items.reduce((total, m) => total + m[key], 0) : null;

// This adapter consumes exported message payloads, not Langfuse Observations.
export function normalizeTrace(payload, turn, sessionId = null, traceId = null) {
  const messages = payload.output?.messages;
  if (!Array.isArray(messages)) throw new Error('output.messages is required');
  const input = (payload.input?.messages ?? []).filter((m) => m.type === 'human').map((m) => text(m.content)).join('\n');
  const boundary = messages.findLastIndex((m) => m.type === 'human' && text(m.content).trim() === input.trim());
  const compressed = boundary < 0 && messages[0]?.type === 'human'
    && text(messages[0].content).startsWith('Here is a summary of the conversation to date:');
  if (boundary < 0 && !compressed) throw new Error('Cannot reliably locate the current turn');
  const offset = boundary >= 0 ? boundary : 1;
  const current = messages.slice(offset);
  const ai = current.flatMap((m, index) => m.type === 'ai' ? [{ m, index: index + offset }] : []);
  const results = current.filter((m) => m.type === 'tool');
  const used = new Set();
  const steps = ai.map(({ m, index }) => ({
    id: m.id || `turn${turn}-message-${index}`, sourceIndex: index,
    text: text(m.content), reasoning: Boolean(m.additional_kwargs?.reasoning_content),
    model: m.response_metadata?.model_name ?? null,
    inputTokens: number(m.usage_metadata?.input_tokens), outputTokens: number(m.usage_metadata?.output_tokens),
    tools: (m.tool_calls ?? []).map((call) => {
      const matches = results.filter((r) => call.id && r.tool_call_id === call.id);
      const result = matches.length === 1 ? matches[0] : null;
      if (result) used.add(result);
      return { id: call.id || `${index}-${call.name}`, name: call.name, messageId: result?.id ?? null, linked: Boolean(result) };
    }),
  }));
  const last = ai.at(-1);
  const hasFinal = last && last.index === messages.length - 1
    && last.m.response_metadata?.finish_reason === 'stop'
    && !(last.m.tool_calls?.length) && text(last.m.content).trim();
  const final = hasFinal ? steps.at(-1) : null;
  const unlinkedTools = results.filter((r) => !used.has(r)).map((r, i) => ({
    id: r.tool_call_id || r.id || `unlinked-${i}`, name: r.name || '未命名工具', messageId: r.id ?? null, linked: false,
  }));
  return {
    id: `turn${turn}`, sourceFile: `turn${turn}.json`, turn, sessionId,
    traceId, agent: null, occurredAt: null, duration: null, feedback: null, abnormal: null,
    sourceMessageCount: messages.length, historyMessageCount: offset, currentMessageCount: current.length,
    reasoningCount: steps.filter((s) => s.reasoning).length,
    toolCount: steps.reduce((n, s) => n + s.tools.length, 0) + unlinkedTools.length,
    inputTokens: sum(steps, 'inputTokens'), outputTokens: sum(steps, 'outputTokens'),
    compressed, historySummary: compressed ? text(messages[0].content) : '', input,
    output: final?.text ?? '', final, steps: final ? steps.slice(0, -1) : steps, unlinkedTools,
  };
}

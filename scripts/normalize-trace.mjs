const text = (value) => typeof value === 'string' ? value : JSON.stringify(value ?? '');
const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const preview = (value, max = 160) => {
  const s = text(value).replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}……` : s;
};
const compactArgs = (args) => {
  if (!args || typeof args !== 'object') return '';
  const preferred = args.command ?? args.path ?? args.query ?? args.url ?? args.pattern;
  if (typeof preferred === 'string' && preferred.trim()) return preferred;
  const rest = { ...args };
  delete rest.brief;
  delete rest.user;
  return JSON.stringify(rest);
};
const clean = (value) => text(value).replace(/\u001b\[[0-9;]*m/g, '');

// This adapter consumes exported message payloads, not Langfuse Observations.
export function normalizeTrace(payload, turn, sessionId = null, traceId = null, occurredAt = null) {
  const messages = payload.output?.messages;
  if (!Array.isArray(messages)) throw new Error('output.messages is required');
  const input = (payload.input?.messages ?? []).filter((m) => m.type === 'human').map((m) => text(m.content)).join('\n');
  const boundary = messages.findLastIndex((m) => m.type === 'human' && text(m.content).trim() === input.trim());
  const compressed = boundary < 0 && messages[0]?.type === 'human'
    && text(messages[0].content).startsWith('Here is a summary of the conversation to date:');
  if (boundary < 0 && !compressed) throw new Error('Cannot reliably locate the current turn');
  const offset = boundary >= 0 ? boundary : 1;
  const current = messages.slice(offset);
  const contextMessages = messages.slice(0, offset).map((message) => ({
    id: message.id ?? null,
    type: message.type ?? 'unknown',
    name: message.name ?? null,
    content: clean(message.content ?? ''),
  }));
  const results = current.filter((m) => m.type === 'tool');
  const used = new Set();
  const humanMessage = current.find((m) => m.type === 'human') ?? (payload.input?.messages ?? []).find((m) => m.type === 'human');
  const events = [{ kind: 'user', id: `turn${turn}-user`, text: input.trim(), messageId: humanMessage?.id ?? null }];
  let inputTokens = 0;
  let outputTokens = 0;
  let tokenComplete = true;
  let reasoningCount = 0;
  let toolCount = 0;
  let output = '';

  current.forEach((m, index) => {
    if (m.type === 'human') return;
    if (m.type === 'ai') {
      const isFinal = m.response_metadata?.finish_reason === 'stop' && !(m.tool_calls?.length) && Boolean(text(m.content).trim());
      const hasReasoning = Boolean(m.additional_kwargs?.reasoning_content);
      if (hasReasoning) reasoningCount += 1;
      const inTok = number(m.usage_metadata?.input_tokens);
      const outTok = number(m.usage_metadata?.output_tokens);
      if (inTok === null || outTok === null) tokenComplete = false;
      else { inputTokens += inTok; outputTokens += outTok; }
      const textPreview = isFinal ? preview(m.content, 280) : preview(m.additional_kwargs?.reasoning_content || m.content, 220);
      events.push({
        kind: 'assistant',
        id: m.id || `turn${turn}-ai-${index}`,
        text: textPreview,
        isFinal,
        hasReasoning,
        reasoning: clean(m.additional_kwargs?.reasoning_content ?? ''),
        content: clean(m.content ?? ''),
        model: m.response_metadata?.model_name ?? null,
        provider: m.response_metadata?.model_provider ?? null,
        finishReason: m.response_metadata?.finish_reason ?? null,
        inputTokens: inTok,
        outputTokens: outTok,
        totalTokens: number(m.usage_metadata?.total_tokens),
        cacheReadTokens: number(m.usage_metadata?.input_token_details?.cache_read),
        reasoningTokens: number(m.usage_metadata?.output_token_details?.reasoning),
        toolNames: (m.tool_calls ?? []).map((call) => call.name).filter(Boolean),
      });
      if (isFinal) output = text(m.content);
      for (const call of m.tool_calls ?? []) {
        const matches = results.filter((r) => call.id && r.tool_call_id === call.id);
        const result = matches.length === 1 ? matches[0] : null;
        if (result) used.add(result);
        toolCount += 1;
        events.push({
          kind: 'tool',
          id: call.id || `${index}-${call.name}`,
          name: call.name,
          input: preview(compactArgs(call.args), 140),
          output: preview(result?.content ?? '', 140),
          linked: Boolean(result),
          brief: typeof call.args?.brief === 'string' ? call.args.brief : '',
          status: result?.status ?? null,
          args: call.args && typeof call.args === 'object' ? call.args : null,
          result: clean(result?.content ?? ''),
        });
      }
      return;
    }
    if (m.type === 'tool' && !used.has(m)) {
      toolCount += 1;
      events.push({
        kind: 'tool',
        id: m.tool_call_id || m.id || `unlinked-${index}`,
        name: m.name || '未命名工具',
        input: '',
        output: preview(m.content ?? '', 140),
        linked: false,
        brief: '',
        status: m.status ?? null,
        args: null,
        result: clean(m.content ?? ''),
      });
    }
  });

  return {
    id: `turn${turn}`, sourceFile: `turn${turn}.json`, turn, sessionId,
    traceId, agent: null, occurredAt, duration: null, feedback: null,
    abnormal: events.some((event) => event.kind === 'tool' && event.status && event.status !== 'success'),
    sourceMessageCount: messages.length, historyMessageCount: offset, currentMessageCount: current.length,
    reasoningCount, toolCount,
    inputTokens: tokenComplete ? inputTokens : null, outputTokens: tokenComplete ? outputTokens : null,
    compressed, historySummary: compressed ? preview(messages[0].content, 180) : '', input: preview(input, 280),
    output: preview(output, 280), events,
    context: {
      kind: compressed ? 'summary' : contextMessages.length ? 'conversation' : 'none',
      messages: contextMessages,
    },
  };
}

export type TraceEvent =
  | { kind: 'user'; id: string; text: string; messageId: string | null }
  | {
      kind: 'assistant';
      id: string;
      text: string;
      isFinal: boolean;
      hasReasoning: boolean;
      reasoning: string;
      content: string;
      model: string | null;
      provider: string | null;
      finishReason: string | null;
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
      cacheReadTokens: number | null;
      reasoningTokens: number | null;
      toolNames: string[];
    }
  | {
      kind: 'tool';
      id: string;
      name: string;
      input: string;
      output: string;
      linked: boolean;
      brief: string;
      status: string | null;
      args: Record<string, unknown> | null;
      result: string;
    };

export type TraceContextMessage = {
  id: string | null;
  type: string;
  name: string | null;
  content: string;
};

export type TraceContext = {
  kind: 'none' | 'conversation' | 'summary';
  messages: TraceContextMessage[];
};

export type ObservedTrace = {
  id: string;
  traceId: string | null;
  sessionId: string | null;
  turn: number;
  sourceFile: string;
  agent: string | null;
  occurredAt: string | null;
  duration: number | null;
  feedback: string | null;
  abnormal: boolean | null;
  sourceMessageCount: number;
  historyMessageCount: number;
  currentMessageCount: number;
  reasoningCount: number;
  toolCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  compressed: boolean;
  historySummary: string;
  input: string;
  output: string;
  context: TraceContext;
  events: TraceEvent[];
};

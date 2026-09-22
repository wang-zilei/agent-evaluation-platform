export type TraceEvent =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; isFinal: boolean; hasReasoning: boolean }
  | { kind: 'tool'; id: string; name: string; input: string; output: string; linked: boolean };
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
  events: TraceEvent[];
};

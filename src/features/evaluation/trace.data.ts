import data from './trace-data/traces.json';
import { financialComplianceObservedTraces } from './financial-compliance.mock';
import { queryAgentObservedTraces } from './query-agent.mock';
import type { ObservedSession, ObservedTrace } from './trace.types';

export type ObservationFeedbackOverrides = Record<string, string | null>;

const realObservedTraces = data as ObservedTrace[];
const MOCK_TRACE_METADATA: Record<string, Pick<ObservedTrace, 'agent' | 'duration' | 'feedback'>> = {
  turn1: { agent: '行业研究 Agent', duration: 126_000, feedback: '有帮助' },
  turn2: { agent: '行业研究 Agent', duration: 395_000, feedback: '来源需复核' },
  turn3: { agent: '行业研究 Agent', duration: 274_000, feedback: '结构清晰' },
};

// The imported traces keep their original fields. Missing list-level metadata is
// filled only in the normalized display projection for this Mock prototype.
const normalizedRealTraces = realObservedTraces.map((trace) => {
  const mock = MOCK_TRACE_METADATA[trace.id];
  return {
    ...trace,
    agent: trace.agent ?? mock?.agent ?? null,
    duration: trace.duration ?? mock?.duration ?? null,
    feedback: trace.feedback ?? mock?.feedback ?? null,
  };
});

export const observedTraces: ObservedTrace[] = [
  ...normalizedRealTraces,
  ...financialComplianceObservedTraces,
  ...queryAgentObservedTraces,
].sort((left, right) => {
  const timeDelta = Date.parse(right.occurredAt ?? '') - Date.parse(left.occurredAt ?? '');
  return Number.isNaN(timeDelta) ? right.turn - left.turn : timeDelta;
});

export function applyObservationFeedbackOverrides<T extends { id: string; feedback: string | null }>(
  records: T[],
  overrides: ObservationFeedbackOverrides,
): T[] {
  return records.map((record) => {
    if (!Object.prototype.hasOwnProperty.call(overrides, record.id)) return record;
    const feedback = overrides[record.id]?.trim() || null;
    return { ...record, feedback };
  });
}

const sumTokens = (values: Array<number | null>) => {
  const collected = values.filter((value): value is number => value !== null);
  return collected.length ? collected.reduce((total, value) => total + value, 0) : null;
};

export function groupObservedSessions(traces: ObservedTrace[]): ObservedSession[] {
  const grouped = new Map<string, ObservedTrace[]>();

  [...traces]
    .sort((left, right) => {
      const timeDelta = Date.parse(left.occurredAt ?? '') - Date.parse(right.occurredAt ?? '');
      return Number.isNaN(timeDelta) ? left.turn - right.turn : timeDelta;
    })
    .forEach((trace) => {
      const id = trace.sessionId ?? trace.id;
      grouped.set(id, [...(grouped.get(id) ?? []), trace]);
    });

  return [...grouped.entries()].map(([id, turns]) => {
    const feedback = [...new Set(turns.map((turn) => turn.feedback).filter((value): value is string => Boolean(value)))];
    const abnormalValues = turns.map((turn) => turn.abnormal);
    return {
      id,
      sessionId: turns[0]?.sessionId ?? null,
      agent: turns.find((turn) => turn.agent)?.agent ?? null,
      startedAt: turns[0]?.occurredAt ?? null,
      feedback: feedback.length ? feedback.join('；') : null,
      abnormal: abnormalValues.some((value) => value === true) ? true : abnormalValues.every((value) => value === false) ? false : null,
      inputTokens: sumTokens(turns.map((turn) => turn.inputTokens)),
      outputTokens: sumTokens(turns.map((turn) => turn.outputTokens)),
      turns,
    };
  }).sort((left, right) => {
    const timeDelta = Date.parse(right.startedAt ?? '') - Date.parse(left.startedAt ?? '');
    return Number.isNaN(timeDelta) ? right.turns.length - left.turns.length : timeDelta;
  });
}

export const observedSessions = groupObservedSessions(observedTraces);

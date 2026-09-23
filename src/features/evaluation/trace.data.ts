import data from './trace-data/traces.json';
import type { ObservedSession, ObservedTrace } from './trace.types';

export const observedTraces = data as ObservedTrace[];

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
  });
}

export const observedSessions = groupObservedSessions(observedTraces);

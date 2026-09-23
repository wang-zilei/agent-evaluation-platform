import { describe, expect, it } from 'vitest';
import { groupObservedSessions, observedSessions, observedTraces } from './trace.data';

describe('observation session grouping', () => {
  it('groups the three observed turns into one ordered session', () => {
    expect(observedSessions).toHaveLength(1);
    expect(observedSessions[0].id).toBe('c8e468c602f34131');
    expect(observedSessions[0].turns.map((turn) => turn.id)).toEqual(['turn1', 'turn2', 'turn3']);
  });

  it('sums session token usage across turns', () => {
    expect(observedSessions[0].inputTokens).toBe(2393489);
    expect(observedSessions[0].outputTokens).toBe(40636);
  });

  it('keeps traces without a session id as single-turn sessions', () => {
    const standalone = groupObservedSessions([{ ...observedTraces[0], id: 'standalone', sessionId: null }]);
    expect(standalone).toHaveLength(1);
    expect(standalone[0].id).toBe('standalone');
    expect(standalone[0].turns).toHaveLength(1);
  });
});

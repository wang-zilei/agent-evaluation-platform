import { describe, expect, it } from 'vitest';
import { groupObservedSessions, observedSessions, observedTraces } from './trace.data';

describe('observation session grouping', () => {
  it('groups the three observed turns into one ordered session', () => {
    const realSession = observedSessions.find((session) => session.id === 'c8e468c602f34131');
    expect(realSession?.turns.map((turn) => turn.id)).toEqual(['turn1', 'turn2', 'turn3']);
    expect(observedSessions).toHaveLength(10);
  });

  it('sums session token usage across turns', () => {
    const realSession = observedSessions.find((session) => session.id === 'c8e468c602f34131');
    expect(realSession?.inputTokens).toBe(2393489);
    expect(realSession?.outputTokens).toBe(40636);
  });

  it('keeps the imported real trace metadata isolated from scenario mocks', () => {
    const realTraces = observedTraces.filter((trace) => trace.id.startsWith('turn'));
    expect(realTraces).toHaveLength(3);
    realTraces.forEach((trace) => {
      expect(trace.agent).toBe('行业研究 Agent');
      expect(trace.duration).toBeGreaterThan(0);
      expect(trace.feedback).toBeTruthy();
    });
    expect(observedSessions.find((session) => session.id === 'c8e468c602f34131')?.feedback).toBe('有帮助；来源需复核；结构清晰');
  });

  it('adds GraphRAG and query-agent observations with linked sessions', () => {
    const financialMultiTurn = observedSessions.find((session) => session.id === '77ab3319f2ff4ed0');
    expect(financialMultiTurn?.agent).toBe('金融合规问答 Agent');
    expect(financialMultiTurn?.turns).toHaveLength(2);
    expect(observedSessions.some((session) => session.agent === '问数 Agent' && session.turns.length === 1)).toBe(true);
    expect(new Set(observedTraces.map((trace) => trace.id)).size).toBe(observedTraces.length);
  });

  it('keeps traces without a session id as single-turn sessions', () => {
    const standalone = groupObservedSessions([{ ...observedTraces[0], id: 'standalone', sessionId: null }]);
    expect(standalone).toHaveLength(1);
    expect(standalone[0].id).toBe('standalone');
    expect(standalone[0].turns).toHaveLength(1);
  });
});

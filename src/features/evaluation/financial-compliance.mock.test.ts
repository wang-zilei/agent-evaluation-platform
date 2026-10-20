import { describe, expect, it } from 'vitest';
import {
  financialComplianceDataset,
  financialComplianceObservedTraces,
  financialComplianceResults,
} from './financial-compliance.mock';

describe('financial compliance validation mock', () => {
  it('covers both single-turn and multi-turn validation cases', () => {
    expect(financialComplianceDataset.cases).toHaveLength(6);
    expect(financialComplianceDataset.cases.filter((item) => item.values['fc-round'] === '单轮')).toHaveLength(3);
    expect(financialComplianceDataset.cases.filter((item) => item.values['fc-round'] === '多轮')).toHaveLength(3);
  });

  it('links every result to an existing observation trace and session', () => {
    const traces = new Map(financialComplianceObservedTraces.map((trace) => [trace.traceId, trace]));
    financialComplianceResults.forEach((result) => {
      const trace = traces.get(result.observedTraceId ?? '');
      expect(trace).toBeDefined();
      expect(trace?.sessionId).toBe(result.observedSessionId);
    });
  });

  it('keeps the refusal case on its own same-source trace', () => {
    const result = financialComplianceResults.find((item) => item.caseId === 'FC-M-002');
    const trace = financialComplianceObservedTraces.find((item) => item.traceId === result?.observedTraceId);
    expect(result?.agentOutput).toBe(trace?.output);
    expect(trace?.input).toContain('不方便解释来源');
  });
});

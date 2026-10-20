import { describe, expect, it } from 'vitest';
import {
  QUERY_AGENT_CORE_EVALUATOR_IDS,
  createQueryAgentResults,
  queryAgentDataset,
  queryAgentEvaluators,
  queryAgentSourceCases,
} from './query-agent.mock';

describe('query agent migration mock', () => {
  const selected = queryAgentEvaluators;
  const results = createQueryAgentResults(selected);

  it('converts all 45 source cases and preserves raw trace evidence', () => {
    expect(queryAgentSourceCases).toHaveLength(45);
    expect(queryAgentDataset.cases).toHaveLength(45);
    expect(results).toHaveLength(45);
    expect(results.find((item) => item.caseId === 'syn-query-01')?.queryAgent?.rawTrace?.input?.messages).toHaveLength(1);
    expect(results.find((item) => item.caseId === 'syn-query-44')?.trace).toHaveLength(0);
  });

  it('separates pass, fail and insufficient evidence without coercing evidence gaps', () => {
    expect(results.find((item) => item.caseId === 'syn-query-01')?.status).toBe('通过');
    expect(results.find((item) => item.caseId === 'syn-query-43')?.status).toBe('执行失败');
    expect(results.find((item) => item.caseId === 'syn-query-45')?.status).toBe('证据不足');
    const insufficient = results.find((item) => item.caseId === 'syn-query-45')?.evaluatorResults.find((item) => item.evaluatorId === 'result_match');
    expect(insufficient?.evaluationStatus).toBe('证据不足');
    expect(insufficient?.evaluationResult).toBe('证据不足');
  });

  it('keeps code prompts separate from model prompts and hard gates locked', () => {
    expect(QUERY_AGENT_CORE_EVALUATOR_IDS).toEqual(['result_match', 'sql_contract', 'sql_safety']);
    expect(queryAgentEvaluators.find((item) => item.id === 'sql_contract')?.prompt).toBe('');
    expect(queryAgentEvaluators.find((item) => item.id === 'semantic_intent')?.prompt).toContain('不要重新执行 SQL');
  });
});

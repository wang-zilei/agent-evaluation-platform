import { describe, expect, it } from 'vitest';
import { agentEvaluators, agentMcpLibrary, agentSkillLibrary } from './evaluation.mock';

describe('Agent evaluator mock contract', () => {
  it('exposes reusable Skills and MCP capabilities', () => {
    expect(agentSkillLibrary.length).toBeGreaterThan(0);
    expect(agentMcpLibrary.length).toBeGreaterThan(0);
    expect(agentSkillLibrary.every((item) => item.scriptCount > 0)).toBe(true);
    expect(agentMcpLibrary.every((item) => item.tools.length > 0)).toBe(true);
  });

  it('defines Agent evaluators with at least one mounted capability', () => {
    expect(agentEvaluators.length).toBeGreaterThan(0);
    expect(agentEvaluators.every((item) => item.kind === 'Agent 评估器')).toBe(true);
    expect(agentEvaluators.every((item) => Boolean(item.skills?.length || item.mcpConnections?.length))).toBe(true);
  });
});

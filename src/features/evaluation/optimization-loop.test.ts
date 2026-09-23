import { describe, expect, it } from 'vitest';
import {
  decideOptimizationLoop,
  evaluateOptimizationIteration,
  type OptimizationLoopCaseResult,
  type OptimizationLoopIteration,
  type OptimizationIssue,
} from './optimization-loop';

const issue = (kind: OptimizationIssue['kind'], caseIds: string[], optimizerCanFix: boolean): OptimizationIssue => ({ kind, caseIds, optimizerCanFix, evidence: 'mock evidence' });

const iteration = (
  cases: OptimizationLoopCaseResult[],
  issues: OptimizationIssue[] = [],
  configChanged = true,
): OptimizationLoopIteration => ({ iteration: 1, candidateVersion: 'V1', cases, issues, configChanged });

describe('optimization loop policy', () => {
  it('does not stop on target pass alone when a regression exists', () => {
    const decision = decideOptimizationLoop([iteration([
      { caseId: 'b1', cohort: 'target', beforePassed: false, afterPassed: true, comparable: true },
      { caseId: 'g1', cohort: 'guard', beforePassed: true, afterPassed: false, comparable: true },
    ])]);
    expect(decision.action).toBe('stop');
    expect(decision.reason).toBe('出现回归或关键失败');
  });

  it('stops successfully only when target cases pass without regressions or critical failures', () => {
    const decision = decideOptimizationLoop([iteration([
      { caseId: 'b1', cohort: 'target', beforePassed: false, afterPassed: true, comparable: true },
      { caseId: 'g1', cohort: 'guard', beforePassed: true, afterPassed: true, comparable: true },
    ])]);
    expect(decision.action).toBe('stop');
    expect(decision.reason).toBe('目标达成且无回归');
  });

  it('continues when an actionable failure remains and the iteration improves', () => {
    const decision = decideOptimizationLoop([iteration(
      [{ caseId: 'b1', cohort: 'target', beforePassed: false, afterPassed: true, comparable: true, beforeScore: 0.2, afterScore: 0.8 }, { caseId: 'b2', cohort: 'target', beforePassed: false, afterPassed: false, comparable: true }],
      [issue('agent_config', ['b2'], true)],
    )]);
    expect(decision.action).toBe('continue');
  });

  it('stops after repeated iterations without improvement', () => {
    const history = [1, 2].map((round) => ({ ...iteration(
      [{ caseId: 'b1', cohort: 'target', beforePassed: false, afterPassed: false, comparable: true, beforeScore: 0.4, afterScore: 0.4 }],
      [issue('agent_config', ['b1'], true)],
    ), iteration: round }));
    const decision = decideOptimizationLoop(history);
    expect(decision.action).toBe('stop');
    expect(decision.reason).toBe('连续无有效提升');
  });

  it('stops when remaining failures are outside optimizer control', () => {
    const decision = decideOptimizationLoop([iteration(
      [{ caseId: 'b1', cohort: 'target', beforePassed: false, afterPassed: false, comparable: true }],
      [issue('external_dependency', ['b1'], false)],
    )]);
    expect(decision.action).toBe('stop');
    expect(decision.reason).toBe('剩余问题无法由优化系统解决');
  });

  it('reports incomparable results before spending another optimization round', () => {
    const metrics = evaluateOptimizationIteration(iteration([
      { caseId: 'b1', cohort: 'target', beforePassed: false, afterPassed: false, comparable: false },
    ]));
    expect(metrics.incomparable).toBe(1);
    expect(decideOptimizationLoop([iteration([
      { caseId: 'b1', cohort: 'target', beforePassed: false, afterPassed: false, comparable: false },
    ])]).reason).toBe('复测结果不可比');
  });
});

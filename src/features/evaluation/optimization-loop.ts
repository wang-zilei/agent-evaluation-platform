export type OptimizationIssueKind =
  | 'agent_config'
  | 'missing_tool_or_knowledge'
  | 'dataset_or_expectation'
  | 'external_dependency'
  | 'permission_or_policy'
  | 'evaluator_quality'
  | 'human_decision';

export type OptimizationIssue = {
  kind: OptimizationIssueKind;
  caseIds: string[];
  optimizerCanFix: boolean;
  evidence: string;
};

export type OptimizationLoopCaseResult = {
  caseId: string;
  cohort: 'target' | 'guard';
  beforePassed: boolean;
  afterPassed: boolean;
  beforeScore?: number;
  afterScore?: number;
  comparable: boolean;
  critical?: boolean;
};

export type OptimizationLoopIteration = {
  iteration: number;
  candidateVersion: string;
  cases: OptimizationLoopCaseResult[];
  issues: OptimizationIssue[];
  configChanged: boolean;
};

export type OptimizationLoopPolicy = {
  maxIterations: number;
  maxNoImprovementIterations: number;
  requireRegressionGuard: boolean;
};

export type OptimizationLoopMetrics = {
  iteration: number;
  candidateVersion: string;
  targetTotal: number;
  targetPassed: number;
  targetNewlyPassed: number;
  targetStillFailed: number;
  targetScoreDelta: number;
  guardRegressions: number;
  criticalFailures: number;
  incomparable: number;
  improved: boolean;
  remainingAutoFixable: OptimizationIssue[];
  remainingUnsupported: OptimizationIssue[];
};

export type OptimizationLoopStopReason =
  | '目标达成且无回归'
  | '目标达成但存在非配置问题'
  | '出现回归或关键失败'
  | '复测结果不可比'
  | '剩余问题无法由优化系统解决'
  | '连续无有效提升'
  | '达到最大优化轮次'
  | '没有可执行修改'
  | '没有有效复测结果';

export type OptimizationLoopDecision = {
  action: 'continue' | 'stop';
  reason: OptimizationLoopStopReason | '仍有可优化失败';
  message: string;
  metrics: OptimizationLoopMetrics;
  bestIteration: OptimizationLoopIteration;
};

export const DEFAULT_OPTIMIZATION_LOOP_POLICY: OptimizationLoopPolicy = {
  maxIterations: 3,
  maxNoImprovementIterations: 1,
  requireRegressionGuard: true,
};

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const intersects = (issue: OptimizationIssue, caseIds: Set<string>) => issue.caseIds.some((caseId) => caseIds.has(caseId));

export const evaluateOptimizationIteration = (iteration: OptimizationLoopIteration): OptimizationLoopMetrics => {
  const targetCases = iteration.cases.filter((item) => item.cohort === 'target');
  const comparableTargets = targetCases.filter((item) => item.comparable);
  const targetPassedCases = comparableTargets.filter((item) => item.afterPassed);
  const targetStillFailedIds = new Set(comparableTargets.filter((item) => !item.afterPassed).map((item) => item.caseId));
  const scoreDeltas = comparableTargets.filter((item) => item.beforeScore !== undefined && item.afterScore !== undefined).map((item) => (item.afterScore ?? 0) - (item.beforeScore ?? 0));
  const targetScoreDelta = average(scoreDeltas);
  const targetNewlyPassed = comparableTargets.filter((item) => !item.beforePassed && item.afterPassed).length;
  const guardRegressions = iteration.cases.filter((item) => item.cohort === 'guard' && item.comparable && item.beforePassed && !item.afterPassed).length;
  const criticalFailures = iteration.cases.filter((item) => item.critical && item.comparable && !item.afterPassed).length;
  const incomparable = iteration.cases.filter((item) => !item.comparable).length;
  const remainingAutoFixable = iteration.issues.filter((issue) => issue.optimizerCanFix && intersects(issue, targetStillFailedIds));
  const remainingUnsupported = iteration.issues.filter((issue) => !issue.optimizerCanFix && intersects(issue, targetStillFailedIds));

  return {
    iteration: iteration.iteration,
    candidateVersion: iteration.candidateVersion,
    targetTotal: targetCases.length,
    targetPassed: targetPassedCases.length,
    targetNewlyPassed,
    targetStillFailed: targetStillFailedIds.size,
    targetScoreDelta,
    guardRegressions,
    criticalFailures,
    incomparable,
    improved: targetNewlyPassed > 0 || targetScoreDelta > 0.001,
    remainingAutoFixable,
    remainingUnsupported,
  };
};

const isBetter = (left: OptimizationLoopMetrics, right: OptimizationLoopMetrics) => {
  if (left.guardRegressions !== right.guardRegressions) return left.guardRegressions < right.guardRegressions;
  if (left.criticalFailures !== right.criticalFailures) return left.criticalFailures < right.criticalFailures;
  if (left.targetPassed !== right.targetPassed) return left.targetPassed > right.targetPassed;
  return left.targetScoreDelta > right.targetScoreDelta;
};

export const selectBestOptimizationIteration = (history: OptimizationLoopIteration[]): OptimizationLoopIteration => {
  if (!history.length) throw new Error('优化循环至少需要一次复测结果');
  return history.reduce((best, item) => isBetter(evaluateOptimizationIteration(item), evaluateOptimizationIteration(best)) ? item : best, history[0]);
};

export const decideOptimizationLoop = (
  history: OptimizationLoopIteration[],
  policy: OptimizationLoopPolicy = DEFAULT_OPTIMIZATION_LOOP_POLICY,
): OptimizationLoopDecision => {
  if (!history.length) {
    throw new Error('优化循环至少需要一次复测结果');
  }

  const bestIteration = selectBestOptimizationIteration(history);
  const latest = history.at(-1) as OptimizationLoopIteration;
  const metrics = evaluateOptimizationIteration(latest);
  const stop = (reason: OptimizationLoopStopReason, message: string): OptimizationLoopDecision => ({ action: 'stop', reason, message, metrics, bestIteration });

  if (metrics.guardRegressions > 0 || metrics.criticalFailures > 0) {
    return stop('出现回归或关键失败', '停止自动优化，保留历史最佳版本并转人工审查。');
  }
  if (metrics.incomparable > 0) {
    return stop('复测结果不可比', '先修复执行、数据或评估器问题，不继续消耗优化轮次。');
  }
  const unsupportedIssues = latest.issues.filter((item) => !item.optimizerCanFix);
  if (metrics.targetStillFailed === 0) {
    return stop(
      unsupportedIssues.length ? '目标达成但存在非配置问题' : '目标达成且无回归',
      unsupportedIssues.length ? '目标 Case 已通过，但仍有超出优化系统能力的问题，转人工确认。' : '目标 Case 通过，回归检查通过，停止优化。',
    );
  }
  if (!latest.configChanged) {
    return stop('没有可执行修改', '优化系统没有生成可落地的 Agent 配置修改。');
  }
  if (!metrics.remainingAutoFixable.length) {
    return stop('剩余问题无法由优化系统解决', '剩余失败涉及数据、工具、权限、评估器或人工决策，转人工处理。');
  }

  const nonImprovingStreak = [...history].reverse().findIndex((item) => evaluateOptimizationIteration(item).improved);
  const noImprovementIterations = nonImprovingStreak === -1 ? history.length : nonImprovingStreak;
  if (noImprovementIterations >= policy.maxNoImprovementIterations) {
    return stop('连续无有效提升', '最近的优化没有带来通过数或得分提升，停止自动循环。');
  }
  if (history.length >= policy.maxIterations) {
    return stop('达到最大优化轮次', `已达到 ${policy.maxIterations} 轮上限，保留历史最佳版本。`);
  }

  return {
    action: 'continue',
    reason: '仍有可优化失败',
    message: '仍有 Agent 配置可优化的失败 Case，进入下一轮优化。',
    metrics,
    bestIteration,
  };
};

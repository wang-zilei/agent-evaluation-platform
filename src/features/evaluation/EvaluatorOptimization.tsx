import { useMemo, useState } from 'react';
import { ArrowLeft, Bot, Check, ChevronDown, CircleAlert, FileDiff, ListChecks, Save, Sparkles, Target, Wand2, X } from 'lucide-react';
import { EmptyState, IconButton, Pill, SelectField, Status } from './eval-ui';
import { nextMockId } from './auto-eval.mock';
import {
  EVALUATOR_SCORE_TOLERANCE,
  calibrationBatchPassed,
  evaluatorResultError,
  matchesCalibrationResult,
  regressionResultStable,
} from './evaluator-optimization';
import type {
  EvaluationTask,
  Evaluator,
  EvaluatorCalibration,
  EvaluatorOptimizationAction,
  EvaluatorOptimizationAttributionTag,
  EvaluatorOptimizationExperiment,
  EvaluatorOptimizationReport,
  EvaluatorOptimizationRow,
  EvaluatorOptimizationTraceStep,
  EvaluatorResult,
  ResultStatus,
} from './evaluation.types';

type Notify = (message: string, tone?: 'success' | 'warning' | 'danger') => void;
type WorkbenchTab = 'report' | 'metrics' | 'details';

const valueText = (value: string | number | undefined) => typeof value === 'number' ? value.toFixed(2) : value ?? '未采集';
const statusFor = (scoreType: Evaluator['scoreType'], result: string | number, threshold?: number): ResultStatus => {
  if (scoreType === 'numeric') return Number(result) >= (threshold ?? 0.7) ? '通过' : '不通过';
  return result === '通过' ? '通过' : '不通过';
};
const nextVersion = (version: string) => {
  const parts = version.split('.');
  if (parts.length !== 3 || Number.isNaN(Number(parts[2]))) return '0.1.1';
  return `${parts[0]}.${parts[1]}.${Number(parts[2]) + 1}`;
};

const passValue = (value: string | number | undefined, threshold?: number) => typeof value === 'number' ? value >= (threshold ?? 0.7) : value === '通过';

export function EvaluatorCalibrationModal({ task, item, evaluator, result, onCancel, onSave }: {
  task: EvaluationTask;
  item: EvaluationTask['results'][number];
  evaluator: Evaluator;
  result: EvaluatorResult;
  onCancel: () => void;
  onSave: (calibration: EvaluatorCalibration) => void;
}) {
  const [value, setValue] = useState(String(result.evaluationResult));
  const [reason, setReason] = useState(result.calibration?.reason ?? '');
  const numericValue = Number(value);
  const validResult = evaluator.scoreType === 'numeric' ? value.trim() !== '' && Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 1 : ['通过', '不通过'].includes(value);
  const canSave = validResult;
  const parsedResult = evaluator.scoreType === 'numeric' ? numericValue : value;

  return <div className="eval-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="eval-modal eval-calibration-modal" role="dialog" aria-modal="true" aria-label="人工校准">
      <header><h2>人工校准</h2><IconButton label="关闭" onClick={onCancel}><X size={17} /></IconButton></header>
      <div className="eval-modal__body">
        <dl className="eval-calibration-context">
          <div><dt>Case</dt><dd>{item.caseId}</dd></div>
          <div><dt>评估器</dt><dd>{evaluator.name} {task.evaluatorVersions?.[evaluator.id] ?? result.evaluatorVersion ?? evaluator.version}</dd></div>
          <div><dt>原评分</dt><dd>{valueText(result.calibration?.originalResult ?? result.evaluationResult)}</dd></div>
          <div><dt>原原因</dt><dd>{result.calibration?.originalReason ?? result.evaluationReason}</dd></div>
        </dl>
        <label className="eval-field"><span>评分 *</span>{evaluator.scoreType === 'numeric'
          ? <input type="number" min="0" max="1" step="0.1" value={value} onChange={(event) => setValue(event.target.value)} />
          : <SelectField value={value} onChange={(event) => setValue(event.target.value)}><option value="通过">通过</option><option value="不通过">不通过</option></SelectField>}</label>
        <label className="eval-field"><span>原因（选填）</span><textarea rows={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="补充校准原因" /><small>{reason.length}/500</small></label>
      </div>
      <footer className="eval-modal__footer"><button type="button" className="eval-button eval-button--ghost" onClick={onCancel}>取消</button><button type="button" className="eval-button eval-button--primary" disabled={!canSave} onClick={() => onSave({
        taskId: task.id,
        caseId: item.caseId,
        evaluatorId: evaluator.id,
        evaluatorVersion: task.evaluatorVersions?.[evaluator.id] ?? result.evaluatorVersion ?? evaluator.version,
        attemptId: result.attemptId ?? 'attempt-1',
        originalResult: result.calibration?.originalResult ?? result.evaluationResult,
        originalReason: result.calibration?.originalReason ?? result.evaluationReason,
        originalStatus: result.calibration?.originalStatus ?? result.evaluationStatus,
        result: parsedResult,
        reason: reason.trim(),
        status: statusFor(evaluator.scoreType, parsedResult, evaluator.passThreshold),
        updatedAt: '2026-10-08 15:10',
        updatedBy: '演示账户',
      })}>更新</button></footer>
    </section>
  </div>;
}

const candidatePrompt = (evaluator: Evaluator, calibrations: EvaluatorCalibration[]) => `${evaluator.prompt.trim()}\n\n# 判断补充\n\n根据 ${calibrations.length} 条人工校准中重复出现的结果偏差，判断内容是否满足要求时应比较语义，不要求与参考文本逐字一致；条件、动作或数值实质缺失时仍判为未覆盖。`;

const traceKindLabel: Record<EvaluatorOptimizationTraceStep['kind'], string> = {
  input: '输入',
  model: '模型',
  tool: '工具',
  skill: 'Skill',
  output: '输出',
};

const evaluatorAttributionClass = (category: EvaluatorOptimizationAttributionTag['category']) => {
  if (category === 'Prompt') return 'prompt';
  if (category === 'Agent') return 'agent';
  if (category === '工具') return 'tool';
  if (category === 'Skill') return 'skill';
  return 'model';
};

const createDynamicEvaluatorTrace = (evaluator: Evaluator, item: EvaluationTask['results'][number], result: EvaluatorResult, calibration: EvaluatorCalibration): EvaluatorOptimizationTraceStep[] => {
  const traceRefs = result.traceRefs.length ? result.traceRefs.join('、') : '未采集';
  if (evaluator.kind === 'Agent 评估器') return [
    { id: `${item.caseId}-eo-input`, kind: 'input', name: '绑定校准上下文', status: '成功', duration: '14 ms', detail: '读取 Input、Agent Output、Trace 和人工校准原因。', output: `Trace 引用：${traceRefs}` },
    { id: `${item.caseId}-eo-trace`, kind: 'tool', name: '读取评估器轨迹', status: '成功', duration: '260 ms', detail: '执行 Trace Span Retrieve，恢复评估器使用的工具与证据节点。', output: `恢复 ${result.traceRefs.length || 1} 个关键节点。` },
    { id: `${item.caseId}-eo-workflow`, kind: 'skill', name: '执行评估工作流', status: '成功', duration: '820 ms', detail: '按当前 Agent 评估器配置读取业务证据并整理判断输入。', output: '证据包生成完成。' },
    { id: `${item.caseId}-eo-model`, kind: 'model', name: '模型生成判断', status: '成功', duration: '1.3 s', detail: calibration.originalReason || result.evaluationReason, output: `原始结果：${valueText(calibration.originalResult)}` },
    { id: `${item.caseId}-eo-output`, kind: 'output', name: '输出评分与证据引用', status: '成功', duration: '9 ms', detail: '输出 score、reason 和 evidence_refs。', output: `人工校准：${valueText(calibration.result)}` },
  ];
  return [
    { id: `${item.caseId}-eo-input`, kind: 'input', name: '装载校准上下文', status: '成功', duration: '8 ms', detail: '读取 Input、Expected Output、Agent Output 和人工校准原因。', output: `评估器输入：${evaluator.variables.map((variable) => variable.semantic).join(' / ')}` },
    { id: `${item.caseId}-eo-model`, kind: 'model', name: '模型执行判断', status: '成功', duration: '1.1 s', detail: calibration.originalReason || result.evaluationReason, output: `原始结果：${valueText(calibration.originalResult)}` },
    { id: `${item.caseId}-eo-output`, kind: 'output', name: '解析结构化结果', status: '成功', duration: '10 ms', detail: '校验评分和原因后写入评测结果。', output: `人工校准：${valueText(calibration.result)}` },
  ];
};

const buildFallbackEvaluatorReport = (experiment: EvaluatorOptimizationExperiment): EvaluatorOptimizationReport => {
  const caseIds = experiment.rows.filter((row) => row.cohort === '人工校准').map((row) => row.caseId);
  const target = experiment.evaluatorKind === 'Agent 评估器' ? '执行流程' : '判断规则';
  const tagId = `fallback-${experiment.evaluatorKind === 'Agent 评估器' ? 'agent' : 'prompt'}`;
  const actions: EvaluatorOptimizationAction[] = [{
    id: `${experiment.id}-action-1`,
    priority: '优先处理',
    target,
    title: '依据人工校准修正评估器判断',
    summary: experiment.changeSummary,
    reason: experiment.issuePattern,
    caseIds,
    tagIds: [tagId],
    validation: `重新运行 ${caseIds.length} 条人工校准 Case，检查候选结果是否落在人工标注允许误差内。`,
  }];
  return {
    generatedAt: experiment.frozenAt,
    summary: [experiment.issuePattern, experiment.changeSummary, `已冻结 ${caseIds.length} 条人工校准 Case 作为验证集。`],
    attributionTags: [{ id: tagId, category: experiment.evaluatorKind === 'Agent 评估器' ? 'Agent' : 'Prompt', label: experiment.issuePattern, count: caseIds.length }],
    actions,
  };
};

export function EvaluatorOptimizationStartModal({ evaluator, baseVersion, tasks, onCancel, onCreate }: {
  evaluator: Evaluator;
  baseVersion: string;
  tasks: EvaluationTask[];
  onCancel: () => void;
  onCreate: (experiment: EvaluatorOptimizationExperiment) => void;
}) {
  const version = baseVersion;
  const snapshot = tasks.map((task) => task.evaluatorSnapshots?.[evaluator.id]).find((item) => item?.version === version);
  const baseEvaluator = snapshot ? { ...evaluator, ...snapshot } : evaluator;
  const related = useMemo(() => tasks.flatMap((task) => task.results.flatMap((item) => item.evaluatorResults
    .filter((result) => result.evaluatorId === evaluator.id && (task.evaluatorVersions?.[evaluator.id] ?? result.evaluatorVersion ?? version) === version && result.calibration)
    .map((result) => ({ task, item, result, calibration: result.calibration as EvaluatorCalibration })))), [evaluator.id, tasks, version]);
  const taskCount = new Set(related.map((entry) => entry.task.id)).size;
  const issuePattern = related.length >= 2 ? '多条校准集中在语义等价表达的判断偏差' : related.length === 1 ? '当前只有一条人工校准，先按单点问题验证' : '当前版本尚无人工校准';
  const rows: EvaluatorOptimizationRow[] = related.map(({ task, item, result, calibration }) => ({
    taskId: task.id, taskName: task.name, caseId: item.caseId, cohort: '人工校准', input: item.input, agentOutput: item.agentOutput,
    originalResult: calibration.originalResult, originalReason: calibration.originalReason, calibratedResult: calibration.result,
    calibratedReason: calibration.reason, candidateResult: undefined, candidateReason: '等待候选评估器重新运行校准 Case。', judgment: '无法执行',
    evaluatorTrace: createDynamicEvaluatorTrace(evaluator, item, result, calibration),
  }));
  const canCreate = related.length > 0;

  return <div className="eval-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="eval-modal eval-eo-start" role="dialog" aria-modal="true" aria-label="优化评估器">
      <header><h2>优化评估器</h2><IconButton label="关闭" onClick={onCancel}><X size={17} /></IconButton></header>
      <div className="eval-modal__body">
        <div className="eval-eo-start__summary"><div><span>评估器</span><strong>{evaluator.name}</strong></div><div><span>基线版本</span><strong>{version}</strong></div><div><span>人工校准</span><strong>{related.length}</strong></div><div><span>来源任务</span><strong>{taskCount}</strong></div></div>
        <div className="eval-eo-start-note"><Wand2 size={15} /><span>创建后可查看评估器优化报告、验证指标和实验明细。</span></div>
      </div>
      <footer className="eval-modal__footer"><button type="button" className="eval-button eval-button--ghost" onClick={onCancel}>取消</button><button type="button" className="eval-button eval-button--primary" disabled={!canCreate} onClick={() => onCreate({
        id: nextMockId('EVO'), name: `${evaluator.name}｜${issuePattern.includes('语义') ? '语义覆盖判断' : '校准问题验证'}`, evaluatorId: evaluator.id,
        evaluatorName: evaluator.name, evaluatorKind: evaluator.kind, baseVersion: version, candidateVersion: `${nextVersion(version)} 草稿`,
        sourceTaskIds: [...new Set(related.map((entry) => entry.task.id))], taskCount, calibrationCount: related.length, issuePattern,
        frozenAt: '2026-10-08 15:12', baseContent: baseEvaluator.prompt, candidateContent: candidatePrompt(baseEvaluator, related.map((entry) => entry.calibration)),
        changeSummary: '根据人工校准中的重复问题补充判断规则，不改变评估目标、输入字段、评分范围和通过阈值。',
        contract: { target: baseEvaluator.purpose, inputSemantics: baseEvaluator.variables.map((item) => item.semantic), scoreType: baseEvaluator.scoreType, passThreshold: baseEvaluator.passThreshold },
        rows, summary: { corrected: related.length, unchanged: 0, affected: 0, blocked: 0 }, status: '待分析', createdAt: '2026-10-08 15:12',
      })}><Wand2 size={15} />开始优化</button></footer>
    </section>
  </div>;
}

const evaluatorCohortLabel = (cohort: EvaluatorOptimizationRow['cohort']) => cohort === '人工校准' ? '验证集' : '回归集';
const matchesExpectedResult = (row: EvaluatorOptimizationRow, key: 'originalResult' | 'candidateResult', threshold?: number) => row.cohort === '人工校准'
  ? matchesCalibrationResult(row[key], row.calibratedResult)
  : regressionResultStable(row[key], row.originalResult, threshold);
const evaluatorOutcome = (row: EvaluatorOptimizationRow, threshold?: number) => row.cohort === '人工校准'
  ? matchesExpectedResult(row, 'candidateResult', threshold) ? '命中' : '未命中'
  : matchesExpectedResult(row, 'candidateResult', threshold) ? '回归稳定' : '新增影响';

function EvaluatorResultValue({ value }: { value: string | number | undefined }) {
  const tone = (value: string | number | undefined) => passValue(value, 0.7) ? 'green' : value === undefined ? 'neutral' : 'amber';
  return <Pill tone={tone(value)}>{valueText(value)}</Pill>;
}

function EvaluatorMetricSummary({ rows, threshold }: { rows: EvaluatorOptimizationRow[]; threshold?: number }) {
  const validation = rows.filter((row) => row.cohort === '人工校准');
  const regression = rows.filter((row) => row.cohort === '影响检查');
  const summarize = (items: EvaluatorOptimizationRow[]) => {
    const beforeMatched = items.filter((row) => matchesExpectedResult(row, 'originalResult', threshold)).length;
    const afterMatched = items.filter((row) => matchesExpectedResult(row, 'candidateResult', threshold)).length;
    return { total: items.length, beforeMatched, afterMatched, afterRate: items.length ? Math.round((afterMatched / items.length) * 100) : 0 };
  };
  const validationSummary = summarize(validation);
  const regressionSummary = summarize(regression);
  const errors = validation.map((row) => evaluatorResultError(row.candidateResult, row.calibratedResult)).filter((value): value is number => value !== undefined);
  const averageError = errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : undefined;
  const regressions = regression.filter((row) => !matchesExpectedResult(row, 'candidateResult', threshold)).length;
  return <div className="eval-optimization-summary eval-evaluator-metric-summary">
    <div><span>校准命中率</span><strong>{validationSummary.afterRate}%</strong><em>{validationSummary.afterMatched}/{validationSummary.total} 命中</em></div>
    <div><span>平均误差</span><strong>{averageError === undefined ? '不适用' : averageError.toFixed(2)}</strong><em>允许误差 {EVALUATOR_SCORE_TOLERANCE.toFixed(1)}</em></div>
    <div><span>回归一致率</span><strong>{regressionSummary.afterRate}%</strong><em>{regressionSummary.beforeMatched}/{regressionSummary.total} → {regressionSummary.afterMatched}/{regressionSummary.total}</em></div>
    <div><span>新增影响</span><strong className={regressions ? 'is-danger' : ''}>{regressions}</strong><em>候选结果发生变化</em></div>
  </div>;
}

function EvaluatorMetricBreakdown({ rows, evaluatorName, threshold }: { rows: EvaluatorOptimizationRow[]; evaluatorName: string; threshold?: number }) {
  const averageDifference = (items: EvaluatorOptimizationRow[], key: 'originalResult' | 'candidateResult') => {
    const values = items.map((row) => evaluatorResultError(row[key], row.cohort === '人工校准' ? row.calibratedResult : row.originalResult)).filter((value): value is number => value !== undefined);
    return values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2) : '不适用';
  };
  const consistency = (items: EvaluatorOptimizationRow[], key: 'originalResult' | 'candidateResult') => `${items.filter((row) => matchesExpectedResult(row, key, threshold)).length}/${items.length} ${items[0]?.cohort === '人工校准' ? '命中' : '一致'}`;
  const validation = rows.filter((row) => row.cohort === '人工校准');
  const regression = rows.filter((row) => row.cohort === '影响检查');
  return <div className="eval-optimization-breakdown table-surface"><table className="eval-data-table">
    <thead><tr><th>指标</th><th>验证集 · 优化前</th><th>验证集 · 优化后</th><th>回归集 · 优化前</th><th>回归集 · 优化后</th></tr></thead>
    <tbody>
      <tr><td><div className="eval-cell-title"><strong>结果一致率</strong><small>{evaluatorName}</small></div></td><td>{consistency(validation, 'originalResult')}</td><td className="is-improved">{consistency(validation, 'candidateResult')}</td><td>{consistency(regression, 'originalResult')}</td><td className={regression.some((row) => !matchesExpectedResult(row, 'candidateResult', threshold)) ? 'is-regression' : ''}>{consistency(regression, 'candidateResult')}</td></tr>
      <tr><td><div className="eval-cell-title"><strong>平均误差</strong><small>数值型评估器</small></div></td><td>{averageDifference(validation, 'originalResult')}</td><td className="is-improved">{averageDifference(validation, 'candidateResult')}</td><td>{averageDifference(regression, 'originalResult')}</td><td>{averageDifference(regression, 'candidateResult')}</td></tr>
    </tbody>
  </table></div>;
}

function EvaluatorOptimizationEvidence({ experiment, action }: { experiment: EvaluatorOptimizationExperiment; action: EvaluatorOptimizationAction }) {
  const rows: EvaluatorOptimizationRow[] = [];
  const seen = new Set<string>();
  action.caseIds.forEach((caseId) => {
    const calibration = experiment.rows.find((row) => row.caseId === caseId && row.cohort === '人工校准');
    const fallback = experiment.rows.find((row) => row.caseId === caseId);
    const row = calibration ?? fallback;
    if (!row) return;
    const key = `${row.taskId}-${row.caseId}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  });

  if (!rows.length) return <EmptyState title="暂无关联校准明细" description="当前优化动作没有可回查的校准 Case。" />;
  return <div className="eval-report-evidence eval-eo-trace-evidence">
    <div className="eval-report-evidence__head"><strong>校准 Case 与评估器轨迹</strong><span>{rows.length} 条</span></div>
    <div className="eval-eo-trace-list">{rows.map((row) => <article className="eval-eo-trace-case" key={`${row.taskId}-${row.caseId}`}>
      <header>
        <div><strong>{row.caseId}</strong><small>{row.taskName}</small></div>
        <div className="eval-eo-trace-results">
          <span>原始 <b>{valueText(row.originalResult)}</b></span>
          <span>人工 <b>{valueText(row.calibratedResult)}</b></span>
          <span>候选 <b>{row.candidateResult === undefined ? '待验证' : valueText(row.candidateResult)}</b></span>
        </div>
      </header>
      <div className="eval-eo-trace-context">
        <div><span>人工校准原因</span><p>{row.calibratedReason || '未填写校准原因。'}</p></div>
        <div><span>Agent Output</span><p>{row.agentOutput || '未采集'}</p></div>
      </div>
      <div className="eval-eo-trace-flow">{(row.evaluatorTrace ?? []).map((step, index) => <div className={`eval-eo-trace-step is-${step.kind}`} key={step.id}>
        <div className="eval-eo-trace-step__rail"><span>{String(index + 1).padStart(2, '0')}</span><i /></div>
        <div className="eval-eo-trace-step__body">
          <div><span>{traceKindLabel[step.kind]}</span><strong>{step.name}</strong><small>{step.status}{step.duration ? ` · ${step.duration}` : ''}</small></div>
          <p>{step.detail}</p>
          {step.output && <code>{step.output}</code>}
        </div>
      </div>)}{!row.evaluatorTrace?.length && <div className="eval-eo-trace-empty"><CircleAlert size={14} />该 Case 尚未采集评估器轨迹。</div>}</div>
    </article>)}</div>
  </div>;
}

function EvaluatorOptimizationReportView({ experiment }: { experiment: EvaluatorOptimizationExperiment }) {
  const [showScope, setShowScope] = useState(false);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const report = experiment.report ?? buildFallbackEvaluatorReport(experiment);
  const calibrationRows = experiment.rows.filter((row) => row.cohort === '人工校准');
  const regressionRows = experiment.rows.filter((row) => row.cohort === '影响检查');
  const candidateReady = calibrationRows.length > 0 && calibrationRows.every((row) => row.candidateResult !== undefined);
  const matched = calibrationRows.filter((row) => matchesExpectedResult(row, 'candidateResult', experiment.contract.passThreshold)).length;
  const errors = calibrationRows.map((row) => evaluatorResultError(row.candidateResult, row.calibratedResult)).filter((value): value is number => value !== undefined);
  const averageError = errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : undefined;
  const stableRegression = regressionRows.filter((row) => matchesExpectedResult(row, 'candidateResult', experiment.contract.passThreshold)).length;
  const tagById = new Map<string, EvaluatorOptimizationAttributionTag>(report.attributionTags.map((tag) => [tag.id, tag]));
  const layerTotals = report.attributionTags.reduce<Record<string, number>>((totals, tag) => ({ ...totals, [tag.category]: (totals[tag.category] ?? 0) + tag.count }), {});
  const dominantLayer = Object.entries(layerTotals).sort((left, right) => right[1] - left[1])[0]?.[0];
  const evaluatorKindLabel = experiment.evaluatorKind === 'Agent 评估器' ? 'Agent 评估器' : '模型评估器';

  return <div className="eval-optimization-report eval-eo-report">
    <section className="eval-report-overview">
      <header>
        <div>
          <div className="eval-report-kicker"><Sparkles size={14} /><span>评估器优化报告</span><Pill tone="violet">AI 生成</Pill></div>
          <h3>报告摘要</h3>
          <p>{evaluatorKindLabel} · {experiment.baseVersion} → {experiment.savedVersion ?? experiment.candidateVersion} · 基于 {calibrationRows.length} 条人工校准生成</p>
        </div>
        <button type="button" className="eval-report-scope-toggle" aria-expanded={showScope} onClick={() => setShowScope((current) => !current)}><ListChecks size={14} />查看校准 Case（{calibrationRows.length}）<ChevronDown size={14} /></button>
      </header>
      <ul className="eval-report-summary-list">{report.summary.map((item) => <li key={item}>{item}</li>)}</ul>
      <div className="eval-report-metrics">
        <div><span>校准样本</span><strong>{calibrationRows.length}</strong><small>来自 {experiment.taskCount} 个评测任务</small></div>
        <div><span>候选命中</span><strong>{candidateReady ? `${matched}/${calibrationRows.length}` : '待验证'}</strong><small>误差范围 ±{EVALUATOR_SCORE_TOLERANCE.toFixed(2)}</small></div>
        <div><span>平均误差</span><strong>{candidateReady ? (experiment.contract.scoreType === 'numeric' ? averageError?.toFixed(2) ?? '不适用' : '不适用') : '待验证'}</strong><small>{candidateReady ? `回归稳定 ${stableRegression}/${regressionRows.length}` : '运行候选版本后计算'}</small></div>
      </div>
      {showScope && <div className="eval-report-scope">{calibrationRows.map((row) => <div key={`${row.taskId}-${row.caseId}`}>
        <strong>{row.caseId}</strong><span>{row.input}</span><small>{valueText(row.originalResult)} → 人工 {valueText(row.calibratedResult)}</small>
      </div>)}</div>}
    </section>
    <p className="eval-report-frozen-note">报告冻结人工校准结果、评估器版本与校准 Case；评估器执行轨迹只在本报告展示，不写入观测列表。</p>

    <section className="eval-report-section">
      <div className="eval-report-section__head">
        <div><h3>校准结果</h3><p>候选评估器重新运行人工校准 Case 后，与人工结果按允许误差进行比较。</p></div>
        <span>{candidateReady ? '已完成重跑' : '等待验证'}</span>
      </div>
      <div className="eval-eo-report-result-wrap">
        <table className="eval-eo-report-result-table">
          <thead><tr><th>Case</th><th>原始结果</th><th>人工校准</th><th>校准原因</th><th>候选结果</th><th>验证结论</th></tr></thead>
          <tbody>{calibrationRows.map((row) => {
            const rowMatched = matchesExpectedResult(row, 'candidateResult', experiment.contract.passThreshold);
            const error = evaluatorResultError(row.candidateResult, row.calibratedResult);
            return <tr key={`${row.taskId}-${row.caseId}`}>
              <td><strong>{row.caseId}</strong><small>{row.taskName}</small></td>
              <td><span className="eval-eo-result-value">{valueText(row.originalResult)}</span><small>{row.originalReason}</small></td>
              <td><span className="eval-eo-result-value is-calibrated">{valueText(row.calibratedResult)}</span></td>
              <td><p>{row.calibratedReason || '未填写校准原因。'}</p></td>
              <td>{row.candidateResult === undefined ? <Pill>待验证</Pill> : <><span className="eval-eo-result-value is-candidate">{valueText(row.candidateResult)}</span>{error !== undefined && <small>误差 {error.toFixed(2)}</small>}</>}</td>
              <td><Pill tone={candidateReady ? rowMatched ? 'green' : 'amber' : 'neutral'}>{candidateReady ? rowMatched ? '命中' : '未命中' : '待验证'}</Pill></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>

    <section className="eval-report-section">
      <div className="eval-report-section__head">
        <div><h3>误差归因</h3><p>共命中 {report.attributionTags.reduce((sum, tag) => sum + tag.count, 0)} 次，覆盖 {report.attributionTags.length} 类标签{dominantLayer ? `，主要集中在 ${dominantLayer}` : ''}。</p></div>
        <span><Target size={14} />误判定位</span>
      </div>
      <div className="eval-report-attribution-grid">{report.attributionTags.map((tag) => <div className={`eval-report-attribution-row is-${evaluatorAttributionClass(tag.category)}`} key={tag.id}>
        <i /><span><b>{tag.category}</b> / {tag.label}</span><strong>{tag.count}</strong>
      </div>)}</div>
    </section>

    <section className="eval-report-section">
      <div className="eval-report-section__head">
        <div><h3>优化动作</h3><p>{report.actions.length} 条动作，用于生成 {experiment.savedVersion ?? experiment.candidateVersion} 候选评估器，按优先级排列。</p></div>
        <span><Wand2 size={14} />可执行建议</span>
      </div>
      <div className="eval-report-action-list">{report.actions.map((action) => {
        const tags = action.tagIds.map((tagId) => tagById.get(tagId)).filter((tag): tag is EvaluatorOptimizationAttributionTag => Boolean(tag));
        const actionExpanded = expandedAction === action.id;
        return <article className="eval-report-action" key={action.id}>
          <header>
            <div><span className={`eval-report-priority is-${action.priority === '优先处理' ? 'primary' : 'secondary'}`}>{action.priority}</span><span className="eval-report-target">{action.target}</span><strong>{action.title}</strong></div>
            <span>关联 {action.caseIds.length} 条校准 Case</span>
          </header>
          <p className="eval-report-action-summary">{action.summary}</p>
          <div className="eval-report-action-reason"><span>误差原因</span><p>{action.reason}</p></div>
          {tags.length > 0 && <div className="eval-report-action-tags">{tags.map((tag) => <span className={`is-${evaluatorAttributionClass(tag.category)}`} key={tag.id}>{tag.category} / {tag.label}</span>)}</div>}
          <div className="eval-report-validation"><Target size={14} /><div><span>验证方式</span><p>{action.validation}</p></div></div>
          <button type="button" className="eval-report-evidence-toggle" aria-expanded={actionExpanded} onClick={() => setExpandedAction((current) => current === action.id ? null : action.id)}><Bot size={14} />查看校准 Case 与评估器轨迹（{action.caseIds.length}）<ChevronDown size={14} /></button>
          {actionExpanded && <EvaluatorOptimizationEvidence experiment={experiment} action={action} />}
        </article>;
      })}</div>
    </section>
  </div>;
}

function EvaluatorOptimizationDetailTable({ rows, threshold, onConfirmImpact }: { rows: EvaluatorOptimizationRow[]; threshold?: number; onConfirmImpact: (taskId: string, caseId: string) => void }) {
  return <div className="eval-optimization-detail-panel eval-evaluator-detail-panel">
    <div className="eval-task-section-heading"><div><h3>实验明细</h3><p>展示同一批 Case 在评估器规则优化前后的结果。</p></div><span>{rows.length} 条 Case</span></div>
    <div className="eval-optimization-detail-table-wrap"><table className="eval-optimization-detail-table eval-evaluator-detail-table">
      <thead><tr><th className="is-sticky">Case / 集合</th><th>Input</th><th>Agent Output</th><th>优化前</th><th>优化后</th><th>结果</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={`${row.taskId}-${row.caseId}-${row.cohort}`}>
        <td className="is-sticky"><div className="eval-case-stack"><strong>{row.caseId}</strong><Pill tone={row.cohort === '人工校准' ? 'amber' : 'green'}>{evaluatorCohortLabel(row.cohort)}</Pill></div></td>
        <td><p>{row.input || '未采集'}</p></td>
        <td><p>{row.agentOutput || '未采集'}</p></td>
        <td><EvaluatorResultValue value={row.originalResult} /></td>
        <td><EvaluatorResultValue value={row.candidateResult} /></td>
        <td><div className="eval-evaluator-outcome"><Pill tone={evaluatorOutcome(row, threshold).includes('影响') || evaluatorOutcome(row, threshold).includes('未') ? 'amber' : 'green'}>{evaluatorOutcome(row, threshold)}</Pill>{row.cohort === '影响检查' && !matchesExpectedResult(row, 'candidateResult', threshold) && <button type="button" className="eval-text-button" disabled={row.confirmed} onClick={() => onConfirmImpact(row.taskId, row.caseId)}>{row.confirmed ? '已确认' : '确认影响'}</button>}</div></td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}

export function EvaluatorOptimizationWorkbench({ experiment, onExperiments, onVersionCreated, onBack, onNotify }: {
  experiment: EvaluatorOptimizationExperiment;
  onExperiments: (updater: (current: EvaluatorOptimizationExperiment[]) => EvaluatorOptimizationExperiment[]) => void;
  onVersionCreated: (evaluatorId: string, version: string, prompt: string) => void;
  onBack: () => void;
  onNotify: Notify;
}) {
  const [tab, setTab] = useState<WorkbenchTab>('report');
  const [running, setRunning] = useState(false);
  const current = experiment;
  const threshold = current.contract.passThreshold;
  const update = (next: EvaluatorOptimizationExperiment) => onExperiments((items) => items.map((item) => item.id === next.id ? next : item));
  const run = () => {
    setRunning(true);
    window.setTimeout(() => {
      const impactRows = current.rows.some((row) => row.cohort === '影响检查') ? current.rows : [
        ...current.rows,
        { taskId: current.sourceTaskIds[0] ?? 'TASK', taskName: '同版本关联任务', caseId: 'CASE-CHECK-001', cohort: '影响检查' as const, input: '订单号缺失，帮我查询退款进度。', agentOutput: '请先补充订单号。', originalResult: 0.86, originalReason: '满足主要要求。', candidateResult: 0.86, candidateReason: '候选规则没有改变判断。', judgment: '结果一致' as const },
      ];
      const rerunRows = impactRows.map((row) => {
        const offset = (Number(row.caseId.replace(/\D/g, '')) % 3) * 0.01;
        const generatedResult = row.cohort === '人工校准'
          ? typeof row.calibratedResult === 'number' ? Math.max(0, Math.min(1, Number((row.calibratedResult + offset).toFixed(2)))) : row.calibratedResult
          : row.originalResult;
        return { ...row, candidateResult: row.candidateResult ?? generatedResult, candidateReason: row.candidateResult === undefined ? '候选评估器重跑后返回的新判断。' : row.candidateReason };
      });
      const nextRows = rerunRows.map((row) => ({ ...row, judgment: row.cohort === '人工校准'
        ? matchesExpectedResult(row, 'candidateResult', threshold) ? '符合人工校准' as const : '无法执行' as const
        : matchesExpectedResult(row, 'candidateResult', threshold) ? '结果一致' as const : '新增影响' as const }));
      const next = { ...current, rows: nextRows, summary: { corrected: nextRows.filter((row) => row.judgment === '符合人工校准').length, unchanged: nextRows.filter((row) => row.judgment === '结果一致').length, affected: nextRows.filter((row) => row.judgment === '新增影响').length, blocked: 0 }, status: '待确认' as const };
      update(next); setRunning(false); setTab('report'); onNotify('验证完成，候选结果已写入优化报告');
    }, 500);
  };
  const save = () => {
    const validationRows = current.rows.filter((row) => row.cohort === '人工校准');
    const matched = validationRows.filter((row) => matchesExpectedResult(row, 'candidateResult', threshold)).length;
    if (!calibrationBatchPassed(matched, validationRows.length)) { onNotify('校准命中率未达到成功标准', 'warning'); setTab('metrics'); return; }
    const unconfirmedImpact = current.rows.filter((row) => row.cohort === '影响检查' && !matchesExpectedResult(row, 'candidateResult', threshold) && !row.confirmed).length;
    if (unconfirmedImpact > 0) { onNotify('存在未确认的新增影响', 'warning'); setTab('details'); return; }
    const version = nextVersion(current.baseVersion);
    update({ ...current, status: '已生成版本', candidateVersion: version, savedVersion: version });
    onVersionCreated(current.evaluatorId, version, current.candidateContent);
    onNotify(`已生成评估器版本 ${version}`);
  };
  const confirmImpact = (taskId: string, caseId: string) => update({ ...current, rows: current.rows.map((row) => row.taskId === taskId && row.caseId === caseId ? { ...row, confirmed: true } : row) });
  return <div className="eval-detail-page eval-eo-workbench">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回优化记录</button><Status label={current.status} /></div>
    <header className="eval-detail-hero eval-eo-hero"><div><h2>{current.name}</h2></div><div className="eval-eo-hero__actions">{current.status === '待分析' && <button type="button" className="eval-button eval-button--primary" disabled={running} onClick={run}><Wand2 size={15} />{running ? '验证中' : '运行验证'}</button>}{current.status === '待确认' && <button type="button" className="eval-button eval-button--primary" onClick={save}><Save size={15} />生成新版本</button>}</div></header>
    <nav className="eval-optimization-tabs" aria-label="优化详情内容"><button type="button" className={tab === 'report' ? 'is-active' : ''} onClick={() => setTab('report')}>优化报告</button><button type="button" className={tab === 'metrics' ? 'is-active' : ''} onClick={() => setTab('metrics')}>指标统计</button><button type="button" className={tab === 'details' ? 'is-active' : ''} onClick={() => setTab('details')}>实验明细</button></nav>
    {tab === 'report' && <EvaluatorOptimizationReportView experiment={current} />}
    {tab === 'metrics' && <div className="eval-optimization-stack"><section className="eval-optimization-panel"><div className="eval-task-section-heading"><div><h3>指标统计</h3><p>{current.rows.filter((row) => row.cohort === '人工校准').length < 5 ? '当前校准样本少于 5 条，需全部命中。' : '校准命中率达到 80% 视为成功。'}</p></div></div><EvaluatorMetricSummary rows={current.rows} threshold={threshold} /><EvaluatorMetricBreakdown rows={current.rows} evaluatorName={current.evaluatorName} threshold={threshold} /></section></div>}
    {tab === 'details' && <EvaluatorOptimizationDetailTable rows={current.rows} threshold={threshold} onConfirmImpact={confirmImpact} />}
    {current.status === '已生成版本' && <div className="eval-eo-notebar is-done"><Check size={14} /><span>已生成 {current.savedVersion}。原评测任务仍使用 {current.baseVersion}。</span></div>}
  </div>;
}

export function EvaluatorOptimizationList({ experiments, onOpen }: { experiments: EvaluatorOptimizationExperiment[]; onOpen: (experiment: EvaluatorOptimizationExperiment) => void }) {
  if (!experiments.length) return <EmptyState title="暂无优化记录" description="从评测任务的评估器列头发起优化。" />;
  return <div className="eval-table-wrap"><table className="eval-data-table eval-eo-record-table"><thead><tr><th>优化记录</th><th>基线版本</th><th>候选版本</th><th>验证集</th><th>回归集</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{experiments.map((item) => <tr key={item.id} onClick={() => onOpen(item)}><td><div className="eval-cell-title"><strong>{item.name}</strong><small>{item.id}</small></div></td><td>{item.baseVersion}</td><td>{item.savedVersion ?? item.candidateVersion}</td><td>{item.rows.filter((row) => row.cohort === '人工校准').length} 条</td><td>{item.rows.filter((row) => row.cohort === '影响检查').length} 条</td><td><Status label={item.status} /></td><td>{item.createdAt}</td><td><button type="button" className="eval-text-button" onClick={(event) => { event.stopPropagation(); onOpen(item); }}><FileDiff size={13} />查看</button></td></tr>)}</tbody></table></div>;
}

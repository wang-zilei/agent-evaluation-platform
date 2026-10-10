import { useMemo, useState } from 'react';
import { ArrowLeft, Check, FileDiff, Save, Wand2, X } from 'lucide-react';
import { EmptyState, IconButton, Pill, Status } from './eval-ui';
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
  EvaluatorOptimizationExperiment,
  EvaluatorOptimizationRow,
  EvaluatorResult,
  ResultStatus,
} from './evaluation.types';

type Notify = (message: string, tone?: 'success' | 'warning' | 'danger') => void;
type WorkbenchTab = 'config' | 'metrics' | 'details';

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
          : <select value={value} onChange={(event) => setValue(event.target.value)}><option value="通过">通过</option><option value="不通过">不通过</option></select>}</label>
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
  const rows: EvaluatorOptimizationRow[] = related.map(({ task, item, calibration }) => ({
    taskId: task.id, taskName: task.name, caseId: item.caseId, cohort: '人工校准', input: item.input, agentOutput: item.agentOutput,
    originalResult: calibration.originalResult, originalReason: calibration.originalReason, calibratedResult: calibration.result,
    calibratedReason: calibration.reason, candidateResult: calibration.result, candidateReason: '候选规则按人工校准结果重新判断。', judgment: '符合人工校准',
  }));
  const canCreate = related.length > 0;

  return <div className="eval-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="eval-modal eval-eo-start" role="dialog" aria-modal="true" aria-label="优化评估器">
      <header><h2>优化评估器</h2><IconButton label="关闭" onClick={onCancel}><X size={17} /></IconButton></header>
      <div className="eval-modal__body">
        <div className="eval-eo-start__summary"><div><span>评估器</span><strong>{evaluator.name}</strong></div><div><span>基线版本</span><strong>{version}</strong></div><div><span>人工校准</span><strong>{related.length}</strong></div><div><span>来源任务</span><strong>{taskCount}</strong></div></div>
        <div className="eval-eo-start-note"><Wand2 size={15} /><span>创建后可查看评估器规则优化前后对比、指标统计和实验明细。</span></div>
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

function EvaluatorConfigCompare({ experiment }: { experiment: EvaluatorOptimizationExperiment }) {
  return <div className="eval-config-compare eval-evaluator-config-compare">
    <div className="eval-config-compare__legend"><span><i className="is-before" />优化前</span><span><i className="is-after" />优化后</span></div>
    <section className="eval-config-compare__row">
      <div className="eval-config-compare__label"><strong>评估器规则</strong><Pill tone="violet">修改</Pill></div>
      <div className="eval-config-compare__side"><span>优化前 · {experiment.baseVersion}</span><pre>{experiment.baseContent || '未采集'}</pre></div>
      <div className="eval-config-compare__side is-after"><span>优化后 · {experiment.savedVersion ?? experiment.candidateVersion}</span><pre>{experiment.candidateContent || '未采集'}</pre></div>
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
  const [tab, setTab] = useState<WorkbenchTab>('config');
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
      const nextRows = impactRows.map((row) => ({ ...row, judgment: row.cohort === '人工校准'
        ? matchesExpectedResult(row, 'candidateResult', threshold) ? '符合人工校准' as const : '无法执行' as const
        : matchesExpectedResult(row, 'candidateResult', threshold) ? '结果一致' as const : '新增影响' as const }));
      const next = { ...current, rows: nextRows, summary: { corrected: nextRows.filter((row) => row.judgment === '符合人工校准').length, unchanged: nextRows.filter((row) => row.judgment === '结果一致').length, affected: nextRows.filter((row) => row.judgment === '新增影响').length, blocked: 0 }, status: '待确认' as const };
      update(next); setRunning(false); setTab('metrics'); onNotify('验证完成');
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
    <header className="eval-detail-hero eval-eo-hero"><div><h2>{current.name}</h2><p>{current.evaluatorName} · {current.baseVersion} → {current.savedVersion ?? current.candidateVersion} · 验证集 {current.rows.filter((row) => row.cohort === '人工校准').length} 条 · 回归集 {current.rows.filter((row) => row.cohort === '影响检查').length} 条</p></div><div className="eval-eo-hero__actions">{current.status === '待分析' && <button type="button" className="eval-button eval-button--primary" disabled={running} onClick={run}><Wand2 size={15} />{running ? '验证中' : '运行验证'}</button>}{current.status === '待确认' && <button type="button" className="eval-button eval-button--primary" onClick={save}><Save size={15} />生成新版本</button>}</div></header>
    <dl className="eval-eo-experiment-meta"><div><dt>实验 ID</dt><dd>{current.id}</dd></div><div><dt>基线版本</dt><dd>{current.baseVersion}</dd></div><div><dt>候选版本</dt><dd>{current.savedVersion ?? current.candidateVersion}</dd></div><div><dt>来源任务</dt><dd>{current.taskCount}</dd></div></dl>
    <div className="eval-optimization-flow"><span>单次优化</span><strong>验证集 + 回归集</strong><span>候选规则不覆盖原评估器</span></div>
    <nav className="eval-optimization-tabs" aria-label="优化详情内容"><button type="button" className={tab === 'config' ? 'is-active' : ''} onClick={() => setTab('config')}>配置对比</button><button type="button" className={tab === 'metrics' ? 'is-active' : ''} onClick={() => setTab('metrics')}>指标统计</button><button type="button" className={tab === 'details' ? 'is-active' : ''} onClick={() => setTab('details')}>实验明细</button></nav>
    {tab === 'config' && <div className="eval-optimization-stack"><section className="eval-optimization-panel"><div className="eval-task-section-heading"><div><h3>评估器规则</h3><p>左侧为优化前，右侧为优化后。</p></div></div><EvaluatorConfigCompare experiment={current} /></section></div>}
    {tab === 'metrics' && <div className="eval-optimization-stack"><section className="eval-optimization-panel"><div className="eval-task-section-heading"><div><h3>指标统计</h3><p>{current.rows.filter((row) => row.cohort === '人工校准').length < 5 ? '当前校准样本少于 5 条，需全部命中。' : '校准命中率达到 80% 视为成功。'}</p></div></div><EvaluatorMetricSummary rows={current.rows} threshold={threshold} /><EvaluatorMetricBreakdown rows={current.rows} evaluatorName={current.evaluatorName} threshold={threshold} /></section></div>}
    {tab === 'details' && <EvaluatorOptimizationDetailTable rows={current.rows} threshold={threshold} onConfirmImpact={confirmImpact} />}
    {current.status === '已生成版本' && <div className="eval-eo-notebar is-done"><Check size={14} /><span>已生成 {current.savedVersion}。原评测任务仍使用 {current.baseVersion}。</span></div>}
  </div>;
}

export function EvaluatorOptimizationList({ experiments, onOpen }: { experiments: EvaluatorOptimizationExperiment[]; onOpen: (experiment: EvaluatorOptimizationExperiment) => void }) {
  if (!experiments.length) return <EmptyState title="暂无优化记录" description="从评测任务的评估器列头发起优化。" />;
  return <div className="eval-table-wrap"><table className="eval-data-table eval-eo-record-table"><thead><tr><th>优化记录</th><th>基线版本</th><th>候选版本</th><th>验证集</th><th>回归集</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{experiments.map((item) => <tr key={item.id} onClick={() => onOpen(item)}><td><div className="eval-cell-title"><strong>{item.name}</strong><small>{item.id}</small></div></td><td>{item.baseVersion}</td><td>{item.savedVersion ?? item.candidateVersion}</td><td>{item.rows.filter((row) => row.cohort === '人工校准').length} 条</td><td>{item.rows.filter((row) => row.cohort === '影响检查').length} 条</td><td><Status label={item.status} /></td><td>{item.createdAt}</td><td><button type="button" className="eval-text-button" onClick={(event) => { event.stopPropagation(); onOpen(item); }}><FileDiff size={13} />查看</button></td></tr>)}</tbody></table></div>;
}

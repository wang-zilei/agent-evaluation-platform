import { Fragment, useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, ChevronDown, FileDiff, Save, Wand2, X } from 'lucide-react';
import { EmptyState, IconButton, Pill, Status } from './eval-ui';
import { nextMockId } from './auto-eval.mock';
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
type WorkbenchTab = 'plan' | 'metrics' | 'details';

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

const scoreValue = (value: string | number | undefined) => value === '通过' ? 1 : value === '不通过' ? 0 : typeof value === 'number' ? value : undefined;
const passValue = (value: string | number | undefined, threshold?: number) => typeof value === 'number' ? value >= (threshold ?? 0.7) : value === '通过';
const percent = (passed: number, total: number) => total ? `${Math.round((passed / total) * 100)}%` : '未采集';

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
  const canSave = validResult && reason.trim().length > 0;
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
          ? <input type="number" min="0" max="1" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} />
          : <select value={value} onChange={(event) => setValue(event.target.value)}><option value="通过">通过</option><option value="不通过">不通过</option></select>}</label>
        <label className="eval-field"><span>原因 *</span><textarea rows={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明为什么需要调整，以及正确的判断应是什么" /><small>{reason.length}/500</small></label>
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

const candidatePrompt = (evaluator: Evaluator, calibrations: EvaluatorCalibration[]) => `${evaluator.prompt.trim()}\n\n# 判断补充\n\n根据 ${calibrations.length} 条人工校准中重复出现的问题，判断内容是否满足要求时应比较语义，不要求与参考文本逐字一致；条件、动作或数值实质缺失时仍判为未覆盖。`;

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
    calibratedReason: calibration.reason, candidateResult: calibration.result, candidateReason: '候选规则按人工校准原因重新判断。', judgment: '符合人工校准',
  }));
  const canCreate = related.length > 0;

  return <div className="eval-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="eval-modal eval-eo-start" role="dialog" aria-modal="true" aria-label="优化评估器">
      <header><h2>优化评估器</h2><IconButton label="关闭" onClick={onCancel}><X size={17} /></IconButton></header>
      <div className="eval-modal__body">
        <div className="eval-eo-start__summary"><div><span>评估器</span><strong>{evaluator.name}</strong></div><div><span>基线版本</span><strong>{version}</strong></div><div><span>人工校准</span><strong>{related.length}</strong></div><div><span>来源任务</span><strong>{taskCount}</strong></div></div>
        <section className="eval-eo-diagnosis"><h3>问题判断</h3><p>{issuePattern}</p></section>
        {related.length ? <div className="eval-table-wrap"><table className="eval-data-table"><thead><tr><th>来源任务</th><th>Case</th><th>原评分</th><th>校准评分</th><th>校准原因</th></tr></thead><tbody>{related.map(({ task, item, calibration }) => <tr key={`${task.id}-${item.caseId}`}><td>{task.name}</td><td className="eval-mono">{item.caseId}</td><td>{valueText(calibration.originalResult)}</td><td>{valueText(calibration.result)}</td><td className="is-clamp">{calibration.reason}</td></tr>)}</tbody></table></div> : <EmptyState title="没有人工校准" description="先在评测任务的数据明细中校准该评估器结果。" />}
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

function PromptDiff({ base, candidate }: { base: string; candidate: string }) {
  const baseLines = new Set(base.split('\n'));
  const added = candidate.split('\n').filter((line) => line.trim() && !baseLines.has(line));
  return <div className="eval-eo-diff">{added.map((line, index) => <div className="is-added" key={`${line}-${index}`}><span>+</span><code>{line}</code></div>)}</div>;
}

export function EvaluatorOptimizationWorkbench({ experiment, onExperiments, onVersionCreated, onBack, onNotify }: {
  experiment: EvaluatorOptimizationExperiment;
  onExperiments: (updater: (current: EvaluatorOptimizationExperiment[]) => EvaluatorOptimizationExperiment[]) => void;
  onVersionCreated: (evaluatorId: string, version: string, prompt: string) => void;
  onBack: () => void;
  onNotify: Notify;
}) {
  const [tab, setTab] = useState<WorkbenchTab>('plan');
  const [running, setRunning] = useState(false);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const current = experiment;
  const update = (next: EvaluatorOptimizationExperiment) => onExperiments((items) => items.map((item) => item.id === next.id ? next : item));
  const calibrationRows = current.rows.filter((row) => row.cohort === '人工校准');
  const impactRows = current.rows.filter((row) => row.cohort === '影响检查');
  const threshold = current.contract.passThreshold;
  const cohortSummary = (rows: EvaluatorOptimizationRow[]) => {
    const originalScores = rows.map((row) => scoreValue(row.originalResult)).filter((value): value is number => value !== undefined);
    const candidateScores = rows.map((row) => scoreValue(row.candidateResult)).filter((value): value is number => value !== undefined);
    const originalPassed = rows.filter((row) => passValue(row.originalResult, threshold)).length;
    const candidatePassed = rows.filter((row) => passValue(row.candidateResult, threshold)).length;
    return {
      count: rows.length,
      original: percent(originalPassed, rows.length),
      candidate: percent(candidatePassed, rows.length),
      originalScore: originalScores.length ? (originalScores.reduce((sum, value) => sum + value, 0) / originalScores.length).toFixed(2) : '未采集',
      candidateScore: candidateScores.length ? (candidateScores.reduce((sum, value) => sum + value, 0) / candidateScores.length).toFixed(2) : '未采集',
    };
  };
  const calibrationSummary = cohortSummary(calibrationRows);
  const impactSummary = cohortSummary(impactRows);
  const unconfirmedImpact = impactRows.filter((row) => row.judgment === '新增影响' && !row.confirmed).length;
  const toggleRow = (rowKey: string) => setExpandedRows((currentRows) => currentRows.includes(rowKey) ? currentRows.filter((item) => item !== rowKey) : [...currentRows, rowKey]);
  const run = () => {
    setRunning(true);
    window.setTimeout(() => {
      const impactRows = current.rows.some((row) => row.cohort === '影响检查') ? current.rows : [
        ...current.rows,
        { taskId: current.sourceTaskIds[0] ?? 'TASK', taskName: '同版本关联任务', caseId: 'CASE-CHECK-001', cohort: '影响检查' as const, input: '订单号缺失，帮我查询退款进度。', agentOutput: '请先补充订单号。', originalResult: 0.86, originalReason: '满足主要要求。', candidateResult: 0.86, candidateReason: '候选规则没有改变判断。', judgment: '结果一致' as const },
      ];
      const next = { ...current, rows: impactRows, summary: { corrected: current.calibrationCount, unchanged: impactRows.filter((row) => row.judgment === '结果一致').length, affected: impactRows.filter((row) => row.judgment === '新增影响').length, blocked: 0 }, status: '待确认' as const };
      update(next); setRunning(false); setTab('metrics'); onNotify('验证完成');
    }, 500);
  };
  const save = () => {
    const unconfirmed = current.rows.filter((row) => row.judgment === '新增影响' && !row.confirmed).length;
    if (unconfirmed > 0) { onNotify('存在未确认的新增影响。', 'warning'); setTab('details'); return; }
    const version = nextVersion(current.baseVersion);
    update({ ...current, status: '已生成版本', candidateVersion: version, savedVersion: version });
    onVersionCreated(current.evaluatorId, version, current.candidateContent);
    onNotify(`已生成评估器版本 ${version}`);
  };
  const confirmImpact = (taskId: string, caseId: string) => update({ ...current, rows: current.rows.map((row) => row.taskId === taskId && row.caseId === caseId ? { ...row, confirmed: true } : row) });

  return <div className="eval-detail-page eval-eo-workbench">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回优化记录</button><Status label={current.status} /></div>
    <header className="eval-eo-hero"><h2>{current.name}</h2><div className="eval-eo-hero__actions">{current.status === '待分析' && <button type="button" className="eval-button eval-button--primary" disabled={running} onClick={run}><Wand2 size={15} />{running ? '验证中' : '运行验证'}</button>}{current.status === '待确认' && <button type="button" className="eval-button eval-button--primary" onClick={save}><Save size={15} />生成新版本</button>}</div></header>
    <dl className="eval-eo-experiment-meta"><div><dt>实验 ID</dt><dd>{current.id}</dd></div><div><dt>基线版本</dt><dd>{current.baseVersion}</dd></div><div><dt>候选版本</dt><dd>{current.savedVersion ?? current.candidateVersion}</dd></div><div><dt>来源任务</dt><dd>{current.taskCount}</dd></div></dl>
    <nav className="eval-task-detail-tabs"><button type="button" className={tab === 'plan' ? 'is-active' : ''} onClick={() => setTab('plan')}>优化方案</button><button type="button" className={tab === 'metrics' ? 'is-active' : ''} onClick={() => setTab('metrics')}>验证统计</button><button type="button" className={tab === 'details' ? 'is-active' : ''} onClick={() => setTab('details')}>实验明细</button></nav>
    {tab === 'plan' && <>
      <section className="eval-eo-diagnosis eval-eo-diagnosis--hero"><div><span className="eval-eo-kicker">为什么进入优化</span><h3>{current.issuePattern}</h3><p>同一评估器版本在不同任务中出现同方向误判。系统只根据已保存的人工校准生成候选规则，不修改评估目标和评分契约。</p></div><div className="eval-eo-diagnosis__numbers"><strong>{current.calibrationCount}<small>条校准</small></strong><strong>{current.taskCount}<small>个来源任务</small></strong></div></section>
      <section className="eval-eo-evidence"><div className="eval-task-section-heading"><div><h3>人工校准依据</h3><p>候选规则必须能解释每一条校准，并在影响检查样本上保持原有判断。</p></div><span>{calibrationRows.length} 条纠错样本</span></div><div className="eval-eo-evidence-list">{calibrationRows.map((row) => <article key={`${row.taskId}-${row.caseId}`} className="eval-eo-evidence-card"><header><div><Pill tone="violet">人工校准</Pill><strong>{row.caseId}</strong></div><span>{valueText(row.originalResult)} <b>→</b> {valueText(row.calibratedResult)}</span></header><dl><div><dt>Input</dt><dd>{row.input}</dd></div><div><dt>Agent Output</dt><dd>{row.agentOutput}</dd></div></dl><div className="eval-eo-reason-pair"><div><span>原判断</span><p>{row.originalReason}</p></div><div><span>人工校准</span><p>{row.calibratedReason}</p></div></div></article>)}</div></section>
      <section className="eval-eo-contract"><div className="eval-eo-section-title"><div><h3>功能契约</h3><p>优化只补充判断规则，以下字段保持不变。</p></div><Pill>不可变</Pill></div><dl><div><dt>评估目标</dt><dd>{current.contract.target}</dd></div><div><dt>输入字段</dt><dd>{current.contract.inputSemantics.join('、')}</dd></div><div><dt>评分类型</dt><dd>{current.contract.scoreType === 'numeric' ? '0-1 数值' : '通过 / 不通过'}</dd></div><div><dt>通过阈值</dt><dd>{current.contract.passThreshold ?? '不适用'}</dd></div></dl></section>
      <section className="eval-eo-plan"><div className="eval-eo-section-title"><div><h3>候选判断规则</h3><p>{current.changeSummary}</p></div><Pill tone="green">系统生成</Pill></div><PromptDiff base={current.baseContent} candidate={current.candidateContent} /></section>
    </>}
    {tab === 'metrics' && <>
      <div className="eval-stat-strip eval-eo-metrics"><div><span>人工校准</span><strong>{current.calibrationCount}</strong><small>候选规则的输入</small></div><div><span>符合人工校准</span><strong>{current.summary.corrected}</strong><small>纠错样本全部复测</small></div><div><span>结果一致</span><strong>{current.summary.unchanged}</strong><small>影响检查未改变</small></div><div className={current.summary.affected ? 'is-warning' : ''}><span>新增影响</span><strong>{current.summary.affected}</strong><small>{unconfirmedImpact ? '确认后才能生成版本' : '已完成逐条确认'}</small></div></div>
      <section className="eval-eo-cohort-panel"><div className="eval-task-section-heading"><div><h3>验证集分组统计</h3><p>纠错样本验证候选规则是否修正误判；影响检查样本验证是否引入新变化。</p></div><span>阈值 {threshold ?? '不适用'}</span></div><div className="eval-eo-cohort-grid"><article><header><Pill tone="violet">纠错样本</Pill><strong>{calibrationSummary.count} 条</strong></header><dl><div><dt>原版本通过率</dt><dd>{calibrationSummary.original}</dd></div><div><dt>候选版本通过率</dt><dd>{calibrationSummary.candidate}</dd></div><div><dt>平均分</dt><dd>{calibrationSummary.originalScore} <b>→</b> {calibrationSummary.candidateScore}</dd></div></dl><footer><CheckCircle2 size={14} />{current.summary.corrected} 条符合人工校准</footer></article><article><header><Pill>影响检查</Pill><strong>{impactSummary.count} 条</strong></header><dl><div><dt>原版本通过率</dt><dd>{impactSummary.original}</dd></div><div><dt>候选版本通过率</dt><dd>{impactSummary.candidate}</dd></div><div><dt>平均分</dt><dd>{impactSummary.originalScore} <b>→</b> {impactSummary.candidateScore}</dd></div></dl><footer className={current.summary.affected ? 'is-warning' : ''}>{current.summary.affected ? <><Wand2 size={14} />{current.summary.affected} 条新增影响，待确认</> : <><CheckCircle2 size={14} />未改变原有判断</>}</footer></article></div></section>
    </>}
    {tab === 'details' && <section className="eval-eo-details"><div className="eval-task-section-heading"><div><h3>实验明细</h3><p>展开 Case 查看输入、回答和评估器理由。新增影响需要逐条确认，确认前不能生成版本。</p></div><span>{current.rows.length} 条复测样本</span></div><div className="eval-table-wrap"><table className="eval-data-table eval-eo-table"><thead><tr><th>来源任务</th><th>Case</th><th>样本类型</th><th>原结果</th><th>人工校准</th><th>候选结果</th><th>判断</th><th>确认</th></tr></thead><tbody>{current.rows.map((row) => { const rowKey = `${row.taskId}-${row.caseId}-${row.cohort}`; const expanded = expandedRows.includes(rowKey); return <Fragment key={rowKey}><tr className={expanded ? 'is-expanded' : ''} onClick={() => toggleRow(rowKey)}><td><div className="eval-cell-title"><strong>{row.taskName}</strong><small>{row.taskId}</small></div></td><td className="eval-mono"><span className="eval-eo-case-toggle"><ChevronDown size={13} className={expanded ? 'is-open' : ''} />{row.caseId}</span></td><td><Pill tone={row.cohort === '人工校准' ? 'violet' : 'neutral'}>{row.cohort}</Pill></td><td title={row.originalReason}>{valueText(row.originalResult)}</td><td title={row.calibratedReason}>{valueText(row.calibratedResult)}</td><td title={row.candidateReason}>{valueText(row.candidateResult)}</td><td><Status label={row.judgment} /></td><td>{row.judgment === '新增影响' ? <button type="button" className="eval-text-button" disabled={row.confirmed} onClick={(event) => { event.stopPropagation(); confirmImpact(row.taskId, row.caseId); }}>{row.confirmed ? '已确认' : '确认合理'}</button> : '无需确认'}</td></tr>{expanded && <tr className="eval-eo-row-detail"><td colSpan={8}><div className="eval-eo-row-detail__grid"><div><span>Input</span><p>{row.input}</p></div><div><span>Agent Output</span><p>{row.agentOutput}</p></div><div><span>原判断理由</span><p>{row.originalReason}</p></div><div><span>{row.cohort === '人工校准' ? '人工校准理由' : '候选判断理由'}</span><p>{row.cohort === '人工校准' ? row.calibratedReason : row.candidateReason}</p></div></div></td></tr>}</Fragment>; })}</tbody></table></div></section>}
    {current.status === '已生成版本' && <div className="eval-eo-notebar is-done"><Check size={14} /><span>已生成 {current.savedVersion}。原评测任务仍使用 {current.baseVersion}。</span></div>}
  </div>;
}

export function EvaluatorOptimizationList({ experiments, onOpen }: { experiments: EvaluatorOptimizationExperiment[]; onOpen: (experiment: EvaluatorOptimizationExperiment) => void }) {
  if (!experiments.length) return <EmptyState title="暂无优化记录" description="从评测任务的评估器列头发起优化。" />;
  return <div className="eval-table-wrap"><table className="eval-data-table eval-eo-record-table"><thead><tr><th>优化实验</th><th>基线版本</th><th>问题模式</th><th>人工校准</th><th>来源任务</th><th>验证结果</th><th>候选版本</th><th>状态</th><th>操作</th></tr></thead><tbody>{experiments.map((item) => <tr key={item.id} onClick={() => onOpen(item)}><td><div className="eval-cell-title"><strong>{item.name}</strong><small>{item.id}</small></div></td><td>{item.baseVersion}</td><td>{item.issuePattern}</td><td>{item.calibrationCount}</td><td>{item.taskCount}</td><td>{item.summary.corrected} 修正 / {item.summary.affected} 影响</td><td>{item.savedVersion ?? item.candidateVersion}</td><td><Status label={item.status} /></td><td><button type="button" className="eval-text-button" onClick={(event) => { event.stopPropagation(); onOpen(item); }}><FileDiff size={13} />查看</button></td></tr>)}</tbody></table></div>;
}

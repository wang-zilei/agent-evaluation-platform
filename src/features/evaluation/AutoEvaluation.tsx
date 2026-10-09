import { useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronRight, Eye, Pause, Play, Plus, Search, Trash2, Zap } from 'lucide-react';
import { IconButton, Status } from './eval-ui';
import type {
  AgentOption,
  AutomationFilter,
  AutomationFilterField,
  AutomationFilterMode,
  AutomationFilterOperator,
  AutomationObjectType,
  EvaluationTask,
  Evaluator,
} from './evaluation.types';
import './automation.css';

type AutomationStep = 1 | 2 | 3 | 4;

type AutomationDraft = {
  agentId: string;
  agentVersion: string;
  objectType: AutomationObjectType;
  collectStartAt: string;
  collectEndAt: string;
  sessionIdleMinutes: number;
  filterMode: AutomationFilterMode;
  filters: AutomationFilter[];
  sampleRatio: number;
  totalDataLimit: number;
  repeat: '一次性' | '每天';
  evaluatorIds: string[];
  name: string;
  description: string;
};

const TEXT_FIELDS: AutomationFilterField[] = ['Input', 'Output', 'Trace'];
const NUMBER_FIELDS: AutomationFilterField[] = ['耗时', 'Input Tokens', 'Output Tokens'];
const TEXT_OPERATORS: AutomationFilterOperator[] = ['包含', '不包含', '属于', '不属于', '为空', '不为空'];
const NUMBER_OPERATORS: AutomationFilterOperator[] = ['等于', '大于', '小于', '为空', '不为空'];
const OPERATOR_LABELS: Record<AutomationFilterOperator, string> = {
  包含: '包含（关键词）',
  不包含: '不包含（关键词）',
  属于: '属于（精确匹配）',
  不属于: '不属于（精确匹配）',
  等于: '等于',
  大于: '大于',
  小于: '小于',
  为空: '为空',
  不为空: '不为空',
};
const FIELD_LABELS: Record<AutomationFilterField, string> = {
  Input: 'Input',
  Output: 'Output',
  Trace: 'Trace',
  耗时: '耗时（ms）',
  'Input Tokens': 'Input Tokens（Tokens）',
  'Output Tokens': 'Output Tokens（Tokens）',
};

const needsValue = (operator: AutomationFilterOperator) => !['为空', '不为空'].includes(operator);
const operatorsFor = (field: AutomationFilterField) => TEXT_FIELDS.includes(field) ? TEXT_OPERATORS : NUMBER_OPERATORS;
const unitFor = (field: AutomationFilterField) => field === '耗时' ? 'ms' : field.includes('Tokens') ? 'Tokens' : '';
const placeholderFor = (filter: AutomationFilter) => {
  if (!needsValue(filter.operator)) return '';
  if (['属于', '不属于'].includes(filter.operator)) return '输入完整值，多个值用逗号分隔';
  if (['包含', '不包含'].includes(filter.operator)) return '输入关键词';
  return '输入数值';
};

const makeFilter = (index: number): AutomationFilter => ({
  id: `filter-${index}`,
  field: 'Input',
  operator: '包含',
  value: '',
});

const makeDraft = (agents: AgentOption[]): AutomationDraft => {
  const agent = agents[0];
  return {
    agentId: agent?.id ?? '',
    agentVersion: agent?.versions[0] ?? '',
    objectType: '对话',
    collectStartAt: '2026-10-08T09:00',
    collectEndAt: '2026-10-15T09:00',
    sessionIdleMinutes: 30,
    filterMode: '全部满足',
    filters: [makeFilter(1)],
    sampleRatio: 100,
    totalDataLimit: 5000,
    repeat: '每天',
    evaluatorIds: [],
    name: '',
    description: '',
  };
};

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: T[]; onChange: (value: T) => void; label: string }) {
  return <div className="eval-auto-segmented" role="group" aria-label={label}>{options.map((option) => <button type="button" key={option} className={value === option ? 'is-active' : ''} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>)}</div>;
}

function AutomationCreate({ agents, evaluators, taskCount, onBack, onCreate }: {
  agents: AgentOption[];
  evaluators: Evaluator[];
  taskCount: number;
  onBack: () => void;
  onCreate: (task: EvaluationTask) => void;
}) {
  const [step, setStep] = useState<AutomationStep>(1);
  const [draft, setDraft] = useState<AutomationDraft>(() => makeDraft(agents));
  const agent = agents.find((item) => item.id === draft.agentId);
  const automationSemantics = ['Input', 'Agent Output', 'Trace'];
  const availableEvaluators = evaluators.filter((item) => item.variables.every((variable) => !variable.required || automationSemantics.includes(variable.semantic)));
  const filterReady = draft.filters.every((filter) => !needsValue(filter.operator) || filter.value.trim());
  const stepReady = step === 1
    ? Boolean(draft.agentId && draft.agentVersion)
    : step === 2
      ? Boolean(draft.collectStartAt && draft.collectEndAt && draft.collectEndAt > draft.collectStartAt && draft.filters.length && filterReady && draft.sampleRatio >= 1 && draft.sampleRatio <= 100 && draft.totalDataLimit > 0 && (draft.objectType === 'Trace' || draft.sessionIdleMinutes > 0))
      : step === 3
        ? draft.evaluatorIds.length > 0
        : Boolean(draft.name.trim());
  const steps: Array<{ id: AutomationStep; label: string }> = [
    { id: 1, label: '评测对象' },
    { id: 2, label: '采集规则' },
    { id: 3, label: '评估器' },
    { id: 4, label: '确认任务' },
  ];
  const canOpenStep = (target: AutomationStep) => target <= step || (target === step + 1 && stepReady);
  const patchFilter = (id: string, patch: Partial<AutomationFilter>) => setDraft((current) => ({ ...current, filters: current.filters.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const toggleEvaluator = (id: string) => setDraft((current) => ({ ...current, evaluatorIds: current.evaluatorIds.includes(id) ? current.evaluatorIds.filter((item) => item !== id) : [...current.evaluatorIds, id] }));

  const create = () => {
    if (!stepReady || !agent) return;
    const stamp = '2026-10-08 14:30';
    const selectedEvaluators = evaluators.filter((evaluator) => draft.evaluatorIds.includes(evaluator.id));
    onCreate({
      id: `TASK-AUTO-20261008-${String(taskCount + 1).padStart(3, '0')}`,
      name: draft.name.trim(),
      description: draft.description.trim(),
      taskType: '自动化',
      automation: {
        objectType: draft.objectType,
        collectStartAt: draft.collectStartAt.replace('T', ' '),
        collectEndAt: draft.collectEndAt.replace('T', ' '),
        sessionIdleMinutes: draft.sessionIdleMinutes,
        filterMode: draft.filterMode,
        filters: draft.filters,
        sampleRatio: draft.sampleRatio,
        totalDataLimit: draft.totalDataLimit,
        repeat: draft.repeat,
        candidateCount: 0,
        sampledCount: 0,
        evaluatedCount: 0,
      },
      agentType: agent.source,
      agent: agent.name,
      agentVersion: draft.agentVersion,
      datasetId: '',
      datasetVersion: '动态采集',
      evaluatorIds: draft.evaluatorIds,
      evaluatorVersions: Object.fromEntries(selectedEvaluators.map((evaluator) => [evaluator.id, evaluator.version])),
      evaluatorSnapshots: Object.fromEntries(selectedEvaluators.map((evaluator) => [evaluator.id, {
        evaluatorId: evaluator.id,
        name: evaluator.name,
        version: evaluator.version,
        purpose: evaluator.purpose,
        prompt: evaluator.prompt,
        variables: structuredClone(evaluator.variables),
        scoreType: evaluator.scoreType,
        passThreshold: evaluator.passThreshold,
      }])),
      status: '运行中',
      tone: 'info',
      createdBy: '演示账户',
      createdAt: stamp,
      updatedAt: stamp,
      totalCases: 0,
      executableCases: 0,
      completedCases: 0,
      failedCases: 0,
      results: [],
      runtime: { concurrency: 2, timeout: 60, continueOnError: true },
    });
  };

  return <div className="eval-task-create-page eval-task-wizard eval-auto-wizard">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回自动化</button></div>
    <nav className="eval-task-stepper" aria-label="新建自动化步骤">{steps.map((item) => <button type="button" key={item.id} className={`${step === item.id ? 'is-active' : ''}${step > item.id ? ' is-complete' : ''}`} disabled={!canOpenStep(item.id)} onClick={() => setStep(item.id)}><span>{step > item.id ? <Check size={15} /> : item.id}</span><strong>{item.label}</strong></button>)}</nav>

    <section className="eval-task-step-panel">
      {step === 1 && <div className="eval-task-step-content eval-auto-object-step">
        <div className="eval-task-form-row">
          <label className="eval-field"><span>Agent <b>*</b></span><select value={draft.agentId} onChange={(event) => { const next = agents.find((item) => item.id === event.target.value); setDraft((current) => ({ ...current, agentId: event.target.value, agentVersion: next?.versions[0] ?? '' })); }}>{agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="eval-field"><span>版本 <b>*</b></span><select value={draft.agentVersion} onChange={(event) => setDraft((current) => ({ ...current, agentVersion: event.target.value }))}>{(agent?.versions ?? []).map((version) => <option key={version}>{version}</option>)}</select></label>
        </div>
        <div className="eval-auto-control"><span>评测对象 <b>*</b></span><Segmented value={draft.objectType} options={['对话', 'Trace']} label="评测对象" onChange={(objectType) => setDraft((current) => ({ ...current, objectType }))} /></div>
      </div>}

      {step === 2 && <div className="eval-task-step-content eval-auto-rules-step">
        <section className="eval-auto-section"><h3>采集范围</h3><div className="eval-auto-grid eval-auto-grid--range">
          <label className="eval-field"><span>开始时间 <b>*</b></span><input type="datetime-local" value={draft.collectStartAt} onChange={(event) => setDraft((current) => ({ ...current, collectStartAt: event.target.value }))} /></label>
          <label className="eval-field"><span>结束时间 <b>*</b></span><input type="datetime-local" value={draft.collectEndAt} onChange={(event) => setDraft((current) => ({ ...current, collectEndAt: event.target.value }))} /></label>
          {draft.objectType === '对话' && <label className="eval-field"><span>会话闲置时间（分钟）</span><input type="number" min={1} value={draft.sessionIdleMinutes} onChange={(event) => setDraft((current) => ({ ...current, sessionIdleMinutes: Number(event.target.value) || 1 }))} /></label>}
        </div></section>

        <section className="eval-auto-section"><div className="eval-auto-section-head"><h3>筛选条件</h3><Segmented value={draft.filterMode} options={['全部满足', '任一满足']} label="筛选逻辑" onChange={(filterMode) => setDraft((current) => ({ ...current, filterMode }))} /></div>
          <div className="eval-auto-filter-list">{draft.filters.map((filter) => <div className="eval-auto-filter-row" key={filter.id}>
            <select aria-label="筛选字段" value={filter.field} onChange={(event) => { const field = event.target.value as AutomationFilterField; patchFilter(filter.id, { field, operator: operatorsFor(field)[0], value: '' }); }}>{[...TEXT_FIELDS, ...NUMBER_FIELDS].map((field) => <option key={field} value={field}>{FIELD_LABELS[field]}</option>)}</select>
            <select aria-label="运算符" value={filter.operator} title={['属于', '不属于'].includes(filter.operator) ? '按字段完整值精确匹配，多个目标值用逗号分隔' : ['包含', '不包含'].includes(filter.operator) ? '按关键词进行子串匹配' : undefined} onChange={(event) => patchFilter(filter.id, { operator: event.target.value as AutomationFilterOperator, value: '' })}>{operatorsFor(filter.field).map((operator) => <option key={operator} value={operator}>{OPERATOR_LABELS[operator]}</option>)}</select>
            <div className="eval-auto-filter-value"><input aria-label="目标值" type={NUMBER_FIELDS.includes(filter.field) ? 'number' : 'text'} min={NUMBER_FIELDS.includes(filter.field) ? 0 : undefined} value={filter.value} disabled={!needsValue(filter.operator)} placeholder={placeholderFor(filter)} onChange={(event) => patchFilter(filter.id, { value: event.target.value })} />{needsValue(filter.operator) && unitFor(filter.field) && <span>{unitFor(filter.field)}</span>}</div>
            <IconButton label="删除条件" disabled={draft.filters.length === 1} onClick={() => setDraft((current) => ({ ...current, filters: current.filters.filter((item) => item.id !== filter.id) }))}><Trash2 size={15} /></IconButton>
          </div>)}</div>
          <button type="button" className="eval-text-button eval-auto-add-filter" onClick={() => setDraft((current) => ({ ...current, filters: [...current.filters, makeFilter(current.filters.length + 1)] }))}><Plus size={14} />添加筛选条件</button>
        </section>

        <section className="eval-auto-section"><h3>采样</h3><div className="eval-auto-sampling">
          <label className="eval-field eval-auto-ratio"><span>评测比例 <b>*</b></span><div className="eval-auto-range-row"><span>1%</span><input type="range" min={1} max={100} value={draft.sampleRatio} aria-label="评测比例" onChange={(event) => setDraft((current) => ({ ...current, sampleRatio: Number(event.target.value) }))} /><output>{draft.sampleRatio}%</output></div></label>
          <div className="eval-auto-grid eval-auto-grid--sampling"><label className="eval-field"><span>总数据上限 <b>*</b></span><input type="number" min={1} value={draft.totalDataLimit} onChange={(event) => setDraft((current) => ({ ...current, totalDataLimit: Number(event.target.value) || 1 }))} /></label>
          <label className="eval-field"><span>重复周期</span><select value={draft.repeat} onChange={(event) => setDraft((current) => ({ ...current, repeat: event.target.value as AutomationDraft['repeat'] }))}><option>一次性</option><option>每天</option></select></label></div>
        </div></section>
      </div>}

      {step === 3 && <div className="eval-task-step-content eval-auto-evaluator-step"><div className="eval-auto-evaluator-table"><table className="eval-data-table"><thead><tr><th>选择</th><th>评估器</th><th>结果类型</th><th>输入字段</th></tr></thead><tbody>{availableEvaluators.map((evaluator) => <tr key={evaluator.id} onClick={() => toggleEvaluator(evaluator.id)}><td><input type="checkbox" checked={draft.evaluatorIds.includes(evaluator.id)} onChange={() => toggleEvaluator(evaluator.id)} onClick={(event) => event.stopPropagation()} /></td><td><div className="eval-cell-title"><strong>{evaluator.name}</strong><small>{evaluator.version}</small></div></td><td>{evaluator.scoreType === 'numeric' ? '0-1 数值' : '通过 / 不通过'}</td><td>{evaluator.variables.filter((variable) => automationSemantics.includes(variable.semantic)).map((variable) => variable.semantic === 'Agent Output' ? 'Output' : variable.semantic).filter((value, index, values) => values.indexOf(value) === index).join('、')}</td></tr>)}</tbody></table></div></div>}

      {step === 4 && <div className="eval-task-confirm-grid">
        <div className="eval-task-confirm-form"><label className="eval-field"><span>任务名称 <b>*</b></span><input maxLength={50} value={draft.name} placeholder="输入自动化任务名称" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label className="eval-field"><span>任务描述</span><textarea rows={3} maxLength={200} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label></div>
        <aside className="eval-task-confirm-summary"><h3>任务配置</h3><dl className="eval-auto-summary"><div><dt>Agent</dt><dd>{agent?.name} {draft.agentVersion}</dd></div><div><dt>评测对象</dt><dd>{draft.objectType}</dd></div><div><dt>筛选条件</dt><dd>{draft.filters.length} 条，{draft.filterMode}</dd></div><div><dt>采样</dt><dd>{draft.sampleRatio}% / 任务最多 {draft.totalDataLimit} 条</dd></div><div><dt>重复周期</dt><dd>{draft.repeat}</dd></div><div><dt>评估器</dt><dd>{draft.evaluatorIds.length} 个</dd></div></dl></aside>
      </div>}
    </section>

    <footer className="eval-task-wizard-footer"><button type="button" className="eval-button eval-button--ghost" onClick={onBack}>取消</button><div>{step > 1 && <button type="button" className="eval-button eval-button--ghost" onClick={() => setStep((step - 1) as AutomationStep)}>上一步</button>}{step < 4 ? <button type="button" className="eval-button eval-button--primary" disabled={!stepReady} onClick={() => setStep((step + 1) as AutomationStep)}>下一步：{steps[step].label}<ChevronRight size={14} /></button> : <button type="button" className="eval-button eval-button--primary" disabled={!stepReady} onClick={create}><Zap size={15} />启动自动化</button>}</div></footer>
  </div>;
}

export function AutoEvaluationPanel({ tasks, agents, evaluators, onCreate, onUpdate, onOpen, onNotify }: {
  tasks: EvaluationTask[];
  agents: AgentOption[];
  evaluators: Evaluator[];
  onCreate: (task: EvaluationTask) => void;
  onUpdate: (task: EvaluationTask) => void;
  onOpen: (task: EvaluationTask) => void;
  onNotify: (message: string) => void;
}) {
  const [screen, setScreen] = useState<'list' | 'create'>('list');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('全部状态');
  const [tooltip, setTooltip] = useState<{ top: number; left: number; text: string } | null>(null);
  const automationTasks = tasks.filter((task) => task.taskType === '自动化');
  const filtered = automationTasks.filter((task) => {
    const matchesSearch = !search || `${task.name} ${task.id} ${task.description}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (status === '全部状态' || task.status === status);
  });
  const showTooltip = (event: MouseEvent<HTMLButtonElement>, text: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({ top: rect.top - 8, left: rect.right, text });
  };
  const toggleTask = (task: EvaluationTask) => {
    const pausing = task.status === '运行中';
    setTooltip(null);
    onUpdate({ ...task, status: pausing ? '已暂停' : '运行中', tone: pausing ? 'warning' : 'info', updatedAt: '2026-10-09 10:00' });
    onNotify(pausing ? '自动化任务已暂停' : '自动化任务已继续');
  };
  if (screen === 'create') return <AutomationCreate agents={agents} evaluators={evaluators} taskCount={automationTasks.length} onBack={() => setScreen('list')} onCreate={(task) => { onCreate(task); setScreen('list'); onNotify('自动化任务已创建'); }} />;

  return <div className="eval-list-page eval-automation-page">
    <div className="eval-toolbar"><label className="eval-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务名称或 ID" /></label><select aria-label="状态" value={status} onChange={(event) => setStatus(event.target.value)}><option>全部状态</option><option>待启动</option><option>运行中</option><option>已暂停</option><option>已完成</option><option>失败</option></select><button type="button" className="eval-button eval-button--primary" onClick={() => setScreen('create')}><Plus size={16} />新建自动化</button></div>
    <section className="eval-surface table-surface"><table className="eval-data-table eval-automation-table"><thead><tr><th>ID</th><th>名称</th><th>任务类型</th><th>任务进度</th><th>状态</th><th>描述</th><th>创建时间</th><th>数据区间</th><th>操作</th></tr></thead><tbody>{filtered.map((task) => {
      const controllable = task.status === '运行中' || task.status === '已暂停';
      const pausing = task.status === '运行中';
      const controlText = pausing ? '暂停后停止采集新数据和启动新的评测，已完成结果保留。' : '继续后从当前时间恢复采集，暂停期间的数据不补采、不回溯。';
      return <tr key={task.id} onClick={() => onOpen(task)}><td className="eval-mono">{task.id}</td><td><strong>{task.name}</strong></td><td>自动化</td><td>{task.automation?.evaluatedCount ?? 0} / {task.automation?.sampledCount ?? 0}</td><td><Status label={task.status} /></td><td className="is-clip" title={task.description}>{task.description || '未填写'}</td><td>{task.createdAt}</td><td>{task.automation?.collectStartAt}<br />至 {task.automation?.collectEndAt}</td><td><div className="eval-auto-actions">{controllable && <button type="button" className="eval-icon-button" aria-label={pausing ? '暂停任务' : '继续任务'} title={controlText} onMouseEnter={(event) => showTooltip(event, controlText)} onMouseLeave={() => setTooltip(null)} onClick={(event) => { event.stopPropagation(); toggleTask(task); }}>{pausing ? <Pause size={15} /> : <Play size={15} />}</button>}<IconButton label="查看任务" onClick={() => onOpen(task)}><Eye size={15} /></IconButton></div></td></tr>;
    })}</tbody></table>{filtered.length === 0 && <div className="eval-auto-empty">暂无自动化任务</div>}</section>
    {tooltip && createPortal(<div className="eval-auto-action-tooltip" style={{ top: tooltip.top, left: tooltip.left }}>{tooltip.text}</div>, document.body)}
  </div>;
}

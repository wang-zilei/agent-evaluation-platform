import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type Dispatch, type MouseEvent, type ReactNode, type SetStateAction } from 'react';
import * as XLSX from 'xlsx';
import {
  Activity, ArrowLeft, BarChart3, Bot, Braces, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  CircleAlert, CircleCheck, ClipboardCheck, Copy, Database, Download, Eye, FileSpreadsheet, GitCompare, History,
  Layers3, ListChecks, Maximize2, Minus, MoreHorizontal, Plus, RefreshCw, Search, Settings2, Sparkles, Table2, Trash2, Upload,
  X, Zap,
} from 'lucide-react';
import { cloneEvaluationState, createComparisonRecord, getDatasetById, historyConversations, statusTone } from './evaluation.mock';
import { observedTraces } from './trace.data';
import { TraceDetail, TraceList } from './TraceWorkspace';
import type {
  AgentOption, CaseResult, Dataset, DatasetCase, EvaluationModule, EvaluationState,
  EvaluationTask, Evaluator, EvaluatorMode, FieldDefinition, FieldSemantic, HistoryConversation,
  ComparisonRecord, EvaluatorKind, OptimizeExperiment, OptimizationFollowUpMode, OptimizationResult, ScoreType, TaskTab,
  ComparisonCaseRow, ComparisonEvaluatorRow, ComparisonMetricCell, ComparisonRuntimeRow, ComparisonTaskRef, EvaluatorResult,
  HumanAnnotation, HumanLabelDefinition, TaskAgentTarget,
} from './evaluation.types';
import './evaluation.css';

type Toast = { id: number; message: string; tone: 'success' | 'warning' | 'danger' };
type DatasetScreen = 'list' | 'workspace' | 'upload' | 'generate' | 'history';
type EvaluatorScreen = 'list' | 'detail' | 'create';
type TaskScreen = 'list' | 'create' | 'detail' | 'experiment' | 'comparison';
type DatasetCreateMode = '用户上传' | '智能生成' | '历史对话回流';
type HistoryDatePreset = '3' | '5' | '7' | '30' | 'custom';
type TaskCreateStep = 1 | 2 | 3 | 4;
type TraceScreen = 'list' | 'detail';
type MetricAggregation = '均值' | '最大' | '最小';
type TaskMetricRow = { name: string; display: string; passRate?: string; valid: string; range: string; threshold?: string };

type ParsedFile = { name: string; format: string; columns: string[]; rows: Record<string, string>[] };
type UploadField = { id: string; sourceColumn: string; name: string; semantic: FieldSemantic };
type DatasetDraft = {
  mode: DatasetCreateMode; name: string; description: string; file: ParsedFile | null;
  fields: UploadField[]; parsing: boolean; error: string;
  generateAgentId: string; generateVersion: string; generatePrompt: string; generateCount: number;
  historyAgentId: string; historyVersion: string; historyPreset: HistoryDatePreset; historyStart: string; historyEnd: string;
  historyFeedback: '全部' | '有反馈' | '无反馈'; historySelected: Record<string, string[]>; historyExpanded: string | null; historyPage: number;
  appendToDatasetId?: string; importMode?: '追加数据' | '全量覆盖';
};
type EvaluatorDraft = { name: string; description: string; model: string; scoreType: ScoreType; passThreshold: number; prompt: string; variables: Evaluator['variables'] };
type TaskDraft = {
  agentTargets: TaskAgentTarget[]; datasetId: string; datasetVersion: string; evaluatorIds: string[];
  name: string; description: string; concurrency: number; timeout: number; continueOnError: boolean;
};

const TODAY = '2026-08-28';
const HISTORY_PAGE_SIZE = 8;
const INITIAL_EVALUATION_STATE = cloneEvaluationState();
const FIELD_SEMANTICS: FieldSemantic[] = ['Input', 'File', 'Expected Output', 'Agent Output', 'Trace', 'Agent Configuration', 'User Feedback', 'Custom'];
const FIELD_DESCRIPTIONS: Record<FieldSemantic, string> = {
  Input: '提供给 Agent 的完整用户输入，包括多轮消息和文件信息。',
  File: '评测集中单独维护的文件资源字段。',
  'Expected Output': '期望结果、参考答案或验收标准。',
  'Agent Output': 'Agent 已产生的实际回答和交付说明。',
  Trace: 'Agent 的完整运行轨迹和真实执行证据。',
  'Agent Configuration': '本次运行实际生效的完整 Agent 配置快照。',
  'User Feedback': '历史对话中的点赞、点踩和反馈原因。',
  Custom: '其他业务字段。',
};
const SYSTEM_PROVIDED_SEMANTICS: FieldSemantic[] = ['Agent Output', 'Trace', 'Agent Configuration'];
const extractPromptVariables = (prompt: string): Evaluator['variables'] => {
  const variables: Evaluator['variables'] = [];
  const seen = new Set<string>();
  for (const match of prompt.matchAll(/\{\{\s*([^{}\n]+?)\s*\}\}/g)) {
    const name = match[1].trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    variables.push({ name, semantic: (FIELD_SEMANTICS as string[]).includes(name) ? (name as FieldSemantic) : 'Custom', required: true });
  }
  return variables;
};

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, '');
const inferSemantic = (header: string): FieldSemantic => {
  const value = normalizeHeader(header);
  if (['input', 'prompt', 'question', 'query', 'userinput', '用户输入', '用户问题', '问题', '用户消息'].includes(value)) return 'Input';
  if (['file', '文件', 'fileurl', 'attachment', '附件', '文件url'].includes(value)) return 'File';
  if (['expectedoutput', 'expectedanswer', 'referenceanswer', 'expected', '验收要点', '期望输出', '期望答案', '参考答案'].includes(value)) return 'Expected Output';
  if (['actualoutput', 'output', 'response', 'answeroutput', '回答', '实际回答', '最终回答', '最终输出'].includes(value)) return 'Agent Output';
  if (['trace', 'executiontrace', '执行轨迹', '完整trace', '链路', '轨迹'].includes(value)) return 'Trace';
  if (['feedback', 'userfeedback', '反馈', '用户反馈'].includes(value)) return 'User Feedback';
  return 'Custom';
};
const uniqueHeaders = (headers: string[]) => {
  const counts = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header.trim() || `未命名字段 ${index + 1}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
};
const parseCsv = (text: string, delimiter = ',') => {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]; const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell); cell = ''; if (row.some((item) => item.trim())) rows.push(row); row = []; continue;
    }
    cell += char;
  }
  if (quoted) throw new Error('CSV 文件包含未闭合的引号');
  if (cell || row.length) { row.push(cell); if (row.some((item) => item.trim())) rows.push(row); }
  if (!rows.length) throw new Error('文件为空，无法解析表头');
  const columns = uniqueHeaders(rows[0]);
  return { columns, rows: rows.slice(1).map((values) => Object.fromEntries(columns.map((column, index) => [column, values[index]?.trim() ?? '']))).filter((item) => Object.values(item).some(Boolean)) };
};
const parseFile = async (file: File): Promise<ParsedFile> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['csv', 'xls', 'xlsx', 'jsonl'].includes(extension)) throw new Error('仅支持 CSV、XLS、XLSX 和 JSONL 文件');
  if (extension === 'csv' || extension === 'jsonl') {
    const text = await file.text();
    if (extension === 'jsonl') {
      const records = text.split(/\r?\n/).filter(Boolean).map((line, index) => {
        try { const value: unknown = JSON.parse(line); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; } catch { throw new Error(`第 ${index + 1} 行 JSON 无法解析`); }
      });
      const columns = uniqueHeaders([...new Set(records.flatMap((record) => Object.keys(record)))]);
      return { name: file.name, format: extension.toUpperCase(), columns, rows: records.map((record) => Object.fromEntries(columns.map((column) => [column, String(record[column] ?? '')]))) };
    }
    return { name: file.name, format: extension.toUpperCase(), ...parseCsv(text, text.includes('\t') && !text.includes(',') ? '\t' : ',') };
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) throw new Error('表格中没有可解析的工作表');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }).map((values) => values.map((value) => String(value ?? ''))).filter((values) => values.some((value) => value.trim()));
  if (!matrix.length) throw new Error('文件为空，无法解析表头');
  const columns = uniqueHeaders(matrix[0]);
  return { name: file.name, format: extension.toUpperCase(), columns, rows: matrix.slice(1).map((values) => Object.fromEntries(columns.map((column, index) => [column, values[index]?.trim() ?? '']))).filter((item) => Object.values(item).some(Boolean)) };
};
const shiftDate = (value: string, days: number) => { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const dateStamp = (value: string) => new Date(value.replace(' ', 'T')).getTime();
const startOfDay = (value: string) => new Date(`${value}T00:00:00`).getTime();
const endOfDay = (value: string) => new Date(`${value}T23:59:59`).getTime();

const makeDatasetDraft = (state: EvaluationState, mode: DatasetCreateMode = '用户上传'): DatasetDraft => {
  const agent = state.agents[0];
  return {
    mode, name: '', description: '', file: null, fields: [], parsing: false, error: '',
    generateAgentId: agent?.id ?? '', generateVersion: agent?.versions[0] ?? '', generatePrompt: '', generateCount: 5,
    historyAgentId: agent?.id ?? '', historyVersion: agent?.versions[0] ?? '', historyPreset: '7', historyStart: shiftDate(TODAY, -6), historyEnd: TODAY,
    historyFeedback: '全部', historySelected: {}, historyExpanded: null, historyPage: 1,
  };
};
const makeEvaluatorDraft = (): EvaluatorDraft => ({
  name: '', description: '', model: 'Doubao-Seed-1.6', scoreType: 'numeric', passThreshold: 0.7,
  prompt: '',
  variables: [],
});
const makeTaskDraft = (state: EvaluationState): TaskDraft => {
  const dataset = state.datasets.find((item) => item.versions.some((version) => version.status === '已提交')) ?? state.datasets[0];
  const firstAgent = state.agents[0];
  return { agentTargets: firstAgent ? [{ agentId: firstAgent.id, agentVersion: firstAgent.versions[0] ?? '' }] : [], datasetId: dataset?.id ?? '', datasetVersion: dataset?.versions.find((version) => version.status === '已提交')?.id ?? '', evaluatorIds: [], name: '', description: '', concurrency: 2, timeout: 60, continueOnError: true };
};

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'violet' | 'green' | 'amber' }) {
  return <span className={`eval-pill eval-pill--${tone}`}>{children}</span>;
}
function Status({ label }: { label: string }) {
  return <span className={`eval-status eval-status--${statusTone(label)}`}><i />{label}</span>;
}
function IconButton({ label, onClick, children }: { label: string; onClick: (event: MouseEvent<HTMLButtonElement>) => void; children: ReactNode }) {
  return <button type="button" className="eval-icon-button" aria-label={label} title={label} onClick={onClick}>{children}</button>;
}
function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="eval-empty"><div className="eval-empty__mark"><Layers3 size={19} /></div><strong>{title}</strong><span>{description}</span>{action}</div>;
}
function FieldBadge({ semantic, required }: { semantic: FieldSemantic; required?: boolean }) {
  return <Pill tone={semantic === 'Trace' ? 'violet' : semantic === 'Custom' ? 'amber' : 'neutral'}>{semantic}{required ? ' · 必选' : ''}</Pill>;
}

export default function EvaluationCenterPage() {
  const [state, setState] = useState<EvaluationState>(() => cloneEvaluationState());
  const [module, setModule] = useState<EvaluationModule>('tasks');
  const [taskTab, setTaskTab] = useState<TaskTab>('list');
  const [taskScreen, setTaskScreen] = useState<TaskScreen>('list');
  const [datasetScreen, setDatasetScreen] = useState<DatasetScreen>('list');
  const [evaluatorScreen, setEvaluatorScreen] = useState<EvaluatorScreen>('list');
  const [traceScreen, setTraceScreen] = useState<TraceScreen>('list');
  const [evaluatorMode, setEvaluatorMode] = useState<EvaluatorMode>('preset');
  const [evaluatorKind, setEvaluatorKind] = useState<EvaluatorKind>('模型评估器');
  const [datasetDraft, setDatasetDraft] = useState<DatasetDraft>(() => makeDatasetDraft(INITIAL_EVALUATION_STATE));
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(() => makeTaskDraft(INITIAL_EVALUATION_STATE));
  const [evaluatorDraft, setEvaluatorDraft] = useState<EvaluatorDraft>(makeEvaluatorDraft);
  const [selectedDatasetId, setSelectedDatasetId] = useState(INITIAL_EVALUATION_STATE.datasets[0]?.id ?? '');
  const [selectedTaskId, setSelectedTaskId] = useState(INITIAL_EVALUATION_STATE.tasks[0]?.id ?? '');
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState(INITIAL_EVALUATION_STATE.evaluators[0]?.id ?? '');
  const [selectedExperimentId, setSelectedExperimentId] = useState(INITIAL_EVALUATION_STATE.experiments[0]?.id ?? '');
  const [selectedComparisonId, setSelectedComparisonId] = useState(INITIAL_EVALUATION_STATE.comparisons[0]?.id ?? '');
  const [search, setSearch] = useState(''); const [datasetSearch, setDatasetSearch] = useState(''); const [taskSearch, setTaskSearch] = useState(''); const [traceSearch, setTraceSearch] = useState(''); const [scoreFilter, setScoreFilter] = useState('全部结果类型');
  const [toast, setToast] = useState<Toast | null>(null); const [toastId, setToastId] = useState(0); const [casePreview, setCasePreview] = useState<CaseResult | null>(null);
  const [taskReturn, setTaskReturn] = useState(false);
  const [selectedTraceId, setSelectedTraceId] = useState(observedTraces[0]?.id ?? '');
  const [datasetEntryFromTask, setDatasetEntryFromTask] = useState(false);
  const [editingEvaluatorId, setEditingEvaluatorId] = useState<string | null>(null);
  const [comparisonPickerOpen, setComparisonPickerOpen] = useState(false);
  const [comparisonInitialControlId, setComparisonInitialControlId] = useState('');
  const [taskDetailTab, setTaskDetailTab] = useState<'summary' | 'data' | 'optimize'>('data');
  const notify = (message: string, tone: Toast['tone'] = 'success') => { const id = toastId + 1; setToastId(id); setToast({ id, message, tone }); window.setTimeout(() => setToast((current) => current?.id === id ? null : current), 2600); };
  const showList = () => { if (module === 'datasets') { setDatasetScreen('list'); setDatasetEntryFromTask(false); } if (module === 'evaluators') setEvaluatorScreen('list'); if (module === 'tasks') { setTaskScreen('list'); setTaskTab('list'); } if (module === 'traces') setTraceScreen('list'); };
  const openDatasetCreate = (mode: DatasetCreateMode) => {
    setTaskReturn(module === 'tasks' && taskScreen === 'create');
    setDatasetEntryFromTask(module === 'tasks' && taskScreen === 'create');
    setDatasetDraft((current) => ({ ...current, mode }));
    setDatasetScreen(mode === '用户上传' ? 'upload' : mode === '智能生成' ? 'generate' : 'history');
    setModule('datasets');
  };
  const openTaskCreate = () => { setTaskDraft(makeTaskDraft(state)); setTaskScreen('create'); setModule('tasks'); };
  const openComparison = (item: ComparisonRecord) => { setSelectedComparisonId(item.id); setTaskScreen('comparison'); setModule('tasks'); };
  const openComparisonPicker = (controlTaskId?: string) => {
    setComparisonInitialControlId(controlTaskId ?? '');
    setComparisonPickerOpen(true);
  };
  const createComparison = (controlTaskId: string, experimentTaskIds: string[]) => {
    const controlTask = state.tasks.find((item) => item.id === controlTaskId);
    const experimentTasks = experimentTaskIds.map((id) => state.tasks.find((item) => item.id === id)).filter((item): item is EvaluationTask => Boolean(item));
    const dataset = controlTask ? getDatasetById(state, controlTask.datasetId) : undefined;
    if (!controlTask || !experimentTasks.length || !dataset) { notify('请选择对照组和至少一个实验组任务', 'warning'); return; }
    const record = createComparisonRecord(controlTask, experimentTasks, dataset, state.evaluators);
    setState((current) => ({ ...current, comparisons: [record, ...current.comparisons] }));
    setSelectedComparisonId(record.id);
    setComparisonPickerOpen(false);
    setTaskScreen('comparison');
    setModule('tasks');
    notify('对比实验已创建，已生成指标统计');
  };
  const startOptimization = (caseIds: string[], followUpMode: OptimizationFollowUpMode, agentType: '万智' | '外部') => {
    const target = state.experiments.find((item) => item.followUpMode === followUpMode && item.agentType === agentType) ?? state.experiments[0];
    if (!target) return;
    setSelectedExperimentId(target.id);
    setTaskDetailTab('optimize');
    setTaskScreen('detail');
    notify(`${caseIds.length} 个 Badcase 已进入${followUpMode === '直接实验对比' ? '自动复测流程' : followUpMode === '仅生成建议' ? '建议生成流程' : '配置审查流程'}`);
  };
  const openEvaluatorCreate = () => { setTaskReturn(module === 'tasks' && taskScreen === 'create'); setEditingEvaluatorId(null); setEvaluatorDraft(makeEvaluatorDraft()); setEvaluatorScreen('create'); setModule('evaluators'); };

  const createDataset = (draft: DatasetDraft) => {
    if (!draft.name.trim()) { notify('请填写评测集名称', 'warning'); return; }
    let fields: FieldDefinition[] = []; let cases: DatasetCase[] = []; let note = '';
    if (draft.mode === '用户上传') {
      if (!draft.file?.rows.length || !draft.fields.length) { notify('请上传包含数据的文件并确认字段', 'warning'); return; }
      fields = draft.fields.map((field, index) => ({ id: `field-${index + 1}`, name: field.name.trim() || field.sourceColumn, semantic: field.semantic, description: FIELD_DESCRIPTIONS[field.semantic], required: field.semantic === 'Input' }));
      cases = draft.file.rows.map((row, index) => ({ id: `CASE-IMPORT-${String(index + 1).padStart(3, '0')}`, values: Object.fromEntries(draft.fields.map((field, fieldIndex) => [`field-${fieldIndex + 1}`, row[field.sourceColumn] ?? ''])), source: '用户上传', createdAt: TODAY, hasFile: false }));
      note = `从 ${draft.file.name} 导入 ${cases.length} 条数据。`;
    } else if (draft.mode === '智能生成') {
      if (!draft.generateAgentId || !draft.generateVersion || !draft.generatePrompt.trim()) { notify('请完成 Agent、版本和生成场景配置', 'warning'); return; }
      fields = [{ id: 'input', name: '用户输入', semantic: 'Input', description: FIELD_DESCRIPTIONS.Input, required: true }, { id: 'expected', name: '验收要点', semantic: 'Expected Output', description: FIELD_DESCRIPTIONS['Expected Output'], required: false }];
      cases = Array.from({ length: draft.generateCount }, (_, index) => ({ id: `CASE-GENERATED-${String(index + 1).padStart(3, '0')}`, values: { input: `${draft.generatePrompt.trim()} · 示例 ${index + 1}`, expected: '覆盖问题中的关键条件和下一步操作。' }, source: '智能生成', createdAt: TODAY, hasFile: false }));
      note = `基于 ${draft.generateVersion} 生成 ${cases.length} 条可编辑草稿，不执行 Agent。`;
    } else {
      const filtered = historyForDraft(draft); const selected = filtered.map((conversation) => ({ ...conversation, traces: conversation.traces.filter((trace) => (draft.historySelected[conversation.id] ?? []).includes(trace.id)) })).filter((conversation) => conversation.traces.length);
      if (!selected.length) { notify('请至少勾选 1 个对话或 Trace', 'warning'); return; }
      fields = [{ id: 'input', name: '用户输入', semantic: 'Input', description: FIELD_DESCRIPTIONS.Input, required: true }, { id: 'actual', name: '原始回答', semantic: 'Agent Output', description: FIELD_DESCRIPTIONS['Agent Output'], required: false }, { id: 'trace', name: '原始 Trace', semantic: 'Trace', description: FIELD_DESCRIPTIONS.Trace, required: false }, { id: 'feedback', name: '用户反馈', semantic: 'User Feedback', description: FIELD_DESCRIPTIONS['User Feedback'], required: false }];
      cases = selected.map((conversation, index) => ({ id: `CASE-HISTORY-${String(index + 1).padStart(3, '0')}`, values: { input: conversation.traces[0]?.input ?? conversation.title, actual: conversation.traces.at(-1)?.agentOutput ?? '', trace: conversation.traces.map((trace) => `trace://${trace.id}`).join(' / '), feedback: conversation.traces.map((trace) => trace.userFeedback).filter(Boolean).join('；') }, source: '历史对话回流', createdAt: TODAY, hasFile: false }));
      note = `从 ${draft.historyVersion} 回流 ${cases.length} 条对话，沿用原始回复和 Trace。`;
    }
    const id = `DS-${String(state.datasets.length + 1).padStart(5, '0')}`; const versionId = `${id}-draft`;
    const normalizedFields = fields.map((field) => ({ ...field, id: `${id}-${field.id}` }));
    const dataset: Dataset = { id, name: draft.name.trim(), description: draft.description.trim(), status: '草稿', source: draft.mode, createdAt: `${TODAY} 20:18`, updatedAt: `${TODAY} 20:18`, createdBy: '演示账户', fields: normalizedFields, cases: cases.map((item) => ({ ...item, values: Object.fromEntries(Object.entries(item.values).map(([key, value]) => [`${id}-${key}`, value])) })), draftVersionId: versionId, versions: [{ id: versionId, label: '草稿', status: '草稿', caseCount: cases.length, createdAt: `${TODAY} 20:18`, createdBy: '演示账户', note }] };
    setState((current) => ({ ...current, datasets: [dataset, ...current.datasets] })); setSelectedDatasetId(id);
    if (taskReturn) {
      setDatasetScreen('workspace');
      notify('评测集草稿已创建，提交后自动用于当前任务');
      return;
    }
    setDatasetScreen('workspace'); notify(`已创建评测集草稿，带入 ${cases.length} 条数据`);
  };

  const updateDataset = (id: string, updater: (dataset: Dataset) => Dataset) => {
    setState((current) => ({ ...current, datasets: current.datasets.map((item) => item.id === id ? updater(item) : item) }));
  };

  const submitDatasetVersion = (id: string, source: 'dataset' | 'task') => {
    const target = getDatasetById(state, id);
    if (!target?.draftVersionId) { notify('当前没有可提交的草稿', 'warning'); return; }
    const submittedCount = target.versions.filter((version) => version.status === '已提交').length + 1;
    const versionId = `${id}-v${submittedCount}`;
    const version: Dataset['versions'][number] = {
      id: versionId, label: `V${submittedCount}`, status: '已提交', caseCount: target.cases.length,
      createdAt: `${TODAY} 20:36`, createdBy: target.createdBy, note: `提交当前草稿，包含 ${target.cases.length} 条 Case 和 ${target.fields.length} 个字段。`,
      data: { fields: structuredClone(target.fields), cases: structuredClone(target.cases) },
    };
    setState((current) => ({ ...current, datasets: current.datasets.map((item) => item.id === id ? { ...item, status: '已提交', updatedAt: version.createdAt, draftVersionId: '', versions: [version, ...item.versions] } : item) }));
    if (source === 'task') {
      setTaskDraft((current) => ({ ...current, datasetId: id, datasetVersion: versionId }));
      setDatasetEntryFromTask(false);
      setTaskReturn(false);
      setDatasetScreen('list');
      setTaskScreen('create');
      setModule('tasks');
      notify('版本已提交，已返回任务创建并选中该版本');
      return;
    }
    setDatasetEntryFromTask(false);
    notify('版本已提交，草稿已冻结为历史版本');
  };

  const copyDatasetAsDraft = (id: string) => {
    const target = getDatasetById(state, id);
    if (!target || target.draftVersionId) return;
    const draftId = `${id}-draft-${target.versions.length + 1}`;
    const latest = target.versions[0];
    const sourceData = latest?.data;
    setState((current) => ({ ...current, datasets: current.datasets.map((item) => item.id === id ? { ...item, status: '草稿', fields: sourceData?.fields ? structuredClone(sourceData.fields) : item.fields, cases: sourceData?.cases ? structuredClone(sourceData.cases) : item.cases, updatedAt: `${TODAY} 20:38`, draftVersionId: draftId, versions: [{ id: draftId, label: '草稿', status: '草稿' as const, caseCount: sourceData?.cases.length ?? item.cases.length, createdAt: `${TODAY} 20:38`, createdBy: '演示账户', note: `从 ${latest?.label ?? '历史版本'} 复制的草稿。` }, ...item.versions] } : item) }));
    notify('已复制为可编辑草稿');
  };

  const createEvaluator = (draft: EvaluatorDraft) => {
    if (!draft.name.trim()) { notify('请填写评估器名称', 'warning'); return; }
    if (!draft.prompt.trim()) { notify('请填写 Prompt', 'warning'); return; }
    if (!draft.prompt.includes('只返回 JSON')) { notify('请在 Prompt 中补充“只返回 JSON”约束', 'warning'); return; }
    const existing = editingEvaluatorId ? state.evaluators.find((item) => item.id === editingEvaluatorId) : undefined;
    const nextVersion = existing ? `0.0.${existing.versions.length + 1}` : '0.0.1';
    const variables = extractPromptVariables(draft.prompt);
    const evaluator: Evaluator = { id: existing?.id ?? `custom-${state.evaluators.length + 1}`, name: draft.name.trim(), kind: '模型评估器', mode: 'custom', version: nextVersion, versions: existing ? [...existing.versions, nextVersion] : [nextVersion], description: draft.description.trim() || '用户自定义评估规则。', purpose: draft.description.trim() || '用户自定义评估规则。', category: '自建评估器', scoreType: draft.scoreType, model: draft.model, prompt: draft.prompt, variables, passThreshold: draft.scoreType === 'numeric' ? draft.passThreshold : undefined, creator: existing?.creator ?? '演示账户', updatedAt: `${TODAY} 20:30`, runCount: existing?.runCount ?? 0 };
    setState((current) => ({ ...current, evaluators: existing ? current.evaluators.map((item) => item.id === existing.id ? evaluator : item) : [evaluator, ...current.evaluators] })); setSelectedEvaluatorId(evaluator.id); setEditingEvaluatorId(null); setEvaluatorMode('custom');
    if (taskReturn) {
      setTaskDraft((current) => ({ ...current, evaluatorIds: current.evaluatorIds.includes(evaluator.id) ? current.evaluatorIds : [...current.evaluatorIds, evaluator.id] }));
      setTaskReturn(false);
      setEvaluatorScreen('list');
      setTaskScreen('create');
      setModule('tasks');
      notify('自建评估器已创建，已加入当前任务配置');
      return;
    }
    setEvaluatorScreen('list'); notify(existing ? `自建评估器已更新，生成版本 ${nextVersion}` : '自建评估器已创建，版本 0.0.1');
  };

  const createTask = () => {
    const dataset = getDatasetById(state, taskDraft.datasetId);
    const version = dataset?.versions.find((item) => item.id === taskDraft.datasetVersion);
    const selected = state.evaluators.filter((item) => taskDraft.evaluatorIds.includes(item.id));
    if (!taskDraft.name.trim()) { notify('请填写任务名称', 'warning'); return; }
    if (!dataset || !version || version.status !== '已提交') { notify('任务必须绑定已提交的评测集版本', 'warning'); return; }
    if (!taskDraft.agentTargets.length || taskDraft.agentTargets.some((target) => !target.agentId || !target.agentVersion)) { notify('请选择 Agent 和版本', 'warning'); return; }
    if (!selected.length) { notify('至少选择一个评估器', 'warning'); return; }

    const tasks = taskDraft.agentTargets.map((target, targetIndex) => {
      const agent = state.agents.find((item) => item.id === target.agentId);
      const results: CaseResult[] = dataset.cases.map((item, index) => {
        const input = item.values[dataset.fields.find((field) => field.semantic === 'Input')?.id ?? ''] ?? '未读取 Input';
        const agentOutput = item.values[dataset.fields.find((field) => field.semantic === 'Agent Output')?.id ?? ''] ?? '';
        const expectedOutput = item.values[dataset.fields.find((field) => field.semantic === 'Expected Output')?.id ?? ''];
        const status = index === 1 ? '不通过' : '通过';
        return {
          caseId: item.id,
          status,
          duration: index === 1 ? '7.4 s' : '5.9 s',
          input,
          agentOutput,
          expectedOutput,
          trace: [{ id: `mock-${targetIndex}-${index}`, type: 'system', name: 'Mock 执行记录', status: '成功', duration: '未采集', detail: '原型数据：不调用真实 Agent。' }],
          evaluatorResults: selected.map((evaluator) => ({
            evaluatorId: evaluator.id,
            evaluatorName: evaluator.name,
            scoreType: evaluator.scoreType,
            evaluationResult: evaluator.scoreType === 'numeric' ? (index === 1 ? 0.58 : 0.92) : status,
            evaluationReason: index === 1 ? '模拟数据：缺少一个验收要点。' : '模拟数据：满足当前评估器要求。',
            evaluationStatus: status,
            traceRefs: [`mock-${targetIndex}-${index}`],
          })),
          agentConfiguration: `${agent?.name ?? 'Agent'} ${target.agentVersion} · Mock Configuration`,
          runtime: {
            runStatus: status,
            agentDuration: index === 1 ? '7.4 s' : '5.9 s',
            firstTokenLatency: index === 1 ? '780 ms' : '540 ms',
            inputTokens: index === 1 ? 1820 : 2240,
            outputTokens: index === 1 ? 420 : 510,
            totalTokens: index === 1 ? 2240 : 2750,
            evaluatorDuration: '2.4 s',
          },
        };
      });
      const suffix = taskDraft.agentTargets.length > 1 ? ` · ${agent?.name ?? 'Agent'} ${target.agentVersion}` : '';
      return {
        id: `TASK-${TODAY.replaceAll('-', '')}-${String(state.tasks.length + targetIndex + 1).padStart(3, '0')}`,
        name: `${taskDraft.name.trim()}${suffix}`,
        description: taskDraft.description.trim(),
        agent: agent?.name ?? 'Agent',
        agentVersion: target.agentVersion,
        datasetId: dataset.id,
        datasetVersion: version.label,
        evaluatorIds: taskDraft.evaluatorIds,
        status: '运行中' as const,
        tone: 'info' as const,
        createdBy: '演示账户',
        createdAt: `${TODAY} 20:31`,
        updatedAt: `${TODAY} 20:31`,
        totalCases: results.length,
        executableCases: results.length,
        completedCases: 0,
        failedCases: 0,
        results,
        runtime: { concurrency: taskDraft.concurrency, timeout: taskDraft.timeout, continueOnError: taskDraft.continueOnError },
      };
    });

    setState((current) => ({ ...current, tasks: [...tasks, ...current.tasks] }));
    setSelectedTaskId(tasks[0].id);
    setTaskScreen('detail');
    notify(tasks.length > 1 ? `已创建 ${tasks.length} 个评测任务，正在模拟运行` : '评测任务已创建，正在模拟运行');
  };

  function historyForDraft(draft: DatasetDraft) {
    const days = draft.historyPreset === 'custom' ? null : Number(draft.historyPreset);
    const range = draft.historyPreset === 'custom' ? { start: startOfDay(draft.historyStart), end: endOfDay(draft.historyEnd) } : { start: startOfDay(shiftDate(TODAY, -((days ?? 7) - 1))), end: endOfDay(TODAY) };
    return historyConversations.filter((conversation) => {
      if (conversation.agentId !== draft.historyAgentId || conversation.agentVersion !== draft.historyVersion) return false;
      const stamp = dateStamp(conversation.occurredAt); if (stamp < range.start || stamp > range.end) return false;
      const feedback = conversation.traces.some((trace) => trace.userFeedback.trim());
      return draft.historyFeedback === '全部' || (draft.historyFeedback === '有反馈' ? feedback : !feedback);
    });
  }
  const dataset = state.datasets.find((item) => item.id === selectedDatasetId) ?? state.datasets[0];
  const task = state.tasks.find((item) => item.id === selectedTaskId) ?? state.tasks[0];
  const experiment = state.experiments.find((item) => item.id === selectedExperimentId) ?? state.experiments[0];
  const comparison = state.comparisons.find((item) => item.id === selectedComparisonId) ?? state.comparisons[0];
  const evaluator = state.evaluators.find((item) => item.id === selectedEvaluatorId) ?? state.evaluators[0];
  const selectedTrace = observedTraces.find((item) => item.id === selectedTraceId) ?? observedTraces[0];
  const selectModule = (next: EvaluationModule) => { setModule(next); if (next === 'tasks') setTaskScreen('list'); if (next === 'datasets') setDatasetScreen('list'); if (next === 'evaluators') setEvaluatorScreen('list'); if (next === 'traces') setTraceScreen('list'); };
  const moduleGroups = [
    { label: '评测', items: [{ id: 'tasks' as const, label: '评测任务', icon: ListChecks }, { id: 'datasets' as const, label: '评测集', icon: Database }, { id: 'evaluators' as const, label: '评估器', icon: ClipboardCheck }] },
    { label: '数据', items: [{ id: 'traces' as const, label: '观测', icon: Activity }] },
  ];
  return <div className="evaluation-app">
    <aside className="eval-platform-sidebar">
      <div className="eval-sidebar-brand"><div className="eval-app-mark"><span /><span /><span /></div><div><span className="eval-eyebrow">WANZHI</span><strong>评测中心</strong></div></div>
      <nav className="eval-sidebar-nav" aria-label="平台功能模块">{moduleGroups.map((group) => <div className="eval-sidebar-group" key={group.label}><span className="eval-sidebar-label">{group.label}</span>{group.items.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={module === item.id ? 'is-active' : ''} onClick={() => selectModule(item.id)}><Icon size={17} />{item.label}</button>; })}</div>)}</nav>
      <div className="eval-sidebar-footer"><Pill>本地 Mock</Pill></div>
    </aside>
    <div className="evaluation-main">
      <header className="eval-app-header"><div className="eval-app-title"><h1>{module === 'tasks' && taskScreen === 'detail' ? taskDetailTab === 'data' ? '数据明细' : taskDetailTab === 'optimize' ? '优化实验' : '统计结论' : module === 'tasks' && taskScreen === 'comparison' ? '对比实验' : { tasks: '评测任务', datasets: '评测集', evaluators: '评估器', traces: '观测' }[module]}</h1></div><div className="eval-app-actions"><IconButton label="恢复初始数据" onClick={() => { setState(cloneEvaluationState()); notify('已恢复初始 Mock 数据'); }}><RefreshCw size={16} /></IconButton></div></header>
      <main className="eval-content">
      {module === 'datasets' && datasetScreen === 'list' && <DatasetList datasets={state.datasets} search={datasetSearch} setSearch={setDatasetSearch} onCreate={openDatasetCreate} onOpen={(item) => { setSelectedDatasetId(item.id); setDatasetEntryFromTask(false); setDatasetScreen('workspace'); }} />}
      {module === 'datasets' && datasetScreen === 'upload' && <DatasetUploadPage draft={datasetDraft} setDraft={setDatasetDraft} onBack={showList} onCreate={createDataset} onNotify={notify} />}
      {module === 'datasets' && datasetScreen === 'generate' && <DatasetGeneratePage draft={datasetDraft} setDraft={setDatasetDraft} agents={state.agents} onBack={showList} onCreate={createDataset} />}
      {module === 'datasets' && datasetScreen === 'history' && <DatasetHistoryPage draft={datasetDraft} setDraft={setDatasetDraft} agents={state.agents} onBack={showList} onCreate={createDataset} />}
      {module === 'datasets' && datasetScreen === 'workspace' && dataset && <DatasetWorkspace dataset={dataset} entrySource={datasetEntryFromTask ? 'task' : 'dataset'} onBack={() => { if (datasetEntryFromTask) { setDatasetEntryFromTask(false); setDatasetScreen('list'); setTaskScreen('create'); setModule('tasks'); notify('草稿已保存，未带回任务创建'); return; } setDatasetScreen('list'); }} onNotify={notify} onUpdateDataset={updateDataset} onSubmitDataset={submitDatasetVersion} onCopyDraft={copyDatasetAsDraft} />}
      {module === 'evaluators' && evaluatorScreen === 'list' && <EvaluatorList evaluators={state.evaluators.filter((item) => item.kind === evaluatorKind && item.mode === evaluatorMode && (!search || `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase())) && (scoreFilter === '全部结果类型' || (scoreFilter === '0-1 数值' ? item.scoreType === 'numeric' : item.scoreType === 'pass_fail')))} kind={evaluatorKind} setKind={setEvaluatorKind} mode={evaluatorMode} setMode={setEvaluatorMode} search={search} setSearch={setSearch} scoreFilter={scoreFilter} setScoreFilter={setScoreFilter} onCreate={openEvaluatorCreate} onOpen={(item) => { setSelectedEvaluatorId(item.id); setEvaluatorScreen('detail'); }} onCopy={(item) => { setEditingEvaluatorId(null); setEvaluatorDraft({ name: `${item.name}（自建）`, description: item.description, model: item.model, scoreType: item.scoreType, passThreshold: item.passThreshold ?? 0.7, prompt: item.prompt, variables: item.variables }); setEvaluatorScreen('create'); }} />}
      {module === 'evaluators' && evaluatorScreen === 'detail' && evaluator && <EvaluatorDetail evaluator={evaluator} onBack={showList} onCopy={() => { setEditingEvaluatorId(null); setEvaluatorDraft({ name: `${evaluator.name}（自建）`, description: evaluator.description, model: evaluator.model, scoreType: evaluator.scoreType, passThreshold: evaluator.passThreshold ?? 0.7, prompt: evaluator.prompt, variables: evaluator.variables }); setEvaluatorScreen('create'); }} onEdit={() => { setEditingEvaluatorId(evaluator.id); setEvaluatorDraft({ name: evaluator.name, description: evaluator.description, model: evaluator.model, scoreType: evaluator.scoreType, passThreshold: evaluator.passThreshold ?? 0.7, prompt: evaluator.prompt, variables: evaluator.variables }); setEvaluatorScreen('create'); }} />}
      {module === 'evaluators' && evaluatorScreen === 'create' && <EvaluatorEditor editing={editingEvaluatorId !== null} draft={evaluatorDraft} setDraft={setEvaluatorDraft} onBack={showList} onCreate={() => createEvaluator(evaluatorDraft)} />}
      {module === 'tasks' && taskScreen === 'list' && <TaskList tasks={state.tasks} datasets={state.datasets} evaluators={state.evaluators} comparisons={state.comparisons} search={taskSearch} setSearch={setTaskSearch} tab={taskTab} setTab={setTaskTab} onCreate={openTaskCreate} onCreateComparison={() => openComparisonPicker()} onOpen={(item) => { setSelectedTaskId(item.id); setTaskDetailTab('data'); setTaskScreen('detail'); }} onOpenComparison={openComparison} />}
      {module === 'tasks' && taskScreen === 'create' && <TaskCreateWorkspace state={state} config={taskDraft} setConfig={setTaskDraft} onBack={showList} onCreate={createTask} onCreateDataset={openDatasetCreate} />}
      {module === 'tasks' && taskScreen === 'experiment' && experiment && <OptimizationDetail experiment={experiment} comparison={state.comparisons.find((item) => item.id === experiment.result.comparisonId)} onBack={showList} onNotify={notify} onViewComparison={(item) => openComparison(item)} />}
      {module === 'tasks' && taskScreen === 'comparison' && comparison && <ComparisonDetail comparison={comparison} onBack={() => { setTaskTab('compare'); setTaskScreen('list'); }} />}
      {module === 'tasks' && taskScreen === 'detail' && task && <TaskDetail task={task} state={state} tab={taskDetailTab} onTabChange={setTaskDetailTab} onBack={showList} onOpenCase={setCasePreview} onNotify={notify} onOptimize={startOptimization} onCompare={() => openComparisonPicker(task.id)} onOpenExperiment={(item) => { setSelectedExperimentId(item.id); setTaskScreen('experiment'); }} />}
      {module === 'traces' && traceScreen === 'list' && <TraceList traces={observedTraces} search={traceSearch} setSearch={setTraceSearch} onOpen={(item) => { setSelectedTraceId(item.id); setTraceScreen('detail'); }} />}
      {module === 'traces' && traceScreen === 'detail' && selectedTrace && <TraceDetail key={selectedTrace.id} trace={selectedTrace} onBack={showList} />}
      </main>
    </div>
    {comparisonPickerOpen && <ComparisonPicker initialControlTask={state.tasks.find((item) => item.id === comparisonInitialControlId)} datasets={state.datasets} tasks={state.tasks} evaluators={state.evaluators} onCancel={() => setComparisonPickerOpen(false)} onCreate={createComparison} />}
    {casePreview && <CasePreview item={casePreview} onClose={() => setCasePreview(null)} />}
    {toast && <div className={`eval-toast eval-toast--${toast.tone}`}><CheckCircle2 size={15} />{toast.message}</div>}
  </div>;
}

function CreateMenu({ onCreate }: { onCreate: (mode: DatasetCreateMode) => void }) {
  const [open, setOpen] = useState(false);
  const items = [
    { mode: '用户上传' as const, label: '上传文件', note: 'CSV / XLSX / JSONL', icon: <Upload size={17} /> },
    { mode: '智能生成' as const, label: '智能生成', note: '按场景生成草稿', icon: <Sparkles size={17} /> },
    { mode: '历史对话回流' as const, label: '轨迹回流', note: '筛选真实对话', icon: <History size={17} /> },
  ];
  return <div className="eval-create-menu-wrap">
    <button type="button" className="eval-button eval-button--primary eval-create-trigger" onClick={() => setOpen((current) => !current)}><Plus size={16} />新建评测集<ChevronDown size={14} className={open ? 'is-open' : ''} /></button>
    {open && <div className="eval-create-menu">{items.map((item) => <button type="button" key={item.mode} onClick={() => { setOpen(false); onCreate(item.mode); }}><span className="eval-menu-icon">{item.icon}</span><span><strong>{item.label}</strong><small>{item.note}</small></span><ChevronRight size={14} /></button>)}</div>}
  </div>;
}

function DatasetList({ datasets, search, setSearch, onCreate, onOpen }: { datasets: Dataset[]; search: string; setSearch: (value: string) => void; onCreate: (mode: DatasetCreateMode) => void; onOpen: (dataset: Dataset) => void }) {
  const filtered = datasets.filter((dataset) => !search || `${dataset.id} ${dataset.name} ${dataset.description}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="eval-list-page">
    <div className="eval-toolbar"><label className="eval-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索评测集名称、ID 或描述" /></label><CreateMenu onCreate={onCreate} /></div>
    <section className="eval-surface table-surface">
      <table className="eval-data-table">
        <thead><tr><th>评测集</th><th>状态</th><th>来源</th><th>数据量</th><th>最新版本</th><th>更新时间</th><th /></tr></thead>
        <tbody>
          {filtered.map((dataset) => <tr key={dataset.id} onClick={() => onOpen(dataset)}>
            <td><div className="eval-cell-title"><strong>{dataset.name}</strong><small>{dataset.id} · {dataset.description || '暂无描述'}</small></div></td>
            <td><Status label={dataset.status} /></td>
            <td><Pill>{dataset.source === '历史对话回流' ? '轨迹回流' : dataset.source}</Pill></td>
            <td>{dataset.cases.length}</td>
            <td>{dataset.versions[0]?.label ?? '未采集'}</td>
            <td>{dataset.updatedAt.slice(0, 10)}</td>
            <td><IconButton label="打开评测集" onClick={() => onOpen(dataset)}><Eye size={15} /></IconButton></td>
          </tr>)}
        </tbody>
      </table>
    </section>
    {filtered.length === 0 && <EmptyState title="没有匹配的评测集" description="调整搜索条件，或新建一个评测集。" />}
  </div>;
}

function DatasetUploadPage({ draft, setDraft, onBack, onCreate, onNotify }: { draft: DatasetDraft; setDraft: Dispatch<SetStateAction<DatasetDraft>>; onBack: () => void; onCreate: (draft: DatasetDraft) => void; onNotify: (message: string, tone?: Toast['tone']) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseFile = async (file?: File) => {
    if (!file) return;
    setDraft((current) => ({ ...current, parsing: true, error: '' }));
    try {
      const parsed = await parseFile(file);
      setDraft((current) => ({ ...current, file: parsed, fields: parsed.columns.map((column, index) => ({ id: `upload-${index}`, sourceColumn: column, name: column, semantic: inferSemantic(column) })), parsing: false }));
    } catch (error) {
      setDraft((current) => ({ ...current, parsing: false, error: error instanceof Error ? error.message : '文件解析失败' }));
    }
  };
  const updateField = (id: string, key: 'name' | 'semantic', value: string) => setDraft((current) => ({ ...current, fields: current.fields.map((field) => field.id === id ? { ...field, [key]: value } as UploadField : field) }));
  const canCreate = Boolean(draft.name.trim() && draft.file?.rows.length && draft.fields.length && !draft.parsing);
  return <div className="eval-create-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回评测集</button><Pill tone="violet">上传文件</Pill></div>
    <section className="eval-create-single eval-create-single--compact">
      <div className="eval-form-grid eval-dataset-basic-fields">
        <label className="eval-field"><span>评测集名称 <b>*</b></span><input maxLength={50} value={draft.name} placeholder="例如：退款客服回归问题集" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><small>{draft.name.length}/50</small></label>
        <label className="eval-field"><span>描述</span><textarea maxLength={200} rows={2} value={draft.description} placeholder="说明这份数据用于验证什么" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /><small>{draft.description.length}/200</small></label>
      </div>
      <div className="eval-create-section">
        <div className="eval-create-section__head"><div><span className="eval-eyebrow">IMPORT DATA</span><h4>文件上传</h4><p>支持 CSV、XLS、XLSX、JSONL；字段名称与语义可在下方编辑。</p></div><button type="button" className="eval-button eval-button--ghost" onClick={() => onNotify('模板下载在本地 Mock 中仅展示入口')}><Download size={14} />下载模板</button></div>
        {!draft.file && <button type="button" className={`eval-upload-dropzone${draft.parsing ? ' is-loading' : ''}`} disabled={draft.parsing} onClick={() => inputRef.current?.click()}><Upload size={24} /><strong>{draft.parsing ? '正在解析文件…' : '点击上传，或将文件拖拽至此处'}</strong><span>不限制字段名称，上传后可以编辑字段语义</span></button>}
        {draft.file && <div className="eval-file-summary"><div className="eval-file-summary__icon"><FileSpreadsheet size={20} /></div><div><strong>{draft.file.name}</strong><span>{draft.file.format} · {draft.file.columns.length} 个字段 · {draft.file.rows.length} 条数据</span></div><button type="button" className="eval-button eval-button--ghost" onClick={() => inputRef.current?.click()}>更换文件</button></div>}
        {draft.error && <div className="eval-error"><CircleAlert size={15} />{draft.error}</div>}
        <input ref={inputRef} type="file" accept=".csv,.xls,.xlsx,.jsonl" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => { void chooseFile(event.target.files?.[0]); }} />
        {draft.file && <div className="eval-field-mapping"><div className="eval-subsection-head"><div><h4>字段确认</h4><span>不设置数据类型，只确认字段名称和语义</span></div><span>{draft.fields.length} 个字段</span></div><div className="eval-field-mapping__head"><span>原始字段</span><span>展示名称</span><span>字段语义</span><span>示例值</span></div>{draft.fields.map((field) => <div className="eval-field-mapping__row" key={field.id}><strong>{field.sourceColumn}</strong><input value={field.name} onChange={(event) => updateField(field.id, 'name', event.target.value)} /><select value={field.semantic} onChange={(event) => updateField(field.id, 'semantic', event.target.value)}>{FIELD_SEMANTICS.map((semantic) => <option key={semantic}>{semantic}</option>)}</select><span>{draft.file?.rows[0]?.[field.sourceColumn] || '未采集'}</span></div>)}</div>}
      </div>
    </section>
    <footer className="eval-sticky-footer"><span>字段可以在草稿详情继续编辑。</span><div><button type="button" className="eval-button eval-button--ghost" onClick={onBack}>取消</button><button type="button" className="eval-button eval-button--primary" disabled={!canCreate} onClick={() => onCreate(draft)}><Check size={15} />创建评测集</button></div></footer>
  </div>;
}

function DatasetGeneratePage({ draft, setDraft, agents, onBack, onCreate }: { draft: DatasetDraft; setDraft: Dispatch<SetStateAction<DatasetDraft>>; agents: AgentOption[]; onBack: () => void; onCreate: (draft: DatasetDraft) => void }) {
  const selectedAgent = agents.find((agent) => agent.id === draft.generateAgentId) ?? agents[0];
  const canCreate = Boolean(draft.name.trim() && draft.generateAgentId && draft.generateVersion && draft.generatePrompt.trim() && draft.generateCount > 0);
  return <div className="eval-create-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回评测集</button><Pill tone="violet">智能生成</Pill></div>
    <section className="eval-create-single eval-create-single--compact">
      <div className="eval-form-grid eval-dataset-basic-fields">
        <label className="eval-field"><span>评测集名称 <b>*</b></span><input maxLength={50} value={draft.name} placeholder="例如：退款场景生成问题集" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><small>{draft.name.length}/50</small></label>
        <label className="eval-field"><span>描述</span><textarea maxLength={200} rows={2} value={draft.description} placeholder="说明这份数据用于验证什么" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /><small>{draft.description.length}/200</small></label>
      </div>
      <div className="eval-create-section">
        <div className="eval-form-grid"><label className="eval-field"><span>Agent <b>*</b></span><select value={draft.generateAgentId} onChange={(event) => { const agent = agents.find((item) => item.id === event.target.value); setDraft((current) => ({ ...current, generateAgentId: event.target.value, generateVersion: agent?.versions[0] ?? '' })); }}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label><label className="eval-field"><span>版本 <b>*</b></span><select value={draft.generateVersion} disabled={!draft.generateAgentId} onChange={(event) => setDraft((current) => ({ ...current, generateVersion: event.target.value }))}>{(selectedAgent?.versions ?? []).map((version) => <option key={version}>{version}</option>)}</select></label></div>
        <label className="eval-field eval-field--wide"><span>生成场景 Prompt <b>*</b></span><textarea rows={5} value={draft.generatePrompt} placeholder="例如：生成退款政策、到账时间和转人工相关的用户问题，覆盖简单咨询和异常情况。" onChange={(event) => setDraft((current) => ({ ...current, generatePrompt: event.target.value }))} /></label>
        <div className="eval-generated-fields"><div className="eval-generated-fields__head"><span>字段名称</span><span>字段语义</span><span>字段说明</span></div><div className="eval-generated-fields__row"><strong>用户输入</strong><FieldBadge semantic="Input" required /><span>{FIELD_DESCRIPTIONS.Input}</span></div><div className="eval-generated-fields__row"><strong>验收要点</strong><FieldBadge semantic="Expected Output" /><span>{FIELD_DESCRIPTIONS['Expected Output']}</span></div></div>
        <label className="eval-field eval-generate-count"><span>生成数量</span><input type="number" min={1} max={50} value={draft.generateCount} onChange={(event) => setDraft((current) => ({ ...current, generateCount: Math.max(1, Math.min(50, Number(event.target.value) || 1)) }))} /></label>
      </div>
    </section>
    <footer className="eval-sticky-footer"><span>生成结果进入草稿，不代表 Agent 已经运行。</span><div><button type="button" className="eval-button eval-button--ghost" onClick={onBack}>取消</button><button type="button" className="eval-button eval-button--primary" disabled={!canCreate} onClick={() => onCreate(draft)}><Check size={15} />创建评测集</button></div></footer>
  </div>;
}

function DatasetHistoryPage({ draft, setDraft, agents, onBack, onCreate }: { draft: DatasetDraft; setDraft: Dispatch<SetStateAction<DatasetDraft>>; agents: AgentOption[]; onBack: () => void; onCreate: (draft: DatasetDraft) => void }) {
  const selectedAgent = agents.find((agent) => agent.id === draft.historyAgentId) ?? agents[0];
  const history = useMemo(() => {
    const days = draft.historyPreset === 'custom' ? null : Number(draft.historyPreset);
    const range = draft.historyPreset === 'custom'
      ? { start: startOfDay(draft.historyStart), end: endOfDay(draft.historyEnd) }
      : { start: startOfDay(shiftDate(TODAY, -((days ?? 7) - 1))), end: endOfDay(TODAY) };
    return historyConversations.filter((conversation) => {
      if (conversation.agentId !== draft.historyAgentId || conversation.agentVersion !== draft.historyVersion) return false;
      const stamp = dateStamp(conversation.occurredAt);
      if (stamp < range.start || stamp > range.end) return false;
      const hasFeedback = conversation.traces.some((trace) => trace.userFeedback.trim());
      return draft.historyFeedback === '全部' || (draft.historyFeedback === '有反馈' ? hasFeedback : !hasFeedback);
    });
  }, [draft.historyAgentId, draft.historyVersion, draft.historyPreset, draft.historyStart, draft.historyEnd, draft.historyFeedback]);
  const selectedHistoryCount = Object.values(draft.historySelected).filter((ids) => ids.length > 0).length;
  const historyPageCount = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const currentHistoryPage = Math.min(draft.historyPage, historyPageCount);
  const visibleHistory = history.slice((currentHistoryPage - 1) * HISTORY_PAGE_SIZE, currentHistoryPage * HISTORY_PAGE_SIZE);
  const toggleConversation = (conversation: HistoryConversation) => setDraft((current) => {
    const all = conversation.traces.map((trace) => trace.id);
    const selected = current.historySelected[conversation.id] ?? [];
    return { ...current, historySelected: { ...current.historySelected, [conversation.id]: selected.length === all.length ? [] : all } };
  });
  const toggleTrace = (conversationId: string, traceId: string) => setDraft((current) => {
    const selected = current.historySelected[conversationId] ?? [];
    const next = selected.includes(traceId) ? selected.filter((id) => id !== traceId) : [...selected, traceId];
    return { ...current, historySelected: { ...current.historySelected, [conversationId]: next } };
  });
  const canCreate = Boolean(draft.name.trim() && draft.historyAgentId && draft.historyVersion && selectedHistoryCount);
  return <div className="eval-create-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回评测集</button><Pill tone="violet">轨迹回流</Pill></div>
    <section className="eval-create-single eval-create-single--compact">
      <div className="eval-form-grid eval-dataset-basic-fields">
        <label className="eval-field"><span>评测集名称 <b>*</b></span><input maxLength={50} value={draft.name} placeholder="例如：历史会话回流集" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><small>{draft.name.length}/50</small></label>
        <label className="eval-field"><span>描述</span><textarea maxLength={200} rows={2} value={draft.description} placeholder="说明这份数据用于验证什么" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /><small>{draft.description.length}/200</small></label>
      </div>
      <div className="eval-create-section">
        <div className="eval-create-section__head"><div><span className="eval-eyebrow">TRACE REPLAY</span><h4>选择对话和 Trace</h4><p>勾选整段对话等于勾选全部 Trace，也可以只选部分 Trace。</p></div><Pill tone="green">{selectedHistoryCount} 个对话已选</Pill></div>
        <div className="eval-form-grid"><label className="eval-field"><span>Agent <b>*</b></span><select value={draft.historyAgentId} onChange={(event) => { const agent = agents.find((item) => item.id === event.target.value); setDraft((current) => ({ ...current, historyAgentId: event.target.value, historyVersion: agent?.versions[0] ?? '', historySelected: {}, historyPage: 1 })); }}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label><label className="eval-field"><span>版本 <b>*</b></span><select value={draft.historyVersion} disabled={!draft.historyAgentId} onChange={(event) => setDraft((current) => ({ ...current, historyVersion: event.target.value, historySelected: {}, historyPage: 1 }))}>{(selectedAgent?.versions ?? []).map((version) => <option key={version}>{version}</option>)}</select></label></div>
        <div className="eval-history-filterbar"><label className="eval-field"><span>日期</span><select value={draft.historyPreset} onChange={(event) => setDraft((current) => ({ ...current, historyPreset: event.target.value as HistoryDatePreset, historyPage: 1 }))}><option value="3">近 3 天</option><option value="5">近 5 天</option><option value="7">近 7 天</option><option value="30">近 30 天</option><option value="custom">自定义</option></select></label><label className="eval-field"><span>是否有反馈记录</span><select value={draft.historyFeedback} onChange={(event) => setDraft((current) => ({ ...current, historyFeedback: event.target.value as DatasetDraft['historyFeedback'], historyPage: 1 }))}><option>全部</option><option>有反馈</option><option>无反馈</option></select></label>{draft.historyPreset === 'custom' && <><label className="eval-field"><span>开始日期</span><input type="date" value={draft.historyStart} max={draft.historyEnd} onChange={(event) => setDraft((current) => ({ ...current, historyStart: event.target.value, historyPage: 1 }))} /></label><label className="eval-field"><span>结束日期</span><input type="date" value={draft.historyEnd} min={draft.historyStart} max={TODAY} onChange={(event) => setDraft((current) => ({ ...current, historyEnd: event.target.value, historyPage: 1 }))} /></label></>}</div>
        {history.length === 0 ? <EmptyState title="暂无符合条件的轨迹" description="调整 Agent、版本、日期或反馈筛选。" /> : <><div className="eval-history-list">{visibleHistory.map((conversation) => { const selected = draft.historySelected[conversation.id] ?? []; const allSelected = selected.length === conversation.traces.length; const partial = selected.length > 0 && !allSelected; const expanded = draft.historyExpanded === conversation.id; return <div className={`eval-history-item${selected.length ? ' is-selected' : ''}`} key={conversation.id}><div className="eval-history-item__head"><button type="button" className="eval-icon-button" onClick={() => setDraft((current) => ({ ...current, historyExpanded: expanded ? null : conversation.id }))} aria-label={expanded ? '收起对话' : '展开对话'}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button><input type="checkbox" checked={allSelected} ref={(element) => { if (element) element.indeterminate = partial; }} onChange={() => toggleConversation(conversation)} /><div className="eval-history-item__title"><strong>{conversation.title}</strong><span>{conversation.id} · {conversation.traces.length} 条 Trace</span></div><time>{conversation.occurredAt}</time></div>{expanded && <div className="eval-history-item__traces">{conversation.traces.map((trace) => <label key={trace.id}><input type="checkbox" checked={selected.includes(trace.id)} onChange={() => toggleTrace(conversation.id, trace.id)} /><span><strong>{trace.name} · {trace.summary}</strong><small>{trace.input}{trace.userFeedback ? ` · ${trace.userFeedback}` : ''}</small></span></label>)}</div>}</div>; })}</div><div className="eval-pagination"><span>共 {history.length} 条对话</span><div><button type="button" className="eval-page-button" disabled={currentHistoryPage <= 1} onClick={() => setDraft((current) => ({ ...current, historyPage: Math.max(1, current.historyPage - 1) }))}><ChevronLeft size={14} />上一页</button><b>{currentHistoryPage} / {historyPageCount}</b><button type="button" className="eval-page-button" disabled={currentHistoryPage >= historyPageCount} onClick={() => setDraft((current) => ({ ...current, historyPage: Math.min(historyPageCount, current.historyPage + 1) }))}>下一页<ChevronRight size={14} /></button></div></div></>}
      </div>
    </section>
    <footer className="eval-sticky-footer"><span>每个被选对话生成 1 条 Case。</span><div><button type="button" className="eval-button eval-button--ghost" onClick={onBack}>取消</button><button type="button" className="eval-button eval-button--primary" disabled={!canCreate} onClick={() => onCreate(draft)}><Check size={15} />创建评测集</button></div></footer>
  </div>;
}

type FieldEditRow = { id: string; name: string; description: string; semantic: FieldSemantic; required: boolean; existing: boolean };
type CaseEditDraft = { id?: string; values: Record<string, string>; hasFile: boolean };
type ImportPreview = { file: ParsedFile; mode: '追加数据' | '全量覆盖'; mappings: { sourceColumn: string; target: string; name: string }[] };
type TraceImportDraft = { agentId: string; version: string; feedback: '全部' | '有反馈' | '无反馈'; search: string; mode: '追加数据' | '全量覆盖'; selected: string[] };

function DatasetWorkspace({ dataset, entrySource, onBack, onNotify, onUpdateDataset, onSubmitDataset, onCopyDraft }: {
  dataset: Dataset; entrySource: 'dataset' | 'task'; onBack: () => void; onNotify: (message: string, tone?: Toast['tone']) => void;
  onUpdateDataset: (id: string, updater: (dataset: Dataset) => Dataset) => void;
  onSubmitDataset: (id: string, source: 'dataset' | 'task') => void;
  onCopyDraft: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  const [fieldMenuId, setFieldMenuId] = useState<string | null>(null);
  const [fieldEditor, setFieldEditor] = useState<FieldEditRow | null>(null);
  const [caseEditor, setCaseEditor] = useState<CaseEditDraft | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [traceEditor, setTraceEditor] = useState<TraceImportDraft | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!addMenuOpen && !exportMenuOpen && !versionDrawerOpen && !fieldMenuId) return;
    const closeMenus = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.eval-menu-anchor, .eval-column-menu-anchor')) return;
      setAddMenuOpen(false);
      setExportMenuOpen(false);
      setVersionDrawerOpen(false);
      setFieldMenuId(null);
    };
    document.addEventListener('pointerdown', closeMenus);
    return () => document.removeEventListener('pointerdown', closeMenus);
  }, [addMenuOpen, exportMenuOpen, versionDrawerOpen, fieldMenuId]);
  const editable = Boolean(dataset.draftVersionId);
  const currentStatus = editable ? '草稿' : '已提交';
  const latestSubmitted = dataset.versions.find((version) => version.status === '已提交');
  const filteredCases = dataset.cases.filter((item) => {
    const matched = !query || `${item.id} ${dataset.fields.map((field) => item.values[field.id] ?? '').join(' ')}`.toLowerCase().includes(query.toLowerCase());
    return matched;
  });
  const fieldBySemantic = (semantic: FieldSemantic) => dataset.fields.find((field) => field.semantic === semantic);

  const patchDraft = (fields: FieldDefinition[], cases: DatasetCase[], note = '草稿已更新。') => {
    if (!dataset.draftVersionId) return;
    const updatedAt = `${TODAY} 20:40`;
    onUpdateDataset(dataset.id, (current) => ({
      ...current,
      fields,
      cases,
      updatedAt,
      versions: current.versions.map((version) => version.id === current.draftVersionId ? { ...version, caseCount: cases.length, note } : version),
    }));
  };

  const openFieldEditor = (field?: FieldDefinition) => setFieldEditor(field ? { id: field.id, name: field.name, description: field.description, semantic: field.semantic, required: field.required, existing: true } : { id: `${dataset.id}-new-${dataset.fields.length + 1}`, name: '', description: '', semantic: 'Custom', required: false, existing: false });
  const saveField = () => {
    if (!fieldEditor) return;
    const name = fieldEditor.name.trim();
    if (!name) { onNotify('字段名称必填', 'warning'); return; }
    if (dataset.fields.some((field) => field.id !== fieldEditor.id && field.name.trim() === name)) { onNotify('字段名称不能重复', 'warning'); return; }
    const nextField = { id: fieldEditor.id, name, description: fieldEditor.description.trim(), semantic: fieldEditor.semantic, required: fieldEditor.semantic === 'Input' };
    const fields = fieldEditor.existing ? dataset.fields.map((field) => field.id === fieldEditor.id ? nextField : field) : [...dataset.fields, nextField];
    patchDraft(fields, dataset.cases, `维护 ${fields.length} 个字段。`);
    setFieldEditor(null);
    onNotify(fieldEditor.existing ? '字段已更新' : '字段已新增');
  };
  const deleteField = (id: string) => {
    if (dataset.fields.length <= 1) { onNotify('至少保留一个字段', 'warning'); return; }
    const field = dataset.fields.find((item) => item.id === id);
    if (!field) return;
    patchDraft(dataset.fields.filter((item) => item.id !== id), dataset.cases.map((item) => ({ ...item, values: Object.fromEntries(Object.entries(item.values).filter(([key]) => key !== id)) })), `删除字段 ${field.name}。`);
    setFieldMenuId(null);
    onNotify(`字段「${field.name}」已删除`);
  };

  const saveCase = () => {
    if (!caseEditor) return;
    const missingRequired = dataset.fields.find((field) => field.required && !caseEditor.values[field.id]?.trim());
    if (missingRequired) { onNotify(`请填写必填字段「${missingRequired.name}」`, 'warning'); return; }
    if (caseEditor.id) {
      patchDraft(dataset.fields, dataset.cases.map((item) => item.id === caseEditor.id ? { ...item, values: { ...caseEditor.values }, hasFile: caseEditor.hasFile } : item), `更新 Case ${caseEditor.id}。`);
    } else {
      const id = `CASE-NEW-${String(dataset.cases.length + 1).padStart(3, '0')}`;
      patchDraft(dataset.fields, [...dataset.cases, { id, values: { ...caseEditor.values }, source: '手动添加', createdAt: TODAY, hasFile: caseEditor.hasFile }], `手动添加 ${id}。`);
    }
    setCaseEditor(null);
    onNotify('Case 已保存到当前草稿');
  };

  const deleteCase = (id: string) => {
    patchDraft(dataset.fields, dataset.cases.filter((item) => item.id !== id), `删除 Case ${id}。`);
    onNotify(`${id} 已从当前草稿删除`);
  };

  const chooseImportFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = await parseFile(file);
      setImportPreview({
        file: parsed,
        mode: '追加数据',
        mappings: parsed.columns.map((column) => {
          const matched = dataset.fields.find((field) => normalizeHeader(field.name) === normalizeHeader(column));
          return { sourceColumn: column, target: matched?.id ?? 'new', name: column };
        }),
      });
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '文件解析失败', 'warning');
    }
  };

  const confirmImport = () => {
    if (!importPreview) return;
    const fields = [...dataset.fields];
    const newFields: FieldDefinition[] = [];
    const usedNames = new Set(dataset.fields.map((field) => field.name.trim()));
    for (const mapping of importPreview.mappings) {
      if (mapping.target !== 'new') continue;
      const name = mapping.name.trim();
      if (!name) { onNotify('新增字段名称必填', 'warning'); return; }
      if (usedNames.has(name)) { onNotify(`字段名称「${name}」重复`, 'warning'); return; }
      usedNames.add(name);
      const semantic = inferSemantic(name);
      newFields.push({ id: `${dataset.id}-import-${newFields.length + 1}`, name, semantic, description: FIELD_DESCRIPTIONS[semantic], required: semantic === 'Input' });
    }
    const allFields = [...fields, ...newFields];
    const rows = importPreview.file.rows.map((row, index) => ({
      id: `CASE-IMPORT-${String(dataset.cases.length + index + 1).padStart(3, '0')}`,
      values: Object.fromEntries(importPreview.mappings.map((mapping) => {
        const target = mapping.target === 'new' ? newFields.find((field) => field.name === mapping.name.trim()) : allFields.find((field) => field.id === mapping.target);
        return [target?.id ?? '', row[mapping.sourceColumn] ?? ''];
      }).filter(([id]) => Boolean(id))),
      source: '用户上传' as const,
      createdAt: TODAY,
      hasFile: false,
    }));
    const cases = importPreview.mode === '全量覆盖' ? rows : [...dataset.cases, ...rows];
    patchDraft(allFields, cases, `${importPreview.mode} ${rows.length} 条本地数据。`);
    setImportPreview(null);
    onNotify(`${importPreview.mode}成功，共 ${rows.length} 条 Case`);
  };

  const filteredHistory = historyConversations.filter((conversation) => {
    if (traceEditor && (conversation.agentId !== traceEditor.agentId || conversation.agentVersion !== traceEditor.version)) return false;
    const feedback = conversation.traces.some((trace) => trace.userFeedback.trim());
    const feedbackMatched = !traceEditor || traceEditor.feedback === '全部' || (traceEditor.feedback === '有反馈' ? feedback : !feedback);
    const searchMatched = !traceEditor?.search || `${conversation.title} ${conversation.id}`.toLowerCase().includes(traceEditor.search.toLowerCase());
    return feedbackMatched && searchMatched;
  });
  const confirmTraceImport = () => {
    if (!traceEditor) return;
    if (!traceEditor.selected.length) { onNotify('请至少选择 1 条对话', 'warning'); return; }
    const selected = historyConversations.filter((conversation) => traceEditor.selected.includes(conversation.id));
    const inputField = fieldBySemantic('Input');
    const actualField = fieldBySemantic('Agent Output');
    const traceField = fieldBySemantic('Trace');
    const feedbackField = fieldBySemantic('User Feedback');
    const cases = selected.map((conversation, index) => ({
      id: `CASE-TRACE-${String(dataset.cases.length + index + 1).padStart(3, '0')}`,
      values: Object.fromEntries([
        inputField && [inputField.id, conversation.traces[0]?.input ?? conversation.title],
        actualField && [actualField.id, conversation.traces.at(-1)?.agentOutput ?? ''],
        traceField && [traceField.id, conversation.traces.map((trace) => `trace://${trace.id}`).join(' / ')],
        feedbackField && [feedbackField.id, conversation.traces.map((trace) => trace.userFeedback).filter(Boolean).join('；')],
      ].filter(Boolean) as [string, string][]),
      source: '历史对话回流' as const,
      createdAt: TODAY,
      hasFile: false,
    }));
    const nextCases = traceEditor.mode === '全量覆盖' ? cases : [...dataset.cases, ...cases];
    patchDraft(dataset.fields, nextCases, `${traceEditor.mode} ${cases.length} 条轨迹数据。`);
    setTraceEditor(null);
    onNotify(`${traceEditor.mode}成功，共 ${cases.length} 条 Case`);
  };

  const downloadVersion = (label: string, fields: FieldDefinition[], cases: DatasetCase[]) => {
    const escapeCell = (value: string) => `"${value.replaceAll('"', '""').replaceAll(/\r?\n/g, ' ')}"`;
    const csv = [[...fields.map((field) => field.name), '来源', '更新时间'], ...cases.map((item) => [...fields.map((field) => item.values[field.id] ?? ''), item.source, item.createdAt])].map((row) => row.map((cell) => escapeCell(String(cell))).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${dataset.name}-${label}.csv`; link.click(); URL.revokeObjectURL(url);
    onNotify(`${label} 已按字段并集导出`);
  };

  return <div className="eval-dataset-detail">
    <div className="eval-page-topline">
      <button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />{entrySource === 'task' ? '返回任务创建' : '返回评测集'}</button>
      <div className="eval-dataset-detail__context"><Status label={currentStatus} /><span>{entrySource === 'task' ? '来自评测任务创建' : `${dataset.source} · ${dataset.id}`}</span></div>
    </div>
    <header className="eval-dataset-detail__hero">
      <div>
        <h1>{dataset.name}</h1>
        <p>{dataset.description || '暂无描述'}</p>
      </div>
    </header>

    <section className="eval-dataset-detail__controls">
      <div className="eval-dataset-detail__toolbar">
        <div className="eval-dataset-detail__toolbar-left">
          <label className="eval-search eval-search--small"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Case" /></label>
        </div>
        <div className="eval-dataset-detail__toolbar-right">
          <div className="eval-menu-anchor">
            <button type="button" className="eval-button eval-button--ghost" onClick={() => setExportMenuOpen((current) => !current)}><Download size={14} />导出数据<ChevronDown size={13} /></button>
            {exportMenuOpen && <div className="eval-inline-menu">
              {editable && <button type="button" onClick={() => { setExportMenuOpen(false); downloadVersion('草稿', dataset.fields, dataset.cases); }}><Download size={14} />导出当前草稿</button>}
              {latestSubmitted && <button type="button" onClick={() => { setExportMenuOpen(false); downloadVersion(latestSubmitted.label, latestSubmitted.data?.fields ?? dataset.fields, latestSubmitted.data?.cases ?? dataset.cases); }}><Download size={14} />导出 {latestSubmitted.label}</button>}
            </div>}
          </div>
          <div className="eval-menu-anchor">
            <button type="button" className="eval-button eval-button--ghost" disabled={!editable} onClick={() => setAddMenuOpen((current) => !current)}><Plus size={14} />添加数据<ChevronDown size={13} /></button>
            {addMenuOpen && editable && <div className="eval-inline-menu">
              <button type="button" onClick={() => { setAddMenuOpen(false); setCaseEditor({ values: Object.fromEntries(dataset.fields.map((field) => [field.id, ''])), hasFile: false }); }}><Plus size={14} />手动添加</button>
              <button type="button" onClick={() => { setAddMenuOpen(false); importInputRef.current?.click(); }}><Upload size={14} />本地文件导入</button>
              <button type="button" onClick={() => { setAddMenuOpen(false); setTraceEditor({ agentId: dataset.source === '历史对话回流' ? 'agent-refund' : 'agent-refund', version: 'V3', feedback: '全部', search: '', mode: '追加数据', selected: [] }); }}><History size={14} />轨迹回流</button>
            </div>}
          </div>
          {editable ? (
            <button type="button" className="eval-button eval-button--primary" onClick={() => onSubmitDataset(dataset.id, entrySource)}>
              <Check size={14} />{entrySource === 'task' ? '提交并用于评测' : '提交新版本'}
            </button>
          ) : (
            <button type="button" className="eval-button eval-button--primary" onClick={() => onCopyDraft(dataset.id)}><Copy size={14} />复制为草稿</button>
          )}
          <div className="eval-menu-anchor">
            <IconButton label="版本管理" onClick={() => setVersionDrawerOpen((current) => !current)}><MoreHorizontal size={17} /></IconButton>
            {versionDrawerOpen && <section className="eval-version-popover">
              <header><div><h2>版本管理</h2><p>按提交顺序查看冻结数据；任务只使用已提交版本。</p></div><IconButton label="关闭版本管理" onClick={() => setVersionDrawerOpen(false)}><X size={16} /></IconButton></header>
              <div>{[...dataset.versions].reverse().map((version) => <article className="eval-dataset-version-card" key={version.id}>
                <div><strong>{version.label}</strong><Status label={version.status} /></div>
                <p>{version.note}</p>
                <small>{version.createdAt} · {version.createdBy} · {version.caseCount} 条 Case</small>
                {version.status === '已提交' && <button type="button" className="eval-button eval-button--ghost" onClick={() => downloadVersion(version.label, version.data?.fields ?? dataset.fields, version.data?.cases ?? dataset.cases)}><Download size={14} />导出</button>}
              </article>)}</div>
            </section>}
          </div>
        </div>
      </div>
    </section>

    <section className="eval-surface eval-dataset-detail__panel">
      <div className="eval-dataset-detail__table-wrap">
        <table className="eval-dataset-detail__table">
          <thead><tr>
            <th className="is-id">ID</th>
            {dataset.fields.map((field) => <th key={field.id}><div className="eval-dataset-detail__column-head"><span title={`${field.name} · ${field.description}`}>{field.name}</span>{field.semantic === 'Trace' && <i className="eval-dataset-detail__trace">轨迹</i>}{editable && <div className="eval-column-menu-anchor"><button type="button" className="eval-column-menu-trigger" aria-label={`管理字段 ${field.name}`} onClick={() => setFieldMenuId((current) => current === field.id ? null : field.id)}><ChevronDown size={14} /></button>{fieldMenuId === field.id && <div className="eval-column-menu"><button type="button" onClick={() => { setFieldMenuId(null); openFieldEditor(field); }}><Settings2 size={14} />编辑</button><button type="button" onClick={() => deleteField(field.id)}><Trash2 size={14} />删除列</button></div>}</div>}</div></th>)}
            <th className="is-actions">操作</th>
          </tr></thead>
          <tbody>
            {filteredCases.map((item) => <tr key={item.id}>
              <td className="is-id"><span className="eval-case-chip">#{item.id}</span></td>
              {dataset.fields.map((field) => <td key={field.id} title={item.values[field.id] || ''}>{item.values[field.id] || <em>未采集</em>}</td>)}
              <td className="is-actions">
                {editable ? <>
                  <button type="button" className="eval-text-button" onClick={() => setCaseEditor({ id: item.id, values: { ...item.values }, hasFile: Boolean(item.hasFile) })}>编辑</button>
                  <button type="button" className="eval-text-button" onClick={() => onNotify(`${item.id} 详情已打开`)}>查看</button>
                  <IconButton label={`删除 ${item.id}`} onClick={() => deleteCase(item.id)}><Trash2 size={14} /></IconButton>
                </> : <button type="button" className="eval-text-button" onClick={() => onNotify(`${item.id} 详情已打开`)}>查看</button>}
              </td>
            </tr>)}
          </tbody>
        </table>
        {filteredCases.length === 0 && <EmptyState title="没有匹配的数据" description="调整搜索或过滤条件。" />}
      </div>
      <input ref={importInputRef} type="file" accept=".csv,.xls,.xlsx,.jsonl" hidden onChange={(event) => { void chooseImportFile(event.target.files?.[0]); event.target.value = ''; }} />
    </section>

    {fieldEditor && <div className="eval-overlay" onClick={() => setFieldEditor(null)}>
      <section className="eval-modal" onClick={(event) => event.stopPropagation()}>
        <header className="eval-modal__header"><div><h2>{fieldEditor.existing ? '编辑数据列' : '新增数据列'}</h2><p>字段名称必须唯一，字段语义用于创建任务时绑定。</p></div><IconButton label="关闭字段编辑" onClick={() => setFieldEditor(null)}><X size={16} /></IconButton></header>
        <div className="eval-modal__body eval-dataset-edit-list">
          <label className="eval-field"><span>字段名称 <b>*</b></span><input autoFocus value={fieldEditor.name} onChange={(event) => setFieldEditor({ ...fieldEditor, name: event.target.value })} /></label>
          <label className="eval-field"><span>字段描述</span><textarea rows={2} value={fieldEditor.description} onChange={(event) => setFieldEditor({ ...fieldEditor, description: event.target.value })} /></label>
          <label className="eval-field"><span>字段语义</span><select value={fieldEditor.semantic} onChange={(event) => setFieldEditor({ ...fieldEditor, semantic: event.target.value as FieldSemantic, required: event.target.value === 'Input' })}>{FIELD_SEMANTICS.map((semantic) => <option key={semantic} value={semantic}>{semantic}</option>)}</select></label>
          {!fieldEditor.existing && <p className="eval-detail-footnote">新增列对已有 Case 默认为空。</p>}
        </div>
        <footer className="eval-modal__footer"><button type="button" className="eval-button eval-button--ghost" onClick={() => setFieldEditor(null)}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={saveField}>{fieldEditor.existing ? '保存修改' : '新增列'}</button></footer>
      </section>
    </div>}

    {caseEditor && <div className="eval-overlay" onClick={() => setCaseEditor(null)}>
      <section className="eval-modal" onClick={(event) => event.stopPropagation()}>
        <header className="eval-modal__header"><div><h2>{caseEditor.id ? `编辑 ${caseEditor.id}` : '手动添加 Case'}</h2><p>保存后写入当前草稿，不影响已提交版本。</p></div><IconButton label="关闭 Case 编辑" onClick={() => setCaseEditor(null)}><X size={16} /></IconButton></header>
        <div className="eval-modal__body eval-dataset-edit-list">
          {dataset.fields.map((field) => <label className="eval-field" key={field.id}>
            <span>{field.name}{field.required && <b>*</b>}</span>
            {field.semantic === 'File' ? <span className="eval-file-field"><input value={caseEditor.values[field.id] ?? ''} placeholder="填写文件 URL，或上传本地文件" onChange={(event) => setCaseEditor({ ...caseEditor, values: { ...caseEditor.values, [field.id]: event.target.value } })} /><span><input type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) setCaseEditor({ ...caseEditor, values: { ...caseEditor.values, [field.id]: file.name }, hasFile: true }); }} /></span></span> : <textarea rows={field.semantic === 'Trace' ? 2 : 2} value={caseEditor.values[field.id] ?? ''} onChange={(event) => setCaseEditor({ ...caseEditor, values: { ...caseEditor.values, [field.id]: event.target.value } })} />}
          </label>)}
        </div>
        <footer className="eval-modal__footer"><button type="button" className="eval-button eval-button--ghost" onClick={() => setCaseEditor(null)}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={saveCase}>保存 Case</button></footer>
      </section>
    </div>}

    {importPreview && <div className="eval-overlay" onClick={() => setImportPreview(null)}>
      <section className="eval-modal eval-modal--wide" onClick={(event) => event.stopPropagation()}>
        <header className="eval-modal__header"><div><h2>本地文件导入</h2><p>{importPreview.file.name} · {importPreview.file.rows.length} 条待写入数据</p></div><IconButton label="关闭导入预览" onClick={() => setImportPreview(null)}><X size={16} /></IconButton></header>
        <div className="eval-modal__body">
          <div className="eval-import-mode"><label><input type="radio" checked={importPreview.mode === '追加数据'} onChange={() => setImportPreview({ ...importPreview, mode: '追加数据' })} /><span><strong>追加数据</strong><small>保留已有 Case，新增本次数据。</small></span></label><label><input type="radio" checked={importPreview.mode === '全量覆盖'} onChange={() => setImportPreview({ ...importPreview, mode: '全量覆盖' })} /><span><strong>全量覆盖</strong><small>清空当前草稿 Case 后写入。</small></span></label></div>
          <div className="eval-import-mapping">
            <div><span>导入列</span><span>写入字段</span><span>新字段名称</span></div>
            {importPreview.mappings.map((mapping, index) => <div key={mapping.sourceColumn}>
              <strong>{mapping.sourceColumn}</strong>
              <select value={mapping.target} onChange={(event) => setImportPreview({ ...importPreview, mappings: importPreview.mappings.map((item, itemIndex) => itemIndex === index ? { ...item, target: event.target.value } : item) })}>{dataset.fields.map((field) => <option key={field.id} value={field.id}>映射到 {field.name}</option>)}<option value="new">添加为新字段</option></select>
              {mapping.target === 'new' ? <input value={mapping.name} onChange={(event) => setImportPreview({ ...importPreview, mappings: importPreview.mappings.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} /> : <span>沿用字段定义</span>}
            </div>)}
          </div>
        </div>
        <footer className="eval-modal__footer"><button type="button" className="eval-button eval-button--ghost" onClick={() => setImportPreview(null)}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={confirmImport}>确认写入草稿</button></footer>
      </section>
    </div>}

    {traceEditor && <div className="eval-overlay" onClick={() => setTraceEditor(null)}>
      <section className="eval-modal" onClick={(event) => event.stopPropagation()}>
        <header className="eval-modal__header"><div><h2>轨迹回流</h2><p>选择对话记录后写入当前草稿。</p></div><IconButton label="关闭轨迹回流" onClick={() => setTraceEditor(null)}><X size={16} /></IconButton></header>
        <div className="eval-modal__body">
          <div className="eval-trace-import-filters">
            <select value={traceEditor.agentId} onChange={(event) => setTraceEditor({ ...traceEditor, agentId: event.target.value, selected: [] })}>{['agent-refund', 'agent-tender', 'agent-research'].map((id) => <option key={id} value={id}>{id === 'agent-refund' ? '退款客服助手' : id === 'agent-tender' ? '招标文件评估助手' : '网页研究助手'}</option>)}</select>
            <select value={traceEditor.version} onChange={(event) => setTraceEditor({ ...traceEditor, version: event.target.value, selected: [] })}>{['V3', 'V2', 'V1'].map((version) => <option key={version}>{version}</option>)}</select>
            <select value={traceEditor.feedback} onChange={(event) => setTraceEditor({ ...traceEditor, feedback: event.target.value as TraceImportDraft['feedback'] })}>{['全部', '有反馈', '无反馈'].map((item) => <option key={item}>{item}</option>)}</select>
            <input value={traceEditor.search} placeholder="搜索对话" onChange={(event) => setTraceEditor({ ...traceEditor, search: event.target.value })} />
          </div>
          <div className="eval-trace-import-list">{filteredHistory.map((conversation) => <label key={conversation.id}><input type="checkbox" checked={traceEditor.selected.includes(conversation.id)} onChange={() => setTraceEditor({ ...traceEditor, selected: traceEditor.selected.includes(conversation.id) ? traceEditor.selected.filter((id) => id !== conversation.id) : [...traceEditor.selected, conversation.id] })} /><span><strong>{conversation.title}</strong><small>{conversation.occurredAt} · {conversation.traces.length} 条 Trace</small></span></label>)}</div>
          <div className="eval-import-mode"><label><input type="radio" checked={traceEditor.mode === '追加数据'} onChange={() => setTraceEditor({ ...traceEditor, mode: '追加数据' })} /><span><strong>追加数据</strong><small>保留已有 Case。</small></span></label><label><input type="radio" checked={traceEditor.mode === '全量覆盖'} onChange={() => setTraceEditor({ ...traceEditor, mode: '全量覆盖' })} /><span><strong>全量覆盖</strong><small>清空当前草稿 Case 后写入。</small></span></label></div>
        </div>
        <footer className="eval-modal__footer"><button type="button" className="eval-button eval-button--ghost" onClick={() => setTraceEditor(null)}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={confirmTraceImport}>确认写入草稿</button></footer>
      </section>
    </div>}
  </div>;
}

function EvaluatorList({ evaluators, kind, setKind, mode, setMode, search, setSearch, scoreFilter, setScoreFilter, onCreate, onOpen, onCopy }: { evaluators: Evaluator[]; kind: EvaluatorKind; setKind: (kind: EvaluatorKind) => void; mode: EvaluatorMode; setMode: (mode: EvaluatorMode) => void; search: string; setSearch: (value: string) => void; scoreFilter: string; setScoreFilter: (value: string) => void; onCreate: () => void; onOpen: (evaluator: Evaluator) => void; onCopy: (evaluator: Evaluator) => void }) {
  return <div className="eval-list-page"><div className="eval-evaluator-tabs">{(['模型评估器', '代码评估', '人工评估'] as EvaluatorKind[]).map((item) => <button type="button" key={item} className={kind === item ? 'is-active' : ''} onClick={() => setKind(item)}>{item}</button>)}</div><div className="eval-toolbar"><label className="eval-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索评估器名称" /></label><select value={mode} onChange={(event) => setMode(event.target.value as EvaluatorMode)}><option value="preset">预置评估器</option><option value="custom">自建评估器</option></select><select value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)}><option>全部结果类型</option><option>通过 / 不通过</option><option>0-1 数值</option></select><button type="button" className="eval-button eval-button--primary" onClick={onCreate}><Plus size={16} />新建自建评估器</button></div><div className="eval-evaluator-grid">{evaluators.map((evaluator) => <article className="eval-evaluator-card" key={evaluator.id} role="button" tabIndex={0} onClick={() => onOpen(evaluator)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(evaluator); } }}><h3>{evaluator.name}</h3><p>{evaluator.description}</p><div className="eval-evaluator-meta"><Pill tone={evaluator.mode === 'preset' ? 'violet' : 'neutral'}>{evaluator.mode === 'preset' ? '预置' : '自建'}</Pill><Pill>{evaluator.scoreType === 'numeric' ? '0-1 数值评分' : '通过 / 不通过'}</Pill><span>{evaluator.scoreType === 'numeric' ? `通过阈值 ${evaluator.passThreshold?.toFixed(2) ?? '未设置'}` : `${evaluator.variables.length} 个输入语义`}</span></div><div className="eval-evaluator-variables">{evaluator.variables.map((variable) => <FieldBadge key={`${evaluator.id}-${variable.name}`} semantic={variable.semantic} required={variable.required} />)}</div><footer><span>{evaluator.updatedAt}</span>{evaluator.mode === 'preset' && <IconButton label={`复制 ${evaluator.name}`} onClick={(event) => { event.stopPropagation(); onCopy(evaluator); }}><Copy size={14} /></IconButton>}</footer></article>)}</div>{evaluators.length === 0 && <EmptyState title="没有匹配的评估器" description="调整筛选条件，或创建一个自建评估器。" />}</div>;
}

function EvaluatorDetail({ evaluator, onBack, onCopy, onEdit }: { evaluator: Evaluator; onBack: () => void; onCopy: () => void; onEdit: () => void }) {
  const [expandedPrompt, setExpandedPrompt] = useState(false);
  return <div className="eval-detail-page eval-evaluator-detail-page"><div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回评估器</button></div><div className="eval-evaluator-detail-intro"><div><span className="eval-eyebrow">{evaluator.category}</span><h2>{evaluator.name}</h2><p>{evaluator.description}</p></div><div className="eval-detail-hero__actions"><Pill tone={evaluator.mode === 'preset' ? 'violet' : 'neutral'}>{evaluator.mode === 'preset' ? '预置' : '自建'}</Pill>{evaluator.mode === 'preset' ? <button type="button" className="eval-button eval-button--primary" onClick={onCopy}><Copy size={14} />复制为自建</button> : <button type="button" className="eval-button eval-button--primary" onClick={onEdit}><Settings2 size={14} />编辑并生成新版本</button>}</div></div><div className="eval-evaluator-detail-meta"><div><span>结果类型</span><strong>{evaluator.scoreType === 'numeric' ? '0-1 数值评分' : '通过 / 不通过'}</strong></div><div><span>通过阈值</span><strong>{evaluator.scoreType === 'numeric' ? (evaluator.passThreshold?.toFixed(2) ?? '未设置') : '直接判断'}</strong></div><div><span>评估模型</span><strong>{evaluator.model}</strong></div><div><span>累计运行</span><strong>{evaluator.runCount}</strong></div><div><span>输入变量</span><strong>{evaluator.variables.length} 个</strong></div></div><section className={`eval-evaluator-prompt-card${expandedPrompt ? ' is-expanded' : ''}`}><div className="eval-evaluator-prompt-head"><div><span className="eval-eyebrow">PROMPT</span><h3>评估规则</h3></div><div className="eval-prompt-actions"><IconButton label={expandedPrompt ? '收起 Prompt' : '放大 Prompt'} onClick={() => setExpandedPrompt((current) => !current)}><Maximize2 size={15} /></IconButton><IconButton label="复制 Prompt" onClick={() => { void navigator.clipboard?.writeText(evaluator.prompt); }}><Copy size={15} /></IconButton></div></div><div className="eval-prompt-system">System</div><pre className="eval-evaluator-prompt">{evaluator.prompt}</pre><div className="eval-evaluator-variables-bar"><span>Variables</span>{evaluator.variables.map((variable) => <strong key={variable.name}>{variable.name}</strong>)}</div></section></div>;
}

function PromptEditor({ prompt, onChange }: { prompt: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestStart, setSuggestStart] = useState(0);
  const [suggestQuery, setSuggestQuery] = useState('');
  const builtins: FieldSemantic[] = FIELD_SEMANTICS.filter((semantic) => semantic !== 'Custom' && semantic !== 'File');

  const syncSuggestions = (value: string, cursor: number) => {
    const before = value.slice(0, cursor);
    const start = before.lastIndexOf('{{');
    if (start === -1 || before.indexOf('}}', start + 2) !== -1) {
      setSuggestOpen(false); setSuggestQuery(''); return;
    }
    setSuggestStart(start);
    setSuggestQuery(value.slice(start + 2, cursor));
    setSuggestOpen(true);
  };

  const insertVariable = (name: string) => {
    const cursor = ref.current?.selectionStart ?? prompt.length;
    const next = `${prompt.slice(0, suggestStart)}{{${name}}}${prompt.slice(cursor)}`;
    onChange(next);
    setSuggestOpen(false);
    requestAnimationFrame(() => {
      const caret = suggestStart + name.length + 4;
      ref.current?.focus();
      ref.current?.setSelectionRange(caret, caret);
    });
  };

  const customName = suggestQuery.trim();
  const showCustom = Boolean(customName) && !builtins.includes(customName as FieldSemantic);

  return (
    <div className="eval-prompt-editor-wrap">
      <textarea
        ref={ref}
        className="eval-prompt-input"
        spellCheck={false}
        value={prompt}
        placeholder="输入评估规则，输入 {{ 插入字段变量，也可以直接输入自定义变量名。"
        onChange={(event) => {
          const value = event.target.value;
          onChange(value);
          syncSuggestions(value, event.target.selectionStart ?? value.length);
        }}
        onBlur={() => setSuggestOpen(false)}
        onKeyDown={(event) => { if (suggestOpen && event.key === 'Escape') { event.preventDefault(); setSuggestOpen(false); } }}
      />
      {suggestOpen && (
        <div className="eval-variable-suggestions">
          <span>插入变量</span>
          {showCustom && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertVariable(customName)}><Braces size={11} />自定义：{customName}</button>}
          {builtins.map((semantic) => <button type="button" key={semantic} onMouseDown={(event) => event.preventDefault()} onClick={() => insertVariable(semantic)}><Braces size={11} /><span><strong>{semantic}</strong><small>{FIELD_DESCRIPTIONS[semantic]}</small></span></button>)}
        </div>
      )}
    </div>
  );
}

function EvaluatorEditor({ draft, setDraft, editing = false, onBack, onCreate }: { draft: EvaluatorDraft; setDraft: Dispatch<SetStateAction<EvaluatorDraft>>; editing?: boolean; onBack: () => void; onCreate: () => void }) {
  const promptVariables = extractPromptVariables(draft.prompt);
  const jsonReady = draft.prompt.includes('只返回 JSON');
  return (
    <div className="eval-create-page">
      <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回评估器</button></div>
      <section className="eval-create-single eval-create-single--compact">
        <div className="eval-form-grid eval-dataset-basic-fields">
          <label className="eval-field"><span>评估器名称 <b>*</b></span><input autoFocus maxLength={50} value={draft.name} placeholder="例如：客服回答相关性" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><small>{draft.name.length}/50</small></label>
          <label className="eval-field"><span>描述</span><textarea maxLength={200} rows={2} value={draft.description} placeholder="说明这条评估器判断什么" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /><small>{draft.description.length}/200</small></label>
        </div>
        <div className="eval-form-grid eval-evaluator-option-fields">
          <label className="eval-field"><span>评估模型</span><select value={draft.model} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}><option>Doubao-Seed-1.6</option><option>Doubao-Seed-1.6-flash</option><option>GPT-5.6</option></select></label>
          <label className="eval-field"><span>结果类型</span><select value={draft.scoreType} onChange={(event) => setDraft((current) => ({ ...current, scoreType: event.target.value as ScoreType }))}><option value="numeric">0-1 数值评分</option><option value="pass_fail">通过 / 不通过</option></select></label>
          {draft.scoreType === 'numeric' && <label className="eval-field eval-threshold-field"><span>通过阈值 <b>*</b></span><div className="eval-threshold-control"><input aria-label="通过阈值" type="range" min="0" max="1" step="0.01" value={draft.passThreshold} onChange={(event) => setDraft((current) => ({ ...current, passThreshold: Number(event.target.value) }))} /><strong>{draft.passThreshold.toFixed(2)}</strong></div><small>得分达到该值时判定为通过，阈值不写入 Prompt。</small></label>}
        </div>
        <div className="eval-create-section">
          <section className="eval-evaluator-prompt-card">
            <div className="eval-evaluator-prompt-head"><div><span className="eval-eyebrow">PROMPT</span><h3>评估规则</h3></div></div>
            <div className="eval-prompt-system">System</div>
            <PromptEditor prompt={draft.prompt} onChange={(value) => setDraft((current) => ({ ...current, prompt: value }))} />
            <div className="eval-evaluator-variables-bar"><span>Variables</span>{promptVariables.length ? promptVariables.map((variable) => <strong key={variable.name}>{variable.name}{variable.semantic === 'Custom' ? ' · 手动绑定' : ''}</strong>) : <em>在 Prompt 中输入 {'{{'} 插入字段变量</em>}</div>
          </section>
          <div className={`eval-prompt-check ${jsonReady ? 'is-ok' : 'is-warning'}`}>{jsonReady ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}{jsonReady ? 'JSON 输出约束已配置' : '保存前需要补充“只返回 JSON”约束'}</div>
        </div>
      </section>
      <footer className="eval-sticky-footer"><span>{editing ? '保存后生成新版本，不覆盖历史版本。' : '保存后生成版本 0.0.1。'}</span><div><button type="button" className="eval-button eval-button--ghost" onClick={onBack}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={onCreate}><Check size={15} />{editing ? '保存并生成新版本' : '创建评估器'}</button></div></footer>
    </div>
  );
}

function EvaluationTaskTable({ tasks, datasets, evaluators = [], selectable = false, controlTaskId = '', lockedControl = false, experimentTaskIds = [], onOpen, onSetControl, onToggleExperiment }: {
  tasks: EvaluationTask[];
  datasets: Dataset[];
  evaluators?: Evaluator[];
  selectable?: boolean;
  controlTaskId?: string;
  lockedControl?: boolean;
  experimentTaskIds?: string[];
  onOpen?: (task: EvaluationTask) => void;
  onSetControl?: (id: string) => void;
  onToggleExperiment?: (id: string) => void;
}) {
  const datasetName = (id: string) => datasets.find((item) => item.id === id)?.name ?? id;
  const evaluatorNames = (task: EvaluationTask) => task.evaluatorIds.map((id) => evaluators.find((item) => item.id === id)?.name ?? id);
  return <table className="eval-data-table">
    <thead><tr>{selectable && <><th>对照组</th><th>实验组</th></>}<th>任务名称</th><th>任务状态</th><th>评测对象</th><th>评测集</th><th>评估器</th><th>创建时间</th><th>操作</th></tr></thead>
    <tbody>{tasks.map((task) => {
      const isControl = task.id === controlTaskId;
      const isExperiment = experimentTaskIds.includes(task.id);
      return <tr key={task.id} className={isControl ? 'is-control-selected' : isExperiment ? 'is-experiment-selected' : ''} onClick={() => onOpen?.(task)}>
        {selectable && <>
          <td><input type="radio" name="comparison-control-task" checked={isControl} disabled={lockedControl && !isControl} onChange={() => onSetControl?.(task.id)} aria-label={`设为对照组 ${task.name}`} /></td>
          <td><input type="checkbox" checked={isExperiment} disabled={isControl} onChange={() => onToggleExperiment?.(task.id)} aria-label={`选择实验组 ${task.name}`} /></td>
        </>}
        <td><div className="eval-cell-title"><strong>{task.name}</strong><small>{task.id}</small></div></td>
        <td><Status label={task.status} /></td>
        <td><div className="eval-cell-title"><strong>{task.agent}</strong><small>{task.agentVersion}</small></div></td>
        <td><div className="eval-cell-title"><strong>{datasetName(task.datasetId)}</strong><small>{task.datasetVersion}</small></div></td>
        <td><div className="eval-cell-pills">{evaluatorNames(task).map((name) => <span key={name}>{name}</span>)}</div></td>
        <td>{task.createdAt.slice(0, 10)}</td>
        <td><IconButton label="打开任务" onClick={(event) => { event.stopPropagation(); onOpen?.(task); }}><Eye size={15} /></IconButton></td>
      </tr>;
    })}</tbody>
  </table>;
}

function TaskList({ tasks, datasets, evaluators, comparisons, search, setSearch, tab, setTab, onCreate, onCreateComparison, onOpen, onOpenComparison }: { tasks: EvaluationTask[]; datasets: Dataset[]; evaluators: Evaluator[]; comparisons: ComparisonRecord[]; search: string; setSearch: (value: string) => void; tab: TaskTab; setTab: (tab: TaskTab) => void; onCreate: () => void; onCreateComparison: () => void; onOpen: (task: EvaluationTask) => void; onOpenComparison: (item: ComparisonRecord) => void }) {
  const filtered = tasks.filter((task) => !search || `${task.name} ${task.agent}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="eval-list-page">
    <div className="eval-task-tabs">{(['list', 'compare'] as TaskTab[]).map((item) => <button type="button" key={item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>{item === 'list' ? '任务列表' : '对比实验'}</button>)}</div>
    {tab === 'list' && <>
      <div className="eval-toolbar"><label className="eval-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务名称或 Agent" /></label><button type="button" className="eval-button eval-button--primary" onClick={onCreate}><Plus size={16} />新建评测任务</button></div>
      <section className="eval-surface table-surface">
        <EvaluationTaskTable tasks={filtered} datasets={datasets} evaluators={evaluators} onOpen={onOpen} />
      </section>
      {filtered.length === 0 && <EmptyState title="没有匹配的评测任务" description="调整搜索条件。" />}
    </>}
    {tab === 'compare' && <section className="eval-record-page">
      <div className="eval-section-head"><div><span className="eval-eyebrow">COMPARISON</span><h2>对比实验</h2><p>基于同一评测集，对已经完成的评测任务进行数据对比。</p></div><button type="button" className="eval-button eval-button--primary" onClick={onCreateComparison}><Plus size={15} />创建对比实验</button></div>
      <section className="eval-surface table-surface">
        <table className="eval-data-table">
          <thead><tr><th>对比名称</th><th>对照组</th><th>实验组</th><th>评测集</th><th>Case 对比</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>{comparisons.map((item) => <tr key={item.id} onClick={() => onOpenComparison(item)}>
            <td><strong>{item.name}</strong></td>
            <td>{item.taskRefs.find((task) => task.role === '对照组')?.label}</td>
            <td><div className="eval-cell-pills">{item.taskRefs.filter((task) => task.role === '实验组').map((task) => <span key={task.taskId}>{task.name}</span>)}</div></td>
            <td>{item.dataset}</td>
            <td><div className="eval-cell-pills"><span>有差异 {item.differentCases}</span><span>一致 {item.sameCases}</span><span>无法比较 {item.incomparableCases}</span></div></td>
            <td><Status label={item.status} /></td>
            <td><IconButton label="查看对比结果" onClick={() => onOpenComparison(item)}><Eye size={15} /></IconButton></td>
          </tr>)}</tbody>
        </table>
      </section>
      {comparisons.length === 0 && <EmptyState title="暂无对比实验" description="从同一评测集的已完成任务中选择对照组和实验组。" />}
    </section>}
  </div>;
}

function ConfigCompare({ experiment }: { experiment: OptimizeExperiment }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const labels: Record<string, string> = { system_prompt: '系统提示词', tools: '工具描述', skills: 'Skill 内容' };
  const sections = experiment.result.changes.map((change) => ({
    ...change,
    label: labels[change.target] ?? change.target,
  }));
  if (!sections.length) return <EmptyState title="没有可直接修改的配置" description="本次只展示不能自动修改的问题建议。" />;
  return <div className="eval-config-compare">
    {sections.map((section) => <div key={section.target}>
      <section className="eval-config-compare__row">
        <div className="eval-config-compare__label"><strong>{section.label}</strong></div>
        <div className="eval-config-compare__side"><span>优化前</span><pre>{section.before || '未采集'}</pre></div>
        <div className="eval-config-compare__side is-after"><span>优化后</span><pre>{section.after || '未采集'}</pre></div>
        <IconButton label={expanded === section.target ? '收起修改详情' : '查看修改详情'} onClick={() => setExpanded((current) => current === section.target ? null : section.target)}><ChevronDown size={15} /></IconButton>
      </section>
      {expanded === section.target && <div className="eval-config-compare__details"><div><span>修改原因</span><p>{section.reason}</p></div><div><span>关联 Case</span><p>{section.caseIds.map((caseId) => <Pill key={caseId}>{caseId}</Pill>)}</p></div></div>}
    </div>)}
  </div>;
}

function OptimizationSuggestions({ suggestions }: { suggestions: OptimizationResult['suggestions'] }) {
  if (!suggestions.length) return <EmptyState title="暂无优化建议" description="当前 Badcase 没有发现需要人工处理的问题。" />;
  return <div className="eval-suggestion-list">{suggestions.map((suggestion) => <article className="eval-suggestion-row" key={suggestion.id}>
    <div className="eval-suggestion-problem"><strong>{suggestion.problem}</strong><div>{suggestion.caseIds.map((caseId) => <Pill key={caseId}>{caseId}</Pill>)}</div></div>
    <div className="eval-suggestion-advice"><span>修改建议</span><p>{suggestion.suggestion}</p></div>
  </article>)}</div>;
}

function OptimizationComparison({ comparison }: { comparison?: ComparisonRecord }) {
  if (!comparison) return null;
  return <div className="eval-optimization-comparison">
    <MetricCompareMatrix rows={comparison.evaluatorRows} tasks={comparison.taskRefs} />
    <MetricCompareMatrix rows={comparison.runtimeRows} tasks={comparison.taskRefs} />
  </div>;
}

function OptimizationDetail({ experiment, comparison, onBack, onNotify, onViewComparison }: { experiment: OptimizeExperiment; comparison?: ComparisonRecord; onBack: () => void; onNotify: (message: string, tone?: Toast['tone']) => void; onViewComparison: (comparison: ComparisonRecord) => void }) {
  const result = experiment.result;
  const [evaluationState, setEvaluationState] = useState<'idle' | 'running' | 'ready'>(experiment.followUpMode === '直接实验对比' ? 'ready' : 'idle');
  const continueExperiment = () => {
    setEvaluationState('running');
    onNotify('已创建优化后复测任务，正在运行评测');
    window.setTimeout(() => {
      setEvaluationState('ready');
      onNotify('复测完成，已生成实验对比数据');
    }, 1200);
  };
  const showComparison = evaluationState === 'ready' && Boolean(comparison);
  return <div className="eval-detail-page eval-optimization-detail">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回优化记录</button><Pill tone={experiment.status === '已完成' ? 'green' : 'amber'}>{experiment.status}</Pill></div>
    <header className="eval-detail-hero eval-optimization-hero"><div><span className="eval-eyebrow">OPTIMIZATION RESULT</span><h2>{experiment.name}</h2><p>{experiment.agentType} · {experiment.followUpMode} · 已选 {result.selectedCaseCount} 个 Badcase</p></div></header>
    <div className="eval-optimization-flow"><span>优化后流程</span><strong>{experiment.followUpMode}</strong><span>{experiment.agentType === '外部' ? '外部 Agent 只生成优化建议' : '优化后 Agent 需要先完成复测任务'}</span></div>
    <div className="eval-optimization-stack">
      <section className="eval-optimization-panel"><div className="eval-task-section-heading"><div><h3>配置对比</h3><p>只展示优化前后的配置内容，展开查看修改原因和关联 Case。</p></div></div><ConfigCompare experiment={experiment} /></section>
      <section className="eval-optimization-panel"><div className="eval-task-section-heading"><div><h3>优化建议</h3><p>展示不能自动修改、但由 Badcase 明确暴露的问题。</p></div></div><OptimizationSuggestions suggestions={result.suggestions} /></section>
      {evaluationState === 'running' && <section className="eval-optimization-progress"><RefreshCw size={17} /><div><strong>优化后复测任务正在运行</strong><p>复测完成后生成实验对比数据。</p></div><Status label="复测评测中" /></section>}
      {showComparison && comparison && <section className="eval-optimization-panel"><div className="eval-task-section-heading"><div><h3>实验对比数据</h3><p>复测任务完成后，基于评测任务结果展示优化前后的指标。</p></div><button type="button" className="eval-button eval-button--ghost" onClick={() => onViewComparison(comparison)}>查看完整对比实验</button></div><OptimizationComparison comparison={comparison} /></section>}
    </div>
    <footer className="eval-sticky-footer"><span>{experiment.agentType === '外部' ? '外部 Agent 不修改配置，也不自动生成实验对比。' : '优化结果不会覆盖原 Agent。'}</span><div>
      {experiment.agentType !== '外部' && evaluationState === 'idle' && <><button type="button" className="eval-button eval-button--ghost" onClick={onBack}>暂不继续</button><button type="button" className="eval-button eval-button--primary" onClick={continueExperiment}><Zap size={15} />继续实验对比</button></>}
      {evaluationState === 'running' && <button type="button" className="eval-button eval-button--primary" disabled>复测评测中</button>}
      {showComparison && comparison && <button type="button" className="eval-button eval-button--primary" onClick={() => onViewComparison(comparison)}><GitCompare size={15} />查看完整对比实验</button>}
    </div></footer>
  </div>;
}

function ComparisonPicker({ initialControlTask, datasets, tasks, evaluators, onCancel, onCreate }: { initialControlTask?: EvaluationTask; datasets: Dataset[]; tasks: EvaluationTask[]; evaluators: Evaluator[]; onCancel: () => void; onCreate: (controlTaskId: string, experimentTaskIds: string[]) => void }) {
  const terminalStatuses: EvaluationTask['status'][] = ['已完成', '部分失败'];
  const firstDatasetId = datasets.find((dataset) => tasks.some((task) => task.datasetId === dataset.id && terminalStatuses.includes(task.status)))?.id ?? datasets[0]?.id ?? '';
  const [datasetId, setDatasetId] = useState(initialControlTask?.datasetId ?? firstDatasetId);
  const [controlTaskId, setControlTaskId] = useState(initialControlTask?.id ?? '');
  const [experimentTaskIds, setExperimentTaskIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const selectedDataset = datasets.find((item) => item.id === datasetId);
  const eligibleTasks = tasks
    .filter((item) => item.datasetId === datasetId && terminalStatuses.includes(item.status))
    .filter((item) => !query || `${item.name} ${item.agent} ${item.agentVersion}`.toLowerCase().includes(query.toLowerCase()));
  const selectedTasks = [controlTaskId, ...experimentTaskIds].map((id) => tasks.find((item) => item.id === id)).filter((item): item is EvaluationTask => Boolean(item));
  const commonCases = selectedTasks.length
    ? selectedTasks[0].results.filter((item) => selectedTasks.every((task) => task.results.some((result) => result.caseId === item.caseId))).length
    : 0;
  const lockedControl = Boolean(initialControlTask);
  const canCreate = Boolean(controlTaskId && experimentTaskIds.length && commonCases > 0);

  const changeDataset = (id: string) => {
    setDatasetId(id);
    if (!lockedControl) setControlTaskId('');
    setExperimentTaskIds([]);
  };
  const setControl = (id: string) => {
    if (lockedControl) return;
    const task = tasks.find((item) => item.id === id);
    if (task) setDatasetId(task.datasetId);
    setControlTaskId(id);
    setExperimentTaskIds((current) => current.filter((item) => item !== id));
  };
  const toggleExperiment = (id: string) => {
    if (id === controlTaskId) return;
    setExperimentTaskIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  return <div className="eval-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="eval-comparison-picker" role="dialog" aria-modal="true" aria-label="创建对比实验">
      <header>
        <div><span className="eval-eyebrow">CREATE COMPARISON</span><h2>创建对比实验</h2><p>筛选评测集后，选择 1 个对照组和至少 1 个实验组任务。</p></div>
        <IconButton label="关闭" onClick={onCancel}><X size={17} /></IconButton>
      </header>
      <div className="eval-picker-toolbar">
        <label className="eval-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务名称或 Agent" /></label>
        <select className="eval-picker-dataset-select" value={datasetId} disabled={lockedControl} onChange={(event) => changeDataset(event.target.value)} aria-label="筛选评测集">
          {datasets.filter((item) => tasks.some((task) => task.datasetId === item.id && terminalStatuses.includes(task.status))).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <span>{eligibleTasks.length} 个可选任务</span>
      </div>
      <div className="eval-picker-table-wrap">
        <EvaluationTaskTable tasks={eligibleTasks} datasets={datasets} evaluators={evaluators} selectable controlTaskId={controlTaskId} lockedControl={lockedControl} experimentTaskIds={experimentTaskIds} onSetControl={setControl} onToggleExperiment={toggleExperiment} />
      </div>
      <footer>
        <div className="eval-picker-compatibility">{selectedDataset ? <><CircleCheck size={15} /><span>{selectedDataset.name} · 对照组 {controlTaskId ? 1 : 0} 个 · 实验组 {experimentTaskIds.length} 个 · 共同 Case {commonCases} 个。</span></> : <><Minus size={15} /><span>筛选评测集后显示可比范围。</span></>}</div>
        <div><button type="button" className="eval-button eval-button--ghost" onClick={onCancel}>取消</button><button type="button" className="eval-button eval-button--primary" disabled={!canCreate} onClick={() => onCreate(controlTaskId, experimentTaskIds)}><GitCompare size={15} />创建对比实验</button></div>
      </footer>
    </section>
  </div>;
}

function evaluatorDisplay(item: EvaluatorResult) {
  if (item.scoreType === 'numeric' && typeof item.evaluationResult === 'number') return item.evaluationResult.toFixed(2);
  return item.evaluationResult;
}

function MetricCellView({ cell }: { cell: ComparisonMetricCell }) {
  const tone = cell.judgment === '改善' ? 'green' : cell.judgment === '下降' ? 'amber' : 'neutral';
  return <div className={`eval-metric-task-cell is-${cell.state}`}>
    <strong>{cell.result}</strong>
    {cell.judgment ? <span><Pill tone={tone}>{cell.delta} {cell.judgment}</Pill></span> : <span>{cell.state === '对照组' ? '对照基准' : cell.state}</span>}
    <small>样本 {cell.coverage}</small>
  </div>;
}

function MetricCompareRow({ row, tasks }: { row: ComparisonEvaluatorRow | ComparisonRuntimeRow; tasks: ComparisonTaskRef[] }) {
  return <div className="eval-metric-row">
    <div className="eval-metric-row__name"><strong>{row.metric}</strong><small>{'scoreType' in row ? row.scoreType === 'pass_fail' ? '通过率' : '0-1 数值' : '运行时平均值'}</small></div>
    {tasks.map((task) => <MetricCellView key={task.taskId} cell={row.cells[task.taskId]} />)}
  </div>;
}

function MetricCompareMatrix({ rows, tasks }: { rows: Array<ComparisonEvaluatorRow | ComparisonRuntimeRow>; tasks: ComparisonTaskRef[] }) {
  const columns = `minmax(180px, 1.2fr) repeat(${tasks.length}, minmax(150px, 1fr))`;
  return <div className="eval-metric-matrix" style={{ '--metric-task-count': tasks.length } as CSSProperties}>
    <div className="eval-metric-matrix__head" style={{ gridTemplateColumns: columns }}><span>指标</span>{tasks.map((task) => <span key={task.taskId}><strong>{task.role}</strong><small>{task.name}</small></span>)}</div>
    <div className="eval-metric-matrix__body">{rows.map((row) => <MetricCompareRow key={'evaluatorId' in row ? row.evaluatorId : row.metric} row={row} tasks={tasks} />)}</div>
  </div>;
}

function ComparisonCasePreview({ row, taskRefs, onClose }: { row: ComparisonCaseRow; taskRefs: ComparisonTaskRef[]; onClose: () => void }) {
  return <div className="eval-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="eval-comparison-case-preview" role="dialog" aria-modal="true" aria-label={row.caseId}>
      <header><div><span className="eval-eyebrow">CASE COMPARISON</span><h2>{row.caseId}</h2></div><IconButton label="关闭" onClick={onClose}><X size={17} /></IconButton></header>
      <div className="eval-compare-case-context"><span>评测集共享字段</span><div>{Object.entries(row.sharedValues).map(([key, value]) => <p key={key}><strong>{key}</strong>{value}</p>)}</div></div>
      <div className="eval-compare-output-grid" data-count={taskRefs.length}>
        {taskRefs.map((task) => {
          const output = row.outputs[task.taskId];
          return <section key={task.taskId} className={task.role === '实验组' ? 'is-experiment' : ''}>
            <header><strong>{task.label}</strong><span>{task.role} · agent_output</span></header>
            <p>{output?.output || '未采集'}</p>
            <div>{output?.evaluatorResults.map((item) => <span key={item.evaluatorId}><strong>{item.evaluatorName}</strong><em>{evaluatorDisplay(item)}</em></span>)}</div>
          </section>;
        })}
      </div>
      <div className="eval-compare-case-judgment"><Pill tone={row.judgment === '一致' ? 'green' : row.judgment === '有差异' ? 'amber' : 'neutral'}>{row.judgment}</Pill><span>{row.reason}</span></div>
      <footer><button type="button" className="eval-button eval-button--primary" onClick={onClose}>关闭</button></footer>
    </section>
  </div>;
}

function ComparisonDetail({ comparison, onBack }: { comparison: ComparisonRecord; onBack: () => void }) {
  const [tab, setTab] = useState<'data' | 'metrics'>('data');
  const [filter, setFilter] = useState<'全部' | '有差异' | '一致' | '无法比较'>('全部');
  const [query, setQuery] = useState('');
  const [previewRow, setPreviewRow] = useState<ComparisonCaseRow | null>(null);
  const rows = comparison.caseRows.filter((row) => {
    const matchesFilter = filter === '全部' || row.judgment === filter;
    const haystack = `${row.caseId} ${Object.values(row.sharedValues).join(' ')} ${Object.values(row.outputs).map((item) => item.output).join(' ')}`.toLowerCase();
    return matchesFilter && (!query || haystack.includes(query.toLowerCase()));
  });
  const judgmentTone = (judgment: ComparisonCaseRow['judgment']) => judgment === '一致' ? 'green' : judgment === '有差异' ? 'amber' : 'neutral';
  return <div className="eval-detail-page eval-comparison-detail">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回对比实验</button><Pill tone={comparison.status === '已完成' ? 'green' : 'amber'}>{comparison.status}</Pill></div>
    <header className="eval-comparison-detail-header">
      <div><span className="eval-eyebrow">COMPARISON RESULT</span><h2>{comparison.name}</h2><p>{comparison.dataset} · 版本 {comparison.datasetVersion}</p></div>
    </header>
    <div className="eval-comparison-task-strip">{comparison.taskRefs.map((task) => <div key={task.taskId} className={task.role === '实验组' ? 'is-experiment' : ''}><span>{task.role}</span><strong>{task.name}</strong><small>{task.agent} · {task.agentVersion}</small></div>)}</div>
    <nav className="eval-comparison-tabs" aria-label="对比结果内容"><button type="button" className={tab === 'data' ? 'is-active' : ''} onClick={() => setTab('data')}><Table2 size={15} />评测集数据</button><button type="button" className={tab === 'metrics' ? 'is-active' : ''} onClick={() => setTab('metrics')}><BarChart3 size={15} />指标统计</button></nav>
    {tab === 'data' && <section className="eval-comparison-data">
      <div className="eval-comparison-toolbar"><label className="eval-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Case、Input 或 Agent Output" /></label><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option>全部</option><option>有差异</option><option>一致</option><option>无法比较</option></select><span>{rows.length} 条 Case</span></div>
      <div className="eval-comparison-table-wrap">
        <table className="eval-comparison-data-table">
          <thead><tr><th className="is-sticky">Case</th>{comparison.sharedFields.map((field) => <th key={field}>{field}</th>)}{comparison.taskRefs.map((task) => <th className="is-output" key={task.taskId}>{task.role} Agent Output<small>{task.name}</small></th>)}<th>判断</th><th className="is-sticky is-sticky-right">操作</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.caseId}>
            <td className="is-sticky"><strong className="eval-mono">{row.caseId}</strong></td>
            {comparison.sharedFields.map((field) => <td key={field}>{row.sharedValues[field] || '未采集'}</td>)}
            {comparison.taskRefs.map((task) => {
              const output = row.outputs[task.taskId];
              return <td className="is-output" key={task.taskId}><div className={`eval-compare-output-cell${task.role === '实验组' ? ' is-experiment' : ''}`}><p>{output?.output || '未采集'}</p><div>{output?.evaluatorResults.slice(0, 2).map((item) => <span key={item.evaluatorId}>{item.evaluatorName} {evaluatorDisplay(item)}</span>)}</div></div></td>;
            })}
            <td><Pill tone={judgmentTone(row.judgment)}>{row.judgment}</Pill></td>
            <td className="is-sticky is-sticky-right"><button type="button" className="eval-text-button" onClick={() => setPreviewRow(row)}>详情</button></td>
          </tr>)}</tbody>
        </table>
        {rows.length === 0 && <EmptyState title="没有匹配的 Case" description="调整搜索或对比判断筛选条件。" />}
      </div>
    </section>}
    {tab === 'metrics' && <section className="eval-metrics-workspace">
      <div className="eval-metrics-summary"><div><span>共同 Case</span><strong>{comparison.totalCases}</strong></div><div><span>实验组</span><strong>{comparison.experimentTaskIds.length}</strong></div><div><span>有差异</span><strong>{comparison.differentCases}</strong></div><div><span>一致</span><strong>{comparison.sameCases}</strong></div><div><span>无法比较</span><strong>{comparison.incomparableCases}</strong></div></div>
      <section className="eval-metrics-section"><div className="eval-task-section-heading"><div><h3>评估器得分</h3><p>展示评估器并集。未配置、未采集和异常状态不转换为 0。</p></div></div><MetricCompareMatrix rows={comparison.evaluatorRows} tasks={comparison.taskRefs} /></section>
      <section className="eval-metrics-section"><div className="eval-task-section-heading"><div><h3>运行时指标</h3><p>默认展示平均值；运行设置不一致时只标记为参考差异。</p></div></div><MetricCompareMatrix rows={comparison.runtimeRows} tasks={comparison.taskRefs} /></section>
    </section>}
    {previewRow && <ComparisonCasePreview row={previewRow} taskRefs={comparison.taskRefs} onClose={() => setPreviewRow(null)} />}
  </div>;
}

function TaskCreateWorkspace({ state, config, setConfig, onBack, onCreate, onCreateDataset }: { state: EvaluationState; config: TaskDraft; setConfig: Dispatch<SetStateAction<TaskDraft>>; onBack: () => void; onCreate: () => void; onCreateDataset: (mode: DatasetCreateMode) => void }) {
  const [step, setStep] = useState<TaskCreateStep>(1);
  const [evaluatorCards, setEvaluatorCards] = useState<string[]>(() => [...new Set(config.evaluatorIds)]);
  const [customBindings, setCustomBindings] = useState<Record<string, string>>({});
  const dataset = getDatasetById(state, config.datasetId);
  const selectedAgents = config.agentTargets.map((target) => ({ target, agent: state.agents.find((item) => item.id === target.agentId) }));
  const selected = evaluatorCards.map((id) => state.evaluators.find((item) => item.id === id)).filter((item): item is Evaluator => Boolean(item));
  const submitted = state.datasets.filter((item) => item.versions.some((version) => version.status === '已提交'));
  const selectedVersion = dataset?.versions.find((version) => version.id === config.datasetVersion);
  const bindings = evaluatorCards.map((evaluatorId, index) => {
    const evaluator = state.evaluators.find((item) => item.id === evaluatorId);
    const variables = (evaluator?.variables ?? []).map((variable) => {
      const systemProvided = SYSTEM_PROVIDED_SEMANTICS.includes(variable.semantic);
      const bindingKey = `${evaluatorId}:${variable.name}`;
      const field = systemProvided ? undefined : variable.semantic === 'Custom' ? dataset?.fields.find((item) => item.id === customBindings[bindingKey]) : dataset?.fields.find((item) => item.semantic === variable.semantic);
      return { variable, systemProvided, field, bindingKey };
    });
    const missing = variables.filter((item) => item.variable.required && !item.systemProvided && !item.field);
    const usedIds = evaluatorCards.filter((_, cardIndex) => cardIndex !== index);
    const options = state.evaluators.filter((item) => !usedIds.includes(item.id));
    return { evaluator, variables, missing, options };
  });
  const validVersion = Boolean(selectedVersion?.status === '已提交');
  const datasetReady = Boolean(dataset && validVersion && dataset.cases.length);
  const agentReady = config.agentTargets.length > 0 && config.agentTargets.every((target) => Boolean(target.agentId && target.agentVersion));
  const evaluatorsReady = evaluatorCards.length > 0 && evaluatorCards.every(Boolean);
  const runnableEvaluatorCount = bindings.filter((item) => item.evaluator && item.missing.length === 0).length;
  const blocked = !datasetReady || !agentReady || !evaluatorsReady || !config.name.trim() || runnableEvaluatorCount === 0;
  const steps: { id: TaskCreateStep; label: string }[] = [
    { id: 1, label: '评测对象' },
    { id: 2, label: '评测集' },
    { id: 3, label: '评估器' },
    { id: 4, label: '确认实验配置' },
  ];
  const canOpenStep = (target: TaskCreateStep) => target === 1 || (target === 2 && agentReady) || (target === 3 && agentReady && datasetReady) || (target === 4 && agentReady && datasetReady && evaluatorsReady);
  const currentStepReady = step === 1 ? agentReady : step === 2 ? datasetReady : step === 3 ? evaluatorsReady : !blocked;
  const changeAgentTarget = (index: number, id: string) => {
    const next = state.agents.find((item) => item.id === id);
    setConfig((current) => ({ ...current, agentTargets: current.agentTargets.map((target, targetIndex) => targetIndex === index ? { agentId: id, agentVersion: next?.versions[0] ?? '' } : target) }));
  };
  const changeAgentVersion = (index: number, version: string) => {
    setConfig((current) => ({ ...current, agentTargets: current.agentTargets.map((target, targetIndex) => targetIndex === index ? { ...target, agentVersion: version } : target) }));
  };
  const addAgentTarget = () => {
    const next = state.agents.find((item) => !config.agentTargets.some((target) => target.agentId === item.id)) ?? state.agents[0];
    if (!next) return;
    setConfig((current) => ({ ...current, agentTargets: [...current.agentTargets, { agentId: next.id, agentVersion: next.versions[0] ?? '' }] }));
  };
  const removeAgentTarget = (index: number) => {
    setConfig((current) => ({ ...current, agentTargets: current.agentTargets.filter((_, targetIndex) => targetIndex !== index) }));
  };
  const changeDataset = (id: string) => {
    const next = state.datasets.find((item) => item.id === id);
    setConfig((current) => ({ ...current, datasetId: id, datasetVersion: next?.versions.find((version) => version.status === '已提交')?.id ?? '' }));
  };
  const syncEvaluatorCards = (cards: string[]) => {
    setEvaluatorCards(cards);
    setConfig((current) => ({ ...current, evaluatorIds: cards.filter((id) => state.evaluators.some((item) => item.id === id)) }));
  };
  const addEvaluatorCard = () => syncEvaluatorCards([...evaluatorCards, '']);
  const removeEvaluatorCard = (index: number) => syncEvaluatorCards(evaluatorCards.filter((_, cardIndex) => cardIndex !== index));
  const changeEvaluatorCard = (index: number, id: string) => syncEvaluatorCards(evaluatorCards.map((current, cardIndex) => cardIndex === index ? id : current));
  const nextStep = () => { if (step < 4 && currentStepReady) setStep((step + 1) as TaskCreateStep); };

  return <div className="eval-task-create-page eval-task-wizard">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回任务列表</button><Pill tone="violet">未创建任务</Pill></div>
    <nav className="eval-task-stepper" aria-label="新建评测任务步骤">
      {steps.map((item) => <button type="button" key={item.id} className={`${step === item.id ? 'is-active' : ''}${step > item.id ? ' is-complete' : ''}`} disabled={!canOpenStep(item.id)} onClick={() => setStep(item.id)}><span>{step > item.id ? <Check size={15} /> : item.id}</span><strong>{item.label}</strong></button>)}
    </nav>

    <section className="eval-task-step-panel">
      {step === 2 && <div className="eval-task-step-content">
        <div className="eval-task-form-row eval-task-form-row--action">
          <label className="eval-field"><span>评测集 <b>*</b></span><select value={config.datasetId} onChange={(event) => changeDataset(event.target.value)}>{submitted.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="eval-field"><span>版本 <b>*</b></span><select value={config.datasetVersion} disabled={!dataset} onChange={(event) => setConfig((current) => ({ ...current, datasetVersion: event.target.value }))}>{dataset?.versions.filter((version) => version.status === '已提交').map((version) => <option key={version.id} value={version.id}>{version.label}</option>)}</select></label>
          <CreateMenu onCreate={onCreateDataset} />
        </div>
        {!submitted.length && <div className="eval-inline-warning"><CircleAlert size={15} />当前没有可运行的已提交评测集，请先新建评测集。</div>}
        {dataset && <div className="eval-task-selection-detail"><div><span>描述</span><p>{dataset.description || '暂无描述'}</p></div><div><span>字段</span><div className="eval-task-field-tags">{dataset.fields.map((field) => <FieldBadge key={field.id} semantic={field.semantic} required={field.required} />)}</div></div><div><span>数据总量</span><strong>{dataset.cases.length}</strong></div></div>}
      </div>}

      {step === 1 && <div className="eval-task-step-content">
        <div className="eval-agent-target-list">
          {selectedAgents.map(({ target, agent }, index) => <div className="eval-agent-target-row" key={`${target.agentId}-${index}`}>
            <label className="eval-field"><span>Agent <b>*</b></span><select value={target.agentId} onChange={(event) => changeAgentTarget(index, event.target.value)}>{state.agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="eval-field"><span>版本 <b>*</b></span><select value={target.agentVersion} disabled={!agent} onChange={(event) => changeAgentVersion(index, event.target.value)}>{(agent?.versions ?? []).map((version) => <option key={version}>{version}</option>)}</select></label>
            {config.agentTargets.length > 1 && <IconButton label={`移除 ${agent?.name ?? 'Agent'}`} onClick={() => removeAgentTarget(index)}><Trash2 size={15} /></IconButton>}
            {agent && <div className="eval-agent-target-description"><span>描述</span><p>{agent.description}</p></div>}
          </div>)}
        </div>
        <button type="button" className="eval-evaluator-add-trigger" onClick={addAgentTarget}><Plus size={16} />添加 Agent</button>
      </div>}

      {step === 3 && <div className="eval-task-step-content">
        <div className="eval-selected-evaluators">
          {bindings.map(({ evaluator, variables, missing, options }, index) => <article className="eval-selected-evaluator" key={`evaluator-card-${index}`}>
            <header>
              <div>
                <strong>评估器 {index + 1}</strong>
                <select aria-label={`选择评估器 ${index + 1}`} value={evaluator?.id ?? ''} onChange={(event) => changeEvaluatorCard(index, event.target.value)}>
                  <option value="">请选择评估器</option>
                  {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div>{evaluator && <Status label={missing.length ? '无法执行' : '可执行'} />}<IconButton label={`移除评估器 ${index + 1}`} onClick={() => removeEvaluatorCard(index)}><Trash2 size={15} /></IconButton></div>
            </header>
            {evaluator ? <>
              <p>{evaluator.description}</p>
              <div className="eval-auto-binding"><div className="eval-auto-binding__head"><span>评估器变量</span><span>字段语义</span><span>自动绑定</span></div>{variables.map(({ variable, systemProvided, field, bindingKey }) => <div className={`eval-auto-binding__row${variable.required && !systemProvided && !field ? ' is-missing' : ''}`} key={`${evaluator.id}-${variable.name}`}><strong>{variable.name}</strong><FieldBadge semantic={variable.semantic} required={variable.required} /><span>{systemProvided ? '系统运行时提供' : variable.semantic === 'Custom' ? <select aria-label={`绑定 ${variable.name}`} value={customBindings[bindingKey] ?? ''} onChange={(event) => setCustomBindings((current) => ({ ...current, [bindingKey]: event.target.value }))}><option value="">手动绑定字段</option>{dataset?.fields.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : field?.name ?? '未找到对应字段'}</span></div>)}</div>
            </> : <p>请选择一个评估器。</p>}
          </article>)}
        </div>
        <button type="button" className="eval-evaluator-add-trigger" onClick={addEvaluatorCard}><Plus size={16} />添加评估器</button>
      </div>}

      {step === 4 && <div className="eval-task-confirm-grid">
        <div className="eval-task-confirm-form">
          <label className="eval-field"><span>任务名称 <b>*</b></span><input maxLength={50} value={config.name} placeholder="例如：退款客服助手 V3 回流问题评测" onChange={(event) => setConfig((current) => ({ ...current, name: event.target.value }))} /><small>{config.name.length}/50</small></label>
          <label className="eval-field"><span>任务描述</span><textarea maxLength={200} rows={3} value={config.description} placeholder="记录本次验证目的" onChange={(event) => setConfig((current) => ({ ...current, description: event.target.value }))} /></label>
          <div className="eval-runtime-grid"><label className="eval-field"><span>并发数</span><input type="number" min={1} max={10} value={config.concurrency} onChange={(event) => setConfig((current) => ({ ...current, concurrency: Number(event.target.value) || 1 }))} /></label><label className="eval-field"><span>单条超时（秒）</span><input type="number" min={10} max={600} value={config.timeout} onChange={(event) => setConfig((current) => ({ ...current, timeout: Number(event.target.value) || 60 }))} /></label><label className="eval-check-card"><input type="checkbox" checked={config.continueOnError} onChange={(event) => setConfig((current) => ({ ...current, continueOnError: event.target.checked }))} /><span><strong>单条失败继续</strong><small>保留其他 Case 的运行结果</small></span></label></div>
        </div>
        <aside className="eval-task-confirm-summary"><h3>实验配置</h3><div className="eval-confirm-item"><Database size={16} /><span><small>评测集</small><strong>{dataset?.name ?? '未选择'}</strong><em>{selectedVersion?.label ?? '未选择版本'}，{dataset?.cases.length ?? 0} 条 Case</em></span></div><div className="eval-confirm-item"><Bot size={16} /><span><small>评测对象</small><strong>{selectedAgents.length ? `${selectedAgents.length} 个 Agent` : '未选择'}</strong><em>{selectedAgents.map(({ target, agent }) => `${agent?.name ?? 'Agent'} ${target.agentVersion}`).join('、') || '未选择版本'}</em></span></div><div className="eval-confirm-item"><ClipboardCheck size={16} /><span><small>评估器</small><strong>{selected.length} 个</strong><em>{runnableEvaluatorCount} 个可执行</em></span></div><div className={`eval-summary-alert${blocked ? ' is-warning' : ' is-ok'}`}>{blocked ? <><CircleAlert size={15} /><span>填写任务名称，并确保至少有一个评估器可执行。</span></> : <><CheckCircle2 size={15} /><span>配置检查通过，可以开始评测。</span></>}</div></aside>
      </div>}
    </section>

    <footer className="eval-task-wizard-footer"><button type="button" className="eval-button eval-button--ghost" onClick={onBack}>取消</button><div>{step > 1 && <button type="button" className="eval-button eval-button--ghost" onClick={() => setStep((step - 1) as TaskCreateStep)}>上一步</button>}{step < 4 ? <button type="button" className="eval-button eval-button--primary" disabled={!currentStepReady} onClick={nextStep}>下一步：{steps[step].label}<ChevronRight size={14} /></button> : <button type="button" className="eval-button eval-button--primary" disabled={blocked} onClick={onCreate}><Zap size={15} />开始评测</button>}</div></footer>
  </div>;
}

const aggregateNumbers = (values: number[], aggregation: MetricAggregation): number | undefined => {
  if (!values.length) return undefined;
  if (aggregation === '最大') return Math.max(...values);
  if (aggregation === '最小') return Math.min(...values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const metricDurationValue = (value?: string): number | undefined => {
  if (!value) return undefined;
  const match = value.match(/([\d.]+)\s*(ms|s|min)/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return match[2].toLowerCase() === 'ms' ? amount / 1000 : match[2].toLowerCase() === 'min' ? amount * 60 : amount;
};

const formatTaskMetric = (value: number | undefined, name: string): string => {
  if (value === undefined) return '未采集';
  if (name.includes('Tokens')) return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${Math.round(value)}`;
  return name === '首字时延' ? `${Math.round(value * 1000)} ms` : `${value.toFixed(1)} s`;
};

function TaskMetricBoard({ evaluatorRows, runtimeRows, aggregation, onAggregationChange }: { evaluatorRows: TaskMetricRow[]; runtimeRows: TaskMetricRow[]; aggregation: MetricAggregation; onAggregationChange: (value: MetricAggregation) => void }) {
  const renderRows = (rows: TaskMetricRow[], runtime = false) => rows.map((row) => <tr key={row.name}>
    <td><strong>{row.name}</strong></td>
    <td className="eval-task-metric-value">{row.display}</td>
    {!runtime && <td>{row.passRate ?? '不适用'}</td>}
    <td>{row.valid}</td>
    <td>{row.range}</td>
    {!runtime && <td>{row.threshold ?? '直接判断'}</td>}
  </tr>);
  return <div className="eval-task-metric-board">
    <div className="eval-metric-board-toolbar"><div><strong>指标统计</strong><span>按评估器得分、通过率和 Agent 运行数据汇总。</span></div><label><span>聚合方式</span><select value={aggregation} onChange={(event) => onAggregationChange(event.target.value as MetricAggregation)}><option>均值</option><option>最大</option><option>最小</option></select></label></div>
    <section><div className="eval-task-section-heading"><div><h3>评估器得分</h3><p>得分与通过率独立展示，不生成任务总分。</p></div></div><div className="eval-task-metric-table-wrap"><table className="eval-task-metric-table"><thead><tr><th>评估器</th><th>得分</th><th>通过率</th><th>有效样本</th><th>范围</th><th>通过阈值</th></tr></thead><tbody>{renderRows(evaluatorRows)}</tbody></table></div></section>
    <section><div className="eval-task-section-heading"><div><h3>Agent 运行数据</h3><p>展示 Agent 运行效率，不与评估器质量得分合并。</p></div></div><div className="eval-task-metric-table-wrap"><table className="eval-task-metric-table"><thead><tr><th>指标</th><th>数值</th><th>有效样本</th><th>范围</th></tr></thead><tbody>{renderRows(runtimeRows, true)}</tbody></table></div></section>
  </div>;
}

function HumanAnnotationEditor({ caseId, label, value, onCancel, onSave }: { caseId: string; label: HumanLabelDefinition; value?: HumanAnnotation; onCancel: () => void; onSave: (annotation: HumanAnnotation) => void }) {
  const [score, setScore] = useState(String(value?.score ?? label.passThreshold ?? label.scoreMin ?? 0));
  const [passed, setPassed] = useState(value?.passed ?? true);
  const [reason, setReason] = useState(value?.reason ?? '');
  const numericScore = Number(score);
  const numericPassed = label.scoreType === 'numeric' ? numericScore >= (label.passThreshold ?? 0) : passed;
  return <div className="eval-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="eval-human-annotation-editor" role="dialog" aria-modal="true" aria-label={`人工标注 ${caseId}`}>
      <header><div><span className="eval-eyebrow">HUMAN ANNOTATION</span><h2>{label.name}</h2><p>{caseId} · {label.scoreType === 'numeric' ? '分数评价' : '通过 / 不通过'}</p></div><IconButton label="关闭" onClick={onCancel}><X size={17} /></IconButton></header>
      <div className="eval-human-annotation-editor__body">
        {label.scoreType === 'numeric' ? <label className="eval-field"><span>分数 <b>*</b></span><input type="number" min={label.scoreMin ?? 0} max={label.scoreMax ?? 1} step="0.01" value={score} onChange={(event) => setScore(event.target.value)} /><small>通过阈值 {label.passThreshold ?? 0}，当前结果 {numericPassed ? '通过' : '不通过'}</small></label> : <div className="eval-human-pass-control"><span>判断结果 <b>*</b></span><div><button type="button" className={passed ? 'is-active is-pass' : ''} onClick={() => setPassed(true)}><CircleCheck size={14} />通过</button><button type="button" className={!passed ? 'is-active is-fail' : ''} onClick={() => setPassed(false)}><CircleAlert size={14} />不通过</button></div></div>}
        <label className="eval-field"><span>标注原因</span><textarea rows={4} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明判断依据" /><small>{reason.length}/300</small></label>
      </div>
      <footer><button type="button" className="eval-button eval-button--ghost" onClick={onCancel}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={() => onSave({ labelId: label.id, score: label.scoreType === 'numeric' ? numericScore : undefined, passed: numericPassed, reason: reason.trim(), updatedAt: '2026-09-23 13:20' })}><Check size={15} />保存标注</button></footer>
    </section>
  </div>;
}

function OptimizationStartModal({ task, selectedCount, onCancel, onStart }: { task: EvaluationTask; selectedCount: number; onCancel: () => void; onStart: (mode: OptimizationFollowUpMode) => void }) {
  const agentType = task.agentType ?? '万智';
  const external = agentType === '外部';
  const [mode, setMode] = useState<OptimizationFollowUpMode>(external ? '仅生成建议' : '先审查配置');
  return <div className="eval-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="eval-optimization-start" role="dialog" aria-modal="true" aria-label="开始优化">
      <header><div><span className="eval-eyebrow">START OPTIMIZATION</span><h2>开始优化</h2><p>已选择 {selectedCount} 个 Badcase。</p></div><IconButton label="关闭" onClick={onCancel}><X size={17} /></IconButton></header>
      {external ? <div className="eval-optimization-start__body"><div className="eval-inline-warning"><CircleAlert size={15} /><span>外部 Agent 只分析 Badcase 并生成优化建议，不修改配置，也不自动生成实验对比。</span></div></div> : <div className="eval-optimization-start__body"><span>优化后流程</span><label className={mode === '先审查配置' ? 'is-selected' : ''}><input type="radio" name="optimization-follow-up" checked={mode === '先审查配置'} onChange={() => setMode('先审查配置')} /><span><strong>先审查配置</strong><small>先查看优化前后的配置变化，再决定是否继续实验对比。</small></span></label><label className={mode === '直接实验对比' ? 'is-selected' : ''}><input type="radio" name="optimization-follow-up" checked={mode === '直接实验对比'} onChange={() => setMode('直接实验对比')} /><span><strong>直接实验对比</strong><small>优化完成后自动运行复测任务，并生成实验对比。</small></span></label></div>}
      <footer><button type="button" className="eval-button eval-button--ghost" onClick={onCancel}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={() => onStart(mode)}><Sparkles size={15} />开始优化</button></footer>
    </section>
  </div>;
}

function TaskDetail({ task, state, tab, onTabChange, onBack, onOpenCase, onNotify, onOptimize, onCompare, onOpenExperiment }: { task: EvaluationTask; state: EvaluationState; tab: 'summary' | 'data' | 'optimize'; onTabChange: (tab: 'summary' | 'data' | 'optimize') => void; onBack: () => void; onOpenCase: (item: CaseResult) => void; onNotify: (message: string, tone?: Toast['tone']) => void; onOptimize: (caseIds: string[], mode: OptimizationFollowUpMode, agentType: '万智' | '外部') => void; onCompare: () => void; onOpenExperiment: (item: OptimizeExperiment) => void }) {
  const [selectedBadCaseIds, setSelectedBadCaseIds] = useState<string[]>([]);
  const [optimizeModalOpen, setOptimizeModalOpen] = useState(false);
  const [metricAggregation, setMetricAggregation] = useState<MetricAggregation>('均值');
  const [activeHumanLabelId, setActiveHumanLabelId] = useState('');
  const [humanLabelMenuOpen, setHumanLabelMenuOpen] = useState(false);
  const [annotationEditor, setAnnotationEditor] = useState<{ caseId: string; labelId: string } | null>(null);
  const [humanAnnotations, setHumanAnnotations] = useState<Record<string, HumanAnnotation>>(() => Object.fromEntries(task.results.flatMap((item) => Object.entries(item.humanAnnotations ?? {}).map(([labelId, value]) => [`${item.caseId}:${labelId}`, value]))));
  const dataset = getDatasetById(state, task.datasetId);
  const taskEvaluators = state.evaluators.filter((evaluator) => task.evaluatorIds.includes(evaluator.id));
  const taskExperiments = state.experiments.filter((item) => item.sourceTaskId === task.id);
  const activeHumanLabel = state.humanLabels.find((item) => item.id === activeHumanLabelId);
  const editingHumanLabel = annotationEditor ? state.humanLabels.find((item) => item.id === annotationEditor.labelId) : undefined;
  const datasetFields = dataset?.fields.filter((field) => !['Agent Output', 'Trace', 'Agent Configuration', 'User Feedback'].includes(field.semantic)) ?? [];
  const runtimeOutputFields = dataset?.fields.filter((field) => ['Agent Output', 'Agent Configuration'].includes(field.semantic)) ?? [];
  const runtimeEfficiencyFields: { key: string; label: string }[] = [
    { key: 'agentDuration', label: 'Agent 耗时' },
    { key: 'firstTokenLatency', label: '首字时延' },
    { key: 'inputTokens', label: 'Input Tokens' },
    { key: 'outputTokens', label: 'Output Tokens' },
    { key: 'totalTokens', label: 'Total Tokens' },
    { key: 'evaluatorDuration', label: '评估器耗时' },
  ];
  const getFieldValue = (item: CaseResult, field: FieldDefinition) => {
    const datasetCase = dataset?.cases.find((current) => current.id === item.caseId);
    if (field.semantic === 'Input') return item.input || datasetCase?.values[field.id] || '未采集';
    if (field.semantic === 'Expected Output') return item.expectedOutput || datasetCase?.values[field.id] || '未采集';
    if (field.semantic === 'Agent Output') return item.agentOutput || '未采集';
    if (field.semantic === 'Agent Configuration') return item.agentConfiguration || '未采集';
    return datasetCase?.values[field.id] || '未采集';
  };
  const getTraceValue = (item: CaseResult) => item.trace.map((event) => `${event.name} ${event.status}`).join(' > ') || '未采集';
  const getRuntimeValue = (item: CaseResult, key: string) => {
    const value = item.runtime?.[key as keyof NonNullable<CaseResult['runtime']>];
    return value === undefined || value === null ? '未采集' : String(value);
  };
  const getEvaluatorValue = (item: CaseResult, evaluatorId: string) => {
    const result = item.evaluatorResults.find((current) => current.evaluatorId === evaluatorId);
    if (!result) return '未采集';
    return result.scoreType === 'numeric' && typeof result.evaluationResult === 'number' ? result.evaluationResult.toFixed(2) : String(result.evaluationResult);
  };
  const getHumanAnnotationValue = (item: CaseResult) => {
    if (!activeHumanLabel) return '';
    const annotation = humanAnnotations[`${item.caseId}:${activeHumanLabel.id}`] ?? item.humanAnnotations?.[activeHumanLabel.id];
    if (!annotation) return '未标注';
    return activeHumanLabel.scoreType === 'numeric' ? `${annotation.score?.toFixed(2) ?? '未采集'} / ${annotation.passed ? '通过' : '不通过'}` : annotation.passed ? '通过' : '不通过';
  };
  const toggleBadCase = (caseId: string) => setSelectedBadCaseIds((current) => current.includes(caseId) ? current.filter((id) => id !== caseId) : [...current, caseId]);
  const evaluatorRows: TaskMetricRow[] = taskEvaluators.map((evaluator) => {
    const results = task.results.map((item) => item.evaluatorResults.find((result) => result.evaluatorId === evaluator.id)).filter((item): item is EvaluatorResult => item !== undefined && ['通过', '不通过'].includes(item.evaluationStatus));
    const scores = results.map((item) => item.scoreType === 'numeric' && typeof item.evaluationResult === 'number' ? item.evaluationResult : item.evaluationStatus === '通过' ? 1 : 0);
    const aggregate = aggregateNumbers(scores, metricAggregation);
    const passed = results.filter((item) => item.evaluationStatus === '通过').length;
    return {
      name: evaluator.name,
      display: aggregate === undefined ? '未采集' : aggregate.toFixed(2),
      passRate: results.length ? `${Math.round((passed / results.length) * 100)}% (${passed}/${results.length})` : '未采集',
      valid: `${results.length}/${task.results.length}`,
      range: scores.length ? `${Math.min(...scores).toFixed(2)} - ${Math.max(...scores).toFixed(2)}` : '未采集',
      threshold: evaluator.passThreshold === undefined ? undefined : evaluator.passThreshold.toFixed(2),
    };
  });
  const runtimeMetricValue = (item: CaseResult, key: string) => {
    if (!item.runtime) return undefined;
    if (key === 'agentDuration') return metricDurationValue(item.runtime.agentDuration);
    if (key === 'firstTokenLatency') return metricDurationValue(item.runtime.firstTokenLatency);
    if (key === 'evaluatorDuration') return metricDurationValue(item.runtime.evaluatorDuration);
    return Number(item.runtime[key as 'inputTokens' | 'outputTokens' | 'totalTokens']);
  };
  const runtimeRows: TaskMetricRow[] = runtimeEfficiencyFields.map((field) => {
    const values = task.results.map((item) => runtimeMetricValue(item, field.key)).filter((item): item is number => item !== undefined);
    const aggregate = aggregateNumbers(values, metricAggregation);
    return {
      name: field.label,
      display: formatTaskMetric(aggregate, field.label),
      valid: `${values.length}/${task.results.length}`,
      range: values.length ? `${formatTaskMetric(Math.min(...values), field.label)} - ${formatTaskMetric(Math.max(...values), field.label)}` : '未采集',
    };
  });
  const successfulCases = Math.max(task.completedCases - task.failedCases, 0);
  const pendingCases = Math.max(task.totalCases - task.completedCases, 0);
  return <div className="eval-detail-page eval-task-detail-page">
    <header className="eval-task-detail-header">
      <div className="eval-task-detail-header__main">
        <button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回任务列表</button>
        <div className="eval-task-title-line">
          <h1>{task.name}</h1>
          <Status label={task.status} />
        </div>
        <div className="eval-task-summary-chips" aria-label="任务结果摘要">
          <span><small>总条数</small><strong>{task.totalCases}</strong></span>
          <span><small>成功</small><strong>{successfulCases}</strong></span>
          <span><small>失败</small><strong>{task.failedCases}</strong></span>
          <span><small>待执行</small><strong>{pendingCases}</strong></span>
        </div>
      </div>
      <div className="eval-task-detail-actions">
        <button type="button" className="eval-button eval-button--primary" disabled={selectedBadCaseIds.length === 0} onClick={() => setOptimizeModalOpen(true)}><Sparkles size={14} />优化 Badcase{selectedBadCaseIds.length > 0 ? `（${selectedBadCaseIds.length}）` : ''}</button>
        <button type="button" className="eval-button eval-button--ghost" disabled={!['已完成', '部分失败'].includes(task.status)} title={['已完成', '部分失败'].includes(task.status) ? '创建对比实验' : '任务执行完成后才能创建对比实验'} onClick={onCompare}><Layers3 size={14} />对比实验</button>
        <button type="button" className="eval-button eval-button--ghost" onClick={() => onNotify('已创建异常 Case 重试任务')}><RefreshCw size={14} />重试异常</button>
      </div>
    </header>
    <section className="eval-task-info-panel">
      <div className="eval-task-info-panel__heading"><strong>基础信息</strong><ChevronDown size={15} /></div>
      <div className="eval-task-info-grid">
        <div><span>评测对象</span><strong>{task.agent}<small>{task.agentVersion}</small></strong></div>
        <div><span>评测集</span><strong>{dataset?.name ?? '未采集'}<small>{task.datasetVersion}</small></strong></div>
        <div><span>创建时间</span><strong>{task.createdAt}</strong></div>
        <div><span>任务 ID</span><strong className="eval-mono">{task.id}</strong></div>
        <div><span>创建人</span><strong>{task.createdBy}</strong></div>
        <div><span>描述</span><strong>{task.description || '未采集'}</strong></div>
      </div>
    </section>
    <nav className="eval-task-detail-tabs" aria-label="任务详情内容"><button type="button" className={tab === 'data' ? 'is-active' : ''} onClick={() => onTabChange('data')}>数据明细</button><button type="button" className={tab === 'summary' ? 'is-active' : ''} onClick={() => onTabChange('summary')}>统计结论</button><button type="button" className={tab === 'optimize' ? 'is-active' : ''} onClick={() => onTabChange('optimize')}>优化实验</button></nav>
    {tab === 'summary' && <TaskMetricBoard evaluatorRows={evaluatorRows} runtimeRows={runtimeRows} aggregation={metricAggregation} onAggregationChange={setMetricAggregation} />}
    {tab === 'data' && <section className="eval-task-data-detail">
      <div className="eval-task-data-toolbar"><span>{task.results.length} 条 Case</span><div className="eval-human-label-wrap"><button type="button" className="eval-button eval-button--ghost" onClick={() => setHumanLabelMenuOpen((current) => !current)}><Plus size={15} />添加人工标注</button>{humanLabelMenuOpen && <div className="eval-human-label-menu">{state.humanLabels.map((label) => <button type="button" key={label.id} className={activeHumanLabelId === label.id ? 'is-active' : ''} onClick={() => { setActiveHumanLabelId(label.id); setHumanLabelMenuOpen(false); }}><span><strong>{label.name}</strong><small>{label.scoreType === 'numeric' ? `0-1 分，阈值 ${label.passThreshold ?? 0}` : '通过 / 不通过'}</small></span>{activeHumanLabelId === label.id && <Check size={14} />}</button>)}</div>}</div></div>
      <div className="eval-task-detail-table-wrap">
        <table className="eval-task-detail-table">
          <thead>
            <tr className="eval-task-detail-table__groups">
              <th rowSpan={2} className="is-sticky">选择 / ID</th>
              <th colSpan={datasetFields.length}>评测集字段</th>
              <th colSpan={runtimeOutputFields.length + 1}>运行时产生数据</th>
              <th>Trace</th>
              <th>User Feedback</th>
              {activeHumanLabel && <th>人工标注</th>}
              <th colSpan={taskEvaluators.length}>评估器</th>
              <th colSpan={runtimeEfficiencyFields.length}>Agent 运行效率</th>
              <th rowSpan={2} className="is-sticky is-sticky-right">操作</th>
            </tr>
            <tr>
              {datasetFields.map((field) => <th key={field.id}>{field.semantic === 'Custom' ? field.name : field.semantic}</th>)}
              {runtimeOutputFields.map((field) => <th key={field.id}>{field.semantic}</th>)}
              <th>运行状态</th>
              <th className="is-trace">执行轨迹</th>
              <th>User Feedback</th>
              {activeHumanLabel && <th>{activeHumanLabel.name}</th>}
              {taskEvaluators.map((evaluator) => <th key={evaluator.id}>{evaluator.name}<small>评估结果</small></th>)}
              {runtimeEfficiencyFields.map((field) => <th key={field.key}>{field.label}<small>运行指标</small></th>)}
            </tr>
          </thead>
          <tbody>{task.results.map((item) => {
            const annotationKey = activeHumanLabel ? `${item.caseId}:${activeHumanLabel.id}` : '';
            const annotation = activeHumanLabel ? humanAnnotations[annotationKey] ?? item.humanAnnotations?.[activeHumanLabel.id] : undefined;
            const feedbackField = dataset?.fields.find((field) => field.semantic === 'User Feedback');
            const datasetCase = dataset?.cases.find((current) => current.id === item.caseId);
            return <tr key={item.caseId} onClick={() => onOpenCase(item)}>
              <td className="is-sticky"><div className="eval-case-select"><input type="checkbox" disabled={item.caseMark !== 'Badcase'} checked={selectedBadCaseIds.includes(item.caseId)} onChange={() => toggleBadCase(item.caseId)} onClick={(event) => event.stopPropagation()} /><span><strong className="eval-mono">{item.caseId}</strong></span></div></td>
              {datasetFields.map((field) => <td key={field.id} title={getFieldValue(item, field)}>{getFieldValue(item, field)}</td>)}
              {runtimeOutputFields.map((field) => <td key={field.id} title={getFieldValue(item, field)}>{getFieldValue(item, field)}</td>)}
              <td>{getRuntimeValue(item, 'runStatus')}</td>
              <td className="is-trace" title={getTraceValue(item)}><span>{getTraceValue(item)}</span></td>
              <td title={item.userFeedback || datasetCase?.values[feedbackField?.id ?? ''] || '未采集'}>{item.userFeedback || datasetCase?.values[feedbackField?.id ?? ''] || '未采集'}</td>
              {activeHumanLabel && <td><button type="button" className={`eval-human-cell${annotation ? ' is-filled' : ''}`} onClick={(event) => { event.stopPropagation(); setAnnotationEditor({ caseId: item.caseId, labelId: activeHumanLabel.id }); }}><strong>{getHumanAnnotationValue(item)}</strong><small>{annotation?.reason || '点击编辑标注'}</small></button></td>}
              {taskEvaluators.map((evaluator) => <td key={evaluator.id} title={getEvaluatorValue(item, evaluator.id)}>{getEvaluatorValue(item, evaluator.id)}</td>)}
              {runtimeEfficiencyFields.map((field) => <td key={field.key} title={getRuntimeValue(item, field.key)}>{getRuntimeValue(item, field.key)}</td>)}
              <td className="is-sticky is-sticky-right"><div className="eval-row-actions"><button type="button" className="eval-text-button" onClick={(event) => { event.stopPropagation(); onOpenCase(item); }}>详情</button><button type="button" className="eval-text-button" onClick={(event) => { event.stopPropagation(); onNotify(`${item.caseId} 已加入重试队列`); }}>重试</button></div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>}
    {tab === 'optimize' && <section className="eval-experiment-records"><div className="eval-task-section-heading"><div><h3>优化实验记录</h3><p>点击记录查看配置对比、优化建议和实验对比数据。</p></div><span>{taskExperiments.length} 条记录</span></div>{taskExperiments.length ? <div className="eval-table-wrap"><table className="eval-data-table"><thead><tr><th>优化任务</th><th>Agent 类型</th><th>优化后流程</th><th>Badcase</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{taskExperiments.map((item) => <tr key={item.id} onClick={() => onOpenExperiment(item)}><td><div className="eval-cell-title"><strong>{item.name}</strong><small>{item.id}</small></div></td><td>{item.agentType}</td><td>{item.followUpMode}</td><td>{item.selectedCaseCount}</td><td><Status label={item.status} /></td><td>{item.createdAt}</td><td><IconButton label="查看优化详情" onClick={() => onOpenExperiment(item)}><Eye size={15} /></IconButton></td></tr>)}</tbody></table></div> : <EmptyState title="暂无优化实验记录" description="在数据明细中勾选 Badcase 后发起优化。" />}</section>}
    {optimizeModalOpen && <OptimizationStartModal task={task} selectedCount={selectedBadCaseIds.length} onCancel={() => setOptimizeModalOpen(false)} onStart={(mode) => { setOptimizeModalOpen(false); onOptimize(selectedBadCaseIds, mode, task.agentType ?? '万智'); }} />}
    {annotationEditor && editingHumanLabel && <HumanAnnotationEditor caseId={annotationEditor.caseId} label={editingHumanLabel} value={humanAnnotations[`${annotationEditor.caseId}:${annotationEditor.labelId}`]} onCancel={() => setAnnotationEditor(null)} onSave={(annotation) => { setHumanAnnotations((current) => ({ ...current, [`${annotationEditor.caseId}:${annotationEditor.labelId}`]: annotation })); setAnnotationEditor(null); onNotify('人工标注已保存'); }} />}
  </div>;
}
function CasePreview({ item, onClose }: { item: CaseResult; onClose: () => void }) {
  return <div className="eval-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="eval-case-preview" role="dialog" aria-modal="true" aria-label={item.caseId}><header><div><span className="eval-eyebrow">CASE DETAIL</span><h2>{item.caseId}</h2></div><IconButton label="关闭" onClick={onClose}><X size={17} /></IconButton></header><div className="eval-case-preview__status"><Status label={item.status} /><span>{item.runtime?.agentDuration ?? '未采集'} · {item.runtime?.totalTokens ?? 0} Tokens</span>{item.caseMark && <Pill tone={item.caseMark === 'Badcase' ? 'amber' : 'green'}>{item.caseMark}</Pill>}</div><div className="eval-case-preview__blocks"><div><span>Input</span><p>{item.input || '未采集'}</p></div><div><span>Agent Output</span><p>{item.agentOutput || '没有生成 Agent Output。'}</p></div><div><span>Trace</span><p>{item.trace.map((event) => `${event.name} · ${event.status}`).join(' → ')}</p></div><div><span>User Feedback</span><p>{item.userFeedback || '未采集'}</p></div><div><span>人工标注</span><p>{item.humanEvaluation ? `${item.humanEvaluation.humanLabel} · ${item.humanEvaluation.humanReason}` : '未采集'}</p></div></div><div className="eval-case-preview__evaluators"><span className="eval-eyebrow">EVALUATOR RESULTS</span>{item.evaluatorResults.map((result) => <div key={result.evaluatorId}><div><strong>{result.evaluatorName}</strong><small>{result.evaluationReason}</small></div><Pill tone={result.evaluationStatus === '通过' ? 'green' : result.evaluationStatus === '不通过' ? 'amber' : 'neutral'}>{result.scoreType === 'numeric' && typeof result.evaluationResult === 'number' ? result.evaluationResult.toFixed(2) : result.evaluationResult}</Pill></div>)}</div><footer><button type="button" className="eval-button eval-button--primary" onClick={onClose}>关闭</button></footer></section></div>;
}

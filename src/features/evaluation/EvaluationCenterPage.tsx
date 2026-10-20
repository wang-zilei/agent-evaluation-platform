import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type Dispatch, type MouseEvent, type ReactNode, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import {
  Activity, ArrowLeft, ArrowUpRight, BarChart3, Bot, Braces, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  CircleAlert, CircleCheck, CircleX, ClipboardCheck, Clock3, Copy, Database, Download, Eye, FileSpreadsheet, Gauge, GitCompare, History,
  Layers3, ListChecks, Maximize2, Minus, MoreHorizontal, Package, Pencil, Percent, PlugZap, Plus, RefreshCw, Search, Settings2, Sparkles, Table2, Target, TimerReset, Trash2, Upload,
  Tag, Wand2, X, Zap,
} from 'lucide-react';
import OverviewPage from '../overview/OverviewPage';
import AccessCenterPage from '../access/AccessCenterPage';
import { cloneEvaluationState, createComparisonRecord, getDatasetById, historyConversations, statusTone } from './evaluation.mock';
import {
  FINANCIAL_COMPLIANCE_AGENT_ID,
  FINANCIAL_COMPLIANCE_AGENT_VERSION,
  FINANCIAL_COMPLIANCE_DATASET_ID,
} from './financial-compliance.mock';
import {
  QUERY_AGENT_CORE_EVALUATOR_IDS,
  QUERY_AGENT_AGENT_ID,
  QUERY_AGENT_AGENT_VERSION,
  createQueryAgentResults,
  isQueryAgentDataset,
} from './query-agent.mock';
import { observedSessions, observedTraces } from './trace.data';
import { SessionDetail, TraceDetail, TraceList, type ObservationBackflowSelection, type ObservationView } from './TraceWorkspace';
import { AutoEvaluationPanel } from './AutoEvaluation';
import { EvaluatorCalibrationModal, EvaluatorOptimizationList, EvaluatorOptimizationStartModal, EvaluatorOptimizationWorkbench } from './EvaluatorOptimization';
import { SearchField, SelectField } from './eval-ui';
import type { EvaluatorCalibration, EvaluatorOptimizationExperiment } from './evaluation.types';
import type { ObservedSession, ObservedTrace, TraceEvent as ObservationTraceEvent } from './trace.types';
import type {
  AgentMcpConnection,
  AgentSkillBinding,
  AgentOption, CaseResult, Dataset, DatasetCase, EvaluationModule, EvaluationState,
  EvaluationTask, Evaluator, EvaluatorMode, FieldDefinition, FieldSemantic, HistoryConversation,
  ComparisonRecord, EvaluatorKind, OptimizeExperiment, OptimizationFollowUpMode, OptimizationResult, ScoreType,
  ComparisonCaseRow, ComparisonEvaluatorRow, ComparisonMetricCell, ComparisonOutputCell, ComparisonRuntimeRow, ComparisonTaskRef, EvaluatorResult,
  HumanAnnotation, HumanLabelDefinition, TaskAgentTarget, OptimizationAttributionTag, OptimizationReport, OptimizationReportAction,
} from './evaluation.types';
import './evaluation.css';
import './auto-eval.css';

type Toast = { id: number; message: string; tone: 'success' | 'warning' | 'danger' };
type DatasetScreen = 'list' | 'workspace' | 'upload' | 'generate' | 'history';
type EvaluatorScreen = 'list' | 'detail' | 'create' | 'optimization';
type TaskScreen = 'list' | 'create' | 'detail' | 'experiment';
type ExperimentScreen = 'list' | 'detail';
type DatasetCreateMode = '用户上传' | '智能生成' | '历史对话回流';
type AddDataMode = 'choose' | 'manual' | 'file' | 'trace';
type HistoryDatePreset = '3' | '5' | '7' | '30' | 'custom';
type ObservationHistorySource = { conversations: HistoryConversation[]; agents: AgentOption[]; anchor: string };
type TaskCreateStep = 1 | 2 | 3 | 4;
type TraceScreen = 'list' | 'detail';
type CaseObservationView = 'trace' | 'session';
type HumanAnnotationFilter = '' | '已标注' | '未标注';
type EvaluatorResultFilter = '通过' | '不通过';
type OptimizationDetailTab = 'report' | 'metrics' | 'details';
type TaskEvaluatorMetric = {
  name: string;
  average?: number;
  passRate?: number;
  validCount: number;
  invalidCount: number;
  invalidLabel: string;
  scores: number[];
  min?: number;
  max?: number;
  threshold?: number;
};
type TaskRuntimeMetric = {
  key: string;
  name: string;
  average?: number;
  min?: number;
  max?: number;
  validCount: number;
  values: number[];
};

type ParsedFile = { name: string; format: string; columns: string[]; rows: Record<string, string>[] };
type UploadField = { id: string; sourceColumn: string; name: string; semantic: FieldSemantic };
type DatasetDraft = {
  mode: DatasetCreateMode; name: string; description: string; tags: string; file: ParsedFile | null;
  fields: UploadField[]; parsing: boolean; error: string;
  generateAgentId: string; generateVersion: string; generatePrompt: string; generateCount: number;
  historyAgentId: string; historyVersion: string; historyPreset: HistoryDatePreset; historyStart: string; historyEnd: string;
  historyFeedback: '全部' | '有反馈' | '无反馈'; historySelected: Record<string, string[]>; historyExpanded: string | null; historyPage: number;
  appendToDatasetId?: string; importMode?: '追加数据' | '全量覆盖';
};
type CodeEvaluatorLanguage = 'Python' | 'JavaScript';
type ImportedSkillFile = {
  id: string;
  name: string;
  path: string;
  size: number;
  text: string;
};
type DroppedFileEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file?: (resolve: (file: File) => void, reject?: (reason: unknown) => void) => void;
  createReader?: () => {
    readEntries: (resolve: (entries: DroppedFileEntry[]) => void, reject?: (reason: unknown) => void) => void;
  };
};
type EvaluatorDraft = {
  name: string;
  description: string;
  model: string;
  scoreType: ScoreType;
  passThreshold: number;
  prompt: string;
  variables: Evaluator['variables'];
  category: string;
  language: CodeEvaluatorLanguage;
  inputs: string[];
  code: string;
  scope: string;
  notFor: string;
  dependencies: string;
  timeout: number;
  skills: AgentSkillBinding[];
  mcpConnections: AgentMcpConnection[];
};
type TaskDraft = {
  agentTargets: TaskAgentTarget[]; datasetId: string; datasetVersion: string; evaluatorIds: string[];
  name: string; description: string; concurrency: number; timeout: number; continueOnError: boolean;
};

const TODAY = '2026-08-28';
const currentTimestamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false }).slice(0, 16);
const HISTORY_PAGE_SIZE = 8;
const INITIAL_EVALUATION_STATE = cloneEvaluationState();
const FIELD_SEMANTICS: FieldSemantic[] = ['Input', 'File', 'Expected Output', 'Agent Output', 'Trace', 'Agent Configuration', 'User Feedback', 'Custom'];
const EVALUATOR_KINDS: EvaluatorKind[] = ['模型评估器', 'Agent 评估器', '代码评估', '人工评估'];
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
    mode, name: '', description: '', tags: '', file: null, fields: [], parsing: false, error: '',
    generateAgentId: agent?.id ?? '', generateVersion: agent?.versions[0] ?? '', generatePrompt: '', generateCount: 5,
    historyAgentId: agent?.id ?? '', historyVersion: agent?.versions[0] ?? '', historyPreset: '7', historyStart: shiftDate(TODAY, -6), historyEnd: TODAY,
    historyFeedback: '全部', historySelected: {}, historyExpanded: null, historyPage: 1,
  };
};
const compactObservationText = (value: string, fallback: string) => {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return fallback;
  return compact.length > 72 ? `${compact.slice(0, 72)}…` : compact;
};
const normalizeHistoryDate = (value: string | null) => {
  const match = value?.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : TODAY;
};
const formatObservationHistoryTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false }).slice(0, 16);
};
const observedHistoryAgentId = (agent: string | null) => `observed:${agent ?? '未采集 Agent'}`;
const observedHistoryTrace = (trace: ObservedTrace) => ({
  id: trace.traceId ?? trace.id,
  name: `Turn ${trace.turn}`,
  summary: compactObservationText(trace.output, `${trace.events.length} 个执行节点`),
  input: trace.input || '未采集',
  agentOutput: trace.output || '未采集',
  userFeedback: trace.feedback ?? '',
  occurredAt: formatObservationHistoryTime(trace.occurredAt),
});
const buildObservationHistorySource = (selection: ObservationBackflowSelection): ObservationHistorySource => {
  const conversations: HistoryConversation[] = selection.view === 'trace'
    ? selection.traces.map((trace) => ({
      id: `OBS-TRACE-${trace.id}`,
      title: compactObservationText(trace.input, trace.traceId ?? trace.id),
      occurredAt: formatObservationHistoryTime(trace.occurredAt),
      agentId: observedHistoryAgentId(trace.agent),
      agentVersion: '采集记录',
      traces: [observedHistoryTrace(trace)],
    }))
    : selection.sessions.map((session) => ({
      id: `OBS-SESSION-${session.id}`,
      title: compactObservationText(session.turns[0]?.input ?? '', session.id),
      occurredAt: formatObservationHistoryTime(session.startedAt),
      agentId: observedHistoryAgentId(session.agent),
      agentVersion: '采集记录',
      traces: session.turns.map(observedHistoryTrace),
    }));
  const agents = [...new Set(conversations.map((conversation) => conversation.agentId))].map((agentId) => ({
    id: agentId,
    name: agentId.startsWith('observed:') ? agentId.slice('observed:'.length) : agentId,
    versions: ['采集记录'],
    description: '从观测列表带入的已采集轨迹。',
    source: '万智' as const,
    protocol: '实时上报' as const,
  }));
  const anchor = conversations.map((conversation) => normalizeHistoryDate(conversation.occurredAt)).sort().at(-1) ?? TODAY;
  return { conversations, agents, anchor };
};
const CODE_TEMPLATE: Record<CodeEvaluatorLanguage, string> = {
  Python: `def evaluate(input, output, context=None):
    # Evaluate one record and return score and explanation.
    return {
        "score": 0,
        "explanation": "Describe why this score was assigned",
    }`,
  JavaScript: `export function evaluate(input, output, context = null) {
  // Evaluate one record and return score and explanation.
  return {
    score: 0,
    explanation: "Describe why this score was assigned",
  };
}`,
};
const makeEvaluatorDraft = (): EvaluatorDraft => ({
  name: '', description: '', model: 'Doubao-Seed-1.6', scoreType: 'numeric', passThreshold: 0.7,
  prompt: '',
  variables: [],
  category: '格式与结构',
  language: 'Python',
  inputs: ['Agent Output'],
  code: CODE_TEMPLATE.Python,
  scope: '按声明的输入变量执行确定性检查。',
  notFor: '不进行开放式语义判断。',
  dependencies: 'Python 标准库 + 白名单依赖',
  timeout: 30000,
  skills: [],
  mcpConnections: [],
});
const makeTaskDraft = (state: EvaluationState, preferredAgentId?: string): TaskDraft => {
  const dataset = state.datasets.find((item) => item.versions.some((version) => version.status === '已提交')) ?? state.datasets[0];
  const firstAgent = state.agents.find((item) => item.id === preferredAgentId) ?? state.agents[0];
  return { agentTargets: firstAgent ? [{ agentId: firstAgent.id, agentVersion: firstAgent.versions[0] ?? '' }] : [], datasetId: dataset?.id ?? '', datasetVersion: dataset?.versions.find((version) => version.status === '已提交')?.id ?? '', evaluatorIds: [], name: '', description: '', concurrency: 2, timeout: 60, continueOnError: true };
};

const evaluatorDraftFrom = (evaluator: Evaluator, name = evaluator.name): EvaluatorDraft => ({
  name,
  description: evaluator.description,
  model: evaluator.model,
  scoreType: evaluator.scoreType,
  passThreshold: evaluator.passThreshold ?? 0.7,
  prompt: evaluator.prompt,
  variables: evaluator.variables,
  category: evaluator.category,
  language: evaluator.implementation === 'JavaScript' ? 'JavaScript' : 'Python',
  inputs: evaluator.variables.map((variable) => variable.name),
  code: evaluator.code ?? CODE_TEMPLATE.Python,
  scope: evaluator.scope ?? '按声明的输入变量执行确定性检查。',
  notFor: evaluator.notFor ?? '不进行开放式语义判断。',
  dependencies: evaluator.dependencies ?? 'Python 标准库 + 白名单依赖',
  timeout: evaluator.timeout ?? 30000,
  skills: structuredClone(evaluator.skills ?? []),
  mcpConnections: structuredClone(evaluator.mcpConnections ?? []),
});

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
  const [module, setModule] = useState<EvaluationModule>('overview');
  const [taskScreen, setTaskScreen] = useState<TaskScreen>('list');
  const [experimentScreen, setExperimentScreen] = useState<ExperimentScreen>('list');
  const [datasetScreen, setDatasetScreen] = useState<DatasetScreen>('list');
  const [evaluatorScreen, setEvaluatorScreen] = useState<EvaluatorScreen>('list');
  const [traceScreen, setTraceScreen] = useState<TraceScreen>('list');
  const [observationView, setObservationView] = useState<ObservationView>('trace');
  const [evaluatorMode, setEvaluatorMode] = useState<EvaluatorMode>('preset');
  const [evaluatorKind, setEvaluatorKind] = useState<EvaluatorKind>('代码评估');
  const [datasetDraft, setDatasetDraft] = useState<DatasetDraft>(() => makeDatasetDraft(INITIAL_EVALUATION_STATE));
  const [observationHistorySource, setObservationHistorySource] = useState<ObservationHistorySource | null>(null);
  const [datasetReturnToObservation, setDatasetReturnToObservation] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(() => makeTaskDraft(INITIAL_EVALUATION_STATE));
  const [evaluatorDraft, setEvaluatorDraft] = useState<EvaluatorDraft>(makeEvaluatorDraft);
  const [selectedDatasetId, setSelectedDatasetId] = useState(INITIAL_EVALUATION_STATE.datasets[0]?.id ?? '');
  const [selectedTaskId, setSelectedTaskId] = useState(INITIAL_EVALUATION_STATE.tasks[0]?.id ?? '');
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState(INITIAL_EVALUATION_STATE.evaluators[0]?.id ?? '');
  const [selectedExperimentId, setSelectedExperimentId] = useState(INITIAL_EVALUATION_STATE.experiments[0]?.id ?? '');
  const [selectedComparisonId, setSelectedComparisonId] = useState(INITIAL_EVALUATION_STATE.comparisons[0]?.id ?? '');
  const [search, setSearch] = useState(''); const [datasetSearch, setDatasetSearch] = useState(''); const [taskSearch, setTaskSearch] = useState(''); const [experimentSearch, setExperimentSearch] = useState(''); const [traceSearch, setTraceSearch] = useState(''); const [scoreFilter, setScoreFilter] = useState('全部结果类型');
  const [toast, setToast] = useState<Toast | null>(null); const [toastId, setToastId] = useState(0); const [casePreview, setCasePreview] = useState<{ item: CaseResult; taskId: string } | null>(null);
  const [caseObservation, setCaseObservation] = useState<{ item: CaseResult; task: EvaluationTask; view: CaseObservationView } | null>(null);
  const [taskReturn, setTaskReturn] = useState(false);
  const [selectedTraceId, setSelectedTraceId] = useState(observedTraces[0]?.id ?? '');
  const [selectedSessionId, setSelectedSessionId] = useState(observedSessions[0]?.id ?? '');
  const [datasetEntryFromTask, setDatasetEntryFromTask] = useState(false);
  const [editingEvaluatorId, setEditingEvaluatorId] = useState<string | null>(null);
  const [comparisonPickerOpen, setComparisonPickerOpen] = useState(false);
  const [comparisonInitialControlId, setComparisonInitialControlId] = useState('');
  const [taskDetailTab, setTaskDetailTab] = useState<'summary' | 'data' | 'optimize'>('summary');
  const [selectedOptimizationId, setSelectedOptimizationId] = useState('');
  const [calibrationTarget, setCalibrationTarget] = useState<{ taskId: string; caseId: string; evaluatorId: string } | null>(null);
  const [optimizationStart, setOptimizationStart] = useState<{ evaluatorId: string; version: string } | null>(null);
  const notify = (message: string, tone: Toast['tone'] = 'success') => { const id = toastId + 1; setToastId(id); setToast({ id, message, tone }); window.setTimeout(() => setToast((current) => current?.id === id ? null : current), 2600); };
  const showList = () => { if (module === 'datasets') { setDatasetScreen('list'); setDatasetEntryFromTask(false); } if (module === 'evaluators') setEvaluatorScreen('list'); if (module === 'tasks' || module === 'automation') setTaskScreen('list'); if (module === 'experiments') setExperimentScreen('list'); if (module === 'traces') { setTraceScreen('list'); setCaseObservation(null); } };
  const openDatasetCreate = (mode: DatasetCreateMode) => {
    setTaskReturn(module === 'tasks' && taskScreen === 'create');
    setDatasetEntryFromTask(module === 'tasks' && taskScreen === 'create');
    setObservationHistorySource(null);
    setDatasetReturnToObservation(false);
    setDatasetDraft((current) => ({ ...current, mode }));
    setDatasetScreen(mode === '用户上传' ? 'upload' : mode === '智能生成' ? 'generate' : 'history');
    setModule('datasets');
  };
  const openObservationBackflow = (selection: ObservationBackflowSelection) => {
    const source = buildObservationHistorySource(selection);
    if (!source.conversations.length || !source.agents.length) {
      notify('请先选择要回流的 Trace 或 Session', 'warning');
      return;
    }
    const firstAgent = source.agents[0];
    const draft = makeDatasetDraft(state, '历史对话回流');
    setObservationHistorySource(source);
    setDatasetReturnToObservation(true);
    setDatasetEntryFromTask(false);
    setTaskReturn(false);
    setDatasetDraft({
      ...draft,
      historyAgentId: firstAgent.id,
      historyVersion: firstAgent.versions[0] ?? '',
      historyPreset: '30',
      historyStart: shiftDate(source.anchor, -29),
      historyEnd: source.anchor,
      historySelected: Object.fromEntries(source.conversations.map((conversation) => [conversation.id, conversation.traces.map((trace) => trace.id)])),
    });
    setDatasetScreen('history');
    setModule('datasets');
  };
  const closeObservationBackflow = () => {
    setObservationHistorySource(null);
    setDatasetReturnToObservation(false);
    setDatasetScreen('list');
    setModule('traces');
    setTraceScreen('list');
  };
  const openTaskCreate = (preferredAgentId?: string) => { setTaskDraft(makeTaskDraft(state, preferredAgentId)); setTaskScreen('create'); setModule('tasks'); };
  const openComparison = (item: ComparisonRecord) => { setSelectedComparisonId(item.id); setExperimentScreen('detail'); setModule('experiments'); };
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
    setExperimentScreen('detail');
    setModule('experiments');
    notify('对比实验已创建，已生成指标统计');
  };
  const rebuildComparisons = (current: EvaluationState, tasks: EvaluationTask[]) => current.comparisons.map((record) => {
    const controlTask = tasks.find((item) => item.id === record.controlTaskId);
    const experimentTasks = record.experimentTaskIds.map((id) => tasks.find((item) => item.id === id)).filter((item): item is EvaluationTask => Boolean(item));
    const sourceDataset = current.datasets.find((item) => item.id === record.datasetId);
    if (!controlTask || experimentTasks.length !== record.experimentTaskIds.length || !sourceDataset) return record;
    return { ...createComparisonRecord(controlTask, experimentTasks, sourceDataset, current.evaluators, record.name), createdAt: record.createdAt };
  });
  const saveCalibration = (calibration: EvaluatorCalibration) => {
    setState((current) => {
      const tasks = current.tasks.map((currentTask) => currentTask.id === calibration.taskId ? {
        ...currentTask,
        results: currentTask.results.map((caseResult) => caseResult.caseId === calibration.caseId ? {
          ...caseResult,
          evaluatorResults: caseResult.evaluatorResults.map((entry) => entry.evaluatorId === calibration.evaluatorId ? {
            ...entry,
            evaluationResult: calibration.result,
            evaluationReason: calibration.reason,
            evaluationStatus: calibration.status,
            calibration,
          } : entry),
        } : caseResult),
      } : currentTask);
      return { ...current, tasks, comparisons: rebuildComparisons(current, tasks) };
    });
    setCalibrationTarget(null);
    notify('人工校准已更新');
  };
  const retryCase = (taskId: string, caseId: string) => {
    setState((current) => {
      const tasks = current.tasks.map((currentTask) => currentTask.id === taskId ? {
        ...currentTask,
        results: currentTask.results.map((caseResult) => {
          if (caseResult.caseId !== caseId) return caseResult;
          const attemptNumber = (caseResult.attemptHistory?.length ?? 0) + 2;
          const attemptId = `attempt-${attemptNumber}`;
          const snapshot = {
            attemptId: caseResult.currentAttemptId ?? 'attempt-1',
            status: caseResult.status,
            agentOutput: caseResult.agentOutput,
            evaluatorResults: structuredClone(caseResult.evaluatorResults),
            createdAt: currentTask.updatedAt,
          };
          return {
            ...caseResult,
            currentAttemptId: attemptId,
            attemptHistory: [...(caseResult.attemptHistory ?? []), snapshot],
            evaluatorResults: caseResult.evaluatorResults.map((entry) => ({
              ...entry,
              attemptId,
              evaluationResult: entry.calibration?.originalResult ?? entry.evaluationResult,
              evaluationReason: entry.calibration?.originalReason ?? entry.evaluationReason,
              evaluationStatus: entry.calibration?.originalStatus ?? entry.evaluationStatus,
              calibration: undefined,
            })),
          };
        }),
      } : currentTask);
      return { ...current, tasks, comparisons: rebuildComparisons(current, tasks) };
    });
    notify('重试完成，当前结果已切换到新执行轮次');
  };
  const startOptimization = (caseIds: string[], followUpMode: OptimizationFollowUpMode, agentType: '万智' | '外部', sourceTaskId: string) => {
    const target = state.experiments.find((item) => item.sourceTaskId === sourceTaskId && item.followUpMode === followUpMode && item.agentType === agentType) ?? state.experiments.find((item) => item.followUpMode === followUpMode && item.agentType === agentType) ?? state.experiments[0];
    if (!target) return;
    setSelectedExperimentId(target.id);
    setTaskDetailTab('optimize');
    setTaskScreen('detail');
    notify(`${caseIds.length} 个 Badcase 已进入${followUpMode === '直接实验对比' ? '自动复测流程' : followUpMode === '仅生成建议' ? '建议生成流程' : '配置审查流程'}`);
  };
  const openEvaluatorCreate = () => { setTaskReturn(module === 'tasks' && taskScreen === 'create'); setEditingEvaluatorId(null); setEvaluatorDraft(makeEvaluatorDraft()); setEvaluatorScreen('create'); setModule('evaluators'); };

  const createDataset = (draft: DatasetDraft) => {
    if (!draft.name.trim()) { notify('请填写评测集名称', 'warning'); return; }
    const createdAt = currentTimestamp();
    const createdDate = createdAt.slice(0, 10);
    const tags = [...new Set(draft.tags.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 6);
    const fallbackTag = draft.mode === '历史对话回流' ? '轨迹' : draft.mode === '智能生成' ? '合成数据' : '文件导入';
    let fields: FieldDefinition[] = []; let cases: DatasetCase[] = []; let note = '';
    if (draft.mode === '用户上传') {
      if (!draft.file?.rows.length || !draft.fields.length) { notify('请上传包含数据的文件并确认字段', 'warning'); return; }
      fields = draft.fields.map((field, index) => ({ id: `field-${index + 1}`, name: field.name.trim() || field.sourceColumn, semantic: field.semantic, description: FIELD_DESCRIPTIONS[field.semantic], required: field.semantic === 'Input' }));
      cases = draft.file.rows.map((row, index) => ({ id: `CASE-IMPORT-${String(index + 1).padStart(3, '0')}`, values: Object.fromEntries(draft.fields.map((field, fieldIndex) => [`field-${fieldIndex + 1}`, row[field.sourceColumn] ?? ''])), source: '用户上传', createdAt: createdDate, hasFile: false }));
      note = `从 ${draft.file.name} 导入 ${cases.length} 条数据。`;
    } else if (draft.mode === '智能生成') {
      if (!draft.generateAgentId || !draft.generateVersion || !draft.generatePrompt.trim()) { notify('请完成 Agent、版本和生成场景配置', 'warning'); return; }
      fields = [{ id: 'input', name: '用户输入', semantic: 'Input', description: FIELD_DESCRIPTIONS.Input, required: true }, { id: 'expected', name: '验收要点', semantic: 'Expected Output', description: FIELD_DESCRIPTIONS['Expected Output'], required: false }];
      cases = Array.from({ length: draft.generateCount }, (_, index) => ({ id: `CASE-GENERATED-${String(index + 1).padStart(3, '0')}`, values: { input: `${draft.generatePrompt.trim()} · 示例 ${index + 1}`, expected: '覆盖问题中的关键条件和下一步操作。' }, source: '智能生成', createdAt: createdDate, hasFile: false }));
      note = `基于 ${draft.generateVersion} 生成 ${cases.length} 条可编辑草稿，不执行 Agent。`;
    } else {
      const filtered = historyForDraft(draft); const selected = filtered.map((conversation) => ({ ...conversation, traces: conversation.traces.filter((trace) => (draft.historySelected[conversation.id] ?? []).includes(trace.id)) })).filter((conversation) => conversation.traces.length);
      if (!selected.length) { notify('请至少勾选 1 个对话或 Trace', 'warning'); return; }
      fields = [{ id: 'input', name: '用户输入', semantic: 'Input', description: FIELD_DESCRIPTIONS.Input, required: true }, { id: 'actual', name: '原始回答', semantic: 'Agent Output', description: FIELD_DESCRIPTIONS['Agent Output'], required: false }, { id: 'trace', name: '原始 Trace', semantic: 'Trace', description: FIELD_DESCRIPTIONS.Trace, required: false }, { id: 'feedback', name: '用户反馈', semantic: 'User Feedback', description: FIELD_DESCRIPTIONS['User Feedback'], required: false }];
      cases = selected.map((conversation, index) => ({ id: `CASE-HISTORY-${String(index + 1).padStart(3, '0')}`, values: { input: conversation.traces[0]?.input ?? conversation.title, actual: conversation.traces.at(-1)?.agentOutput ?? '', trace: conversation.traces.map((trace) => `trace://${trace.id}`).join(' / '), feedback: conversation.traces.map((trace) => trace.userFeedback).filter(Boolean).join('；') }, source: '历史对话回流', createdAt: createdDate, hasFile: false }));
      note = `从 ${draft.historyVersion} 回流 ${cases.length} 条对话，沿用原始回复和 Trace。`;
    }
    const id = `DS-${String(state.datasets.length + 1).padStart(5, '0')}`; const versionId = `${id}-draft`;
    const normalizedFields = fields.map((field) => ({ ...field, id: `${id}-${field.id}` }));
    const dataset: Dataset = { id, name: draft.name.trim(), description: draft.description.trim(), tags: tags.length ? tags : [fallbackTag], status: '草稿', source: draft.mode, createdAt, updatedAt: createdAt, createdBy: '演示账户', fields: normalizedFields, cases: cases.map((item) => ({ ...item, values: Object.fromEntries(Object.entries(item.values).map(([key, value]) => [`${id}-${key}`, value])) })), draftVersionId: versionId, versions: [{ id: versionId, label: '草稿', status: '草稿', caseCount: cases.length, createdAt, createdBy: '演示账户', note }] };
    setState((current) => ({ ...current, datasets: [dataset, ...current.datasets] })); setSelectedDatasetId(id);
    setDatasetReturnToObservation(false);
    setObservationHistorySource(null);
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

  const deleteDataset = (id: string) => {
    const target = state.datasets.find((item) => item.id === id);
    if (!target) return;
    setState((current) => ({ ...current, datasets: current.datasets.filter((item) => item.id !== id) }));
    notify(`评测集「${target.name}」已删除`);
  };

  const submitDatasetVersion = (id: string, source: 'dataset' | 'task') => {
    const target = getDatasetById(state, id);
    if (!target?.draftVersionId) { notify('当前没有可提交的草稿', 'warning'); return; }
    const createdAt = currentTimestamp();
    const submittedCount = target.versions.filter((version) => version.status === '已提交').length + 1;
    const versionId = `${id}-v${submittedCount}`;
    const version: Dataset['versions'][number] = {
      id: versionId, label: `V${submittedCount}`, status: '已提交', caseCount: target.cases.length,
      createdAt, createdBy: target.createdBy, note: `提交当前草稿，包含 ${target.cases.length} 条 Case 和 ${target.fields.length} 个字段。`,
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

  const createEvaluator = (draft: EvaluatorDraft) => {
    const isHuman = evaluatorKind === '人工评估';
    const isCode = evaluatorKind === '代码评估';
    const isAgent = evaluatorKind === 'Agent 评估器';
    const evaluatorLabel = isAgent ? 'Agent 评估器' : isHuman ? '人工评估标签' : isCode ? '代码评估器' : '自建评估器';
    if (!draft.name.trim()) { notify(isHuman ? '请填写标签名' : '请填写评估器名称', 'warning'); return; }
    if (isCode) {
      if (!draft.code.trim() || !draft.code.includes('evaluate(')) { notify('评估代码需要包含 evaluate 函数', 'warning'); return; }
    } else if (!isHuman) {
      if (!draft.prompt.trim()) { notify('请填写 Prompt', 'warning'); return; }
    }

    const existing = editingEvaluatorId ? state.evaluators.find((item) => item.id === editingEvaluatorId) : undefined;
    const nextVersion = existing ? `0.0.${existing.versions.length + 1}` : '0.0.1';
    const variables = isHuman ? [] : isCode
      ? draft.inputs.map((name) => ({
          name,
          semantic: (['Input', 'Expected Output', 'Agent Output', 'Trace', 'Agent Configuration'] as string[]).includes(name) ? (name as FieldSemantic) : 'Custom' as const,
          required: true,
        }))
      : extractPromptVariables(draft.prompt);
    const evaluator: Evaluator = {
      id: existing?.id ?? `${isAgent ? 'agent' : isCode ? 'code' : isHuman ? 'human' : 'custom'}-${state.evaluators.length + 1}`,
      name: draft.name.trim(),
      kind: evaluatorKind,
      mode: 'custom',
      version: nextVersion,
      versions: existing ? [...existing.versions, nextVersion] : [nextVersion],
      description: isHuman ? '人工评估标签。' : draft.description.trim() || (isAgent ? '通过 Skills 和 MCP 完成多步评测。' : isCode ? '用户自定义确定性检查。' : '用户自定义评估规则。'),
      purpose: isHuman ? '用于人工标注和人工评分。' : isAgent ? (draft.description.trim() || '使用评测工作流、脚本和外部 MCP 完成多步判断。') : isCode ? (draft.scope.trim() || '按声明的输入变量执行确定性检查。') : (draft.description.trim() || '用户自定义评估规则。'),
      category: isHuman ? '人工评估' : isAgent ? 'Agent 评估' : isCode ? draft.category : '自建评估器',
      scoreType: draft.scoreType,
      model: isHuman ? '人工评估' : isCode ? '规则执行器' : draft.model,
      prompt: isHuman || isCode ? '' : draft.prompt,
      variables,
      passThreshold: draft.scoreType === 'numeric' ? draft.passThreshold : undefined,
      implementation: isCode ? draft.language : undefined,
      code: isCode ? draft.code : undefined,
      scope: isCode ? draft.scope : undefined,
      notFor: isCode ? draft.notFor : undefined,
      rules: isCode ? [
        { condition: '满足代码中的通过条件', output: draft.scoreType === 'numeric' ? '返回 0-1 的 score 和 explanation' : '返回通过状态和 explanation' },
        { condition: '不满足通过条件', output: draft.scoreType === 'numeric' ? '返回低分和 explanation' : '返回不通过状态和 explanation' },
      ] : undefined,
      outputExample: isCode ? (draft.scoreType === 'numeric'
        ? `{\n  "score": 0.8,\n  "explanation": "Describe why this score was assigned"\n}`
        : `{\n  "passed": true,\n  "explanation": "Describe why this result was assigned"\n}`) : undefined,
      dependencies: isCode ? draft.dependencies : undefined,
      timeout: isCode ? Math.min(60000, Math.max(1, draft.timeout)) : undefined,
      skills: isAgent ? structuredClone(draft.skills) : undefined,
      mcpConnections: isAgent ? structuredClone(draft.mcpConnections) : undefined,
      creator: existing?.creator ?? '演示账户',
      updatedAt: `${TODAY} 20:30`,
      runCount: existing?.runCount ?? 0,
    };
    const humanLabel: HumanLabelDefinition = {
      id: evaluator.id,
      name: evaluator.name,
      description: evaluator.description,
      scoreType: evaluator.scoreType,
      scoreMin: evaluator.scoreType === 'numeric' ? 0 : undefined,
      scoreMax: evaluator.scoreType === 'numeric' ? 1 : undefined,
      passThreshold: evaluator.passThreshold,
    };

    setState((current) => ({
      ...current,
      evaluators: existing ? current.evaluators.map((item) => item.id === existing.id ? evaluator : item) : [evaluator, ...current.evaluators],
      humanLabels: isHuman ? (current.humanLabels.some((item) => item.id === humanLabel.id) ? current.humanLabels.map((item) => item.id === humanLabel.id ? humanLabel : item) : [humanLabel, ...current.humanLabels]) : current.humanLabels,
    }));
    setSelectedEvaluatorId(evaluator.id);
    setEditingEvaluatorId(null);
    setEvaluatorMode('custom');
    if (taskReturn) {
      setTaskDraft((current) => ({ ...current, evaluatorIds: current.evaluatorIds.includes(evaluator.id) ? current.evaluatorIds : [...current.evaluatorIds, evaluator.id] }));
      setTaskReturn(false);
      setEvaluatorScreen('list');
      setTaskScreen('create');
      setModule('tasks');
      notify(`${evaluatorLabel}已创建，已加入当前任务配置`);
      return;
    }
    setEvaluatorScreen('list');
    notify(existing ? `${evaluatorLabel}已更新，生成版本 ${nextVersion}` : `${evaluatorLabel}已创建，版本 0.0.1`);
  };

  const createTask = () => {
    const dataset = getDatasetById(state, taskDraft.datasetId);
    const version = dataset?.versions.find((item) => item.id === taskDraft.datasetVersion);
    const selected = state.evaluators.filter((item) => taskDraft.evaluatorIds.includes(item.id));
    if (!taskDraft.name.trim()) { notify('请填写任务名称', 'warning'); return; }
    if (!dataset || !version || version.status !== '已提交') { notify('任务必须绑定已提交的评测集版本', 'warning'); return; }
    if (!taskDraft.agentTargets.length || taskDraft.agentTargets.some((target) => !target.agentId || !target.agentVersion)) { notify('请选择 Agent 和版本', 'warning'); return; }
    if (!selected.length) { notify('至少选择一个评估器', 'warning'); return; }
    if (isQueryAgentDataset(dataset.id) && !QUERY_AGENT_CORE_EVALUATOR_IDS.every((id) => taskDraft.evaluatorIds.includes(id))) {
      notify('问数评测必须选择 3 个核心硬门禁', 'warning'); return;
    }

    const tasks = taskDraft.agentTargets.map((target, targetIndex) => {
      const agent = state.agents.find((item) => item.id === target.agentId);
      const results: CaseResult[] = isQueryAgentDataset(dataset.id)
        ? createQueryAgentResults(selected, agent?.name ?? '问数 Agent', target.agentVersion)
        : dataset.cases.map((item, index) => {
        const input = item.values[dataset.fields.find((field) => field.semantic === 'Input')?.id ?? ''] ?? '未读取 Input';
        const agentOutput = item.values[dataset.fields.find((field) => field.semantic === 'Agent Output')?.id ?? ''] ?? '';
        const expectedOutput = item.values[dataset.fields.find((field) => field.semantic === 'Expected Output')?.id ?? ''];
        const status = index === 1 ? '不通过' : '通过';
        return {
          caseId: item.id,
          currentAttemptId: 'attempt-1',
          status,
          duration: index === 1 ? '7.4 s' : '5.9 s',
          input,
          agentOutput,
          expectedOutput,
          trace: [{ id: `mock-${targetIndex}-${index}`, type: 'system', name: 'Mock 执行记录', status: '成功', duration: '未采集', detail: '原型数据：不调用真实 Agent。' }],
          evaluatorResults: selected.map((evaluator) => ({
            evaluatorId: evaluator.id,
            evaluatorName: evaluator.name,
            evaluatorVersion: evaluator.version,
            attemptId: 'attempt-1',
            scoreType: evaluator.scoreType,
            evaluationResult: evaluator.scoreType === 'numeric' ? (index === 1 ? 0.58 : 0.92) : status,
            evaluationReason: evaluator.kind === '代码评估' ? '' : index === 1 ? '模拟数据：缺少一个验收要点。' : '模拟数据：满足当前评估器要求。',
            evaluationStatus: status,
            traceRefs: [`mock-${targetIndex}-${index}`],
            evaluationKind: evaluator.kind,
            diagnostics: evaluator.kind === '代码评估' ? (status === '通过' ? [] : [{ code: 'CHECK_FAILED', message: '规则检查未满足。', path: '$.agent_output' }]) : undefined,
            observations: evaluator.kind === '代码评估' ? { checks: status === '通过' ? 1 : 0, failed: status === '通过' ? 0 : 1 } : undefined,
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
        evaluatorVersions: Object.fromEntries(selected.map((evaluator) => [evaluator.id, evaluator.version])),
        evaluatorSnapshots: Object.fromEntries(selected.map((evaluator) => [evaluator.id, {
          evaluatorId: evaluator.id,
          name: evaluator.name,
          version: evaluator.version,
          purpose: evaluator.purpose,
          prompt: evaluator.prompt,
          variables: structuredClone(evaluator.variables),
          scoreType: evaluator.scoreType,
          passThreshold: evaluator.passThreshold,
          skills: evaluator.skills ? structuredClone(evaluator.skills) : undefined,
          mcpConnections: evaluator.mcpConnections ? structuredClone(evaluator.mcpConnections) : undefined,
        }])),
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
    const source = observationHistorySource?.conversations ?? historyConversations;
    const anchor = observationHistorySource?.anchor ?? TODAY;
    const days = draft.historyPreset === 'custom' ? null : Number(draft.historyPreset);
    const range = draft.historyPreset === 'custom' ? { start: startOfDay(draft.historyStart), end: endOfDay(draft.historyEnd) } : { start: startOfDay(shiftDate(anchor, -((days ?? 7) - 1))), end: endOfDay(anchor) };
    return source.filter((conversation) => {
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
  const selectedSession = observedSessions.find((item) => item.id === selectedSessionId) ?? observedSessions[0];
  const calibrationTask = state.tasks.find((item) => item.id === calibrationTarget?.taskId);
  const calibrationCase = calibrationTask?.results.find((item) => item.caseId === calibrationTarget?.caseId);
  const calibrationResult = calibrationCase?.evaluatorResults.find((item) => item.evaluatorId === calibrationTarget?.evaluatorId);
  const calibrationEvaluator = state.evaluators.find((item) => item.id === calibrationTarget?.evaluatorId);
  const optimizationStartEvaluator = state.evaluators.find((item) => item.id === optimizationStart?.evaluatorId);
  const selectedTrace = observedTraces.find((item) => item.id === selectedTraceId) ?? observedTraces[0];
  const casePreviewTask = casePreview ? state.tasks.find((item) => item.id === casePreview.taskId) : undefined;
  const caseObservationTrace = caseObservation ? resolveCaseObservationTrace(caseObservation.item, caseObservation.task) : null;
  const caseObservationSession = caseObservation && caseObservationTrace ? resolveCaseObservationSession(caseObservation.item, caseObservation.task, caseObservationTrace) : null;
  const selectedOptimization = state.evaluatorOptimizations.find((item) => item.id === selectedOptimizationId) ?? null;
  const openCaseObservation = (view: CaseObservationView) => {
    if (!casePreview || !casePreviewTask) return;
    setCaseObservation({ item: casePreview.item, task: casePreviewTask, view });
    setCasePreview(null);
    setModule('traces');
    setObservationView(view);
    setTraceScreen('detail');
    setTraceSearch('');
  };
  const openOptimization = (item: EvaluatorOptimizationExperiment) => { setSelectedOptimizationId(item.id); setSelectedEvaluatorId(item.evaluatorId); setEvaluatorScreen('optimization'); setModule('evaluators'); };
  const selectModule = (next: EvaluationModule) => {
    setCaseObservation(null);
    setModule(next);
    if (next === 'tasks') setTaskScreen('list');
    if (next === 'experiments') { setExperimentScreen('list'); setExperimentSearch(''); }
    if (next === 'datasets') setDatasetScreen('list');
    if (next === 'evaluators') setEvaluatorScreen('list');
    if (next === 'automation') setTaskScreen('list');
    if (next === 'traces') {
      setTraceScreen('list');
      setObservationView('trace');
      setTraceSearch('');
      setObservationHistorySource(null);
      setDatasetReturnToObservation(false);
    }
  };
  const moduleGroups = [
    { id: 'primary', label: '', items: [{ id: 'overview' as const, label: '总览', icon: Gauge }] },
    { id: 'observation', label: '观测', items: [{ id: 'access' as const, label: '应用接入', icon: PlugZap }, { id: 'traces' as const, label: '观测', icon: Activity }] },
    { id: 'evaluation', label: '运行与评测', items: [{ id: 'tasks' as const, label: '评测任务', icon: ListChecks }, { id: 'experiments' as const, label: '实验', icon: GitCompare }, { id: 'datasets' as const, label: '评测集', icon: Database }, { id: 'evaluators' as const, label: '评估器', icon: ClipboardCheck }, { id: 'automation' as const, label: '自动化', icon: TimerReset }] },
  ];
  return <div className="evaluation-app">
    <aside className="eval-platform-sidebar">
      <div className="eval-sidebar-brand"><div className="eval-app-mark"><span /><span /><span /></div><strong>评测中心</strong></div>
      <nav className="eval-sidebar-nav" aria-label="平台功能模块">{moduleGroups.map((group) => <div className="eval-sidebar-group" key={group.id}>{group.label && <span className="eval-sidebar-label">{group.label}</span>}{group.items.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={module === item.id ? 'is-active' : ''} onClick={() => selectModule(item.id)}><Icon size={19} />{item.label}</button>; })}</div>)}</nav>
      <div className="eval-sidebar-footer"><Pill>本地 Mock</Pill></div>
    </aside>
    <div className="evaluation-main">
      <header className="eval-app-header"><div className="eval-app-title"><h1>{(module === 'tasks' || module === 'automation') && taskScreen === 'detail' ? taskDetailTab === 'data' ? '数据明细' : taskDetailTab === 'optimize' ? '优化实验' : '统计结论' : module === 'experiments' && experimentScreen === 'detail' ? '对比实验' : { overview: '总览', access: '应用接入', traces: '观测', tasks: '评测任务', experiments: '实验', datasets: '评测集', evaluators: '评估器', automation: '自动化' }[module]}</h1></div>{module !== 'automation' && <div className="eval-app-actions"><IconButton label="恢复初始数据" onClick={() => { setState(cloneEvaluationState()); notify('已恢复初始 Mock 数据'); }}><RefreshCw size={16} /></IconButton></div>}</header>
      <main className="eval-content">
      {module === 'overview' && <OverviewPage onOpenTrace={() => selectModule('traces')} onOpenTasks={() => selectModule('tasks')} />}
      {module === 'access' && <AccessCenterPage />}
      {module === 'datasets' && datasetScreen === 'list' && <DatasetList datasets={state.datasets} search={datasetSearch} setSearch={setDatasetSearch} onCreate={openDatasetCreate} onOpen={(item) => { setSelectedDatasetId(item.id); setDatasetEntryFromTask(false); setDatasetScreen('workspace'); }} onDelete={(item) => deleteDataset(item.id)} />}
      {module === 'datasets' && datasetScreen === 'upload' && <DatasetUploadPage draft={datasetDraft} setDraft={setDatasetDraft} onBack={showList} onCreate={createDataset} onNotify={notify} />}
      {module === 'datasets' && datasetScreen === 'generate' && <DatasetGeneratePage draft={datasetDraft} setDraft={setDatasetDraft} agents={state.agents} onBack={showList} onCreate={createDataset} />}
      {module === 'datasets' && datasetScreen === 'history' && <DatasetHistoryPage draft={datasetDraft} setDraft={setDatasetDraft} agents={observationHistorySource?.agents ?? state.agents} historySource={observationHistorySource?.conversations ?? historyConversations} historyAnchor={observationHistorySource?.anchor ?? TODAY} fromObservation={Boolean(observationHistorySource)} onBack={datasetReturnToObservation ? closeObservationBackflow : showList} onCreate={createDataset} />}
      {module === 'datasets' && datasetScreen === 'workspace' && dataset && <DatasetWorkspace dataset={dataset} agents={state.agents} entrySource={datasetEntryFromTask ? 'task' : 'dataset'} onBack={() => { if (datasetEntryFromTask) { setDatasetEntryFromTask(false); setDatasetScreen('list'); setTaskScreen('create'); setModule('tasks'); notify('草稿已保存，未带回任务创建'); return; } setDatasetScreen('list'); }} onNotify={notify} onUpdateDataset={updateDataset} onSubmitDataset={submitDatasetVersion} />}
      {module === 'evaluators' && evaluatorScreen === 'list' && <EvaluatorList evaluators={state.evaluators.filter((item) => item.kind === evaluatorKind && item.mode === evaluatorMode && (!search || `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase())) && (scoreFilter === '全部结果类型' || (scoreFilter === '0-1 数值' ? item.scoreType === 'numeric' : item.scoreType === 'pass_fail')))} kind={evaluatorKind} setKind={setEvaluatorKind} mode={evaluatorMode} setMode={setEvaluatorMode} search={search} setSearch={setSearch} scoreFilter={scoreFilter} setScoreFilter={setScoreFilter} onCreate={openEvaluatorCreate} onOpen={(item) => { setSelectedEvaluatorId(item.id); setEvaluatorScreen('detail'); }} onCopy={(item) => { setEditingEvaluatorId(null); setEvaluatorDraft(evaluatorDraftFrom(item, `${item.name}（自建）`)); setEvaluatorScreen('create'); }} />}
      {module === 'evaluators' && evaluatorScreen === 'detail' && evaluator && <EvaluatorDetail evaluator={evaluator} optimizations={state.evaluatorOptimizations.filter((item) => item.evaluatorId === evaluator.id)} onOpenOptimization={openOptimization} onBack={showList} onCopy={() => { setEditingEvaluatorId(null); setEvaluatorDraft(evaluatorDraftFrom(evaluator, `${evaluator.name}（自建）`)); setEvaluatorScreen('create'); }} onEdit={() => { setEditingEvaluatorId(evaluator.id); setEvaluatorDraft(evaluatorDraftFrom(evaluator)); setEvaluatorScreen('create'); }} />}
      {module === 'evaluators' && evaluatorScreen === 'optimization' && selectedOptimization && <EvaluatorOptimizationWorkbench experiment={selectedOptimization} onExperiments={(updater) => setState((current) => ({ ...current, evaluatorOptimizations: updater(current.evaluatorOptimizations) }))} onVersionCreated={(evaluatorId, version, prompt) => setState((current) => ({ ...current, evaluators: current.evaluators.map((item) => item.id === evaluatorId ? { ...item, version, versions: item.versions.includes(version) ? item.versions : [...item.versions, version], prompt, updatedAt: '2026-10-08 15:30' } : item) }))} onBack={() => setEvaluatorScreen('detail')} onNotify={notify} />}
      {module === 'evaluators' && evaluatorScreen === 'create' && (evaluatorKind === '人工评估' ? <HumanEvaluatorEditor editing={editingEvaluatorId !== null} draft={evaluatorDraft} setDraft={setEvaluatorDraft} onBack={showList} onCreate={() => createEvaluator(evaluatorDraft)} /> : evaluatorKind === '代码评估' ? <CodeEvaluatorEditor editing={editingEvaluatorId !== null} draft={evaluatorDraft} setDraft={setEvaluatorDraft} onBack={showList} onCreate={() => createEvaluator(evaluatorDraft)} /> : evaluatorKind === 'Agent 评估器' ? <AgentEvaluatorEditor editing={editingEvaluatorId !== null} draft={evaluatorDraft} setDraft={setEvaluatorDraft} onBack={showList} onCreate={() => createEvaluator(evaluatorDraft)} /> : <EvaluatorEditor editing={editingEvaluatorId !== null} draft={evaluatorDraft} setDraft={setEvaluatorDraft} onBack={showList} onCreate={() => createEvaluator(evaluatorDraft)} />)}
      {module === 'tasks' && taskScreen === 'list' && <TaskList tasks={state.tasks} datasets={state.datasets} evaluators={state.evaluators} search={taskSearch} setSearch={setTaskSearch} onCreate={openTaskCreate} onOpen={(item) => { setSelectedTaskId(item.id); setTaskDetailTab('summary'); setTaskScreen('detail'); }} />}
      {module === 'tasks' && taskScreen === 'create' && <TaskCreateWorkspace state={state} config={taskDraft} setConfig={setTaskDraft} onBack={showList} onCreate={createTask} onCreateDataset={openDatasetCreate} />}
      {module === 'tasks' && taskScreen === 'experiment' && experiment && <OptimizationDetail experiment={experiment} task={state.tasks.find((item) => item.id === experiment.sourceTaskId)} comparison={state.comparisons.find((item) => item.id === experiment.result.comparisonId)} onBack={showList} onNotify={notify} onViewComparison={(item) => openComparison(item)} />}
      {module === 'experiments' && experimentScreen === 'list' && <ExperimentList comparisons={state.comparisons} search={experimentSearch} setSearch={setExperimentSearch} onCreate={() => openComparisonPicker()} onOpen={openComparison} />}
      {module === 'experiments' && experimentScreen === 'detail' && comparison && <ComparisonDetail comparison={comparison} onBack={showList} />}
      {module === 'tasks' && taskScreen === 'detail' && task && <TaskDetail key={task.id} task={task} state={state} tab={taskDetailTab} onTabChange={setTaskDetailTab} onBack={showList} onOpenCase={(item) => setCasePreview({ item, taskId: task.id })} onCalibrate={(item, evaluatorId) => setCalibrationTarget({ taskId: task.id, caseId: item.caseId, evaluatorId })} onOptimizeEvaluator={(evaluatorId) => setOptimizationStart({ evaluatorId, version: task.evaluatorVersions?.[evaluatorId] ?? state.evaluators.find((item) => item.id === evaluatorId)?.version ?? '0.1.0' })} onRetryCase={(caseId) => retryCase(task.id, caseId)} onNotify={notify} onOptimize={startOptimization} onCompare={() => openComparisonPicker(task.id)} onOpenExperiment={(item) => { setSelectedExperimentId(item.id); setTaskScreen('experiment'); }} />}
      {module === 'automation' && taskScreen === 'list' && <AutoEvaluationPanel tasks={state.tasks} agents={state.agents} evaluators={state.evaluators} onCreate={(item) => setState((current) => ({ ...current, tasks: [item, ...current.tasks] }))} onUpdate={(item) => setState((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === item.id ? item : task) }))} onOpen={(item) => { setSelectedTaskId(item.id); setTaskDetailTab('summary'); setTaskScreen('detail'); }} onNotify={notify} />}
      {module === 'automation' && taskScreen === 'detail' && task && <TaskDetail key={task.id} task={task} state={state} tab={taskDetailTab} onTabChange={setTaskDetailTab} onBack={showList} backLabel="返回自动化" onOpenCase={(item) => setCasePreview({ item, taskId: task.id })} onCalibrate={(item, evaluatorId) => setCalibrationTarget({ taskId: task.id, caseId: item.caseId, evaluatorId })} onOptimizeEvaluator={(evaluatorId) => setOptimizationStart({ evaluatorId, version: task.evaluatorVersions?.[evaluatorId] ?? state.evaluators.find((item) => item.id === evaluatorId)?.version ?? '0.1.0' })} onRetryCase={(caseId) => retryCase(task.id, caseId)} onNotify={notify} onOptimize={startOptimization} onCompare={() => openComparisonPicker(task.id)} onOpenExperiment={(item) => { setSelectedExperimentId(item.id); setTaskScreen('experiment'); }} />}
      {module === 'traces' && traceScreen === 'list' && <TraceList traces={observedTraces} sessions={observedSessions} view={observationView} onViewChange={setObservationView} search={traceSearch} setSearch={setTraceSearch} onOpenTrace={(item) => { setSelectedTraceId(item.id); setTraceScreen('detail'); }} onOpenSession={(item) => { setSelectedSessionId(item.id); setTraceScreen('detail'); }} onBackflow={openObservationBackflow} />}
      {module === 'traces' && traceScreen === 'detail' && observationView === 'trace' && (caseObservationTrace ?? selectedTrace) && <TraceDetail key={(caseObservationTrace ?? selectedTrace)?.id} trace={caseObservationTrace ?? selectedTrace} onBack={showList} />}
      {module === 'traces' && traceScreen === 'detail' && observationView === 'session' && (caseObservationSession ?? selectedSession) && <SessionDetail key={(caseObservationSession ?? selectedSession)?.id} session={caseObservationSession ?? selectedSession} onBack={showList} />}
      </main>
    </div>
    {comparisonPickerOpen && <ComparisonPicker initialControlTask={state.tasks.find((item) => item.id === comparisonInitialControlId)} datasets={state.datasets} tasks={state.tasks} evaluators={state.evaluators} onCancel={() => setComparisonPickerOpen(false)} onCreate={createComparison} />}
    {casePreview && casePreviewTask && <CasePreview item={casePreview.item} task={casePreviewTask} onOpenTrace={() => openCaseObservation('trace')} onOpenSession={() => openCaseObservation('session')} onClose={() => setCasePreview(null)} />}
    {calibrationTarget && calibrationTask && calibrationCase && calibrationResult && calibrationEvaluator && <EvaluatorCalibrationModal task={calibrationTask} item={calibrationCase} evaluator={calibrationEvaluator} result={calibrationResult} onCancel={() => setCalibrationTarget(null)} onSave={saveCalibration} />}
    {optimizationStart && optimizationStartEvaluator && <EvaluatorOptimizationStartModal evaluator={optimizationStartEvaluator} baseVersion={optimizationStart.version} tasks={state.tasks} onCancel={() => setOptimizationStart(null)} onCreate={(item) => { setState((current) => ({ ...current, evaluatorOptimizations: [item, ...current.evaluatorOptimizations] })); setOptimizationStart(null); openOptimization(item); notify('评估器优化实验已创建'); }} />}
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

function DatasetList({ datasets, search, setSearch, onCreate, onOpen, onDelete }: { datasets: Dataset[]; search: string; setSearch: (value: string) => void; onCreate: (mode: DatasetCreateMode) => void; onOpen: (dataset: Dataset) => void; onDelete: (dataset: Dataset) => void }) {
  const [tagFilter, setTagFilter] = useState('全部标签');
  const tags = [...new Set(datasets.flatMap((dataset) => dataset.tags))].sort((left, right) => left.localeCompare(right, 'zh-CN'));
  const filtered = datasets.filter((dataset) => {
    const searchMatched = !search || `${dataset.id} ${dataset.name} ${dataset.description} ${dataset.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase());
    const tagMatched = tagFilter === '全部标签' || dataset.tags.includes(tagFilter);
    return searchMatched && tagMatched;
  });
  return <div className="eval-list-page eval-dataset-list-page">
    <div className="eval-toolbar eval-dataset-list-toolbar">
      <SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、ID、描述或标签" />
      <label className="eval-dataset-tag-filter"><Tag size={14} /><SelectField aria-label="按标签筛选评测集" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option>全部标签</option>{tags.map((tag) => <option key={tag}>{tag}</option>)}</SelectField></label>
      <span className="eval-toolbar-count">{filtered.length} 个评测集</span>
      <CreateMenu onCreate={onCreate} />
    </div>
    <section className="eval-surface table-surface eval-dataset-list-surface">
      <table className="eval-data-table eval-dataset-list-table">
        <thead><tr><th>名称</th><th>描述</th><th>标签</th><th>状态</th><th>数据量</th><th>最新版本</th><th>创建时间</th><th>更新时间</th><th className="eval-dataset-list__actions-head">操作</th></tr></thead>
        <tbody>
          {filtered.map((dataset) => <tr key={dataset.id} tabIndex={0} onClick={() => onOpen(dataset)} onKeyDown={(event) => { if (event.key === 'Enter') onOpen(dataset); }}>
            <td className="eval-dataset-list__name"><div className="eval-cell-title"><strong>{dataset.name}</strong></div></td>
            <td className="eval-dataset-list__description"><p title={dataset.description || '暂无描述'}>{dataset.description || '暂无描述'}</p></td>
            <td><div className="eval-dataset-tags">{dataset.tags.map((tag) => <button type="button" key={tag} className={tagFilter === tag ? 'is-active' : ''} onClick={(event) => { event.stopPropagation(); setTagFilter((current) => current === tag ? '全部标签' : tag); }}>{tag}</button>)}</div></td>
            <td><Status label={dataset.status} /></td>
            <td className="eval-dataset-list__number">{dataset.cases.length}</td>
            <td className="eval-dataset-list__version"><span title={dataset.versions[0]?.label ?? '未采集'}>{dataset.versions[0]?.label ?? '未采集'}</span></td>
            <td><time dateTime={dataset.createdAt}>{dataset.createdAt.slice(0, 10)}</time></td>
            <td><time dateTime={dataset.updatedAt}>{dataset.updatedAt.slice(0, 10)}</time></td>
            <td className="eval-dataset-list__actions">
              <button type="button" className="eval-icon-button" aria-label={`查看 ${dataset.name}`} title="查看" onClick={(event) => { event.stopPropagation(); onOpen(dataset); }}><Eye size={15} /></button>
              <button type="button" className="eval-icon-button eval-icon-button--danger" aria-label={`删除 ${dataset.name}`} title="删除" onClick={(event) => { event.stopPropagation(); onDelete(dataset); }}><Trash2 size={15} /></button>
            </td>
          </tr>)}
        </tbody>
      </table>
    </section>
    {filtered.length === 0 && <EmptyState title="没有匹配的评测集" description="调整搜索或标签筛选，或新建一个评测集。" />}
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
        <label className="eval-field"><span>标签</span><input maxLength={80} value={draft.tags} placeholder="例如：售后, 回归, Badcase" onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} /><small>多个标签用逗号分隔，用于评测集列表筛选。</small></label>
      </div>
      <div className="eval-create-section">
        <div className="eval-create-section__head"><div><span className="eval-eyebrow">IMPORT DATA</span><h4>文件上传</h4><p>支持 CSV、XLS、XLSX、JSONL；字段名称与语义可在下方编辑。</p></div><button type="button" className="eval-button eval-button--ghost" onClick={() => onNotify('模板下载在本地 Mock 中仅展示入口')}><Download size={14} />下载模板</button></div>
        {!draft.file && <button type="button" className={`eval-upload-dropzone${draft.parsing ? ' is-loading' : ''}`} disabled={draft.parsing} onClick={() => inputRef.current?.click()}><Upload size={24} /><strong>{draft.parsing ? '正在解析文件…' : '点击上传，或将文件拖拽至此处'}</strong><span>不限制字段名称，上传后可以编辑字段语义</span></button>}
        {draft.file && <div className="eval-file-summary"><div className="eval-file-summary__icon"><FileSpreadsheet size={20} /></div><div><strong>{draft.file.name}</strong><span>{draft.file.format} · {draft.file.columns.length} 个字段 · {draft.file.rows.length} 条数据</span></div><button type="button" className="eval-button eval-button--ghost" onClick={() => inputRef.current?.click()}>更换文件</button></div>}
        {draft.error && <div className="eval-error"><CircleAlert size={15} />{draft.error}</div>}
        <input ref={inputRef} type="file" accept=".csv,.xls,.xlsx,.jsonl" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => { void chooseFile(event.target.files?.[0]); }} />
        {draft.file && <div className="eval-field-mapping"><div className="eval-subsection-head"><div><h4>字段确认</h4><span>不设置数据类型，只确认字段名称和语义</span></div><span>{draft.fields.length} 个字段</span></div><div className="eval-field-mapping__head"><span>原始字段</span><span>展示名称</span><span>字段语义</span><span>示例值</span></div>{draft.fields.map((field) => <div className="eval-field-mapping__row" key={field.id}><strong>{field.sourceColumn}</strong><input value={field.name} onChange={(event) => updateField(field.id, 'name', event.target.value)} /><SelectField value={field.semantic} onChange={(event) => updateField(field.id, 'semantic', event.target.value)}>{FIELD_SEMANTICS.map((semantic) => <option key={semantic}>{semantic}</option>)}</SelectField><span>{draft.file?.rows[0]?.[field.sourceColumn] || '未采集'}</span></div>)}</div>}
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
        <label className="eval-field"><span>标签</span><input maxLength={80} value={draft.tags} placeholder="例如：售后, 回归, Badcase" onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} /><small>多个标签用逗号分隔，用于评测集列表筛选。</small></label>
      </div>
      <div className="eval-create-section">
        <div className="eval-form-grid"><label className="eval-field"><span>Agent <b>*</b></span><SelectField value={draft.generateAgentId} onChange={(event) => { const agent = agents.find((item) => item.id === event.target.value); setDraft((current) => ({ ...current, generateAgentId: event.target.value, generateVersion: agent?.versions[0] ?? '' })); }}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</SelectField></label><label className="eval-field"><span>版本 <b>*</b></span><SelectField value={draft.generateVersion} disabled={!draft.generateAgentId} onChange={(event) => setDraft((current) => ({ ...current, generateVersion: event.target.value }))}>{(selectedAgent?.versions ?? []).map((version) => <option key={version}>{version}</option>)}</SelectField></label></div>
        <label className="eval-field eval-field--wide"><span>生成场景 Prompt <b>*</b></span><textarea rows={5} value={draft.generatePrompt} placeholder="例如：生成退款政策、到账时间和转人工相关的用户问题，覆盖简单咨询和异常情况。" onChange={(event) => setDraft((current) => ({ ...current, generatePrompt: event.target.value }))} /></label>
        <div className="eval-generated-fields"><div className="eval-generated-fields__head"><span>字段名称</span><span>字段语义</span><span>字段说明</span></div><div className="eval-generated-fields__row"><strong>用户输入</strong><FieldBadge semantic="Input" required /><span>{FIELD_DESCRIPTIONS.Input}</span></div><div className="eval-generated-fields__row"><strong>验收要点</strong><FieldBadge semantic="Expected Output" /><span>{FIELD_DESCRIPTIONS['Expected Output']}</span></div></div>
        <label className="eval-field eval-generate-count"><span>生成数量</span><input type="number" min={1} max={50} value={draft.generateCount} onChange={(event) => setDraft((current) => ({ ...current, generateCount: Math.max(1, Math.min(50, Number(event.target.value) || 1)) }))} /></label>
      </div>
    </section>
    <footer className="eval-sticky-footer"><span>生成结果进入草稿，不代表 Agent 已经运行。</span><div><button type="button" className="eval-button eval-button--ghost" onClick={onBack}>取消</button><button type="button" className="eval-button eval-button--primary" disabled={!canCreate} onClick={() => onCreate(draft)}><Check size={15} />创建评测集</button></div></footer>
  </div>;
}

function DatasetHistoryPage({ draft, setDraft, agents, historySource, historyAnchor, fromObservation = false, onBack, onCreate }: { draft: DatasetDraft; setDraft: Dispatch<SetStateAction<DatasetDraft>>; agents: AgentOption[]; historySource: HistoryConversation[]; historyAnchor: string; fromObservation?: boolean; onBack: () => void; onCreate: (draft: DatasetDraft) => void }) {
  const selectedAgent = agents.find((agent) => agent.id === draft.historyAgentId) ?? agents[0];
  const history = useMemo(() => {
    const days = draft.historyPreset === 'custom' ? null : Number(draft.historyPreset);
    const range = draft.historyPreset === 'custom'
      ? { start: startOfDay(draft.historyStart), end: endOfDay(draft.historyEnd) }
      : { start: startOfDay(shiftDate(historyAnchor, -((days ?? 7) - 1))), end: endOfDay(historyAnchor) };
    return historySource.filter((conversation) => {
      if (conversation.agentId !== draft.historyAgentId || conversation.agentVersion !== draft.historyVersion) return false;
      const stamp = dateStamp(conversation.occurredAt);
      if (stamp < range.start || stamp > range.end) return false;
      const hasFeedback = conversation.traces.some((trace) => trace.userFeedback.trim());
      return draft.historyFeedback === '全部' || (draft.historyFeedback === '有反馈' ? hasFeedback : !hasFeedback);
    });
  }, [draft.historyAgentId, draft.historyVersion, draft.historyPreset, draft.historyStart, draft.historyEnd, draft.historyFeedback, historyAnchor, historySource]);
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
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />{fromObservation ? '返回观测' : '返回评测集'}</button><Pill tone="violet">轨迹回流</Pill></div>
    <section className="eval-create-single eval-create-single--compact">
      <div className="eval-form-grid eval-dataset-basic-fields">
        <label className="eval-field"><span>评测集名称 <b>*</b></span><input maxLength={50} value={draft.name} placeholder="例如：历史会话回流集" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><small>{draft.name.length}/50</small></label>
        <label className="eval-field"><span>描述</span><textarea maxLength={200} rows={2} value={draft.description} placeholder="说明这份数据用于验证什么" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /><small>{draft.description.length}/200</small></label>
        <label className="eval-field"><span>标签</span><input maxLength={80} value={draft.tags} placeholder="例如：售后, 回归, Badcase" onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} /><small>多个标签用逗号分隔，用于评测集列表筛选。</small></label>
      </div>
      <div className="eval-create-section">
        <div className="eval-create-section__head"><div><span className="eval-eyebrow">TRACE REPLAY</span><h4>选择对话和 Trace</h4><p>{fromObservation ? `已从观测列表带入 ${selectedHistoryCount} 条记录，可继续调整。` : '勾选整段对话等于勾选全部 Trace，也可以只选部分 Trace。'}</p></div><Pill tone="green">{selectedHistoryCount} 个对话已选</Pill></div>
        <div className="eval-form-grid"><label className="eval-field"><span>Agent <b>*</b></span><SelectField value={draft.historyAgentId} onChange={(event) => { const agent = agents.find((item) => item.id === event.target.value); setDraft((current) => ({ ...current, historyAgentId: event.target.value, historyVersion: agent?.versions[0] ?? '', historySelected: {}, historyPage: 1 })); }}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</SelectField></label><label className="eval-field"><span>版本 <b>*</b></span><SelectField value={draft.historyVersion} disabled={!draft.historyAgentId} onChange={(event) => setDraft((current) => ({ ...current, historyVersion: event.target.value, historySelected: {}, historyPage: 1 }))}>{(selectedAgent?.versions ?? []).map((version) => <option key={version}>{version}</option>)}</SelectField></label></div>
        <div className="eval-history-filterbar"><label className="eval-field"><span>日期</span><SelectField value={draft.historyPreset} onChange={(event) => setDraft((current) => ({ ...current, historyPreset: event.target.value as HistoryDatePreset, historyPage: 1 }))}><option value="3">近 3 天</option><option value="5">近 5 天</option><option value="7">近 7 天</option><option value="30">近 30 天</option><option value="custom">自定义</option></SelectField></label><label className="eval-field"><span>是否有反馈记录</span><SelectField value={draft.historyFeedback} onChange={(event) => setDraft((current) => ({ ...current, historyFeedback: event.target.value as DatasetDraft['historyFeedback'], historyPage: 1 }))}><option>全部</option><option>有反馈</option><option>无反馈</option></SelectField></label>{draft.historyPreset === 'custom' && <><label className="eval-field"><span>开始日期</span><input type="date" value={draft.historyStart} max={draft.historyEnd} onChange={(event) => setDraft((current) => ({ ...current, historyStart: event.target.value, historyPage: 1 }))} /></label><label className="eval-field"><span>结束日期</span><input type="date" value={draft.historyEnd} min={draft.historyStart} max={historyAnchor} onChange={(event) => setDraft((current) => ({ ...current, historyEnd: event.target.value, historyPage: 1 }))} /></label></>}</div>
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

function DatasetWorkspace({ dataset, agents, entrySource, onBack, onNotify, onUpdateDataset, onSubmitDataset }: {
  dataset: Dataset; agents: AgentOption[]; entrySource: 'dataset' | 'task'; onBack: () => void; onNotify: (message: string, tone?: Toast['tone']) => void;
  onUpdateDataset: (id: string, updater: (dataset: Dataset) => Dataset) => void;
  onSubmitDataset: (id: string, source: 'dataset' | 'task') => void;
}) {
  const [query, setQuery] = useState('');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  const [fieldMenuId, setFieldMenuId] = useState<string | null>(null);
  const [fieldEditor, setFieldEditor] = useState<FieldEditRow | null>(null);
  const [caseEditor, setCaseEditor] = useState<CaseEditDraft | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [traceEditor, setTraceEditor] = useState<TraceImportDraft | null>(null);
  const [addDataMode, setAddDataMode] = useState<AddDataMode | null>(null);
  const [manualFieldQuery, setManualFieldQuery] = useState('');
  const [activeManualFieldId, setActiveManualFieldId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!exportMenuOpen && !versionDrawerOpen && !fieldMenuId) return;
    const closeMenus = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.eval-menu-anchor, .eval-column-menu-anchor')) return;
      setExportMenuOpen(false);
      setVersionDrawerOpen(false);
      setFieldMenuId(null);
    };
    document.addEventListener('pointerdown', closeMenus);
    return () => document.removeEventListener('pointerdown', closeMenus);
  }, [exportMenuOpen, versionDrawerOpen, fieldMenuId]);
  const hasWorkingDraft = Boolean(dataset.draftVersionId);
  const latestSubmitted = dataset.versions.find((version) => version.status === '已提交');
  const filteredCases = dataset.cases.filter((item) => {
    const matched = !query || `${item.id} ${dataset.fields.map((field) => item.values[field.id] ?? '').join(' ')}`.toLowerCase().includes(query.toLowerCase());
    return matched;
  });
  const fieldBySemantic = (semantic: FieldSemantic) => dataset.fields.find((field) => field.semantic === semantic);
  const manualFields = dataset.fields.filter((field) => !manualFieldQuery || `${field.name} ${field.semantic}`.toLowerCase().includes(manualFieldQuery.toLowerCase()));

  const patchDraft = (fields: FieldDefinition[], cases: DatasetCase[], note = '草稿已更新。') => {
    const updatedAt = currentTimestamp();
    onUpdateDataset(dataset.id, (current) => {
      const draftId = current.draftVersionId || `${current.id}-draft-${current.versions.length + 1}`;
      const draftVersion = { id: draftId, label: '草稿', status: '草稿' as const, caseCount: cases.length, createdAt: updatedAt, createdBy: current.createdBy, note };
      return {
        ...current,
        fields,
        cases,
        status: '草稿' as const,
        updatedAt,
        draftVersionId: draftId,
        versions: current.draftVersionId
          ? current.versions.map((version) => version.id === current.draftVersionId ? { ...version, caseCount: cases.length, note } : version)
          : [draftVersion, ...current.versions],
      };
    });
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

  const openManualCaseEditor = (item?: DatasetCase) => {
    setCaseEditor(item ? { id: item.id, values: { ...item.values }, hasFile: Boolean(item.hasFile) } : { values: Object.fromEntries(dataset.fields.map((field) => [field.id, ''])), hasFile: false });
    setManualFieldQuery('');
    setActiveManualFieldId(dataset.fields[0]?.id ?? null);
    setImportPreview(null);
    setTraceEditor(null);
    setAddDataMode('manual');
  };
  const openFileImportDrawer = () => {
    setCaseEditor(null);
    setTraceEditor(null);
    setImportPreview(null);
    setAddDataMode('file');
  };
  const openTraceImportDrawer = () => {
    setCaseEditor(null);
    setImportPreview(null);
    const defaultConversation = historyConversations.find((conversation) => agents.some((agent) => agent.id === conversation.agentId && agent.versions.includes(conversation.agentVersion)));
    const defaultAgent = agents.find((agent) => agent.id === defaultConversation?.agentId) ?? agents[0];
    setTraceEditor({
      agentId: defaultAgent?.id ?? '',
      version: defaultConversation?.agentVersion ?? defaultAgent?.versions[0] ?? '',
      feedback: '全部',
      search: '',
      mode: '追加数据',
      selected: [],
    });
    setAddDataMode('trace');
  };
  const closeAddDataDrawer = () => {
    setAddDataMode(null);
    setCaseEditor(null);
    setImportPreview(null);
    setTraceEditor(null);
    setManualFieldQuery('');
    setActiveManualFieldId(null);
  };
  const returnToAddDataChooser = () => {
    setCaseEditor(null);
    setImportPreview(null);
    setTraceEditor(null);
    setManualFieldQuery('');
    setActiveManualFieldId(null);
    setAddDataMode('choose');
  };
  const scrollToManualField = (id: string) => {
    setActiveManualFieldId(id);
    document.getElementById(`eval-manual-field-${id}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  const saveCase = () => {
    if (!caseEditor) return;
    const missingRequired = dataset.fields.find((field) => field.required && !caseEditor.values[field.id]?.trim());
    if (missingRequired) { onNotify(`请填写必填字段「${missingRequired.name}」`, 'warning'); return; }
    if (caseEditor.id) {
      patchDraft(dataset.fields, dataset.cases.map((item) => item.id === caseEditor.id ? { ...item, values: { ...caseEditor.values }, hasFile: caseEditor.hasFile } : item), `更新 Case ${caseEditor.id}。`);
    } else {
      const id = `CASE-NEW-${String(dataset.cases.length + 1).padStart(3, '0')}`;
      patchDraft(dataset.fields, [...dataset.cases, { id, values: { ...caseEditor.values }, source: '手动添加', createdAt: currentTimestamp().slice(0, 10), hasFile: caseEditor.hasFile }], `手动添加 ${id}。`);
    }
    closeAddDataDrawer();
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
      createdAt: currentTimestamp().slice(0, 10),
      hasFile: false,
    }));
    const cases = importPreview.mode === '全量覆盖' ? rows : [...dataset.cases, ...rows];
    patchDraft(allFields, cases, `${importPreview.mode} ${rows.length} 条本地数据。`);
    closeAddDataDrawer();
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
      createdAt: currentTimestamp().slice(0, 10),
      hasFile: false,
    }));
    const nextCases = traceEditor.mode === '全量覆盖' ? cases : [...dataset.cases, ...cases];
    patchDraft(dataset.fields, nextCases, `${traceEditor.mode} ${cases.length} 条轨迹数据。`);
    closeAddDataDrawer();
    onNotify(`${traceEditor.mode}成功，共 ${cases.length} 条 Case`);
  };

  const addDataTitle = addDataMode === 'manual' ? (caseEditor?.id ? `编辑 ${caseEditor.id}` : '手动添加数据') : addDataMode === 'file' ? '本地文件导入' : addDataMode === 'trace' ? '轨迹回流' : '添加数据';
  const addDataDescription = addDataMode === 'manual'
    ? '按字段填写一条 Case；保存后才生成待提交变更。'
    : addDataMode === 'file'
      ? '上传本地文件，确认字段映射后写入待提交版本。'
      : addDataMode === 'trace'
        ? '筛选真实对话和 Trace，保留原始回复作为评测数据。'
        : '选择一种数据录入方式，已提交版本不会被直接修改。';

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
          <SearchField size="small" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Case" />
        </div>
        <div className="eval-dataset-detail__toolbar-right">
          <div className="eval-menu-anchor">
            <button type="button" className="eval-button eval-button--ghost" onClick={() => setExportMenuOpen((current) => !current)}><Download size={14} />导出数据<ChevronDown size={13} /></button>
            {exportMenuOpen && <div className="eval-inline-menu">
              {hasWorkingDraft && <button type="button" onClick={() => { setExportMenuOpen(false); downloadVersion('草稿', dataset.fields, dataset.cases); }}><Download size={14} />导出当前草稿</button>}
              {latestSubmitted && <button type="button" onClick={() => { setExportMenuOpen(false); downloadVersion(latestSubmitted.label, latestSubmitted.data?.fields ?? dataset.fields, latestSubmitted.data?.cases ?? dataset.cases); }}><Download size={14} />导出 {latestSubmitted.label}</button>}
            </div>}
          </div>
          <button type="button" className="eval-button eval-button--ghost" onClick={() => setAddDataMode('choose')}><Plus size={14} />添加数据</button>
          <button type="button" className="eval-button eval-button--primary" disabled={!hasWorkingDraft} onClick={() => onSubmitDataset(dataset.id, entrySource)}>
            <Check size={14} />{entrySource === 'task' ? '提交并用于评测' : '提交新版本'}
          </button>
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
            {dataset.fields.map((field) => <th key={field.id}><div className="eval-dataset-detail__column-head"><span title={`${field.name} · ${field.description}`}>{field.name}</span>{field.semantic === 'Trace' && <i className="eval-dataset-detail__trace">轨迹</i>}<div className="eval-column-menu-anchor"><button type="button" className="eval-column-menu-trigger" aria-label={`管理字段 ${field.name}`} onClick={() => setFieldMenuId((current) => current === field.id ? null : field.id)}><ChevronDown size={14} /></button>{fieldMenuId === field.id && <div className="eval-column-menu"><button type="button" onClick={() => { setFieldMenuId(null); openFieldEditor(field); }}><Settings2 size={14} />编辑</button><button type="button" onClick={() => deleteField(field.id)}><Trash2 size={14} />删除列</button></div>}</div></div></th>)}
            <th className="is-actions">操作</th>
          </tr></thead>
          <tbody>
            {filteredCases.map((item) => <tr key={item.id}>
              <td className="is-id"><span className="eval-case-chip">#{item.id}</span></td>
              {dataset.fields.map((field) => <td key={field.id} title={item.values[field.id] || ''}>{item.values[field.id] || <em>未采集</em>}</td>)}
              <td className="is-actions">
                <button type="button" className="eval-text-button" onClick={() => openManualCaseEditor(item)}>编辑</button>
                <IconButton label={`删除 ${item.id}`} onClick={() => deleteCase(item.id)}><Trash2 size={14} /></IconButton>
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
          <label className="eval-field"><span>字段语义</span><SelectField value={fieldEditor.semantic} onChange={(event) => setFieldEditor({ ...fieldEditor, semantic: event.target.value as FieldSemantic, required: event.target.value === 'Input' })}>{FIELD_SEMANTICS.map((semantic) => <option key={semantic} value={semantic}>{semantic}</option>)}</SelectField></label>
          {!fieldEditor.existing && <p className="eval-detail-footnote">新增列对已有 Case 默认为空。</p>}
        </div>
        <footer className="eval-modal__footer"><button type="button" className="eval-button eval-button--ghost" onClick={() => setFieldEditor(null)}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={saveField}>{fieldEditor.existing ? '保存修改' : '新增列'}</button></footer>
      </section>
    </div>}

    {addDataMode && <div className="eval-overlay eval-overlay--drawer" onClick={closeAddDataDrawer}>
      <section className={`eval-drawer eval-dataset-add-drawer eval-dataset-add-drawer--${addDataMode}`} onClick={(event) => event.stopPropagation()}>
        <header className="eval-drawer__header eval-dataset-add-drawer__header">
          <div className="eval-dataset-add-drawer__heading">
            {addDataMode !== 'choose' && <button type="button" className="eval-add-drawer-back" onClick={returnToAddDataChooser}><ChevronLeft size={14} />更换方式</button>}
            <h2>{addDataTitle}</h2>
            <p>{addDataDescription}</p>
          </div>
          <IconButton label="关闭添加数据" onClick={closeAddDataDrawer}><X size={16} /></IconButton>
        </header>

        {addDataMode === 'choose' && <div className="eval-drawer__body eval-add-choice-body">
          <div className="eval-add-choice-intro"><span>{hasWorkingDraft ? '当前已有待提交版本' : '当前为已提交版本'}</span><strong>{hasWorkingDraft ? '继续编辑会写入现有草稿' : '完成一次写入后自动生成草稿'}</strong></div>
          <button type="button" className="eval-add-choice-card" onClick={() => openManualCaseEditor()}>
            <span className="eval-add-choice-card__icon"><Plus size={18} /></span>
            <span><strong>手动添加</strong><small>按字段填写 1 条 Case，适合补充单个 Badcase 或样本。</small></span>
            <ChevronRight size={16} />
          </button>
          <button type="button" className="eval-add-choice-card" onClick={openFileImportDrawer}>
            <span className="eval-add-choice-card__icon"><FileSpreadsheet size={18} /></span>
            <span><strong>本地文件导入</strong><small>上传 CSV、XLS、XLSX 或 JSONL，确认字段映射后批量写入。</small></span>
            <ChevronRight size={16} />
          </button>
          <button type="button" className="eval-add-choice-card" onClick={openTraceImportDrawer}>
            <span className="eval-add-choice-card__icon"><History size={18} /></span>
            <span><strong>轨迹回流</strong><small>筛选真实对话和 Trace，保留原始回复作为评测数据。</small></span>
            <ChevronRight size={16} />
          </button>
        </div>}

        {addDataMode === 'manual' && caseEditor && <>
          <div className="eval-add-manual-layout">
            <aside className="eval-add-field-nav">
              <header><span>全部字段</span><b>{dataset.fields.length}</b></header>
              <SearchField size="small" value={manualFieldQuery} onChange={(event) => setManualFieldQuery(event.target.value)} placeholder="搜索字段名" />
              <nav aria-label="Case 字段导航">{manualFields.map((field) => <button type="button" key={field.id} className={activeManualFieldId === field.id ? 'is-active' : ''} onClick={() => scrollToManualField(field.id)}><span>{field.name}</span>{field.required && <b>必填</b>}</button>)}</nav>
              {manualFields.length === 0 && <p className="eval-add-field-nav__empty">没有匹配字段</p>}
            </aside>
            <div className="eval-add-manual-form">
              <div className="eval-add-record-meta"><span>{caseEditor.id ? '编辑记录' : '新建记录'}</span><code>{caseEditor.id ?? '保存后生成 Case ID'}</code></div>
              {dataset.fields.map((field) => <section id={`eval-manual-field-${field.id}`} className={`eval-add-field-card${activeManualFieldId === field.id ? ' is-active' : ''}`} key={field.id} onFocus={() => setActiveManualFieldId(field.id)}>
                <header><div><strong>{field.name}{field.required && <b>*</b>}</strong><p>{field.description || '暂无字段说明'}</p></div><FieldBadge semantic={field.semantic} required={field.required} /></header>
                {field.semantic === 'File' ? <div className="eval-add-field-file"><input aria-label={field.name} value={caseEditor.values[field.id] ?? ''} placeholder="填写文件 URL，或选择本地文件" onChange={(event) => setCaseEditor({ ...caseEditor, values: { ...caseEditor.values, [field.id]: event.target.value } })} /><label><Upload size={14} />选择文件<input type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) setCaseEditor({ ...caseEditor, values: { ...caseEditor.values, [field.id]: file.name }, hasFile: true }); }} /></label></div> : <textarea aria-label={field.name} rows={field.semantic === 'Trace' ? 4 : 3} value={caseEditor.values[field.id] ?? ''} placeholder={`填写 ${field.name}`} onChange={(event) => setCaseEditor({ ...caseEditor, values: { ...caseEditor.values, [field.id]: event.target.value } })} />}
              </section>)}
            </div>
          </div>
          <footer className="eval-drawer-footer eval-dataset-add-drawer__footer"><span>{hasWorkingDraft ? '保存到现有草稿' : '保存后自动建立待提交版本'}</span><div><button type="button" className="eval-button eval-button--ghost" onClick={closeAddDataDrawer}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={saveCase}>{caseEditor.id ? '保存修改' : '保存并生成草稿'}</button></div></footer>
        </>}

        {addDataMode === 'file' && <>
          <div className="eval-drawer__body eval-add-file-body">
            {!importPreview ? <button type="button" className="eval-add-file-dropzone" onClick={() => importInputRef.current?.click()}><span><Upload size={22} /></span><strong>选择本地数据文件</strong><small>支持 CSV、XLS、XLSX 和 JSONL。上传后先确认字段映射，再写入数据。</small></button> : <>
              <div className="eval-add-file-summary"><div><FileSpreadsheet size={18} /><span><strong>{importPreview.file.name}</strong><small>{importPreview.file.format} · {importPreview.file.columns.length} 个字段 · {importPreview.file.rows.length} 条数据</small></span></div><button type="button" className="eval-button eval-button--ghost" onClick={() => importInputRef.current?.click()}>更换文件</button></div>
              <div className="eval-import-mode"><label><input type="radio" checked={importPreview.mode === '追加数据'} onChange={() => setImportPreview({ ...importPreview, mode: '追加数据' })} /><span><strong>追加数据</strong><small>保留已有 Case，新增本次数据。</small></span></label><label><input type="radio" checked={importPreview.mode === '全量覆盖'} onChange={() => setImportPreview({ ...importPreview, mode: '全量覆盖' })} /><span><strong>全量覆盖</strong><small>清空当前草稿 Case 后写入。</small></span></label></div>
              <div className="eval-import-mapping">
                <div><span>导入列</span><span>写入字段</span><span>新字段名称</span></div>
                {importPreview.mappings.map((mapping, index) => <div key={mapping.sourceColumn}>
                  <strong>{mapping.sourceColumn}</strong>
                  <SelectField value={mapping.target} onChange={(event) => setImportPreview({ ...importPreview, mappings: importPreview.mappings.map((item, itemIndex) => itemIndex === index ? { ...item, target: event.target.value } : item) })}>{dataset.fields.map((field) => <option key={field.id} value={field.id}>映射到 {field.name}</option>)}<option value="new">添加为新字段</option></SelectField>
                  {mapping.target === 'new' ? <input value={mapping.name} onChange={(event) => setImportPreview({ ...importPreview, mappings: importPreview.mappings.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} /> : <span>沿用字段定义</span>}
                </div>)}
              </div>
            </>}
          </div>
          <footer className="eval-drawer-footer eval-dataset-add-drawer__footer"><span>{hasWorkingDraft ? '导入到现有草稿' : '导入后自动建立待提交版本'}</span><div><button type="button" className="eval-button eval-button--ghost" onClick={closeAddDataDrawer}>取消</button><button type="button" className="eval-button eval-button--primary" disabled={!importPreview} onClick={confirmImport}>导入并写入</button></div></footer>
        </>}

        {addDataMode === 'trace' && traceEditor && <>
          <div className="eval-drawer__body eval-add-trace-body">
            <div className="eval-add-trace-summary"><div><strong>{traceEditor.selected.length}</strong><span>条对话已选择</span></div><p>每条对话生成 1 条 Case，沿用原始回复和 Trace。</p></div>
            <div className="eval-trace-import-filters">
              <SelectField aria-label="选择 Agent" value={traceEditor.agentId} onChange={(event) => { const agent = agents.find((item) => item.id === event.target.value); setTraceEditor({ ...traceEditor, agentId: event.target.value, version: agent?.versions[0] ?? '', selected: [] }); }}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</SelectField>
              <SelectField aria-label="选择 Agent 版本" value={traceEditor.version} onChange={(event) => setTraceEditor({ ...traceEditor, version: event.target.value, selected: [] })}>{(agents.find((agent) => agent.id === traceEditor.agentId)?.versions ?? []).map((version) => <option key={version}>{version}</option>)}</SelectField>
              <SelectField aria-label="筛选反馈状态" value={traceEditor.feedback} onChange={(event) => setTraceEditor({ ...traceEditor, feedback: event.target.value as TraceImportDraft['feedback'] })}>{['全部', '有反馈', '无反馈'].map((item) => <option key={item}>{item}</option>)}</SelectField>
              <SearchField size="small" aria-label="搜索对话" value={traceEditor.search} placeholder="搜索对话" onChange={(event) => setTraceEditor({ ...traceEditor, search: event.target.value })} />
            </div>
            <div className="eval-trace-import-list">{filteredHistory.map((conversation) => <label key={conversation.id}><input type="checkbox" checked={traceEditor.selected.includes(conversation.id)} onChange={() => setTraceEditor({ ...traceEditor, selected: traceEditor.selected.includes(conversation.id) ? traceEditor.selected.filter((id) => id !== conversation.id) : [...traceEditor.selected, conversation.id] })} /><span><strong>{conversation.title}</strong><small>{conversation.occurredAt} · {conversation.traces.length} 条 Trace</small></span></label>)}</div>
            {filteredHistory.length === 0 && <EmptyState title="没有匹配的轨迹" description="调整 Agent、版本、反馈或搜索条件。" />}
            <div className="eval-import-mode"><label><input type="radio" checked={traceEditor.mode === '追加数据'} onChange={() => setTraceEditor({ ...traceEditor, mode: '追加数据' })} /><span><strong>追加数据</strong><small>保留已有 Case。</small></span></label><label><input type="radio" checked={traceEditor.mode === '全量覆盖'} onChange={() => setTraceEditor({ ...traceEditor, mode: '全量覆盖' })} /><span><strong>全量覆盖</strong><small>清空当前草稿 Case 后写入。</small></span></label></div>
          </div>
          <footer className="eval-drawer-footer eval-dataset-add-drawer__footer"><span>{hasWorkingDraft ? '写入现有草稿' : '写入后自动建立待提交版本'}</span><div><button type="button" className="eval-button eval-button--ghost" onClick={closeAddDataDrawer}>取消</button><button type="button" className="eval-button eval-button--primary" disabled={!traceEditor.selected.length} onClick={confirmTraceImport}>写入 {traceEditor.selected.length} 条数据</button></div></footer>
        </>}
      </section>
    </div>}
  </div>;
}

function EvaluatorList({ evaluators, kind, setKind, mode, setMode, search, setSearch, scoreFilter, setScoreFilter, onCreate, onOpen, onCopy }: { evaluators: Evaluator[]; kind: EvaluatorKind; setKind: (kind: EvaluatorKind) => void; mode: EvaluatorMode; setMode: (mode: EvaluatorMode) => void; search: string; setSearch: (value: string) => void; scoreFilter: string; setScoreFilter: (value: string) => void; onCreate: () => void; onOpen: (evaluator: Evaluator) => void; onCopy: (evaluator: Evaluator) => void }) {
  const isHuman = kind === '人工评估';
  const evaluatorLabel = kind === 'Agent 评估器' ? 'Agent 评估器' : kind === '代码评估' ? '代码评估器' : isHuman ? '人工评估' : '模型评估器';
  const modeLabel = kind === '代码评估' ? (mode === 'preset' ? '内置' : '自建') : (mode === 'preset' ? '预置' : '自建');
  return <div className="eval-list-page eval-evaluator-page">
    <div className="eval-evaluator-list-head">
      <div className="eval-evaluator-tabs" role="tablist" aria-label="评估器类型">
        {EVALUATOR_KINDS.map((item) => <button type="button" role="tab" aria-selected={kind === item} key={item} className={kind === item ? 'is-active' : ''} onClick={() => setKind(item)}>{item === '代码评估' ? '代码评估器' : item}</button>)}
      </div>
      <button type="button" className="eval-button eval-button--primary" onClick={onCreate}><Plus size={16} />新建评估器</button>
    </div>
    <div className="eval-toolbar eval-evaluator-toolbar">
      <SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isHuman ? '搜索标签名' : '搜索评估器名称'} />
      <SelectField aria-label={`${evaluatorLabel}来源`} value={mode} onChange={(event) => setMode(event.target.value as EvaluatorMode)}><option value="preset">{kind === '代码评估' ? '内置评估器' : `预置${isHuman ? '标签' : '评估器'}`}</option><option value="custom">自建{isHuman ? '标签' : '评估器'}</option></SelectField>
      <SelectField aria-label="结果类型" value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)}><option>全部结果类型</option><option>通过 / 不通过</option><option>0-1 数值</option></SelectField>
      <span className="eval-toolbar-count">{evaluators.length} 个{modeLabel}评估器</span>
    </div>
    <div className="eval-evaluator-grid">{evaluators.map((evaluator) => <EvaluatorCard key={evaluator.id} evaluator={evaluator} onOpen={onOpen} onCopy={onCopy} />)}</div>
    {evaluators.length === 0 && <EmptyState title={`没有匹配的${evaluatorLabel}`} description={`调整筛选条件，或新建一个${evaluatorLabel}。`} action={<button type="button" className="eval-button eval-button--primary" onClick={onCreate}><Plus size={15} />新建评估器</button>} />}
  </div>;
}

function EvaluatorCard({ evaluator, onOpen, onCopy }: { evaluator: Evaluator; onOpen: (evaluator: Evaluator) => void; onCopy: (evaluator: Evaluator) => void }) {
  const Icon = evaluator.kind === 'Agent 评估器' ? Bot : evaluator.kind === '代码评估' ? Braces : evaluator.kind === '人工评估' ? ClipboardCheck : Sparkles;
  const skillCount = evaluator.skills?.filter((item) => item.enabled).length ?? 0;
  const mcpCount = evaluator.mcpConnections?.filter((item) => item.status === '已连接').length ?? 0;
  const sourceLabel = evaluator.kind === '代码评估' && evaluator.mode === 'preset' ? '内置' : evaluator.mode === 'preset' ? '预置' : '自建';
  const settingLabel = evaluator.kind === 'Agent 评估器'
    ? `${skillCount} Skills${mcpCount ? ` · ${mcpCount} MCP` : ''}`
    : evaluator.kind === '代码评估'
      ? evaluator.implementation ?? '代码'
      : evaluator.kind === '人工评估'
        ? '人工标注'
        : evaluator.model;
  return <article className="eval-evaluator-card eval-evaluator-card--unified" role="button" tabIndex={0} onClick={() => onOpen(evaluator)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(evaluator); } }}>
    <header className="eval-evaluator-card__head">
      <span className={`eval-evaluator-card__icon is-${evaluator.kind === 'Agent 评估器' ? 'agent' : evaluator.kind === '代码评估' ? 'code' : evaluator.kind === '人工评估' ? 'human' : 'model'}`}><Icon size={17} /></span>
      <div className="eval-evaluator-card__identity"><div><h3>{evaluator.name}</h3><Pill tone={evaluator.mode === 'preset' ? 'violet' : 'neutral'}>{sourceLabel}</Pill></div><p>{evaluator.description}</p></div>
      {evaluator.mode === 'preset' && <IconButton label={`复制 ${evaluator.name}`} onClick={(event) => { event.stopPropagation(); onCopy(evaluator); }}><Copy size={14} /></IconButton>}
    </header>
    <div className="eval-evaluator-card__meta">
      <Pill>{evaluator.scoreType === 'numeric' ? '0-1 数值' : '通过 / 不通过'}</Pill>
      <span>{settingLabel}</span>
      {evaluator.scoreType === 'numeric' && <span>阈值 {evaluator.passThreshold?.toFixed(2) ?? '未设置'}</span>}
    </div>
    <footer><span>{evaluator.updatedAt.slice(0, 10)}</span><span>{evaluator.variables.length ? `${evaluator.variables.length} 个输入` : '无需输入变量'}</span></footer>
  </article>;
}

function EvaluatorDetail({ evaluator, optimizations, onOpenOptimization, onBack, onCopy, onEdit }: {
  evaluator: Evaluator;
  optimizations: EvaluatorOptimizationExperiment[];
  onOpenOptimization: (item: EvaluatorOptimizationExperiment) => void;
  onBack: () => void;
  onCopy: () => void;
  onEdit: () => void;
}) {
  const [expandedPrompt, setExpandedPrompt] = useState(false);
  const [detailTab, setDetailTab] = useState<'config' | 'optimizations'>('config');
  const isHuman = evaluator.kind === '人工评估';
  if (evaluator.kind === '代码评估') return <CodeEvaluatorDetail evaluator={evaluator} onBack={onBack} onCopy={onCopy} onEdit={onEdit} />;
  if (evaluator.kind === 'Agent 评估器') return <AgentEvaluatorDetail evaluator={evaluator} optimizations={optimizations} onOpenOptimization={onOpenOptimization} onBack={onBack} onCopy={onCopy} onEdit={onEdit} />;
  return <div className="eval-detail-page eval-evaluator-detail-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回评估器</button></div>
    <div className="eval-evaluator-detail-intro">
      <div><h2>{evaluator.name}</h2></div>
      <div className="eval-detail-hero__actions"><Pill tone={evaluator.mode === 'preset' ? 'violet' : 'neutral'}>{evaluator.mode === 'preset' ? '预置' : '自建'}</Pill>{evaluator.mode === 'preset' ? <button type="button" className="eval-button eval-button--primary" onClick={onCopy}><Copy size={14} />复制为自建</button> : <button type="button" className="eval-button eval-button--primary" onClick={onEdit}><Settings2 size={14} />编辑并生成新版本</button>}</div>
    </div>
    <div className="eval-evaluator-detail-meta">
      <div><span>{isHuman ? '评分类型' : '结果类型'}</span><strong>{evaluator.scoreType === 'numeric' ? '0-1 数值评分' : '通过 / 不通过'}</strong></div>
      <div><span>通过阈值</span><strong>{evaluator.scoreType === 'numeric' ? (evaluator.passThreshold?.toFixed(2) ?? '未设置') : '直接判断'}</strong></div>
      {isHuman ? <><div><span>评估方式</span><strong>人工标注</strong></div><div><span>累计标注</span><strong>{evaluator.runCount}</strong></div><div><span>版本</span><strong>{evaluator.version}</strong></div></> : <><div><span>评估模型</span><strong>{evaluator.model}</strong></div><div><span>累计运行</span><strong>{evaluator.runCount}</strong></div><div><span>输入变量</span><strong>{evaluator.variables.length} 个</strong></div></>}
    </div>
    {!isHuman && <nav className="eval-task-detail-tabs eval-evaluator-detail-tabs" aria-label="评估器详情内容"><button type="button" className={detailTab === 'config' ? 'is-active' : ''} onClick={() => setDetailTab('config')}>配置</button><button type="button" className={detailTab === 'optimizations' ? 'is-active' : ''} onClick={() => setDetailTab('optimizations')}>优化记录（{optimizations.length}）</button></nav>}
    {!isHuman && detailTab === 'config' && <section className={`eval-evaluator-prompt-card${expandedPrompt ? ' is-expanded' : ''}`}>
      <div className="eval-evaluator-prompt-head"><h3>评估规则</h3><div className="eval-prompt-actions"><IconButton label={expandedPrompt ? '收起 Prompt' : '放大 Prompt'} onClick={() => setExpandedPrompt((current) => !current)}><Maximize2 size={15} /></IconButton><IconButton label="复制 Prompt" onClick={() => { void navigator.clipboard?.writeText(evaluator.prompt); }}><Copy size={15} /></IconButton></div></div>
      <pre className="eval-evaluator-prompt">{evaluator.prompt}</pre>
      <div className="eval-evaluator-variables-bar"><span>变量</span>{evaluator.variables.map((variable) => <strong key={variable.name}>{variable.name}</strong>)}</div>
    </section>}
    {!isHuman && detailTab === 'optimizations' && <EvaluatorOptimizationList experiments={optimizations} onOpen={onOpenOptimization} />}
    {isHuman && <div className="eval-human-detail-note"><ClipboardCheck size={17} /><span><strong>人工评估标签</strong><small>在评测任务数据明细中填写分数或通过状态。</small></span></div>}
  </div>;
}

function AgentCapabilityList({ skills = [], mcpConnections = [] }: { skills?: AgentSkillBinding[]; mcpConnections?: AgentMcpConnection[] }) {
  if (!skills.length && !mcpConnections.length) {
    return <EmptyState title="尚未挂载能力" description="添加 Skill 或 MCP 后，Agent 评估器才能执行多步核查。" />;
  }
  return <div className="eval-agent-capability-list">
    {skills.map((skill) => <div className={`eval-agent-capability-row${skill.enabled ? ' is-enabled' : ''}`} key={skill.id}>
      <span className="eval-agent-capability-icon"><Zap size={16} /></span>
      <div className="eval-agent-capability-copy">
        <div><strong>{skill.name}</strong><Pill tone="violet">Skill</Pill><Pill>{skill.kind}</Pill></div>
        <p>{skill.description}</p>
        <small>{skill.source} · {skill.scriptCount} 个脚本</small>
      </div>
      <span className={`eval-agent-capability-state${skill.enabled ? ' is-on' : ''}`}><i />{skill.enabled ? '已启用' : '已停用'}</span>
    </div>)}
    {mcpConnections.map((connection) => <div className={`eval-agent-capability-row${connection.status === '已连接' ? ' is-enabled' : ''}`} key={connection.id}>
      <span className="eval-agent-capability-icon is-mcp"><Package size={16} /></span>
      <div className="eval-agent-capability-copy">
        <div><strong>{connection.name}</strong><Pill tone="green">MCP</Pill><Pill>{connection.transport}</Pill></div>
        <p>{connection.description}</p>
        <small>{connection.tools.join(' · ')}</small>
      </div>
      <span className={`eval-agent-capability-state${connection.status === '已连接' ? ' is-on' : connection.status === '待验证' ? ' is-pending' : ''}`}><i />{connection.status}</span>
    </div>)}
  </div>;
}

function AgentEvaluatorDetail({ evaluator, optimizations, onOpenOptimization, onBack, onCopy, onEdit }: {
  evaluator: Evaluator;
  optimizations: EvaluatorOptimizationExperiment[];
  onOpenOptimization: (item: EvaluatorOptimizationExperiment) => void;
  onBack: () => void;
  onCopy: () => void;
  onEdit: () => void;
}) {
  const [detailTab, setDetailTab] = useState<'config' | 'optimizations'>('config');
  const skillCount = evaluator.skills?.filter((item) => item.enabled).length ?? 0;
  const mcpCount = evaluator.mcpConnections?.filter((item) => item.status === '已连接').length ?? 0;
  return <div className="eval-detail-page eval-evaluator-detail-page eval-agent-detail-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回 Agent 评估器</button></div>
    <div className="eval-evaluator-detail-intro">
      <div><div className="eval-agent-detail-kicker"><Bot size={16} />Agent evaluator</div><h2>{evaluator.name}</h2><p>{evaluator.purpose}</p></div>
      <div className="eval-detail-hero__actions"><Pill tone={evaluator.mode === 'preset' ? 'violet' : 'neutral'}>{evaluator.mode === 'preset' ? '预置' : '自建'}</Pill>{evaluator.mode === 'preset' ? <button type="button" className="eval-button eval-button--primary" onClick={onCopy}><Copy size={14} />基于此创建</button> : <button type="button" className="eval-button eval-button--primary" onClick={onEdit}><Settings2 size={14} />编辑并生成新版本</button>}</div>
    </div>
    <div className="eval-evaluator-detail-meta">
      <div><span>结果类型</span><strong>{evaluator.scoreType === 'numeric' ? '0-1 数值评分' : '通过 / 不通过'}</strong></div>
      <div><span>评估模型</span><strong>{evaluator.model}</strong></div>
      <div><span>已启用 Skills</span><strong>{skillCount} 个</strong></div>
      <div><span>已连接 MCP</span><strong>{mcpCount} 个</strong></div>
      <div><span>版本</span><strong>{evaluator.version}</strong></div>
    </div>
    <nav className="eval-task-detail-tabs eval-evaluator-detail-tabs" aria-label="Agent 评估器详情内容"><button type="button" className={detailTab === 'config' ? 'is-active' : ''} onClick={() => setDetailTab('config')}>配置</button><button type="button" className={detailTab === 'optimizations' ? 'is-active' : ''} onClick={() => setDetailTab('optimizations')}>优化记录（{optimizations.length}）</button></nav>
    {detailTab === 'config' && <>
      <section className="eval-detail-card eval-agent-detail-capabilities">
        <div className="eval-detail-card__heading"><div><h3>能力挂载</h3></div><span className="eval-detail-card__hint">Skills 与 MCP 随评估器版本冻结</span></div>
        <AgentCapabilityList skills={evaluator.skills} mcpConnections={evaluator.mcpConnections} />
      </section>
      <section className="eval-evaluator-prompt-card">
        <div className="eval-evaluator-prompt-head"><div><span className="eval-eyebrow">AGENT WORKFLOW</span><h3>评测工作流</h3></div><IconButton label="复制评测工作流" onClick={() => { void navigator.clipboard?.writeText(evaluator.prompt); }}><Copy size={15} /></IconButton></div>
        <pre className="eval-evaluator-prompt">{evaluator.prompt}</pre>
        <div className="eval-evaluator-variables-bar"><span>变量</span>{evaluator.variables.map((variable) => <strong key={variable.name}>{variable.name}</strong>)}</div>
      </section>
    </>}
    {detailTab === 'optimizations' && <EvaluatorOptimizationList experiments={optimizations} onOpen={onOpenOptimization} />}
  </div>;
}


function CodeEvaluatorDetail({ evaluator, onBack, onCopy, onEdit }: { evaluator: Evaluator; onBack: () => void; onCopy: () => void; onEdit: () => void }) {
  return (
    <div className="eval-detail-page eval-evaluator-detail-page eval-code-only-detail">
      <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回代码评估器</button></div>
      <div className="eval-evaluator-detail-intro">
        <div><h2>{evaluator.name}</h2></div>
        <div className="eval-detail-hero__actions"><Pill>Code</Pill><Pill>{evaluator.category}</Pill><Pill>{evaluator.scoreType === 'numeric' ? '0-1 数值' : '通过 / 不通过'}</Pill>{evaluator.mode === 'preset' ? <button type="button" className="eval-button eval-button--primary" onClick={onCopy}><Copy size={14} />基于此创建</button> : <button type="button" className="eval-button eval-button--primary" onClick={onEdit}><Settings2 size={14} />编辑</button>}</div>
      </div>
      <div className="eval-evaluator-detail-meta">
        <div><span>评估目的</span><strong>{evaluator.purpose}</strong></div>
        <div><span>输入变量</span><strong>{evaluator.variables.length} 个</strong></div>
        <div><span>结果类型</span><strong>{evaluator.scoreType === 'numeric' ? '0-1 数值' : '通过 / 不通过'}</strong></div>
        <div><span>适用范围</span><strong>{evaluator.scope ?? '确定性 Mock 检查'}</strong></div>
        <div><span>边界</span><strong>{evaluator.notFor ?? '不执行外部请求'}</strong></div>
      </div>
      <section className="eval-detail-card">
        <div className="eval-detail-card__heading"><div><h3>判定规则</h3></div><Pill>{evaluator.category}</Pill></div>
        {evaluator.variables.length > 0 && <div className="eval-evaluator-variables-bar"><span>变量</span>{evaluator.variables.map((variable) => <strong key={variable.name}>{variable.name}</strong>)}</div>}
        {evaluator.rules?.length ? <div className="eval-code-rules">{evaluator.rules.map((rule) => <div key={rule.condition}><strong>{rule.condition}</strong><small>{rule.output}</small></div>)}</div> : <p>{evaluator.description}</p>}
        <div className="eval-code-output"><span>输出示例</span><pre>{evaluator.outputExample ?? '未采集'}</pre></div>
      </section>
      <section className="eval-detail-card">
        <div className="eval-detail-card__heading"><div><h3>Mock 实现边界</h3></div><Pill tone="violet">不调用外部服务</Pill></div>
        <CodeEditor value={evaluator.code ?? ''} language={evaluator.implementation === 'JavaScript' ? 'JavaScript' : 'Python'} onChange={() => undefined} />
      </section>
    </div>
  );
}

function CodeEditor({ value, language, onChange, onLanguageChange, timeout, onTimeoutChange }: {
  value: string;
  language: CodeEvaluatorLanguage;
  onChange: (value: string) => void;
  onLanguageChange?: (language: CodeEvaluatorLanguage) => void;
  timeout?: number;
  onTimeoutChange?: (value: number) => void;
}) {
  const lineCount = value.split('\n').length;
  return <div className="eval-code-definition">
    <div className="eval-code-definition__head">
      <h3>评估代码</h3>
      <div className="eval-code-language-tabs" role="tablist" aria-label="代码语言">
        {(['Python', 'JavaScript'] as CodeEvaluatorLanguage[]).map((item) => <button type="button" role="tab" key={item} aria-selected={language === item} className={language === item ? 'is-active' : ''} disabled={!onLanguageChange} onClick={() => onLanguageChange?.(item)}>{item}</button>)}
      </div>
    </div>
    <p>编写 evaluate 函数，接收 input、output 和 context，返回包含 score 和 explanation 的对象</p>
    <div className="eval-code-editor">
      <div className="eval-code-editor__file"><Braces size={14} /><span>{language === 'Python' ? 'code.py' : 'code.js'}</span></div>
      <div className="eval-code-editor__body">
        <div aria-hidden="true">{Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
        <textarea aria-label="评估代码" spellCheck={false} readOnly={!onLanguageChange} value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </div>
    {timeout !== undefined && onTimeoutChange && <div className="eval-code-timeout">
      <label className="eval-field"><span>执行超时（毫秒）</span><input type="number" min={1} max={60000} value={timeout} onChange={(event) => onTimeoutChange(Math.max(1, Math.min(60000, Number(event.target.value) || 1)))} /></label>
      <p>单次执行最长 60000 毫秒（60 秒），超过上限的值会被截断。</p>
    </div>}
  </div>;
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

function HumanEvaluatorEditor({ draft, setDraft, editing = false, onBack, onCreate }: { draft: EvaluatorDraft; setDraft: Dispatch<SetStateAction<EvaluatorDraft>>; editing?: boolean; onBack: () => void; onCreate: () => void }) {
  return <div className="eval-create-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回人工评估</button></div>
    <section className="eval-create-single eval-create-single--compact eval-human-create">
      <div className="eval-create-single__head"><span className="eval-eyebrow">HUMAN LABEL</span><h3>{editing ? '编辑人工标签' : '新建人工标签'}</h3></div>
      <div className="eval-human-create-fields">
        <label className="eval-field"><span>标签名 <b>*</b></span><input autoFocus maxLength={30} value={draft.name} placeholder="例如：回答质量" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><small>{draft.name.length}/30</small></label>
        <label className="eval-field"><span>评分类型 <b>*</b></span><SelectField value={draft.scoreType} onChange={(event) => setDraft((current) => ({ ...current, scoreType: event.target.value as ScoreType }))}><option value="numeric">0-1 数值评分</option><option value="pass_fail">通过 / 不通过</option></SelectField></label>
        {draft.scoreType === 'numeric' && <label className="eval-field eval-threshold-field"><span>通过阈值 <b>*</b></span><div className="eval-threshold-control"><input aria-label="人工标签通过阈值" type="range" min="0" max="1" step="0.01" value={draft.passThreshold} onChange={(event) => setDraft((current) => ({ ...current, passThreshold: Number(event.target.value) }))} /><strong>{draft.passThreshold.toFixed(2)}</strong></div><small>得分达到该值时判定为通过。</small></label>}
      </div>
    </section>
    <footer className="eval-sticky-footer"><span>{editing ? '保存后生成新版本，不覆盖历史版本。' : '保存后可用于任务数据明细的人工标注。'}</span><div><button type="button" className="eval-button eval-button--ghost" onClick={onBack}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={onCreate}><Check size={15} />{editing ? '保存并生成新版本' : '创建标签'}</button></div></footer>
  </div>;
}

function EvaluatorBasicFields({ draft, setDraft, namePlaceholder, descriptionPlaceholder }: {
  draft: EvaluatorDraft;
  setDraft: Dispatch<SetStateAction<EvaluatorDraft>>;
  namePlaceholder: string;
  descriptionPlaceholder: string;
}) {
  return <div className="eval-evaluator-form__basics">
    <label className="eval-field"><span>名称 <b>*</b></span><input autoFocus maxLength={50} value={draft.name} placeholder={namePlaceholder} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><small>{draft.name.length}/50</small></label>
    <label className="eval-field"><span>描述</span><textarea maxLength={200} rows={3} value={draft.description} placeholder={descriptionPlaceholder} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /><small>{draft.description.length}/200</small></label>
  </div>;
}

function EvaluatorScoringFields({ draft, setDraft, ariaLabelPrefix }: {
  draft: EvaluatorDraft;
  setDraft: Dispatch<SetStateAction<EvaluatorDraft>>;
  ariaLabelPrefix: string;
}) {
  return <div className="eval-evaluator-form__scoring">
    <label className="eval-field"><span>模型</span><SelectField value={draft.model} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}><option>Doubao-Seed-1.6</option><option>Doubao-Seed-1.6-flash</option><option>GPT-5.6</option></SelectField></label>
    <label className="eval-field"><span>结果类型</span><SelectField value={draft.scoreType} onChange={(event) => setDraft((current) => ({ ...current, scoreType: event.target.value as ScoreType }))}><option value="numeric">0-1 数值评分</option><option value="pass_fail">通过 / 不通过</option></SelectField></label>
    {draft.scoreType === 'numeric' && <label className="eval-field eval-threshold-field"><span>通过阈值 <b>*</b></span><div className="eval-threshold-control"><input aria-label={`${ariaLabelPrefix}通过阈值`} type="range" min="0" max="1" step="0.01" value={draft.passThreshold} onChange={(event) => setDraft((current) => ({ ...current, passThreshold: Number(event.target.value) }))} /><strong>{draft.passThreshold.toFixed(2)}</strong></div></label>}
  </div>;
}

function EvaluatorPromptSection({ prompt, onChange }: { prompt: string; onChange: (value: string) => void }) {
  return <section className="eval-evaluator-form__prompt">
    <div className="eval-evaluator-form__section-head"><h3>Prompt</h3></div>
    <PromptEditor prompt={prompt} onChange={onChange} />
  </section>;
}

function EvaluatorCreateFooter({ editing, onBack, onCreate }: { editing: boolean; onBack: () => void; onCreate: () => void }) {
  return <footer className="eval-evaluator-create-footer">
    <button type="button" className="eval-button eval-button--ghost" onClick={onBack}>取消</button>
    <button type="button" className="eval-button eval-button--primary" onClick={onCreate}><Check size={15} />{editing ? '保存并生成新版本' : '创建评估器'}</button>
  </footer>;
}

function EvaluatorEditor({ draft, setDraft, editing = false, onBack, onCreate }: { draft: EvaluatorDraft; setDraft: Dispatch<SetStateAction<EvaluatorDraft>>; editing?: boolean; onBack: () => void; onCreate: () => void }) {
  return <div className="eval-create-page eval-evaluator-create-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回评估器</button></div>
    <section className="eval-evaluator-form">
      <EvaluatorBasicFields draft={draft} setDraft={setDraft} namePlaceholder="例如：客服回答相关性" descriptionPlaceholder="说明这条评估器判断什么" />
      <div className="eval-evaluator-form__section">
        <EvaluatorScoringFields draft={draft} setDraft={setDraft} ariaLabelPrefix="模型评估器" />
      </div>
      <div className="eval-evaluator-form__section">
        <EvaluatorPromptSection prompt={draft.prompt} onChange={(value) => setDraft((current) => ({ ...current, prompt: value }))} />
      </div>
    </section>
    <EvaluatorCreateFooter editing={editing} onBack={onBack} onCreate={onCreate} />
  </div>;
}

function AgentEvaluatorEditor({ draft, setDraft, editing = false, onBack, onCreate }: { draft: EvaluatorDraft; setDraft: Dispatch<SetStateAction<EvaluatorDraft>>; editing?: boolean; onBack: () => void; onCreate: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [skillDrawerOpen, setSkillDrawerOpen] = useState(false);
  const [skillFiles, setSkillFiles] = useState<ImportedSkillFile[]>([]);
  const [selectedSkillFileId, setSelectedSkillFileId] = useState('');
  const [skillForm, setSkillForm] = useState({ name: '', displayName: '', description: '' });
  const [skillImportError, setSkillImportError] = useState('');
  const selectedSkillFile = skillFiles.find((file) => file.id === selectedSkillFileId) ?? skillFiles[0];

  const resetSkillImport = () => {
    setSkillFiles([]);
    setSelectedSkillFileId('');
    setSkillForm({ name: '', displayName: '', description: '' });
    setSkillImportError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const closeSkillDrawer = () => {
    setSkillDrawerOpen(false);
    resetSkillImport();
  };
  const readSkillFiles = async (files: File[]) => {
    const incoming = files.slice(0, 50);
    if (!incoming.length) return;
    const parsed = await Promise.all(incoming.map(async (file) => {
      const fileWithPath = file as File & { webkitRelativePath?: string };
      const canPreview = file.size <= 2_000_000 && /\.(md|txt|json|ya?ml|toml|py|js|ts|tsx|jsx|sh)$/i.test(file.name);
      return {
        id: `skill-file-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${file.name}-${file.size}`}`,
        name: file.name,
        path: fileWithPath.webkitRelativePath || file.name,
        size: file.size,
        text: canPreview ? await file.text() : '',
      };
    }));
    setSkillFiles(parsed);
    const skillMarkdown = parsed.find((file) => file.name.toLowerCase() === 'skill.md' && file.text);
    const content = skillMarkdown?.text ?? parsed.find((file) => file.text)?.text ?? '';
    const frontmatterName = content.match(/^name:\s*(.+)$/im)?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? '';
    const frontmatterDescription = content.match(/^description:\s*(.+)$/im)?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? '';
    const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
    const bodyDescription = content
      .replace(/^---[\s\S]*?---\s*/m, '')
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .find((block) => block && !block.startsWith('#') && !block.includes(':')) ?? '';
    setSkillForm((current) => ({
      name: current.name || frontmatterName || heading,
      displayName: current.displayName || heading || frontmatterName,
      description: current.description || frontmatterDescription || bodyDescription,
    }));
    setSelectedSkillFileId(skillMarkdown?.id ?? parsed[0].id);
    setSkillImportError('');
  };
  const collectDroppedFiles = async (entry: DroppedFileEntry): Promise<File[]> => {
    if (entry.isFile && entry.file) {
      return [await new Promise<File>((resolve, reject) => entry.file?.(resolve, reject))];
    }
    if (!entry.isDirectory || !entry.createReader) return [];
    const reader = entry.createReader();
    const children: DroppedFileEntry[] = [];
    while (true) {
      const batch = await new Promise<DroppedFileEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      children.push(...batch);
    }
    return (await Promise.all(children.map(collectDroppedFiles))).flat();
  };
  const readDroppedFiles = async (dataTransfer: DataTransfer) => {
    const entries = Array.from(dataTransfer.items)
      .map((item) => (item as unknown as { webkitGetAsEntry?: () => DroppedFileEntry | null }).webkitGetAsEntry?.())
      .filter((entry): entry is DroppedFileEntry => Boolean(entry));
    const files = entries.length
      ? (await Promise.all(entries.map(collectDroppedFiles))).flat()
      : Array.from(dataTransfer.files);
    await readSkillFiles(files);
  };
  const addImportedSkill = () => {
    const skillName = skillForm.name.trim();
    const displayName = skillForm.displayName.trim();
    if (!skillName || !displayName || !skillFiles.length) {
      setSkillImportError('请填写 Skill 名称、显示名称并上传文件。');
      return;
    }
    const binding: AgentSkillBinding = {
      id: `skill-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      name: displayName,
      description: skillForm.description.trim(),
      kind: '评测工作流',
      source: '自定义',
      scriptCount: Math.max(1, skillFiles.filter((file) => file.name.toLowerCase() !== 'skill.md').length),
      fileCount: skillFiles.length,
      enabled: true,
    };
    setDraft((current) => ({ ...current, skills: [...current.skills, binding] }));
    closeSkillDrawer();
  };

  return <div className="eval-create-page eval-evaluator-create-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回 Agent 评估器</button></div>
    <section className="eval-evaluator-form">
      <EvaluatorBasicFields draft={draft} setDraft={setDraft} namePlaceholder="例如：退款业务终态核验" descriptionPlaceholder="说明 Agent 评估器需要核查什么" />
      <div className="eval-evaluator-form__section"><EvaluatorScoringFields draft={draft} setDraft={setDraft} ariaLabelPrefix="Agent 评估器" /></div>
      <div className="eval-evaluator-form__section"><EvaluatorPromptSection prompt={draft.prompt} onChange={(value) => setDraft((current) => ({ ...current, prompt: value }))} /></div>
      <section className="eval-evaluator-form__section eval-skill-mount">
        <div className="eval-skill-mount__head">
          <div><h3>能力挂载</h3><p>添加 Skill，帮助评估器理解业务规则、领域术语与内部 API，让评估不止于文本相似度。</p></div>
          <div className="eval-skill-mount__actions">
            <button type="button" className="eval-button eval-button--ghost" onClick={() => setSkillDrawerOpen(true)}><Plus size={15} />Skill</button>
            <button type="button" className="eval-button eval-button--ghost" disabled><Plus size={15} />MCP</button>
            <span>MCP 暂未开放</span>
          </div>
        </div>
        {draft.skills.length > 0 && <div className="eval-skill-binding-list">
          {draft.skills.map((skill) => <div className="eval-skill-binding-row" key={skill.id}>
            <span className="eval-agent-capability-icon"><Zap size={16} /></span>
            <div><strong>{skill.name}</strong><p>{skill.description || '已导入 Skill'}</p><small>{skill.source === '自定义' ? `文件导入 · ${skill.fileCount ?? skill.scriptCount} 个文件` : `${skill.source} · ${skill.scriptCount} 个脚本`}</small></div>
            <IconButton label={`删除 ${skill.name}`} onClick={() => setDraft((current) => ({ ...current, skills: current.skills.filter((item) => item.id !== skill.id) }))}><Trash2 size={15} /></IconButton>
          </div>)}
        </div>}
        {draft.mcpConnections.length > 0 && <div className="eval-skill-binding-list eval-skill-binding-list--existing">
          {draft.mcpConnections.map((connection) => <div className="eval-skill-binding-row" key={connection.id}>
            <span className="eval-agent-capability-icon is-mcp"><Package size={16} /></span>
            <div><strong>{connection.name}</strong><p>{connection.description}</p><small>已有 MCP 连接</small></div>
            <IconButton label={`删除 ${connection.name}`} onClick={() => setDraft((current) => ({ ...current, mcpConnections: current.mcpConnections.filter((item) => item.id !== connection.id) }))}><Trash2 size={15} /></IconButton>
          </div>)}
        </div>}
      </section>
    </section>
    <EvaluatorCreateFooter editing={editing} onBack={onBack} onCreate={onCreate} />
    {skillDrawerOpen && <div className="eval-overlay eval-overlay--drawer" onClick={closeSkillDrawer}>
      <section className="eval-drawer eval-skill-drawer" onClick={(event) => event.stopPropagation()}>
        <header className="eval-drawer__header"><h2>添加 Skill</h2><IconButton label="关闭添加 Skill" onClick={closeSkillDrawer}><X size={16} /></IconButton></header>
        <div className="eval-drawer__body eval-skill-drawer__body">
          <section className="eval-drawer-section">
            <h3 className="eval-skill-drawer__section-title">上传文件</h3>
            <div className="eval-skill-dropzone" role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInputRef.current?.click(); } }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void readDroppedFiles(event.dataTransfer); }}>
              <span><Upload size={20} /></span><strong>请将 文件 或 文件夹 拖拽到此处上传</strong>
            </div>
            <p className="eval-skill-dropzone__note">支持文件、文件夹和 ZIP 包。自动读取 SKILL.md 中的名称、显示名称和描述；同名文件将被替换，其他文件保留。</p>
            <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => { void readSkillFiles(Array.from(event.target.files ?? [])); }} />
          </section>
          <section className="eval-drawer-section eval-skill-metadata">
            <div className="eval-skill-metadata__grid">
              <label className="eval-field"><span>Skill 名称 <b>*</b></span><input value={skillForm.name} placeholder="例如：退款政策核验" onChange={(event) => { setSkillForm((current) => ({ ...current, name: event.target.value })); setSkillImportError(''); }} /></label>
              <label className="eval-field"><span>显示名称 <b>*</b></span><input value={skillForm.displayName} placeholder="例如：退款政策核验" onChange={(event) => setSkillForm((current) => ({ ...current, displayName: event.target.value }))} /></label>
            </div>
            <label className="eval-field"><span>描述</span><textarea rows={4} maxLength={1000} value={skillForm.description} placeholder="技能描述" onChange={(event) => setSkillForm((current) => ({ ...current, description: event.target.value }))} /><small>{skillForm.description.length}/1000</small></label>
          </section>
          <section className="eval-drawer-section eval-skill-files">
            <div className="eval-skill-files__head"><h3 className="eval-skill-drawer__section-title">Skill 文件 <b>*</b></h3><span>{skillFiles.length} 个文件</span></div>
            {skillFiles.length > 0 ? <div className="eval-skill-files__layout">
              <div className="eval-skill-file-tree">
                {skillFiles.map((file) => <button type="button" key={file.id} className={selectedSkillFile?.id === file.id ? 'is-active' : ''} onClick={() => setSelectedSkillFileId(file.id)}><Braces size={13} /><span>{file.path}</span></button>)}
              </div>
              <div className="eval-skill-file-preview">
                <header><strong>{selectedSkillFile?.path}</strong><span>{selectedSkillFile ? `${Math.max(1, Math.ceil(selectedSkillFile.size / 1024))} KB` : ''}</span></header>
                {selectedSkillFile?.text ? <pre>{selectedSkillFile.text}</pre> : <div>二进制文件将在导入后随 Skill 保存。</div>}
              </div>
            </div> : <div className="eval-skill-files__empty">请选择文件、文件夹或 ZIP 包</div>}
            {skillImportError && <p className="eval-skill-import-error">{skillImportError}</p>}
          </section>
        </div>
        <footer className="eval-drawer-footer"><button type="button" className="eval-button eval-button--ghost" onClick={closeSkillDrawer}>取消</button><button type="button" className="eval-button eval-button--primary" disabled={!skillForm.name.trim() || !skillForm.displayName.trim() || !skillFiles.length} onClick={addImportedSkill}>添加 Skill</button></footer>
      </section>
    </div>}
  </div>;
}

function CodeEvaluatorEditor({ draft, setDraft, editing = false, onBack, onCreate }: { draft: EvaluatorDraft; setDraft: Dispatch<SetStateAction<EvaluatorDraft>>; editing?: boolean; onBack: () => void; onCreate: () => void }) {
  const changeLanguage = (language: CodeEvaluatorLanguage) => setDraft((current) => ({ ...current, language, code: CODE_TEMPLATE[language], dependencies: language === 'Python' ? 'Python 标准库 + 白名单依赖' : 'JavaScript ECMAScript + 白名单依赖' }));
  return <div className="eval-create-page eval-evaluator-create-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回代码评估器</button></div>
    <section className="eval-evaluator-form">
      <EvaluatorBasicFields draft={draft} setDraft={setDraft} namePlaceholder="例如：文本正则匹配" descriptionPlaceholder="说明检查内容" />
      <div className="eval-evaluator-form__section eval-evaluator-form__section--code">
        <CodeEditor value={draft.code} language={draft.language} onChange={(code) => setDraft((current) => ({ ...current, code }))} onLanguageChange={changeLanguage} timeout={draft.timeout} onTimeoutChange={(timeout) => setDraft((current) => ({ ...current, timeout }))} />
      </div>
    </section>
    <EvaluatorCreateFooter editing={editing} onBack={onBack} onCreate={onCreate} />
  </div>;
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
  const datasetName = (task: EvaluationTask) => task.taskType === '自动化' ? '动态采集' : datasets.find((item) => item.id === task.datasetId)?.name ?? task.datasetId;
  const evaluatorNames = (task: EvaluationTask) => task.evaluatorIds.map((id) => evaluators.find((item) => item.id === id)?.name ?? id);
  return <table className={`eval-data-table${selectable ? ' is-selectable' : ''} eval-task-list-table`}>
    <thead><tr>{selectable && <><th>对照组</th><th>实验组</th></>}<th>任务名称</th><th>任务类型</th><th>任务状态</th><th>评测对象</th><th>数据来源</th><th>评估器</th><th>创建时间</th><th>操作</th></tr></thead>
    <tbody>{tasks.map((task) => {
      const isControl = task.id === controlTaskId;
      const isExperiment = experimentTaskIds.includes(task.id);
      return <tr key={task.id} className={isControl ? 'is-control-selected' : isExperiment ? 'is-experiment-selected' : ''} onClick={() => onOpen?.(task)}>
        {selectable && <>
          <td><input type="radio" name="comparison-control-task" checked={isControl} disabled={lockedControl && !isControl} onChange={() => onSetControl?.(task.id)} aria-label={`设为对照组 ${task.name}`} /></td>
          <td><input type="checkbox" checked={isExperiment} disabled={isControl} onChange={() => onToggleExperiment?.(task.id)} aria-label={`选择实验组 ${task.name}`} /></td>
        </>}
        <td><div className="eval-cell-title eval-task-list-title"><strong>{task.name}</strong><small>{task.description}</small></div></td>
        <td>{task.taskType ?? '普通评测'}</td>
        <td><Status label={task.status} /></td>
        <td><div className="eval-task-entity"><div className="eval-task-entity__content"><div className="eval-task-entity__line"><strong>{task.agent}</strong><span className="eval-task-entity__version">{task.agentVersion}</span></div></div></div></td>
        <td><div className="eval-task-entity"><div className="eval-task-entity__content"><div className="eval-task-entity__line"><strong>{datasetName(task)}</strong><span className="eval-task-entity__version">{task.taskType === '自动化' ? task.automation?.objectType : task.datasetVersion}</span></div></div></div></td>
        <td><div className="eval-cell-pills">{evaluatorNames(task).map((name) => <span key={name}>{name}</span>)}</div></td>
        <td>{task.createdAt.slice(0, 10)}</td>
        <td><IconButton label="打开任务" onClick={(event) => { event.stopPropagation(); onOpen?.(task); }}><Eye size={15} /></IconButton></td>
      </tr>;
    })}</tbody>
  </table>;
}

function TaskList({ tasks, datasets, evaluators, search, setSearch, onCreate, onOpen }: { tasks: EvaluationTask[]; datasets: Dataset[]; evaluators: Evaluator[]; search: string; setSearch: (value: string) => void; onCreate: () => void; onOpen: (task: EvaluationTask) => void }) {
  const [taskStatusFilter, setTaskStatusFilter] = useState('全部状态');
  const filtered = tasks.filter((task) => {
    const searchMatched = !search || `${task.name} ${task.agent} ${task.taskType ?? '普通评测'}`.toLowerCase().includes(search.toLowerCase());
    const statusMatched = taskStatusFilter === '全部状态' || task.status === taskStatusFilter;
    return searchMatched && statusMatched;
  });
  return <div className="eval-list-page">
    <div className="eval-toolbar eval-task-list-toolbar">
      <SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务名称或 Agent" />
      <label className="eval-task-list-status"><span>状态</span><SelectField value={taskStatusFilter} aria-label="按任务状态筛选" onChange={(event) => setTaskStatusFilter(event.target.value)}><option>全部状态</option>{['待启动', '运行中', '已暂停', '已完成', '部分失败', '失败'].map((status) => <option key={status}>{status}</option>)}</SelectField></label>
      <button type="button" className="eval-button eval-button--primary eval-task-list-create" onClick={onCreate}><Plus size={16} />新建评测任务</button>
    </div>
    <section className="eval-surface table-surface eval-task-list-surface">
      <EvaluationTaskTable tasks={filtered} datasets={datasets} evaluators={evaluators} onOpen={onOpen} />
    </section>
    {filtered.length === 0 && <EmptyState title="没有匹配的评测任务" description="调整搜索关键词或任务状态。" />}
  </div>;
}

function ExperimentList({ comparisons, search, setSearch, onCreate, onOpen }: { comparisons: ComparisonRecord[]; search: string; setSearch: (value: string) => void; onCreate: () => void; onOpen: (item: ComparisonRecord) => void }) {
  const filtered = comparisons.filter((item) => !search || `${item.name} ${item.dataset} ${item.taskRefs.map((task) => `${task.name} ${task.agent}`).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="eval-list-page">
    <div className="eval-toolbar">
      <SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索实验名称、任务或评测集" />
      <button type="button" className="eval-button eval-button--primary" onClick={onCreate}><Plus size={15} />新建实验</button>
    </div>
    <section className="eval-surface table-surface">
      <table className="eval-data-table">
        <thead><tr><th>实验名称</th><th>对照组</th><th>实验组</th><th>评测集</th><th>Case 对比</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>{filtered.map((item) => <tr key={item.id} onClick={() => onOpen(item)}>
          <td><strong>{item.name}</strong></td>
          <td>{item.taskRefs.find((task) => task.role === '对照组')?.label}</td>
          <td><div className="eval-cell-pills">{item.taskRefs.filter((task) => task.role === '实验组').map((task) => <span key={task.taskId}>{task.name}</span>)}</div></td>
          <td>{item.dataset}</td>
          <td><div className="eval-cell-pills"><span>有差异 {item.differentCases}</span><span>一致 {item.sameCases}</span><span>无法比较 {item.incomparableCases}</span></div></td>
          <td><Status label={item.status} /></td>
          <td><IconButton label="查看实验结果" onClick={() => onOpen(item)}><Eye size={15} /></IconButton></td>
        </tr>)}</tbody>
      </table>
    </section>
    {filtered.length === 0 && <EmptyState title={comparisons.length === 0 ? '暂无实验' : '没有匹配的实验'} description={comparisons.length === 0 ? '从同一评测集的已完成任务中选择对照组和实验组。' : '调整搜索条件。'} />}
  </div>;
}

const optimizationTargetLabels: Record<OptimizationReportAction['target'], string> = {
  system_prompt: '系统提示词',
  tools: '工具配置',
  skills: 'Skill 内容',
};

const attributionCategoryClass = (category: OptimizationAttributionTag['category']) => {
  if (category === 'Prompt') return 'prompt';
  if (category === '工具') return 'tool';
  if (category === 'Skill') return 'skill';
  return 'model';
};

const fallbackAttributionForEvaluator = (result: EvaluatorResult): Omit<OptimizationAttributionTag, 'count'> => {
  if (result.evaluatorId === 'EVAL-COMPLETE') return { id: `tag-${result.evaluatorId}`, category: 'Prompt', label: '任务完成条件不明确' };
  if (result.evaluatorId === 'EVAL-COVERAGE') return { id: `tag-${result.evaluatorId}`, category: 'Skill', label: '关键流程与知识缺失' };
  if (result.evaluatorId === 'EVAL-INSTRUCTION') return { id: `tag-${result.evaluatorId}`, category: '模型', label: '指令遵循失败' };
  if (result.evaluatorId === 'EVAL-FAITHFUL') return { id: `tag-${result.evaluatorId}`, category: '模型', label: '外部结果使用错误' };
  if (result.evaluatorId === 'EVAL-RISK') return { id: `tag-${result.evaluatorId}`, category: 'Prompt', label: '回答约束缺失' };
  return { id: `tag-${result.evaluatorId}`, category: '模型', label: result.evaluatorName || '评估失败' };
};

const buildFallbackOptimizationReport = (result: OptimizationResult, selectedResults: CaseResult[]): OptimizationReport => {
  const tagMap = new Map<string, OptimizationAttributionTag>();
  selectedResults.forEach((caseResult) => caseResult.evaluatorResults
    .filter((item) => item.evaluationStatus !== '通过')
    .forEach((item) => {
      const tag = fallbackAttributionForEvaluator(item);
      const current = tagMap.get(tag.id);
      tagMap.set(tag.id, { ...tag, count: (current?.count ?? 0) + 1 });
    }));
  const actions: OptimizationReportAction[] = result.changes
    .filter((change) => change.changeType !== '未变化')
    .map((change, index) => ({
      id: `fallback-action-${change.target}`,
      priority: index === 0 ? '优先处理' : '随后处理',
      target: change.target,
      changeType: change.changeType === '新增' ? '新增' : '修改',
      title: `${optimizationTargetLabels[change.target]}优化`,
      summary: change.reason,
      reason: change.evidence || change.reason,
      caseIds: change.caseIds,
      evaluatorIds: change.evaluatorIds ?? [],
      tagIds: [],
      validation: '重新运行关联 Badcase，并检查评估器结果与回归集是否稳定。',
    }));
  return {
    generatedAt: '',
    summary: [result.changeSummary],
    attributionTags: [...tagMap.values()],
    actions,
    unresolved: result.suggestions
      .filter((item) => item.handling !== '已纳入配置修改')
      .map((item) => ({ id: item.id, title: item.problem, reason: item.unfixableReason || item.suggestion })),
  };
};

function OptimizationReportEvidence({ action, selectedResults }: { action: OptimizationReportAction; selectedResults: CaseResult[] }) {
  const rows = action.caseIds.map((caseId) => {
    const caseResult = selectedResults.find((item) => item.caseId === caseId);
    if (!caseResult) return null;
    const failures = caseResult.evaluatorResults.filter((item) => item.evaluationStatus !== '通过' && (!action.evaluatorIds.length || action.evaluatorIds.includes(item.evaluatorId)));
    return { caseResult, failures };
  }).filter((item): item is { caseResult: CaseResult; failures: EvaluatorResult[] } => Boolean(item));

  if (!rows.length) return <EmptyState title="暂无关联明细" description="当前报告没有可回查的 Badcase 执行结果。" />;
  return <div className="eval-report-evidence">
    <div className="eval-report-evidence__head"><strong>关联 Badcase</strong><span>{rows.length} 条</span></div>
    <div className="eval-report-evidence__table-wrap">
      <table className="eval-report-evidence__table">
        <thead><tr><th>Case</th><th>失败评估器</th><th>Input</th><th>Agent Output</th><th>定位依据</th></tr></thead>
        <tbody>{rows.map(({ caseResult, failures }) => <tr key={caseResult.caseId}>
          <td><strong>{caseResult.caseId}</strong><small>{failures.length} 个失败项</small></td>
          <td><div className="eval-report-finding-chips">{failures.map((failure) => <span key={failure.evaluatorId}>{failure.evaluatorName}<b>{failure.scoreType === 'numeric' && typeof failure.evaluationResult === 'number' ? failure.evaluationResult.toFixed(2) : failure.evaluationStatus}</b></span>)}</div></td>
          <td><p>{caseResult.input || '未采集'}</p></td>
          <td><p>{caseResult.agentOutput || '未采集'}</p></td>
          <td><p>{failures.length ? failures.map((failure) => failure.evaluationReason).join('；') : '未找到匹配的评估器证据。'}</p></td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

function OptimizationReportView({ experiment, task }: { experiment: OptimizeExperiment; task?: EvaluationTask }) {
  const [showScope, setShowScope] = useState(false);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const selectedResults = experiment.selectedCaseIds
    .map((caseId) => task?.results.find((item) => item.caseId === caseId))
    .filter((item): item is CaseResult => Boolean(item));
  const report = experiment.result.report ?? buildFallbackOptimizationReport(experiment.result, selectedResults);
  const tagById = new Map(report.attributionTags.map((tag) => [tag.id, tag]));
  const evaluatorMap = new Map<string, { id: string; name: string; scoreType: EvaluatorResult['scoreType']; total: number; passed: number; affected: number; scores: number[] }>();

  selectedResults.forEach((caseResult) => caseResult.evaluatorResults.forEach((result) => {
    const current = evaluatorMap.get(result.evaluatorId) ?? { id: result.evaluatorId, name: result.evaluatorName, scoreType: result.scoreType, total: 0, passed: 0, affected: 0, scores: [] };
    current.total += 1;
    if (result.evaluationStatus === '通过') current.passed += 1;
    else {
      current.affected += 1;
      if (result.scoreType === 'numeric' && typeof result.evaluationResult === 'number') current.scores.push(result.evaluationResult);
    }
    evaluatorMap.set(result.evaluatorId, current);
  }));

  const evaluatorRows = [...evaluatorMap.values()].sort((left, right) => right.affected - left.affected || left.name.localeCompare(right.name, 'zh-CN'));
  const failedFindings = evaluatorRows.reduce((sum, row) => sum + row.affected, 0);
  const coveredCaseCount = new Set(report.actions.flatMap((action) => action.caseIds)).size;
  const layerTotals = report.attributionTags.reduce<Record<string, number>>((totals, tag) => ({ ...totals, [tag.category]: (totals[tag.category] ?? 0) + tag.count }), {});
  const dominantLayer = Object.entries(layerTotals).sort((left, right) => right[1] - left[1])[0]?.[0];

  return <div className="eval-optimization-report">
    <section className="eval-report-overview">
      <header>
        <div>
          <div className="eval-report-kicker"><Sparkles size={14} /><span>优化报告</span><Pill tone="violet">AI 生成</Pill></div>
          <h3>报告摘要</h3>
          <p>{report.generatedAt ? `生成于 ${report.generatedAt} · ` : ''}基于已选 Badcase 的评估结果生成，报告结论固定在生成时。</p>
        </div>
        <button type="button" className="eval-report-scope-toggle" aria-expanded={showScope} onClick={() => setShowScope((current) => !current)}><ListChecks size={14} />查看分析对象（{selectedResults.length || experiment.selectedCaseCount}）<ChevronDown size={14} /></button>
      </header>
      <ul className="eval-report-summary-list">{report.summary.map((item) => <li key={item}>{item}</li>)}</ul>
      <div className="eval-report-metrics">
        <div><span>分析对象</span><strong>{selectedResults.length || experiment.selectedCaseCount}</strong><small>条 Badcase</small></div>
        <div><span>失败发现</span><strong>{failedFindings}</strong><small>{evaluatorRows.length} 个评估器</small></div>
        <div><span>优化动作</span><strong>{report.actions.length}</strong><small>覆盖 {coveredCaseCount} 条 Badcase</small></div>
      </div>
      {showScope && <div className="eval-report-scope">
        {selectedResults.length ? selectedResults.map((item) => <div key={item.caseId}><strong>{item.caseId}</strong><span>{item.input}</span><small>{item.evaluatorResults.filter((result) => result.evaluationStatus !== '通过').length} 个失败项</small></div>) : <span>未找到可展示的 Badcase。</span>}
      </div>}
    </section>
    <p className="eval-report-frozen-note">明细回查自原始评测任务，不在报告中重复存储；报告按评估器分别统计，不计算跨评估器总分。</p>

    <section className="eval-report-section">
      <div className="eval-report-section__head">
        <div><h3>评估器结果概况</h3><p>按受影响 Badcase 数排序，各评估器保持独立口径。</p></div>
        <span>{evaluatorRows.length} 个评估器</span>
      </div>
      <div className="eval-report-evaluator-list">{evaluatorRows.map((row) => {
        const scoreRange = row.scores.length ? `${Math.min(...row.scores).toFixed(2)}–${Math.max(...row.scores).toFixed(2)}` : '';
        return <div className="eval-report-evaluator-row" key={row.id}>
          <div className="eval-report-evaluator-name"><span><Target size={14} /></span><div><strong>{row.name}</strong><small>{row.scoreType === 'numeric' ? '0–1 数值评分' : '通过 / 不通过'}</small></div></div>
          <div className="eval-report-score-track"><i style={{ width: `${row.total ? Math.max(4, row.affected / row.total * 100) : 0}%` }} /></div>
          <div className="eval-report-evaluator-meta"><strong>影响 {row.affected}/{row.total}</strong><span>{row.scoreType === 'numeric' ? scoreRange || '暂无分数' : `${row.passed}/${row.total} 通过`}</span></div>
        </div>;
      })}</div>
    </section>

    <section className="eval-report-section">
      <div className="eval-report-section__head">
        <div><h3>归因标签</h3><p>共命中 {report.attributionTags.reduce((sum, tag) => sum + tag.count, 0)} 次，覆盖 {report.attributionTags.length} 类标签{dominantLayer ? `，主要集中在 ${dominantLayer}` : ''}。</p></div>
        <span><Tag size={14} />问题定位</span>
      </div>
      <div className="eval-report-attribution-grid">{report.attributionTags.map((tag) => <div className={`eval-report-attribution-row is-${attributionCategoryClass(tag.category)}`} key={tag.id}>
        <i />
        <span><b>{tag.category}</b> / {tag.label}</span>
        <strong>{tag.count}</strong>
      </div>)}</div>
    </section>

    <section className="eval-report-section">
      <div className="eval-report-section__head">
        <div><h3>优化动作</h3><p>{report.actions.length} 条动作，覆盖 {coveredCaseCount}/{selectedResults.length || experiment.selectedCaseCount} 条 Badcase，按优先级和影响范围排序。</p></div>
        <span><Wand2 size={14} />可执行建议</span>
      </div>
      <div className="eval-report-action-list">{report.actions.map((action) => {
        const tags = action.tagIds.map((tagId) => tagById.get(tagId)).filter((tag): tag is OptimizationAttributionTag => Boolean(tag));
        const actionExpanded = expandedAction === action.id;
        return <article className="eval-report-action" key={action.id}>
          <header>
            <div>
              <span className={`eval-report-priority is-${action.priority === '优先处理' ? 'primary' : 'secondary'}`}>{action.priority}</span>
              <span className="eval-report-target">{optimizationTargetLabels[action.target]}</span>
              <span className="eval-report-change-type">{action.changeType}</span>
              <strong>{action.title}</strong>
            </div>
            <span>关联 {action.caseIds.length} 条 Badcase</span>
          </header>
          <p className="eval-report-action-summary">{action.summary}</p>
          <div className="eval-report-action-reason"><span>问题与原因</span><p>{action.reason}</p></div>
          {tags.length > 0 && <div className="eval-report-action-tags">{tags.map((tag) => <span className={`is-${attributionCategoryClass(tag.category)}`} key={tag.id}>{tag.category} / {tag.label}</span>)}</div>}
          <div className="eval-report-validation"><Target size={14} /><div><span>验证方式</span><p>{action.validation}</p></div></div>
          <button type="button" className="eval-report-evidence-toggle" aria-expanded={actionExpanded} onClick={() => setExpandedAction((current) => current === action.id ? null : action.id)}><ListChecks size={14} />查看关联 Badcase（{action.caseIds.length}）<ChevronDown size={14} /></button>
          {actionExpanded && <OptimizationReportEvidence action={action} selectedResults={selectedResults} />}
        </article>;
      })}</div>
      {report.unresolved?.length ? <div className="eval-report-unresolved"><CircleAlert size={15} /><div><strong>未纳入自动优化</strong>{report.unresolved.map((item) => <p key={item.id}><b>{item.title}</b>{item.reason}</p>)}</div></div> : null}
    </section>
  </div>;
}

const optimizationCasePassed = (output?: ComparisonOutputCell) => Boolean(output?.evaluatorResults.length && output.evaluatorResults.every((item) => item.evaluationStatus === '通过'));

function OptimizationMetricSummary({ comparison, experiment }: { comparison: ComparisonRecord; experiment: OptimizeExperiment }) {
  const validationIds = new Set(experiment.selectedCaseIds);
  const regressionIds = new Set(experiment.regressionCaseIds ?? comparison.caseRows.filter((item) => !validationIds.has(item.caseId)).map((item) => item.caseId));
  const summarize = (cohort: '验证集' | '回归集', taskId: string) => {
    const rows = comparison.caseRows.filter((item) => cohort === '验证集' ? validationIds.has(item.caseId) : regressionIds.has(item.caseId));
    const passed = rows.filter((item) => optimizationCasePassed(item.outputs[taskId])).length;
    return { total: rows.length, passed, rate: rows.length ? passed / rows.length : 0 };
  };
  const beforeValidation = summarize('验证集', comparison.taskRefs[0].taskId);
  const afterValidation = summarize('验证集', comparison.taskRefs[1].taskId);
  const beforeRegression = summarize('回归集', comparison.taskRefs[0].taskId);
  const afterRegression = summarize('回归集', comparison.taskRefs[1].taskId);
  const regressions = comparison.caseRows.filter((item) => regressionIds.has(item.caseId) && optimizationCasePassed(item.outputs[comparison.taskRefs[0].taskId]) && !optimizationCasePassed(item.outputs[comparison.taskRefs[1].taskId])).length;
  const newPasses = comparison.caseRows.filter((item) => validationIds.has(item.caseId) && !optimizationCasePassed(item.outputs[comparison.taskRefs[0].taskId]) && optimizationCasePassed(item.outputs[comparison.taskRefs[1].taskId])).length;
  return <div className="eval-optimization-summary">
    <div><span>验证集通过率</span><strong>{Math.round(afterValidation.rate * 100)}%</strong><em>{beforeValidation.passed}/{beforeValidation.total} → {afterValidation.passed}/{afterValidation.total}</em></div>
    <div><span>验证集新通过</span><strong>{newPasses}</strong><em>Badcase 修复</em></div>
    <div><span>回归集通过率</span><strong>{Math.round(afterRegression.rate * 100)}%</strong><em>{beforeRegression.passed}/{beforeRegression.total} → {afterRegression.passed}/{afterRegression.total}</em></div>
    <div><span>回归退化</span><strong className={regressions ? 'is-danger' : ''}>{regressions}</strong><em>原通过变为不通过</em></div>
    <div><span>有效对比</span><strong>{comparison.comparableCases}</strong><em>共 {comparison.totalCases} 条 Case</em></div>
  </div>;
}

function OptimizationMetricBreakdown({ comparison, experiment }: { comparison: ComparisonRecord; experiment: OptimizeExperiment }) {
  const validationIds = new Set(experiment.selectedCaseIds);
  const regressionIds = new Set(experiment.regressionCaseIds ?? comparison.caseRows.filter((item) => !validationIds.has(item.caseId)).map((item) => item.caseId));
  const evaluatorIds = comparison.taskRefs[0].evaluatorIds;
  const cellFor = (cohort: '验证集' | '回归集', taskId: string, evaluatorId?: string) => {
    const rows = comparison.caseRows.filter((item) => cohort === '验证集' ? validationIds.has(item.caseId) : regressionIds.has(item.caseId));
    const results = rows.map((row) => evaluatorId ? row.outputs[taskId]?.evaluatorResults.find((item) => item.evaluatorId === evaluatorId) : undefined);
    const passed = evaluatorId ? results.filter((item) => item?.evaluationStatus === '通过').length : rows.filter((item) => optimizationCasePassed(item.outputs[taskId])).length;
    const scores = results.filter((item): item is EvaluatorResult => item != null && item.scoreType === 'numeric' && typeof item.evaluationResult === 'number').map((item) => Number(item.evaluationResult));
    const score = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : undefined;
    return { label: score === undefined ? `${passed}/${rows.length} 通过` : `${score.toFixed(2)} · ${passed}/${rows.length} 通过`, passed, total: rows.length, score };
  };
  const rows = [{ id: 'case', name: 'Case 通过率', type: '汇总' }, ...evaluatorIds.map((id) => {
    const result = comparison.caseRows.flatMap((item) => Object.values(item.outputs)).flatMap((item) => item.evaluatorResults).find((item) => item.evaluatorId === id);
    return { id, name: result?.evaluatorName ?? id, type: result?.scoreType === 'numeric' ? '0-1 数值' : '通过率' };
  })];
  return <div className="eval-optimization-breakdown table-surface"><table className="eval-data-table">
    <thead><tr><th>指标</th><th>验证集 · 优化前</th><th>验证集 · 优化后</th><th>回归集 · 优化前</th><th>回归集 · 优化后</th></tr></thead>
    <tbody>{rows.map((row) => {
      const beforeValidation = cellFor('验证集', comparison.taskRefs[0].taskId, row.id === 'case' ? undefined : row.id);
      const afterValidation = cellFor('验证集', comparison.taskRefs[1].taskId, row.id === 'case' ? undefined : row.id);
      const beforeRegression = cellFor('回归集', comparison.taskRefs[0].taskId, row.id === 'case' ? undefined : row.id);
      const afterRegression = cellFor('回归集', comparison.taskRefs[1].taskId, row.id === 'case' ? undefined : row.id);
      return <tr key={row.id}><td><div className="eval-cell-title"><strong>{row.name}</strong><small>{row.type}</small></div></td><td>{beforeValidation.label}</td><td className="is-improved">{afterValidation.label}</td><td>{beforeRegression.label}</td><td className={afterRegression.passed < beforeRegression.passed ? 'is-regression' : ''}>{afterRegression.label}</td></tr>;
    })}</tbody>
  </table></div>;
}

function EvaluatorPassPair({ before, after }: { before?: EvaluatorResult; after?: EvaluatorResult }) {
  const display = (item?: EvaluatorResult) => {
    if (!item) return '未配置';
    const score = item.scoreType === 'numeric' && typeof item.evaluationResult === 'number' ? ` ${item.evaluationResult.toFixed(2)}` : '';
    return `${item.evaluationStatus}${score}`;
  };
  const tone = (item?: EvaluatorResult) => item?.evaluationStatus === '通过' ? 'green' : item?.evaluationStatus === '不通过' ? 'amber' : 'neutral';
  return <div className="eval-pass-pair"><Pill tone={tone(before)}>{display(before)}</Pill><span>→</span><Pill tone={tone(after)}>{display(after)}</Pill></div>;
}

function OptimizationDetailTable({ comparison, experiment }: { comparison: ComparisonRecord; experiment: OptimizeExperiment }) {
  const validationIds = new Set(experiment.selectedCaseIds);
  const evaluatorIds = comparison.taskRefs[0].evaluatorIds;
  const outcome = (row: ComparisonCaseRow) => {
    const before = optimizationCasePassed(row.outputs[comparison.taskRefs[0].taskId]);
    const after = optimizationCasePassed(row.outputs[comparison.taskRefs[1].taskId]);
    if (row.cohort === '验证集') return before && after ? '保持通过' : !before && after ? '优化通过' : after ? '仍需优化' : '仍不通过';
    return before && after ? '回归稳定' : before && !after ? '回归退化' : !before && after ? '额外通过' : '保持不通过';
  };
  return <div className="eval-optimization-detail-panel">
    <div className="eval-task-section-heading"><div><h3>对比实验明细</h3><p>展示优化实验使用的评测集数据。验证集为已选 Badcase，回归集为原任务此前通过 Case；评估器按“优化前 → 优化后”展示通过状态。</p></div><span>{comparison.caseRows.length} 条 Case</span></div>
    <div className="eval-optimization-detail-table-wrap"><table className="eval-optimization-detail-table">
      <thead><tr><th className="is-sticky">Case / 集合</th><th>评测集字段</th><th>优化前 Agent Output</th><th>优化后 Agent Output</th>{evaluatorIds.map((id) => <th key={id}>{comparison.caseRows.flatMap((row) => Object.values(row.outputs)).flatMap((output) => output.evaluatorResults).find((item) => item.evaluatorId === id)?.evaluatorName ?? id}</th>)}<th>结果</th></tr></thead>
      <tbody>{comparison.caseRows.map((row) => <tr key={row.caseId}>
        <td className="is-sticky"><div className="eval-case-stack"><strong>{row.caseId}</strong><Pill tone={row.cohort === '验证集' ? 'amber' : 'green'}>{row.cohort || (validationIds.has(row.caseId) ? '验证集' : '回归集')}</Pill></div></td>
        <td><div className="eval-detail-context"><strong>{row.sharedValues.Input}</strong><span>{row.sharedValues['Expected Output']}</span><small>{row.sharedValues.订单号} · {row.sharedValues.商品状态} · {row.sharedValues.售后阶段}</small></div></td>
        <td><p>{row.outputs[comparison.taskRefs[0].taskId]?.output || '未采集'}</p></td>
        <td><p>{row.outputs[comparison.taskRefs[1].taskId]?.output || '未采集'}</p></td>
        {evaluatorIds.map((id) => <td key={id}><EvaluatorPassPair before={row.outputs[comparison.taskRefs[0].taskId]?.evaluatorResults.find((item) => item.evaluatorId === id)} after={row.outputs[comparison.taskRefs[1].taskId]?.evaluatorResults.find((item) => item.evaluatorId === id)} /></td>)}
        <td><Pill tone={outcome(row).includes('退化') || outcome(row).includes('仍') ? 'amber' : 'green'}>{outcome(row)}</Pill></td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}

function OptimizationDetail({ experiment, task, comparison, onBack, onNotify, onViewComparison }: { experiment: OptimizeExperiment; task?: EvaluationTask; comparison?: ComparisonRecord; onBack: () => void; onNotify: (message: string, tone?: Toast['tone']) => void; onViewComparison: (comparison: ComparisonRecord) => void }) {
  const [tab, setTab] = useState<OptimizationDetailTab>('report');
  const [evaluationState, setEvaluationState] = useState<'idle' | 'running' | 'ready'>(experiment.followUpMode === '直接实验对比' ? 'ready' : 'idle');
  const continueExperiment = () => {
    setEvaluationState('running');
    onNotify('已创建优化后复测任务，正在运行验证集和回归集');
    window.setTimeout(() => {
      setEvaluationState('ready');
      onNotify('复测完成，已生成指标统计和实验明细');
    }, 1200);
  };
  const showComparison = evaluationState === 'ready' && Boolean(comparison);
  const tabs: Array<{ id: OptimizationDetailTab; label: string }> = [{ id: 'report', label: '优化报告' }, { id: 'metrics', label: '指标统计' }, { id: 'details', label: '实验明细' }];
  return <div className="eval-detail-page eval-optimization-detail">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回优化记录</button><Pill tone={experiment.status === '已完成' ? 'green' : 'amber'}>{experiment.status}</Pill></div>
    <header className="eval-detail-hero eval-optimization-hero"><div><h2>{experiment.name}</h2></div></header>
    <nav className="eval-optimization-tabs" aria-label="优化详情内容">{tabs.map((item) => <button type="button" key={item.id} className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
    {evaluationState === 'running' && <section className="eval-optimization-progress"><RefreshCw size={17} /><div><strong>优化后复测任务正在运行</strong><p>同时运行验证集和回归集，完成后生成指标与明细。</p></div><Status label="复测评测中" /></section>}
    {tab === 'report' && <OptimizationReportView experiment={experiment} task={task} />}
    {tab === 'metrics' && (showComparison && comparison ? <div className="eval-optimization-stack">
      <section className="eval-optimization-panel"><div className="eval-task-section-heading"><div><h3>验证与回归</h3><p>通过阈值决定评估器是否通过，指标按验证集和回归集分别汇总。</p></div><button type="button" className="eval-button eval-button--ghost" onClick={() => onViewComparison(comparison)}>查看完整对比实验</button></div><OptimizationMetricSummary comparison={comparison} experiment={experiment} /><OptimizationMetricBreakdown comparison={comparison} experiment={experiment} /></section>
      <section className="eval-optimization-panel"><div className="eval-task-section-heading"><div><h3>运行指标</h3><p>展示候选配置的运行效率变化。</p></div></div><MetricCompareMatrix rows={comparison.runtimeRows} tasks={comparison.taskRefs} /></section>
    </div> : <EmptyState title="暂无指标统计" description="完成优化后复测后查看验证集和回归集指标。" />)}
    {tab === 'details' && (showComparison && comparison ? <OptimizationDetailTable comparison={comparison} experiment={experiment} /> : <EmptyState title="暂无实验明细" description="完成优化后复测后查看评测集数据和评估器通过状态。" />)}
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
        <SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务名称或 Agent" />
        <SelectField className="eval-picker-dataset-select" value={datasetId} disabled={lockedControl} onChange={(event) => changeDataset(event.target.value)} aria-label="筛选评测集">
          {datasets.filter((item) => tasks.some((task) => task.datasetId === item.id && terminalStatuses.includes(task.status))).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </SelectField>
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
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回实验列表</button><Pill tone={comparison.status === '已完成' ? 'green' : 'amber'}>{comparison.status}</Pill></div>
    <header className="eval-comparison-detail-header">
      <div><span className="eval-eyebrow">COMPARISON RESULT</span><h2>{comparison.name}</h2><p>{comparison.dataset} · 版本 {comparison.datasetVersion}</p></div>
    </header>
    <div className="eval-comparison-task-strip">{comparison.taskRefs.map((task) => <div key={task.taskId} className={task.role === '实验组' ? 'is-experiment' : ''}><span>{task.role}</span><strong>{task.name}</strong><small>{task.agent} · {task.agentVersion}</small></div>)}</div>
    <nav className="eval-comparison-tabs" aria-label="对比结果内容"><button type="button" className={tab === 'data' ? 'is-active' : ''} onClick={() => setTab('data')}><Table2 size={15} />评测集数据</button><button type="button" className={tab === 'metrics' ? 'is-active' : ''} onClick={() => setTab('metrics')}><BarChart3 size={15} />指标统计</button></nav>
    {tab === 'data' && <section className="eval-comparison-data">
      <div className="eval-comparison-toolbar"><SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Case、Input 或 Agent Output" /><SelectField aria-label="对比结果筛选" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option>全部</option><option>有差异</option><option>一致</option><option>无法比较</option></SelectField><span>{rows.length} 条 Case</span></div>
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
  const isQueryDataset = isQueryAgentDataset(dataset?.id ?? '');
  const requiredEvaluators = isQueryDataset
    ? QUERY_AGENT_CORE_EVALUATOR_IDS.map((id) => state.evaluators.find((item) => item.id === id)).filter((item): item is Evaluator => Boolean(item))
    : [];
  const requiredMissing = requiredEvaluators.filter((evaluator) => !config.evaluatorIds.includes(evaluator.id));
  const selectedAgents = config.agentTargets.map((target) => ({ target, agent: state.agents.find((item) => item.id === target.agentId) }));
  const submitted = state.datasets.filter((item) => item.versions.some((version) => version.status === '已提交'));
  const selectedVersion = dataset?.versions.find((version) => version.id === config.datasetVersion);
  const bindings = evaluatorCards.map((evaluatorId, index) => {
    const evaluator = state.evaluators.find((item) => item.id === evaluatorId);
    const variables = (evaluator?.variables ?? []).map((variable) => {
      const systemProvided = isQueryDataset || SYSTEM_PROVIDED_SEMANTICS.includes(variable.semantic);
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
  const taskInfoReady = Boolean(config.name.trim());
  const blocked = !datasetReady || !agentReady || !evaluatorsReady || requiredMissing.length > 0 || !taskInfoReady || runnableEvaluatorCount === 0;
  const steps: { id: TaskCreateStep; label: string }[] = [
    { id: 1, label: '任务信息' },
    { id: 2, label: '评测对象' },
    { id: 3, label: '评测集' },
    { id: 4, label: '评估器' },
  ];
  const stepDescriptions: Record<TaskCreateStep, string> = {
    1: '填写任务名称和评测目的。',
    2: '选择本次评测的 Agent 和运行版本。',
    3: '选择已提交的评测集和冻结版本。',
    4: '配置评估器并确认输入字段绑定。',
  };
  const currentStep = steps.find((item) => item.id === step) ?? steps[0];
  const canOpenStep = (target: TaskCreateStep) => target === 1 || (target === 2 && taskInfoReady) || (target === 3 && taskInfoReady && agentReady) || (target === 4 && taskInfoReady && agentReady && datasetReady);
  const currentStepReady = step === 1 ? taskInfoReady : step === 2 ? agentReady : step === 3 ? datasetReady : !blocked;
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
    const queryDataset = isQueryAgentDataset(id);
    setConfig((current) => ({
      ...current,
      datasetId: id,
      datasetVersion: next?.versions.find((version) => version.status === '已提交')?.id ?? '',
      agentTargets: queryDataset
        ? [{ agentId: QUERY_AGENT_AGENT_ID, agentVersion: QUERY_AGENT_AGENT_VERSION }]
        : id === FINANCIAL_COMPLIANCE_DATASET_ID
          ? [{ agentId: FINANCIAL_COMPLIANCE_AGENT_ID, agentVersion: FINANCIAL_COMPLIANCE_AGENT_VERSION }]
          : current.agentTargets,
      evaluatorIds: queryDataset
        ? [...new Set([...QUERY_AGENT_CORE_EVALUATOR_IDS, ...current.evaluatorIds])]
        : current.evaluatorIds.filter((evaluatorId) => !QUERY_AGENT_CORE_EVALUATOR_IDS.includes(evaluatorId)),
    }));
    if (queryDataset) setEvaluatorCards((current) => [...new Set([...QUERY_AGENT_CORE_EVALUATOR_IDS, ...current])]);
    else setEvaluatorCards((current) => current.filter((evaluatorId) => !QUERY_AGENT_CORE_EVALUATOR_IDS.includes(evaluatorId)));
  };
  const syncEvaluatorCards = (cards: string[]) => {
    setEvaluatorCards(cards);
    setConfig((current) => ({ ...current, evaluatorIds: cards.filter((id) => state.evaluators.some((item) => item.id === id)) }));
  };
  const addEvaluatorCard = () => syncEvaluatorCards([...evaluatorCards, '']);
  const removeEvaluatorCard = (index: number) => syncEvaluatorCards(evaluatorCards.filter((_, cardIndex) => cardIndex !== index));
  const changeEvaluatorCard = (index: number, id: string) => syncEvaluatorCards(evaluatorCards.map((current, cardIndex) => cardIndex === index ? id : current));
  const nextStep = () => { if (step < 4 && currentStepReady) setStep((step + 1) as TaskCreateStep); };

  return <div className="eval-task-create-page eval-task-wizard eval-task-wizard--create">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回任务列表</button><Pill tone="violet">草稿</Pill></div>
    <header className="eval-task-wizard-header">
      <div><span>评测任务</span><h2>{config.name.trim() || '新建评测任务'}</h2></div>
    </header>
    <nav className="eval-task-stepper" aria-label="新建评测任务步骤">
      {steps.map((item) => <button type="button" key={item.id} className={`${step === item.id ? 'is-active' : ''}${step > item.id ? ' is-complete' : ''}`} disabled={!canOpenStep(item.id)} onClick={() => setStep(item.id)}><span>{step > item.id ? <Check size={15} /> : item.id}</span><strong>{item.label}</strong></button>)}
    </nav>

    <section className="eval-task-step-panel">
      <header className="eval-task-step-heading">
        <div>
          <span>{String(step).padStart(2, '0')}</span>
          <div><h3>{currentStep.label}</h3><p>{stepDescriptions[step]}</p></div>
        </div>
      </header>

      {step === 1 && <div className="eval-task-step-content">
        <div className="eval-task-info-form">
          <label className="eval-field eval-task-name-field"><span>任务名称 <b>*</b></span><input autoFocus maxLength={50} value={config.name} placeholder="例如：退款客服助手 V3 回流问题评测" onChange={(event) => setConfig((current) => ({ ...current, name: event.target.value }))} /><small>{config.name.length}/50</small></label>
          <label className="eval-field eval-task-description-field"><span>任务描述</span><textarea maxLength={200} rows={4} value={config.description} placeholder="说明本次评测要验证的问题或变更" onChange={(event) => setConfig((current) => ({ ...current, description: event.target.value }))} /><small>{config.description.length}/200</small></label>
        </div>
      </div>}

      {step === 2 && <div className="eval-task-step-content">
        <div className="eval-agent-target-list">
          {selectedAgents.map(({ target, agent }, index) => <div className="eval-agent-target-row" key={`${target.agentId}-${index}`}>
            <label className="eval-field"><span>Agent <b>*</b></span><SelectField value={target.agentId} onChange={(event) => changeAgentTarget(index, event.target.value)}>{state.agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField></label>
            <label className="eval-field"><span>版本 <b>*</b></span><SelectField value={target.agentVersion} disabled={!agent} onChange={(event) => changeAgentVersion(index, event.target.value)}>{(agent?.versions ?? []).map((version) => <option key={version}>{version}</option>)}</SelectField></label>
            {config.agentTargets.length > 1 && <IconButton label={`移除 ${agent?.name ?? 'Agent'}`} onClick={() => removeAgentTarget(index)}><Trash2 size={15} /></IconButton>}
            {agent && <div className="eval-agent-target-description"><span>描述</span><p>{agent.description}</p></div>}
          </div>)}
        </div>
        <button type="button" className="eval-evaluator-add-trigger eval-agent-add-trigger" onClick={addAgentTarget}><Plus size={16} />添加 Agent</button>
      </div>}

      {step === 3 && <div className="eval-task-step-content">
        <div className="eval-task-dataset-panel">
          <div className="eval-task-form-row eval-task-form-row--action">
            <label className="eval-field"><span>评测集 <b>*</b></span><SelectField value={config.datasetId} onChange={(event) => changeDataset(event.target.value)}>{submitted.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField></label>
            <label className="eval-field"><span>版本 <b>*</b></span><SelectField value={config.datasetVersion} disabled={!dataset} onChange={(event) => setConfig((current) => ({ ...current, datasetVersion: event.target.value }))}>{dataset?.versions.filter((version) => version.status === '已提交').map((version) => <option key={version.id} value={version.id}>{version.label}</option>)}</SelectField></label>
            <CreateMenu onCreate={onCreateDataset} />
          </div>
          {!submitted.length && <div className="eval-inline-warning"><CircleAlert size={15} />当前没有可运行的已提交评测集，请先新建评测集。</div>}
          {dataset && <div className="eval-task-selection-detail">
            <div className="eval-task-selection-summary">
              <div className="eval-task-selection-copy"><span>评测集说明</span><p>{dataset.description || '暂无描述'}</p></div>
              <div className="eval-task-selection-stats"><div><span>版本</span><strong>{selectedVersion?.label ?? '未选择'}</strong></div><div><span>数据总量</span><strong>{dataset.cases.length}</strong><small>条 Case</small></div></div>
            </div>
            <div className="eval-task-selection-fields"><span>字段</span><div className="eval-task-field-tags">{dataset.fields.map((field) => <FieldBadge key={field.id} semantic={field.semantic} required={field.required} />)}</div></div>
          </div>}
        </div>
      </div>}

      {step === 4 && <div className="eval-task-step-content">
        {isQueryDataset && <div className="eval-query-core-panel">
          <div><strong>核心硬门禁</strong><p>三个核心检查必须保留；证据不足会单独展示，不折算为失败。</p></div>
          <div className="eval-query-core-list">{requiredEvaluators.map((evaluator) => (
            <article key={evaluator.id}><strong>{evaluator.name}</strong><small>{evaluator.description}</small><span>必选 · Mock 检查</span></article>
          ))}</div>
          {requiredMissing.length > 0 && <div className="eval-inline-warning"><CircleAlert size={15} />缺少 {requiredMissing.length} 个核心硬门禁。</div>}
        </div>}
        {isQueryDataset && requiredMissing.length > 0 && <div className="eval-inline-warning">请先补齐核心硬门禁评估器。</div>}
        <div className="eval-selected-evaluators">
          {bindings.map(({ evaluator, variables, missing, options }, index) => <article className="eval-selected-evaluator" key={`evaluator-card-${index}`}>
            <header>
              <div>
                <strong>评估器 {index + 1}</strong>
                <SelectField aria-label={`选择评估器 ${index + 1}`} value={evaluator?.id ?? ''} onChange={(event) => changeEvaluatorCard(index, event.target.value)}>
                  <option value="">请选择评估器</option>
                  {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </SelectField>
              </div>
              <div>{evaluator && <Status label={missing.length ? '无法执行' : '可执行'} />}{evaluator && QUERY_AGENT_CORE_EVALUATOR_IDS.includes(evaluator.id) ? <span className="eval-query-core-lock">硬门禁</span> : <IconButton label={`移除评估器 ${index + 1}`} onClick={() => removeEvaluatorCard(index)}><Trash2 size={15} /></IconButton>}</div>
            </header>
            {evaluator ? <>
              <p>{evaluator.description}</p>
              <div className="eval-auto-binding"><div className="eval-auto-binding__head"><span>评估器变量</span><span>字段语义</span><span>自动绑定</span></div>{variables.map(({ variable, systemProvided, field, bindingKey }) => <div className={`eval-auto-binding__row${variable.required && !systemProvided && !field ? ' is-missing' : ''}`} key={`${evaluator.id}-${variable.name}`}><strong>{variable.name}</strong><FieldBadge semantic={variable.semantic} required={variable.required} /><span>{systemProvided ? '系统运行时提供' : variable.semantic === 'Custom' ? <SelectField aria-label={`绑定 ${variable.name}`} value={customBindings[bindingKey] ?? ''} onChange={(event) => setCustomBindings((current) => ({ ...current, [bindingKey]: event.target.value }))}><option value="">手动绑定字段</option>{dataset?.fields.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField> : field?.name ?? '未找到对应字段'}</span></div>)}</div>
            </> : <p>请选择一个评估器。</p>}
          </article>)}
        </div>
        <button type="button" className="eval-evaluator-add-trigger" onClick={addEvaluatorCard}><Plus size={16} />添加评估器</button>
      </div>}
    </section>

    <footer className="eval-task-wizard-footer"><button type="button" className="eval-button eval-button--ghost" onClick={onBack}>取消</button><div>{step > 1 && <button type="button" className="eval-button eval-button--ghost" onClick={() => setStep((step - 1) as TaskCreateStep)}>上一步</button>}{step < 4 ? <button type="button" className="eval-button eval-button--primary" disabled={!currentStepReady} onClick={nextStep}>下一步：{steps[step].label}<ChevronRight size={14} /></button> : <button type="button" className="eval-button eval-button--primary" disabled={blocked} onClick={onCreate}><Zap size={15} />开始评测</button>}</div></footer>
  </div>;
}

const averageNumbers = (values: number[]): number | undefined => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

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

function RuntimeDistribution({ metric }: { metric: TaskRuntimeMetric }) {
  if (!metric.values.length || metric.min === undefined || metric.max === undefined) {
    return <div className="eval-runtime-distribution is-empty"><span>未采集</span></div>;
  }
  const buckets = [0, 1, 2].map((bucket) => metric.values.filter((value) => {
    if (metric.max === metric.min) return bucket === 1;
    const ratio = (value - metric.min!) / (metric.max! - metric.min!);
    return (ratio < 1 / 3 ? 0 : ratio < 2 / 3 ? 1 : 2) === bucket;
  }).length);
  const widths = buckets.map((count) => metric.values.length ? count / metric.values.length * 100 : 0);
  return <div className={`eval-runtime-distribution is-${metric.key}`}>
    <div className="eval-evaluator-distribution__bar" role="img" aria-label={`${metric.name} 数值分布：低 ${buckets[0]}，中 ${buckets[1]}，高 ${buckets[2]}`}>
      <span className="is-low" style={{ width: `${widths[0]}%` }} />
      <span className="is-mid" style={{ width: `${widths[1]}%` }} />
      <span className="is-high" style={{ width: `${widths[2]}%` }} />
    </div>
    <div className="eval-evaluator-distribution__labels"><span>低</span><span>高</span></div>
  </div>;
}

function TaskSummaryReport({ task, evaluatorRows, runtimeRows }: { task: EvaluationTask; evaluatorRows: TaskEvaluatorMetric[]; runtimeRows: TaskRuntimeMetric[] }) {
  const completedCases = task.completedCases;
  const successfulCases = Math.max(completedCases - task.failedCases, 0);
  const successRate = completedCases ? successfulCases / completedCases * 100 : undefined;
  const averageScore = averageNumbers(evaluatorRows.flatMap((row) => row.scores));
  const rateText = successRate === undefined ? '未采集' : Number.isInteger(successRate) ? `${successRate}%` : `${successRate.toFixed(1)}%`;
  const runtimeGroup = (key: string) => ['agentDuration', 'firstTokenLatency'].includes(key) ? '响应性能' : 'Token 消耗';
  const renderScoreDistribution = (scores: number[]) => {
    const total = scores.length;
    const buckets = [0, 1, 2].map((bucket) => scores.filter((score) => Math.min(2, score < 0.5 ? 0 : score < 0.8 ? 1 : 2) === bucket).length);
    const widths = buckets.map((count) => total ? count / total * 100 : 0);
    return <div className="eval-evaluator-distribution">
      <div className="eval-evaluator-distribution__bar" aria-label={total ? `低分 ${buckets[0]}，中分 ${buckets[1]}，高分 ${buckets[2]}` : '暂无得分分布'}>
        {total ? <>
          <span className="is-low" style={{ width: `${widths[0]}%` }} />
          <span className="is-mid" style={{ width: `${widths[1]}%` }} />
          <span className="is-high" style={{ width: `${widths[2]}%` }} />
        </> : <span className="is-empty" />}
      </div>
      <div className="eval-evaluator-distribution__labels"><span>低分</span><span>高分</span></div>
    </div>;
  };
  return <div className="eval-task-summary-report">
    <section className="eval-task-overview">
      <h3>任务统计概览</h3>
      <div className="eval-task-overview__grid">
        <article className="eval-task-overview__card is-violet">
          <span className="eval-task-overview__icon"><Clock3 size={20} /></span>
          <div><span>已完成</span><strong>{completedCases}</strong><small>已处理条目</small></div>
        </article>
        <article className="eval-task-overview__card is-green">
          <span className="eval-task-overview__icon"><CheckCircle2 size={20} /></span>
          <div><span>成功</span><strong>{successfulCases}</strong><small>评估成功</small></div>
        </article>
        <article className="eval-task-overview__card is-blue">
          <span className="eval-task-overview__icon"><Percent size={20} /></span>
          <div><span>成功率</span><strong>{rateText}</strong><small>评估成功率</small></div>
        </article>
        <article className="eval-task-overview__card is-sand">
          <span className="eval-task-overview__icon"><Target size={20} /></span>
          <div><span>平均分</span><strong>{averageScore === undefined ? '未采集' : averageScore.toFixed(2)}</strong><small>综合评估器均值</small></div>
        </article>
      </div>
    </section>
    <section className="eval-task-summary-section eval-evaluator-statistics">
      <h3>评估器统计</h3>
      <div className="eval-evaluator-statistics__table-wrap">
        <table className="eval-evaluator-statistics__table">
          <thead><tr><th>评估器信息</th><th>得分分布</th><th>平均分</th><th>分数范围</th><th>成功率</th><th>评估次数</th></tr></thead>
          <tbody>{evaluatorRows.map((row) => {
            const passRate = row.passRate === undefined ? undefined : row.passRate * 100;
            return <tr key={row.name}>
              <td><strong>{row.name}</strong><small>{row.invalidCount ? row.invalidLabel : row.threshold === undefined ? '直接判断' : `通过阈值 ${row.threshold.toFixed(2)}`}</small></td>
              <td>{renderScoreDistribution(row.scores)}</td>
              <td className="eval-evaluator-statistics__number">{row.average === undefined ? '未采集' : row.average.toFixed(2)}</td>
              <td>{row.min === undefined || row.max === undefined ? '未采集' : `${row.min.toFixed(2)} - ${row.max.toFixed(2)}`}</td>
              <td>{passRate === undefined ? '未采集' : Number.isInteger(passRate) ? `${passRate}%` : `${passRate.toFixed(1)}%`}</td>
              <td><strong>{row.validCount}</strong><small>共 {task.totalCases} 条</small></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
    <section className="eval-task-summary-section eval-agent-runtime">
      <h3>Agent 运行数据</h3>
      <div className="eval-evaluator-statistics__table-wrap">
        <table className="eval-evaluator-statistics__table eval-agent-runtime__metrics-table">
          <thead><tr><th>指标</th><th>数值分布</th><th>平均值</th><th>范围</th><th>有效样本</th></tr></thead>
          <tbody>{runtimeRows.map((row) => <tr className={`is-${row.key}`} key={row.key}>
            <td><strong>{row.name}</strong><small>{runtimeGroup(row.key)}</small></td>
            <td><RuntimeDistribution metric={row} /></td>
            <td className="eval-evaluator-statistics__number">{formatTaskMetric(row.average, row.name)}</td>
            <td>{row.min === undefined || row.max === undefined ? '未采集' : `${formatTaskMetric(row.min, row.name)} - ${formatTaskMetric(row.max, row.name)}`}</td>
            <td><strong>{row.validCount}</strong><small>共 {task.totalCases} 条</small></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
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
      <header><h2>{label.name}</h2><IconButton label="关闭" onClick={onCancel}><X size={17} /></IconButton></header>
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

function EvaluatorResultCell({ result, onCalibrate }: { result?: EvaluatorResult; onCalibrate: () => void }) {
  const [tooltip, setTooltip] = useState<{ top: number; left: number } | null>(null);
  if (!result) return <span className="eval-muted-value">未采集</span>;
  const value = result.scoreType === 'numeric' && typeof result.evaluationResult === 'number' ? result.evaluationResult.toFixed(2) : String(result.evaluationResult);
  const showReason = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    const below = rect.bottom + 8;
    const top = below + 120 < window.innerHeight ? below : Math.max(16, rect.top - 128);
    setTooltip({ top, left });
  };
  return <div className={`eval-evaluator-result-cell${result.calibration ? ' is-calibrated' : ''}`}>
    <span className="eval-evaluator-score" tabIndex={0} onMouseEnter={(event) => showReason(event.currentTarget)} onMouseLeave={() => setTooltip(null)} onFocus={(event) => showReason(event.currentTarget)} onBlur={() => setTooltip(null)}>{value}{result.calibration && <i>已校准</i>}</span>
    {tooltip && createPortal(<div className="eval-evaluator-reason-popover" style={{ top: tooltip.top, left: tooltip.left }}><strong>{result.calibration ? '人工校准原因' : '得分原因'}</strong><p>{result.evaluationReason || '未填写'}</p></div>, document.body)}
    <button type="button" className="eval-evaluator-calibrate" title="人工校准" aria-label={`人工校准 ${result.evaluatorName}`} onClick={(event) => { event.stopPropagation(); onCalibrate(); }}><Pencil size={12} /></button>
  </div>;
}

function EvaluatorResultFilterControl({
  evaluators,
  versions,
  value,
  onChange,
}: {
  evaluators: Evaluator[];
  versions?: Record<string, string>;
  value: Record<string, EvaluatorResultFilter>;
  onChange: (value: Record<string, EvaluatorResultFilter>) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeCount = Object.keys(value).length;
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: globalThis.MouseEvent) => {
      const target = event.target as Element | null;
      const insideSelectPortal = Boolean(target?.closest('.eval-select-content'));
      if (rootRef.current && !rootRef.current.contains(target) && !insideSelectPortal) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  return <div className="eval-evaluator-filter-control" ref={rootRef}>
    <button type="button" className={`eval-evaluator-filter-trigger${activeCount ? ' is-active' : ''}`} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span>评估器结果</span>
      {activeCount > 0 && <b>{activeCount}</b>}
      <ChevronDown size={14} />
    </button>
    {open && <div className="eval-evaluator-filter-panel" role="dialog" aria-label="按评估器结果筛选">
      <header><strong>评估器结果</strong><button type="button" disabled={activeCount === 0} onClick={() => onChange({})}>清空</button></header>
      <div className="eval-evaluator-filter-list">
        {evaluators.length ? evaluators.map((evaluator) => <label className={value[evaluator.id] ? 'is-set' : ''} key={evaluator.id}>
          <span><strong>{evaluator.name}</strong><small>{versions?.[evaluator.id] ?? evaluator.version}</small></span>
          <SelectField
            aria-label={`筛选评估器 ${evaluator.name}`}
            value={value[evaluator.id] ?? ''}
            onChange={(event) => {
              const nextValue = event.target.value as EvaluatorResultFilter | '';
              const next = { ...value };
              if (nextValue) next[evaluator.id] = nextValue;
              else delete next[evaluator.id];
              onChange(next);
            }}
          >
            <option value="">全部</option>
            <option value="通过">通过</option>
            <option value="不通过">不通过</option>
          </SelectField>
        </label>) : <div className="eval-evaluator-filter-empty">当前任务没有评估器</div>}
      </div>
    </div>}
  </div>;
}

function TaskDetail({ task, state, tab, onTabChange, onBack, backLabel = '返回任务列表', onOpenCase, onCalibrate, onOptimizeEvaluator, onRetryCase, onNotify, onOptimize, onCompare, onOpenExperiment }: { task: EvaluationTask; state: EvaluationState; tab: 'summary' | 'data' | 'optimize'; onTabChange: (tab: 'summary' | 'data' | 'optimize') => void; onBack: () => void; backLabel?: string; onOpenCase: (item: CaseResult) => void; onCalibrate: (item: CaseResult, evaluatorId: string) => void; onOptimizeEvaluator: (evaluatorId: string) => void; onRetryCase: (caseId: string) => void; onNotify: (message: string, tone?: Toast['tone']) => void; onOptimize: (caseIds: string[], mode: OptimizationFollowUpMode, agentType: '万智' | '外部', sourceTaskId: string) => void; onCompare: () => void; onOpenExperiment: (item: OptimizeExperiment) => void }) {
  const [selectedBadCaseIds, setSelectedBadCaseIds] = useState<string[]>([]);
  const [optimizeModalOpen, setOptimizeModalOpen] = useState(false);
  const [caseSearch, setCaseSearch] = useState('');
  const [caseStatusFilter, setCaseStatusFilter] = useState('');
  const [annotationFilter, setAnnotationFilter] = useState<HumanAnnotationFilter>('');
  const [evaluatorResultFilters, setEvaluatorResultFilters] = useState<Record<string, EvaluatorResultFilter>>({});
  const [activeHumanLabelId, setActiveHumanLabelId] = useState('');
  const [humanLabelMenuOpen, setHumanLabelMenuOpen] = useState(false);
  const [annotationEditor, setAnnotationEditor] = useState<{ caseId: string; labelId: string } | null>(null);
  const [humanAnnotations, setHumanAnnotations] = useState<Record<string, HumanAnnotation>>(() => Object.fromEntries(task.results.flatMap((item) => Object.entries(item.humanAnnotations ?? {}).map(([labelId, value]) => [`${item.caseId}:${labelId}`, value]))));
  const dataset = getDatasetById(state, task.datasetId);
  const isAutomation = task.taskType === '自动化';
  const taskEvaluators = state.evaluators.filter((evaluator) => task.evaluatorIds.includes(evaluator.id));
  const taskExperiments = state.experiments.filter((item) => item.sourceTaskId === task.id);
  const activeHumanLabel = state.humanLabels.find((item) => item.id === activeHumanLabelId);
  const editingHumanLabel = annotationEditor ? state.humanLabels.find((item) => item.id === annotationEditor.labelId) : undefined;
  const automationInputField: FieldDefinition = { id: 'automation-input', name: 'Input', semantic: 'Input', description: '', required: true };
  const automationOutputField: FieldDefinition = { id: 'automation-output', name: 'Output', semantic: 'Agent Output', description: '', required: true };
  const datasetFields = isAutomation ? [automationInputField] : dataset?.fields.filter((field) => !['Agent Output', 'Trace', 'Agent Configuration', 'User Feedback'].includes(field.semantic)) ?? [];
  const runtimeOutputFields = isAutomation ? [automationOutputField] : dataset?.fields.filter((field) => ['Agent Output', 'Agent Configuration'].includes(field.semantic)) ?? [];
  const allRuntimeEfficiencyFields: { key: string; label: string }[] = [
    { key: 'agentDuration', label: 'Agent 耗时' },
    { key: 'firstTokenLatency', label: '首字时延' },
    { key: 'inputTokens', label: 'Input Tokens' },
    { key: 'outputTokens', label: 'Output Tokens' },
    { key: 'totalTokens', label: 'Total Tokens' },
  ];
  const runtimeEfficiencyFields = isAutomation ? allRuntimeEfficiencyFields.filter((field) => ['agentDuration', 'inputTokens', 'outputTokens'].includes(field.key)) : allRuntimeEfficiencyFields;
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
  const getCaseRunStatus = (item: CaseResult) => (item.runtime?.runStatus ?? item.status) === '通过' ? '成功' : '失败';
  const getCaseHasAnnotation = (item: CaseResult) => {
    if (activeHumanLabel) return Boolean(humanAnnotations[`${item.caseId}:${activeHumanLabel.id}`] ?? item.humanAnnotations?.[activeHumanLabel.id]);
    return Boolean(item.humanEvaluation)
      || Object.keys(item.humanAnnotations ?? {}).length > 0
      || Object.keys(humanAnnotations).some((key) => key.startsWith(`${item.caseId}:`));
  };
  const getHumanAnnotationValue = (item: CaseResult) => {
    if (!activeHumanLabel) return '';
    const annotation = humanAnnotations[`${item.caseId}:${activeHumanLabel.id}`] ?? item.humanAnnotations?.[activeHumanLabel.id];
    if (!annotation) return '未标注';
    return activeHumanLabel.scoreType === 'numeric' ? `${annotation.score?.toFixed(2) ?? '未采集'} / ${annotation.passed ? '通过' : '不通过'}` : annotation.passed ? '通过' : '不通过';
  };
  const toggleBadCase = (caseId: string) => setSelectedBadCaseIds((current) => current.includes(caseId) ? current.filter((id) => id !== caseId) : [...current, caseId]);
  const evaluatorRows: TaskEvaluatorMetric[] = taskEvaluators.map((evaluator) => {
    const results = task.results.map((item) => item.evaluatorResults.find((result) => result.evaluatorId === evaluator.id)).filter((item): item is EvaluatorResult => item !== undefined && ['通过', '不通过'].includes(item.evaluationStatus));
    const invalidResults = task.results.map((item) => item.evaluatorResults.find((result) => result.evaluatorId === evaluator.id)).filter((item): item is EvaluatorResult => item !== undefined && ['证据不足', '无法执行', '执行失败', '待人工评估'].includes(item.evaluationStatus));
    const invalidCounts = invalidResults.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.evaluationStatus]: (counts[item.evaluationStatus] ?? 0) + 1 }), {});
    const scores = results.map((item) => item.scoreType === 'numeric' && typeof item.evaluationResult === 'number' ? item.evaluationResult : item.evaluationStatus === '通过' ? 1 : 0);
    const passed = results.filter((item) => item.evaluationStatus === '通过').length;
    return {
      name: evaluator.name,
      average: averageNumbers(scores),
      passRate: results.length ? passed / results.length : undefined,
      validCount: results.length,
      invalidCount: invalidResults.length,
      invalidLabel: Object.entries(invalidCounts).map(([status, count]) => `${status} ${count}`).join(' · '),
      scores,
      min: scores.length ? Math.min(...scores) : undefined,
      max: scores.length ? Math.max(...scores) : undefined,
      threshold: evaluator.passThreshold,
    };
  });
  const runtimeMetricValue = (item: CaseResult, key: string) => {
    if (!item.runtime) return undefined;
    if (key === 'agentDuration') return metricDurationValue(item.runtime.agentDuration);
    if (key === 'firstTokenLatency') return metricDurationValue(item.runtime.firstTokenLatency);
    return Number(item.runtime[key as 'inputTokens' | 'outputTokens' | 'totalTokens']);
  };
  const runtimeRows: TaskRuntimeMetric[] = runtimeEfficiencyFields.map((field) => {
    const values = task.results.map((item) => runtimeMetricValue(item, field.key)).filter((item): item is number => item !== undefined);
    return {
      key: field.key,
      name: field.label,
      average: averageNumbers(values),
      min: values.length ? Math.min(...values) : undefined,
      max: values.length ? Math.max(...values) : undefined,
      validCount: values.length,
      values,
    };
  });
  const normalizedCaseSearch = caseSearch.trim().toLowerCase();
  const activeEvaluatorResultFilters = Object.entries(evaluatorResultFilters);
  const filteredResults = task.results.filter((item) => {
    if (caseStatusFilter && getCaseRunStatus(item) !== caseStatusFilter) return false;
    if (annotationFilter && (annotationFilter === '已标注' ? !getCaseHasAnnotation(item) : getCaseHasAnnotation(item))) return false;
    if (activeEvaluatorResultFilters.some(([evaluatorId, expectedStatus]) => item.evaluatorResults.find((result) => result.evaluatorId === evaluatorId)?.evaluationStatus !== expectedStatus)) return false;
    if (!normalizedCaseSearch) return true;
    return [
      item.caseId,
      item.status,
      item.caseMark,
      item.input,
      item.expectedOutput,
      item.agentOutput,
      item.agentConfiguration,
      item.userFeedback,
      item.runtime?.runStatus,
      ...item.evaluatorResults.flatMap((result) => [result.evaluatorName, result.evaluationStatus, result.evaluationReason]),
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedCaseSearch);
  });
  const filteredCaseIds = filteredResults.map((item) => item.caseId);
  const selectedFilteredCaseCount = filteredCaseIds.filter((caseId) => selectedBadCaseIds.includes(caseId)).length;
  const allFilteredCasesSelected = filteredCaseIds.length > 0 && selectedFilteredCaseCount === filteredCaseIds.length;
  const someFilteredCasesSelected = selectedFilteredCaseCount > 0 && !allFilteredCasesSelected;
  const toggleAllFilteredCases = () => setSelectedBadCaseIds((current) => {
    if (allFilteredCasesSelected) {
      const filteredIds = new Set(filteredCaseIds);
      return current.filter((caseId) => !filteredIds.has(caseId));
    }
    return [...new Set([...current, ...filteredCaseIds])];
  });
  const dataTableColumnCount = 3 + datasetFields.length + runtimeOutputFields.length + 1 + (isAutomation ? 0 : 1) + (activeHumanLabel ? 1 : 0) + taskEvaluators.length + runtimeEfficiencyFields.length + 1;
  return <div className="eval-detail-page eval-task-detail-page">
    <header className="eval-task-detail-header">
      <div className="eval-task-detail-header__main">
        <button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />{backLabel}</button>
        <div className="eval-task-title-line">
          <h1>{task.name}</h1>
        </div>
      </div>
      <div className="eval-task-detail-actions">
        <button type="button" className="eval-button eval-button--primary" disabled={selectedBadCaseIds.length === 0} onClick={() => setOptimizeModalOpen(true)}><Sparkles size={14} />优化实验{selectedBadCaseIds.length > 0 ? `（${selectedBadCaseIds.length}）` : ''}</button>
        <button type="button" className="eval-button eval-button--ghost" disabled={!['已完成', '部分失败'].includes(task.status)} title={['已完成', '部分失败'].includes(task.status) ? '创建对比实验' : '任务执行完成后才能创建对比实验'} onClick={onCompare}><Layers3 size={14} />对比实验</button>
        <button type="button" className="eval-button eval-button--ghost" onClick={() => onNotify('已创建异常 Case 重试任务')}><RefreshCw size={14} />重试异常</button>
      </div>
    </header>
    <nav className="eval-task-detail-tabs" aria-label="任务详情内容"><button type="button" className={tab === 'summary' ? 'is-active' : ''} onClick={() => onTabChange('summary')}>统计结论</button><button type="button" className={tab === 'data' ? 'is-active' : ''} onClick={() => onTabChange('data')}>数据明细</button><button type="button" className={tab === 'optimize' ? 'is-active' : ''} onClick={() => onTabChange('optimize')}>优化实验</button></nav>
    {tab === 'summary' && <TaskSummaryReport task={task} evaluatorRows={evaluatorRows} runtimeRows={runtimeRows} />}
    {tab === 'data' && <section className="eval-task-data-detail">
      <div className="eval-task-data-toolbar">
        <div className="eval-task-data-query">
          <SearchField className="eval-task-case-search" value={caseSearch} maxLength={10000} placeholder="搜索 Case ID 或内容" aria-label="检索 Case" onChange={(event) => setCaseSearch(event.target.value)} />
          <label className="eval-case-filter eval-case-filter--status"><span>状态</span><SelectField value={caseStatusFilter} aria-label="按运行状态筛选 Case" onChange={(event) => setCaseStatusFilter(event.target.value)}><option value="">全部</option><option value="成功">成功</option><option value="失败">失败</option></SelectField></label>
          <label className="eval-case-filter eval-case-filter--annotation"><span>是否标注</span><SelectField value={annotationFilter} aria-label="按标注状态筛选 Case" onChange={(event) => setAnnotationFilter(event.target.value as HumanAnnotationFilter)}><option value="">全部</option><option value="已标注">已标注</option><option value="未标注">未标注</option></SelectField></label>
          <EvaluatorResultFilterControl evaluators={taskEvaluators} versions={task.evaluatorVersions} value={evaluatorResultFilters} onChange={setEvaluatorResultFilters} />
        </div>
        <div className="eval-human-label-wrap"><button type="button" className="eval-button eval-button--ghost" onClick={() => setHumanLabelMenuOpen((current) => !current)}><Plus size={15} />添加人工标注</button>{humanLabelMenuOpen && <div className="eval-human-label-menu">{state.humanLabels.map((label) => <button type="button" key={label.id} className={activeHumanLabelId === label.id ? 'is-active' : ''} onClick={() => { setActiveHumanLabelId(label.id); setHumanLabelMenuOpen(false); }}><span><strong>{label.name}</strong><small>{label.scoreType === 'numeric' ? `0-1 分，阈值 ${label.passThreshold ?? 0}` : '通过 / 不通过'}</small></span>{activeHumanLabelId === label.id && <Check size={14} />}</button>)}</div>}</div>
      </div>
      <div className="eval-task-detail-table-wrap">
        <table className="eval-task-detail-table">
          <thead>
            <tr>
              <th className="is-sticky-select"><input type="checkbox" aria-label="全选当前筛选 Case" checked={allFilteredCasesSelected} ref={(element) => { if (element) element.indeterminate = someFilteredCasesSelected; }} disabled={filteredResults.length === 0} onChange={toggleAllFilteredCases} /></th>
              <th className="is-sticky-status">状态</th>
              <th className="is-sticky-id">Case ID</th>
              {datasetFields.map((field) => <th key={field.id}>{field.semantic === 'Custom' ? field.name : field.semantic}</th>)}
              {runtimeOutputFields.map((field) => <th key={field.id}>{field.semantic}</th>)}
              <th className="is-trace">Trace</th>
              {!isAutomation && <th>User Feedback</th>}
              {activeHumanLabel && <th>人工标注</th>}
              {taskEvaluators.map((evaluator) => <th key={evaluator.id}><div className="eval-evaluator-column-head"><span><strong>{evaluator.name}</strong><small>{task.evaluatorVersions?.[evaluator.id] ?? evaluator.version}</small></span><button type="button" title="优化评估器" aria-label={`优化评估器 ${evaluator.name}`} onClick={(event) => { event.stopPropagation(); onOptimizeEvaluator(evaluator.id); }}><Wand2 size={13} /></button></div></th>)}
              {runtimeEfficiencyFields.map((field) => <th key={field.key}>{field.label}</th>)}
              <th className="is-sticky is-sticky-right">操作</th>
            </tr>
          </thead>
          <tbody>{filteredResults.map((item) => {
            const annotationKey = activeHumanLabel ? `${item.caseId}:${activeHumanLabel.id}` : '';
            const annotation = activeHumanLabel ? humanAnnotations[annotationKey] ?? item.humanAnnotations?.[activeHumanLabel.id] : undefined;
            const feedbackField = dataset?.fields.find((field) => field.semantic === 'User Feedback');
            const datasetCase = dataset?.cases.find((current) => current.id === item.caseId);
            return <tr key={item.caseId} onClick={() => onOpenCase(item)}>
              <td className="is-sticky-select"><input type="checkbox" aria-label={`选择 ${item.caseId}`} checked={selectedBadCaseIds.includes(item.caseId)} onChange={() => toggleBadCase(item.caseId)} onClick={(event) => event.stopPropagation()} /></td>
              <td className="is-sticky-status"><span className={`eval-case-run-status ${getCaseRunStatus(item) === '成功' ? 'is-success' : 'is-failure'}`} role="img" aria-label={getCaseRunStatus(item)} title={getCaseRunStatus(item)}>{getCaseRunStatus(item) === '成功' ? <CircleCheck size={16} /> : <CircleX size={16} />}</span></td>
              <td className="is-sticky-id"><strong className="eval-mono">{item.caseId}</strong></td>
              {datasetFields.map((field) => <td key={field.id} title={getFieldValue(item, field)}>{getFieldValue(item, field)}</td>)}
              {runtimeOutputFields.map((field) => <td key={field.id} title={getFieldValue(item, field)}>{getFieldValue(item, field)}</td>)}
              <td className="is-trace" title={getTraceValue(item)}><span>{getTraceValue(item)}</span></td>
              {!isAutomation && <td title={item.userFeedback || datasetCase?.values[feedbackField?.id ?? ''] || '未采集'}>{item.userFeedback || datasetCase?.values[feedbackField?.id ?? ''] || '未采集'}</td>}
              {activeHumanLabel && <td><button type="button" className={`eval-human-cell${annotation ? ' is-filled' : ''}`} onClick={(event) => { event.stopPropagation(); setAnnotationEditor({ caseId: item.caseId, labelId: activeHumanLabel.id }); }}><strong>{getHumanAnnotationValue(item)}</strong><small>{annotation?.reason || '点击编辑标注'}</small></button></td>}
              {taskEvaluators.map((evaluator) => <td key={evaluator.id}><EvaluatorResultCell result={item.evaluatorResults.find((result) => result.evaluatorId === evaluator.id)} onCalibrate={() => onCalibrate(item, evaluator.id)} /></td>)}
              {runtimeEfficiencyFields.map((field) => <td key={field.key} title={getRuntimeValue(item, field.key)}>{getRuntimeValue(item, field.key)}</td>)}
              <td className="is-sticky is-sticky-right"><div className="eval-row-actions"><button type="button" className="eval-text-button" onClick={(event) => { event.stopPropagation(); onOpenCase(item); }}>详情</button><button type="button" className="eval-text-button" onClick={(event) => { event.stopPropagation(); onRetryCase(item.caseId); }}>重试</button></div></td>
            </tr>;
          })}{filteredResults.length === 0 && <tr className="eval-task-detail-empty"><td colSpan={dataTableColumnCount}><Search size={18} /><strong>{task.results.length ? '没有匹配的 Case' : '暂无 Case'}</strong><span>{task.results.length ? '调整关键词或筛选条件。' : '任务尚未产生评测数据。'}</span></td></tr>}</tbody>
        </table>
      </div>
    </section>}
    {tab === 'optimize' && (taskExperiments.length ? <div className="eval-table-wrap eval-experiment-table"><table className="eval-data-table"><thead><tr><th>优化任务</th><th>Agent 类型</th><th>优化后流程</th><th>Badcase</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{taskExperiments.map((item) => <tr key={item.id} onClick={() => onOpenExperiment(item)}><td><div className="eval-cell-title"><strong>{item.name}</strong><small>{item.id}</small></div></td><td>{item.agentType}</td><td>{item.followUpMode}</td><td>{item.selectedCaseCount}</td><td><Status label={item.status} /></td><td>{item.createdAt}</td><td><IconButton label="查看优化详情" onClick={() => onOpenExperiment(item)}><Eye size={15} /></IconButton></td></tr>)}</tbody></table></div> : <EmptyState title="暂无优化实验记录" description="在数据明细中勾选 Badcase 后发起优化。" />)}
    {optimizeModalOpen && <OptimizationStartModal task={task} selectedCount={selectedBadCaseIds.length} onCancel={() => setOptimizeModalOpen(false)} onStart={(mode) => { setOptimizeModalOpen(false); onOptimize(selectedBadCaseIds, mode, task.agentType ?? '万智', task.id); }} />}
    {annotationEditor && editingHumanLabel && <HumanAnnotationEditor caseId={annotationEditor.caseId} label={editingHumanLabel} value={humanAnnotations[`${annotationEditor.caseId}:${annotationEditor.labelId}`]} onCancel={() => setAnnotationEditor(null)} onSave={(annotation) => { setHumanAnnotations((current) => ({ ...current, [`${annotationEditor.caseId}:${annotationEditor.labelId}`]: annotation })); setAnnotationEditor(null); onNotify('人工标注已保存'); }} />}
  </div>;
}

const normalizeCaseToken = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const caseTraceId = (item: CaseResult) => item.observedTraceId ?? item.queryAgent?.traceId ?? `trace-${normalizeCaseToken(item.caseId)}`;
const caseSessionId = (item: CaseResult, task: EvaluationTask) => item.observedSessionId ?? item.queryAgent?.sessionId ?? `session-${normalizeCaseToken(task.id)}`;

const durationToMilliseconds = (value?: string) => {
  if (!value) return null;
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return null;
  if (value.includes('ms')) return amount;
  if (value.includes('s')) return amount * 1000;
  return null;
};

const taskObservationTimestamp = (task: EvaluationTask) => {
  const normalized = task.updatedAt.replace(' ', 'T');
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized) ? normalized : `${normalized}:00+08:00`;
  const timestamp = new Date(withTimezone);
  if (!Number.isNaN(timestamp.getTime())) return timestamp.toISOString();
  return `${task.updatedAt.slice(0, 10)}T00:00:00+08:00`;
};

const observationEventStatus = (status: '成功' | '失败' | '跳过') => status === '成功'
  ? 'success'
  : status === '失败'
    ? 'error'
    : 'skipped';

function caseResultToObservedTrace(item: CaseResult, task: EvaluationTask): ObservedTrace {
  const toolEvents: ObservationTraceEvent[] = item.trace
    .filter((event) => event.type !== 'agent')
    .map((event) => ({
      kind: 'tool',
      id: `${item.caseId}-${event.id}`,
      name: event.name,
      input: event.input ?? '未采集',
      output: event.output ?? event.detail,
      linked: true,
      brief: event.detail,
      status: observationEventStatus(event.status),
      args: { sourceType: event.type, duration: event.duration },
      result: event.output ?? event.detail,
    }));
  const finalAgentEvent = [...item.trace].reverse().find((event) => event.type === 'agent');
  const finalOutput = item.agentOutput || finalAgentEvent?.output || finalAgentEvent?.detail || '没有生成 Agent Output。';
  const events: ObservationTraceEvent[] = [
    { kind: 'user', id: `${item.caseId}-user`, text: item.input || '未采集', messageId: `${item.caseId}-user` },
    ...toolEvents,
    {
      kind: 'assistant',
      id: `${item.caseId}-assistant`,
      text: finalOutput,
      isFinal: true,
      hasReasoning: Boolean(finalAgentEvent?.detail),
      reasoning: finalAgentEvent?.detail ?? '根据 Case 输入、工具结果和运行时上下文生成最终回答。',
      content: finalOutput,
      model: null,
      provider: null,
      finishReason: 'stop',
      inputTokens: item.runtime?.inputTokens ?? null,
      outputTokens: item.runtime?.outputTokens ?? null,
      totalTokens: item.runtime?.totalTokens ?? null,
      cacheReadTokens: null,
      reasoningTokens: null,
      toolNames: item.trace.filter((event) => event.type === 'tool').map((event) => event.name),
    },
  ];
  return {
    id: caseTraceId(item),
    traceId: caseTraceId(item),
    sessionId: caseSessionId(item, task),
    turn: 1,
    sourceFile: `评测任务 ${task.id}`,
    agent: task.agent,
    occurredAt: taskObservationTimestamp(task),
    duration: durationToMilliseconds(item.runtime?.agentDuration ?? item.duration),
    feedback: item.userFeedback ?? null,
    abnormal: item.status !== '通过' || item.trace.some((event) => event.status === '失败'),
    sourceMessageCount: item.trace.length + 2,
    historyMessageCount: 0,
    currentMessageCount: 1,
    reasoningCount: item.trace.filter((event) => event.type === 'agent').length,
    toolCount: item.trace.filter((event) => event.type === 'tool').length,
    inputTokens: item.runtime?.inputTokens ?? null,
    outputTokens: item.runtime?.outputTokens ?? null,
    compressed: false,
    historySummary: `由评测 Case ${item.caseId} 生成的观测投影。`,
    input: item.input,
    output: finalOutput,
    context: { kind: 'none', messages: [] },
    events,
  };
}

function caseResultToObservedSession(task: EvaluationTask, trace: ObservedTrace): ObservedSession {
  return {
    id: trace.sessionId ?? trace.id,
    sessionId: trace.sessionId,
    agent: task.agent,
    startedAt: trace.occurredAt,
    feedback: trace.feedback,
    abnormal: trace.abnormal,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    turns: [trace],
  };
}

const caseObservedTrace = (item: CaseResult) => observedTraces.find((trace) =>
  trace.id === item.observedTraceId
  || trace.traceId === item.observedTraceId
  || trace.traceId === item.queryAgent?.traceId,
);

const caseObservedSession = (item: CaseResult) => observedSessions.find((session) =>
  session.id === item.observedSessionId
  || session.sessionId === item.observedSessionId
  || session.id === item.queryAgent?.sessionId,
);

function resolveCaseObservationTrace(item: CaseResult, task: EvaluationTask): ObservedTrace {
  return caseObservedTrace(item) ?? caseResultToObservedTrace(item, task);
}

function resolveCaseObservationSession(item: CaseResult, task: EvaluationTask, fallbackTrace: ObservedTrace): ObservedSession {
  return caseObservedSession(item) ?? caseResultToObservedSession(task, fallbackTrace);
}

const evaluatorResultValue = (result: EvaluatorResult) => result.scoreType === 'numeric' && typeof result.evaluationResult === 'number'
  ? result.evaluationResult.toFixed(2)
  : String(result.evaluationResult);

const evaluatorResultTone = (result: EvaluatorResult) => result.evaluationStatus === '通过'
  ? 'is-pass'
  : result.evaluationStatus === '不通过'
    ? 'is-fail'
    : 'is-neutral';

const evaluatorProcessSteps = (result: EvaluatorResult, item: CaseResult) => {
  const diagnostics = result.diagnostics?.map((diagnostic) => `${diagnostic.code}：${diagnostic.message}${diagnostic.path ? `（${diagnostic.path}）` : ''}`) ?? [];
  const evidenceCount = Math.max(item.trace.length, result.traceRefs.length);
  const evidenceRows = evidenceCount
    ? `读取 ${evidenceCount} 个可观测节点，并关联 ${result.traceRefs.length} 条评估证据引用。`
    : '当前结果未附带可回指的 Trace 节点，按已提供的输入与输出进行判定。';
  const standardRows = result.scoreType === 'numeric'
    ? '按评估器规则拆分可判定子项，逐项计算覆盖或匹配程度，再归一化为 0 到 1 的分数。'
    : '按评估器规则检查每项必要条件；任一致命条件不满足时判定为不通过。';
  const judgmentRows = [
    result.evaluationReason || '当前结果未提供自然语言评分原因。',
    ...diagnostics,
  ].join('\n');
  return [
    { title: '证据准备', body: evidenceRows },
    { title: '判定标准', body: standardRows },
    { title: '逐条判定', body: judgmentRows },
    { title: '结果归因', body: `综合证据与规则，本次结果为 ${evaluatorResultValue(result)}，状态为「${result.evaluationStatus}」。该结论只对应本条 Case 当前执行轮次，不代表任务整体结论。` },
  ];
};

function CaseEvaluatorResult({ result, item, index }: { result: EvaluatorResult; item: CaseResult; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [tooltip, setTooltip] = useState<{ top: number; left: number; width: number } | null>(null);
  const reason = result.evaluationReason || result.diagnostics?.map((diagnostic) => diagnostic.message).join('；') || '未提供评分原因';
  const kind = result.evaluationKind ?? (result.diagnostics ? '代码评估' : '模型评估器');
  const processId = `case-evaluator-process-${normalizeCaseToken(item.caseId)}-${normalizeCaseToken(result.evaluatorId)}`;
  const showReason = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const width = Math.min(460, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.left + 150, window.innerWidth - width - 16));
    const below = rect.bottom + 8;
    const top = below + 170 < window.innerHeight ? below : Math.max(16, rect.top - 178);
    setTooltip({ top, left, width });
  };
  return <article className={`eval-case-evaluator${expanded ? ' is-open' : ''}`} data-evaluator-index={index}>
    <button
      type="button"
      className="eval-case-evaluator__summary"
      aria-expanded={expanded}
      aria-controls={processId}
      onMouseEnter={(event) => showReason(event.currentTarget)}
      onMouseLeave={() => setTooltip(null)}
      onFocus={(event) => showReason(event.currentTarget)}
      onBlur={() => setTooltip(null)}
      onClick={() => setExpanded((current) => !current)}
    >
      <span className="eval-case-evaluator__identity">
        <strong>{result.evaluatorName}</strong>
        <small>{kind} · {result.evaluatorVersion ?? '当前版本'}</small>
      </span>
      <span className={`eval-case-evaluator__score ${evaluatorResultTone(result)}`}>{evaluatorResultValue(result)}</span>
      <span className="eval-case-evaluator__reason">{reason}</span>
      <span className="eval-case-evaluator__toggle"><ChevronDown size={16} /></span>
    </button>
    {tooltip && createPortal(<div className="eval-evaluator-reason-popover eval-case-evaluator-popover" style={{ top: tooltip.top, left: tooltip.left, width: tooltip.width }}><strong>评分原因</strong><p>{reason}</p></div>, document.body)}
    {expanded && <div className="eval-case-evaluator__process" id={processId}>
      <div className="eval-case-evaluator__process-head"><h4>评估过程</h4><span>{result.traceRefs.length} 条证据引用</span></div>
      <ol>
        {evaluatorProcessSteps(result, item).map((step) => <li key={step.title}>
          <div><strong>{step.title}</strong><p>{step.body}</p></div>
        </li>)}
      </ol>
    </div>}
  </article>;
}

function CasePreview({
  item,
  task,
  onClose,
  onOpenTrace,
  onOpenSession,
}: {
  item: CaseResult;
  task: EvaluationTask;
  onClose: () => void;
  onOpenTrace: () => void;
  onOpenSession: () => void;
}) {
  const [view, setView] = useState<'format' | 'json'>('format');
  const traceId = caseTraceId(item);
  const sessionId = caseSessionId(item, task);
  const caseJson = JSON.stringify({
    trace_id: traceId,
    session_id: sessionId,
    agent_name: task.agent,
    input: item.input || '',
    output: item.agentOutput || '',
  }, null, 2);
  const jsonLines = caseJson.split('\n');
  const titleId = `case-preview-title-${normalizeCaseToken(item.caseId)}`;
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);
  return <div className="eval-case-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="eval-case-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="eval-case-drawer__header">
        <div>
          <span className="eval-eyebrow">EVALUATION CASE</span>
          <div><h2 id={titleId}>评估样本</h2><span>{item.caseId}</span></div>
        </div>
        <IconButton label="关闭评估样本" onClick={onClose}><X size={18} /></IconButton>
      </header>
      <div className="eval-case-drawer__body">
        <section className="eval-case-data-pane" aria-label="评测 Case 数据">
          <div className="eval-case-format-bar">
            <div role="tablist" aria-label="数据展示格式">
              <button type="button" role="tab" aria-selected={view === 'format'} className={view === 'format' ? 'is-active' : ''} onClick={() => setView('format')}>Format</button>
              <button type="button" role="tab" aria-selected={view === 'json'} className={view === 'json' ? 'is-active' : ''} onClick={() => setView('json')}>JSON</button>
            </div>
          </div>
          <div className="eval-case-data-pane__scroll">
            {view === 'format' ? <div className="eval-case-format-view" role="tabpanel">
              <section className="eval-case-object">
                <h3><Braces size={15} />评估对象</h3>
                <dl>
                  <div><dt>trace_id</dt><dd><button type="button" className="eval-case-observation-link" title="在观测中查看 Trace" onClick={onOpenTrace}>{traceId}<ArrowUpRight size={13} /></button></dd></div>
                  <div><dt>session_id</dt><dd><button type="button" className="eval-case-observation-link" title="在观测中查看 Session" onClick={onOpenSession}>{sessionId}<ArrowUpRight size={13} /></button></dd></div>
                  <div><dt>agent_name</dt><dd><span>{task.agent}</span></dd></div>
                </dl>
              </section>
              <section className="eval-case-content">
                <h3><Braces size={15} />数据项内容</h3>
                <article>
                  <span>input</span>
                  <p>{item.input || '未采集'}</p>
                </article>
                <article>
                  <span>output</span>
                  <p>{item.agentOutput || '没有生成 Agent Output。'}</p>
                </article>
              </section>
            </div> : <div className="eval-case-json-view" role="tabpanel">
              <div className="eval-case-json-gutter" aria-hidden="true">{jsonLines.map((_, index) => <span key={index}>{index + 1}</span>)}</div>
              <pre>{caseJson}</pre>
            </div>}
          </div>
        </section>
        <section className="eval-case-evaluator-pane" aria-label="评估器结果">
          <header>
            <div><span className="eval-eyebrow">EVALUATOR RESULTS</span><h3>评估器结果</h3></div>
            <span>{item.evaluatorResults.length} 个评估器</span>
          </header>
          <div className="eval-case-evaluator-list">
            {item.evaluatorResults.length
              ? item.evaluatorResults.map((result, index) => <CaseEvaluatorResult key={result.evaluatorId} result={result} item={item} index={index} />)
              : <div className="eval-case-evaluator-empty"><CircleAlert size={18} /><strong>暂无评估器结果</strong><span>当前 Case 尚未完成评估。</span></div>}
          </div>
        </section>
      </div>
    </aside>
  </div>;
}

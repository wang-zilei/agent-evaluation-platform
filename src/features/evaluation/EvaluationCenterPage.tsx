import { useEffect, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type MouseEvent, type ReactNode, type SetStateAction } from 'react';
import * as XLSX from 'xlsx';
import {
  ArrowLeft, Bot, Braces, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  CircleAlert, ClipboardCheck, Copy, Database, Download, Eye, FileSpreadsheet, History,
  Layers3, ListChecks, Maximize2, MoreHorizontal, Plus, RefreshCw, Search, Settings2, Sparkles, Trash2, Upload,
  X, Zap,
} from 'lucide-react';
import { cloneEvaluationState, getDatasetById, historyConversations, statusTone } from './evaluation.mock';
import type {
  AgentOption, CaseResult, Dataset, DatasetCase, EvaluationModule, EvaluationState,
  EvaluationTask, Evaluator, EvaluatorMode, FieldDefinition, FieldSemantic, HistoryConversation,
  ScoreType, TaskTab,
} from './evaluation.types';
import './evaluation.css';

type Toast = { id: number; message: string; tone: 'success' | 'warning' | 'danger' };
type DatasetScreen = 'list' | 'workspace' | 'upload' | 'generate' | 'history';
type EvaluatorScreen = 'list' | 'detail' | 'create';
type TaskScreen = 'list' | 'create' | 'detail';
type DatasetCreateMode = '用户上传' | '智能生成' | '历史对话回流';
type HistoryDatePreset = '3' | '5' | '7' | '30' | 'custom';
type TaskCreateStep = 1 | 2 | 3 | 4;

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
type EvaluatorDraft = { name: string; description: string; model: string; scoreType: ScoreType; prompt: string; variables: Evaluator['variables'] };
type TaskDraft = {
  agentId: string; agentVersion: string; datasetId: string; datasetVersion: string; evaluatorIds: string[];
  name: string; description: string; concurrency: number; timeout: number; continueOnError: boolean;
};

const TODAY = '2026-08-28';
const HISTORY_PAGE_SIZE = 8;
const INITIAL_EVALUATION_STATE = cloneEvaluationState();
const FIELD_SEMANTICS: FieldSemantic[] = ['Input', 'File', 'Expected Output', 'Actual Output', 'Trace', 'Agent Configuration', 'User Feedback', 'Custom'];
const FIELD_DESCRIPTIONS: Record<FieldSemantic, string> = {
  Input: '提供给 Agent 的完整用户输入，包括多轮消息和文件信息。',
  File: '评测集中单独维护的文件资源字段。',
  'Expected Output': '期望结果、参考答案或验收标准。',
  'Actual Output': 'Agent 已产生的实际回答和交付说明。',
  Trace: 'Agent 的完整运行轨迹和真实执行证据。',
  'Agent Configuration': '本次运行实际生效的完整 Agent 配置快照。',
  'User Feedback': '历史对话中的点赞、点踩和反馈原因。',
  Custom: '其他业务字段。',
};
const SYSTEM_PROVIDED_SEMANTICS: FieldSemantic[] = ['Actual Output', 'Trace', 'Agent Configuration', 'User Feedback'];
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
  if (['actualoutput', 'output', 'response', 'answeroutput', '回答', '实际回答', '最终回答', '最终输出'].includes(value)) return 'Actual Output';
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
  name: '', description: '', model: 'Doubao-Seed-1.6', scoreType: 'numeric',
  prompt: '',
  variables: [],
});
const makeTaskDraft = (state: EvaluationState): TaskDraft => {
  const agent = state.agents[0]; const dataset = state.datasets.find((item) => item.versions.some((version) => version.status === '已提交')) ?? state.datasets[0];
  return { agentId: agent?.id ?? '', agentVersion: agent?.versions[0] ?? '', datasetId: dataset?.id ?? '', datasetVersion: dataset?.versions.find((version) => version.status === '已提交')?.id ?? '', evaluatorIds: [], name: '', description: '', concurrency: 2, timeout: 60, continueOnError: true };
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
  const [evaluatorMode, setEvaluatorMode] = useState<EvaluatorMode>('preset');
  const [datasetDraft, setDatasetDraft] = useState<DatasetDraft>(() => makeDatasetDraft(INITIAL_EVALUATION_STATE));
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(() => makeTaskDraft(INITIAL_EVALUATION_STATE));
  const [evaluatorDraft, setEvaluatorDraft] = useState<EvaluatorDraft>(makeEvaluatorDraft);
  const [selectedDatasetId, setSelectedDatasetId] = useState(INITIAL_EVALUATION_STATE.datasets[0]?.id ?? '');
  const [selectedTaskId, setSelectedTaskId] = useState(INITIAL_EVALUATION_STATE.tasks[0]?.id ?? '');
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState(INITIAL_EVALUATION_STATE.evaluators[0]?.id ?? '');
  const [search, setSearch] = useState(''); const [datasetSearch, setDatasetSearch] = useState(''); const [taskSearch, setTaskSearch] = useState(''); const [scoreFilter, setScoreFilter] = useState('全部结果类型');
  const [toast, setToast] = useState<Toast | null>(null); const [toastId, setToastId] = useState(0); const [casePreview, setCasePreview] = useState<CaseResult | null>(null);
  const [taskReturn, setTaskReturn] = useState(false);
  const [datasetEntryFromTask, setDatasetEntryFromTask] = useState(false);
  const [editingEvaluatorId, setEditingEvaluatorId] = useState<string | null>(null);
  const notify = (message: string, tone: Toast['tone'] = 'success') => { const id = toastId + 1; setToastId(id); setToast({ id, message, tone }); window.setTimeout(() => setToast((current) => current?.id === id ? null : current), 2600); };
  const showList = () => { if (module === 'datasets') { setDatasetScreen('list'); setDatasetEntryFromTask(false); } if (module === 'evaluators') setEvaluatorScreen('list'); if (module === 'tasks') setTaskScreen('list'); };
  const openDatasetCreate = (mode: DatasetCreateMode) => {
    setTaskReturn(module === 'tasks' && taskScreen === 'create');
    setDatasetEntryFromTask(module === 'tasks' && taskScreen === 'create');
    setDatasetDraft((current) => ({ ...current, mode }));
    setDatasetScreen(mode === '用户上传' ? 'upload' : mode === '智能生成' ? 'generate' : 'history');
    setModule('datasets');
  };
  const openTaskCreate = () => { setTaskDraft(makeTaskDraft(state)); setTaskScreen('create'); setModule('tasks'); };
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
      fields = [{ id: 'input', name: '用户输入', semantic: 'Input', description: FIELD_DESCRIPTIONS.Input, required: true }, { id: 'actual', name: '原始回答', semantic: 'Actual Output', description: FIELD_DESCRIPTIONS['Actual Output'], required: false }, { id: 'trace', name: '原始 Trace', semantic: 'Trace', description: FIELD_DESCRIPTIONS.Trace, required: false }, { id: 'feedback', name: '用户反馈', semantic: 'User Feedback', description: FIELD_DESCRIPTIONS['User Feedback'], required: false }];
      cases = selected.map((conversation, index) => ({ id: `CASE-HISTORY-${String(index + 1).padStart(3, '0')}`, values: { input: conversation.traces[0]?.input ?? conversation.title, actual: conversation.traces.at(-1)?.actualOutput ?? '', trace: conversation.traces.map((trace) => `trace://${trace.id}`).join(' / '), feedback: conversation.traces.map((trace) => trace.feedback).filter(Boolean).join('；') }, source: '历史对话回流', createdAt: TODAY, hasFile: false }));
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
    const evaluator: Evaluator = { id: existing?.id ?? `custom-${state.evaluators.length + 1}`, name: draft.name.trim(), kind: 'LLM', mode: 'custom', version: nextVersion, versions: existing ? [...existing.versions, nextVersion] : [nextVersion], description: draft.description.trim() || '用户自定义评估规则。', purpose: draft.description.trim() || '用户自定义评估规则。', category: '自建评估器', scoreType: draft.scoreType, model: draft.model, prompt: draft.prompt, variables, creator: existing?.creator ?? '演示账户', updatedAt: `${TODAY} 20:30`, runCount: existing?.runCount ?? 0 };
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
    const dataset = getDatasetById(state, taskDraft.datasetId); const version = dataset?.versions.find((item) => item.id === taskDraft.datasetVersion); const selected = state.evaluators.filter((item) => taskDraft.evaluatorIds.includes(item.id));
    if (!taskDraft.name.trim()) { notify('请填写任务名称', 'warning'); return; }
    if (!dataset || !version || version.status !== '已提交') { notify('任务必须绑定已提交的评测集版本', 'warning'); return; }
    if (!selected.length) { notify('至少选择一个评估器', 'warning'); return; }
    const results: CaseResult[] = dataset.cases.map((item, index) => ({ caseId: item.id, status: index === 1 ? '不通过' : '通过', duration: index === 1 ? '7.4 s' : '5.9 s', input: item.values[dataset.fields.find((field) => field.semantic === 'Input')?.id ?? ''] ?? '未读取 Input', actualOutput: item.values[dataset.fields.find((field) => field.semantic === 'Actual Output')?.id ?? ''] ?? '', expectedOutput: item.values[dataset.fields.find((field) => field.semantic === 'Expected Output')?.id ?? ''], trace: [{ id: `mock-${index}`, type: 'system', name: 'Mock 执行记录', status: '成功', duration: '—', detail: '原型数据：不调用真实 Agent。' }], evaluatorResults: selected.map((evaluator) => ({ evaluatorId: evaluator.id, evaluatorName: evaluator.name, scoreType: evaluator.scoreType, status: index === 1 ? '不通过' : '通过', score: evaluator.scoreType === 'numeric' ? index === 1 ? 0.58 : 0.92 : index === 1 ? 0 : 1, reason: index === 1 ? '模拟数据：缺少一个验收要点。' : '模拟数据：满足当前评估器要求。', evidence: ['字段语义绑定结果', '模拟 Trace 节点'], evidenceRefs: [`mock-${index}`] })), agentConfiguration: `${state.agents.find((agent) => agent.id === taskDraft.agentId)?.name ?? 'Agent'} ${taskDraft.agentVersion} · Mock Configuration` }));
    const task: EvaluationTask = { id: `TASK-${TODAY.replaceAll('-', '')}-${String(state.tasks.length + 1).padStart(3, '0')}`, name: taskDraft.name.trim(), description: taskDraft.description.trim(), agent: state.agents.find((agent) => agent.id === taskDraft.agentId)?.name ?? 'Agent', agentVersion: taskDraft.agentVersion, datasetId: dataset.id, datasetVersion: version.label, evaluatorIds: taskDraft.evaluatorIds, status: '运行中', tone: 'info', createdBy: '演示账户', createdAt: `${TODAY} 20:31`, updatedAt: `${TODAY} 20:31`, totalCases: results.length, executableCases: results.length, completedCases: 0, failedCases: 0, results, runtime: { concurrency: taskDraft.concurrency, timeout: taskDraft.timeout, continueOnError: taskDraft.continueOnError } };
    setState((current) => ({ ...current, tasks: [task, ...current.tasks] })); setSelectedTaskId(task.id); setTaskScreen('detail'); notify('评测任务已创建，正在模拟运行');
  };

  function historyForDraft(draft: DatasetDraft) {
    const days = draft.historyPreset === 'custom' ? null : Number(draft.historyPreset);
    const range = draft.historyPreset === 'custom' ? { start: startOfDay(draft.historyStart), end: endOfDay(draft.historyEnd) } : { start: startOfDay(shiftDate(TODAY, -((days ?? 7) - 1))), end: endOfDay(TODAY) };
    return historyConversations.filter((conversation) => {
      if (conversation.agentId !== draft.historyAgentId || conversation.agentVersion !== draft.historyVersion) return false;
      const stamp = dateStamp(conversation.occurredAt); if (stamp < range.start || stamp > range.end) return false;
      const feedback = conversation.traces.some((trace) => trace.feedback.trim());
      return draft.historyFeedback === '全部' || (draft.historyFeedback === '有反馈' ? feedback : !feedback);
    });
  }
  const dataset = state.datasets.find((item) => item.id === selectedDatasetId) ?? state.datasets[0];
  const task = state.tasks.find((item) => item.id === selectedTaskId) ?? state.tasks[0];
  const evaluator = state.evaluators.find((item) => item.id === selectedEvaluatorId) ?? state.evaluators[0];
  return <div className="evaluation-app">
    <header className="eval-app-header"><div className="eval-app-title"><div className="eval-app-mark"><span /><span /><span /></div><div><span className="eval-eyebrow">WANZHI / QUALITY WORKSPACE</span><h1>评测中心</h1></div></div><div className="eval-app-actions"><Pill>本地 Mock</Pill><IconButton label="恢复初始数据" onClick={() => { setState(cloneEvaluationState()); notify('已恢复初始 Mock 数据'); }}><RefreshCw size={16} /></IconButton></div></header>
    <nav className="eval-module-nav" aria-label="评测中心模块">{([{ id: 'tasks', label: '评测任务', icon: ListChecks }, { id: 'datasets', label: '评测集', icon: Database }, { id: 'evaluators', label: '评估器', icon: ClipboardCheck }] as const).map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={module === item.id ? 'is-active' : ''} onClick={() => { setModule(item.id); if (item.id === 'tasks') setTaskScreen('list'); if (item.id === 'datasets') setDatasetScreen('list'); if (item.id === 'evaluators') setEvaluatorScreen('list'); }}><Icon size={16} />{item.label}</button>; })}</nav>
    <main className="eval-content">
      {module === 'datasets' && datasetScreen === 'list' && <DatasetList datasets={state.datasets} search={datasetSearch} setSearch={setDatasetSearch} onCreate={openDatasetCreate} onOpen={(item) => { setSelectedDatasetId(item.id); setDatasetEntryFromTask(false); setDatasetScreen('workspace'); }} />}
      {module === 'datasets' && datasetScreen === 'upload' && <DatasetUploadPage draft={datasetDraft} setDraft={setDatasetDraft} onBack={showList} onCreate={createDataset} onNotify={notify} />}
      {module === 'datasets' && datasetScreen === 'generate' && <DatasetGeneratePage draft={datasetDraft} setDraft={setDatasetDraft} agents={state.agents} onBack={showList} onCreate={createDataset} />}
      {module === 'datasets' && datasetScreen === 'history' && <DatasetHistoryPage draft={datasetDraft} setDraft={setDatasetDraft} agents={state.agents} onBack={showList} onCreate={createDataset} />}
      {module === 'datasets' && datasetScreen === 'workspace' && dataset && <DatasetWorkspace dataset={dataset} entrySource={datasetEntryFromTask ? 'task' : 'dataset'} onBack={() => { if (datasetEntryFromTask) { setDatasetEntryFromTask(false); setDatasetScreen('list'); setTaskScreen('create'); setModule('tasks'); notify('草稿已保存，未带回任务创建'); return; } setDatasetScreen('list'); }} onNotify={notify} onUpdateDataset={updateDataset} onSubmitDataset={submitDatasetVersion} onCopyDraft={copyDatasetAsDraft} />}
      {module === 'evaluators' && evaluatorScreen === 'list' && <EvaluatorList evaluators={state.evaluators.filter((item) => item.mode === evaluatorMode && (!search || `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase())) && (scoreFilter === '全部结果类型' || (scoreFilter === '0—1 数值' ? item.scoreType === 'numeric' : item.scoreType === 'pass_fail')))} mode={evaluatorMode} setMode={setEvaluatorMode} search={search} setSearch={setSearch} scoreFilter={scoreFilter} setScoreFilter={setScoreFilter} onCreate={openEvaluatorCreate} onOpen={(item) => { setSelectedEvaluatorId(item.id); setEvaluatorScreen('detail'); }} onCopy={(item) => { setEditingEvaluatorId(null); setEvaluatorDraft({ name: `${item.name}（自建）`, description: item.description, model: item.model, scoreType: item.scoreType, prompt: item.prompt, variables: item.variables }); setEvaluatorScreen('create'); }} />}
      {module === 'evaluators' && evaluatorScreen === 'detail' && evaluator && <EvaluatorDetail evaluator={evaluator} onBack={showList} onCopy={() => { setEditingEvaluatorId(null); setEvaluatorDraft({ name: `${evaluator.name}（自建）`, description: evaluator.description, model: evaluator.model, scoreType: evaluator.scoreType, prompt: evaluator.prompt, variables: evaluator.variables }); setEvaluatorScreen('create'); }} onEdit={() => { setEditingEvaluatorId(evaluator.id); setEvaluatorDraft({ name: evaluator.name, description: evaluator.description, model: evaluator.model, scoreType: evaluator.scoreType, prompt: evaluator.prompt, variables: evaluator.variables }); setEvaluatorScreen('create'); }} />}
      {module === 'evaluators' && evaluatorScreen === 'create' && <EvaluatorEditor editing={editingEvaluatorId !== null} draft={evaluatorDraft} setDraft={setEvaluatorDraft} onBack={showList} onCreate={() => createEvaluator(evaluatorDraft)} />}
      {module === 'tasks' && taskScreen === 'list' && <TaskList tasks={state.tasks} datasets={state.datasets} evaluators={state.evaluators} search={taskSearch} setSearch={setTaskSearch} tab={taskTab} setTab={setTaskTab} onCreate={openTaskCreate} onOpen={(item) => { setSelectedTaskId(item.id); setTaskScreen('detail'); }} />}
      {module === 'tasks' && taskScreen === 'create' && <TaskCreateWorkspace state={state} config={taskDraft} setConfig={setTaskDraft} onBack={showList} onCreate={createTask} onCreateDataset={openDatasetCreate} />}
      {module === 'tasks' && taskScreen === 'detail' && task && <TaskDetail task={task} state={state} onBack={showList} onOpenCase={setCasePreview} onNotify={notify} />}
    </main>
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
            <td>{dataset.versions[0]?.label ?? '—'}</td>
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
        {draft.file && <div className="eval-field-mapping"><div className="eval-subsection-head"><div><h4>字段确认</h4><span>不设置数据类型，只确认字段名称和语义</span></div><span>{draft.fields.length} 个字段</span></div><div className="eval-field-mapping__head"><span>原始字段</span><span>展示名称</span><span>字段语义</span><span>示例值</span></div>{draft.fields.map((field) => <div className="eval-field-mapping__row" key={field.id}><strong>{field.sourceColumn}</strong><input value={field.name} onChange={(event) => updateField(field.id, 'name', event.target.value)} /><select value={field.semantic} onChange={(event) => updateField(field.id, 'semantic', event.target.value)}>{FIELD_SEMANTICS.map((semantic) => <option key={semantic}>{semantic}</option>)}</select><span>{draft.file?.rows[0]?.[field.sourceColumn] || '—'}</span></div>)}</div>}
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
      const hasFeedback = conversation.traces.some((trace) => trace.feedback.trim());
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
        {history.length === 0 ? <EmptyState title="暂无符合条件的轨迹" description="调整 Agent、版本、日期或反馈筛选。" /> : <><div className="eval-history-list">{visibleHistory.map((conversation) => { const selected = draft.historySelected[conversation.id] ?? []; const allSelected = selected.length === conversation.traces.length; const partial = selected.length > 0 && !allSelected; const expanded = draft.historyExpanded === conversation.id; return <div className={`eval-history-item${selected.length ? ' is-selected' : ''}`} key={conversation.id}><div className="eval-history-item__head"><button type="button" className="eval-icon-button" onClick={() => setDraft((current) => ({ ...current, historyExpanded: expanded ? null : conversation.id }))} aria-label={expanded ? '收起对话' : '展开对话'}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button><input type="checkbox" checked={allSelected} ref={(element) => { if (element) element.indeterminate = partial; }} onChange={() => toggleConversation(conversation)} /><div className="eval-history-item__title"><strong>{conversation.title}</strong><span>{conversation.id} · {conversation.traces.length} 条 Trace</span></div><time>{conversation.occurredAt}</time></div>{expanded && <div className="eval-history-item__traces">{conversation.traces.map((trace) => <label key={trace.id}><input type="checkbox" checked={selected.includes(trace.id)} onChange={() => toggleTrace(conversation.id, trace.id)} /><span><strong>{trace.name} · {trace.summary}</strong><small>{trace.input}{trace.feedback ? ` · ${trace.feedback}` : ''}</small></span></label>)}</div>}</div>; })}</div><div className="eval-pagination"><span>共 {history.length} 条对话</span><div><button type="button" className="eval-page-button" disabled={currentHistoryPage <= 1} onClick={() => setDraft((current) => ({ ...current, historyPage: Math.max(1, current.historyPage - 1) }))}><ChevronLeft size={14} />上一页</button><b>{currentHistoryPage} / {historyPageCount}</b><button type="button" className="eval-page-button" disabled={currentHistoryPage >= historyPageCount} onClick={() => setDraft((current) => ({ ...current, historyPage: Math.min(historyPageCount, current.historyPage + 1) }))}>下一页<ChevronRight size={14} /></button></div></div></>}
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
    const feedback = conversation.traces.some((trace) => trace.feedback.trim());
    const feedbackMatched = !traceEditor || traceEditor.feedback === '全部' || (traceEditor.feedback === '有反馈' ? feedback : !feedback);
    const searchMatched = !traceEditor?.search || `${conversation.title} ${conversation.id}`.toLowerCase().includes(traceEditor.search.toLowerCase());
    return feedbackMatched && searchMatched;
  });
  const confirmTraceImport = () => {
    if (!traceEditor) return;
    if (!traceEditor.selected.length) { onNotify('请至少选择 1 条对话', 'warning'); return; }
    const selected = historyConversations.filter((conversation) => traceEditor.selected.includes(conversation.id));
    const inputField = fieldBySemantic('Input');
    const actualField = fieldBySemantic('Actual Output');
    const traceField = fieldBySemantic('Trace');
    const feedbackField = fieldBySemantic('User Feedback');
    const cases = selected.map((conversation, index) => ({
      id: `CASE-TRACE-${String(dataset.cases.length + index + 1).padStart(3, '0')}`,
      values: Object.fromEntries([
        inputField && [inputField.id, conversation.traces[0]?.input ?? conversation.title],
        actualField && [actualField.id, conversation.traces.at(-1)?.actualOutput ?? ''],
        traceField && [traceField.id, conversation.traces.map((trace) => `trace://${trace.id}`).join(' / ')],
        feedbackField && [feedbackField.id, conversation.traces.map((trace) => trace.feedback).filter(Boolean).join('；')],
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
              {dataset.fields.map((field) => <td key={field.id} title={item.values[field.id] || ''}>{item.values[field.id] || <em>—</em>}</td>)}
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

function EvaluatorList({ evaluators, mode, setMode, search, setSearch, scoreFilter, setScoreFilter, onCreate, onOpen, onCopy }: { evaluators: Evaluator[]; mode: EvaluatorMode; setMode: (mode: EvaluatorMode) => void; search: string; setSearch: (value: string) => void; scoreFilter: string; setScoreFilter: (value: string) => void; onCreate: () => void; onOpen: (evaluator: Evaluator) => void; onCopy: (evaluator: Evaluator) => void }) {
  return <div className="eval-list-page"><div className="eval-evaluator-tabs"><button type="button" className={mode === 'preset' ? 'is-active' : ''} onClick={() => setMode('preset')}>预置评估器 <b>14</b></button><button type="button" className={mode === 'custom' ? 'is-active' : ''} onClick={() => setMode('custom')}>自建评估器</button></div><div className="eval-toolbar"><label className="eval-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索评估器名称" /></label><select value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)}><option>全部结果类型</option><option>通过 / 不通过</option><option>0—1 数值</option></select><button type="button" className="eval-button eval-button--primary" onClick={onCreate}><Plus size={16} />新建自建评估器</button></div><div className="eval-evaluator-grid">{evaluators.map((evaluator) => <article className="eval-evaluator-card" key={evaluator.id} role="button" tabIndex={0} onClick={() => onOpen(evaluator)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(evaluator); } }}><h3>{evaluator.name}</h3><p>{evaluator.description}</p><div className="eval-evaluator-meta"><Pill>{evaluator.scoreType === 'numeric' ? '0—1 数值评分' : '通过 / 不通过'}</Pill><span>{evaluator.variables.length} 个输入语义</span></div><div className="eval-evaluator-variables">{evaluator.variables.map((variable) => <FieldBadge key={`${evaluator.id}-${variable.name}`} semantic={variable.semantic} required={variable.required} />)}</div><footer><span>{evaluator.updatedAt}</span>{evaluator.mode === 'preset' && <IconButton label={`复制 ${evaluator.name}`} onClick={(event) => { event.stopPropagation(); onCopy(evaluator); }}><Copy size={14} /></IconButton>}</footer></article>)}</div>{evaluators.length === 0 && <EmptyState title="没有匹配的评估器" description="调整筛选条件，或创建一个自建评估器。" />}</div>;
}

function EvaluatorDetail({ evaluator, onBack, onCopy, onEdit }: { evaluator: Evaluator; onBack: () => void; onCopy: () => void; onEdit: () => void }) {
  const [expandedPrompt, setExpandedPrompt] = useState(false);
  return <div className="eval-detail-page eval-evaluator-detail-page"><div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回评估器</button></div><div className="eval-evaluator-detail-intro"><div><span className="eval-eyebrow">{evaluator.category}</span><h2>{evaluator.name}</h2><p>{evaluator.description}</p></div><div className="eval-detail-hero__actions">{evaluator.mode === 'preset' ? <button type="button" className="eval-button eval-button--primary" onClick={onCopy}><Copy size={14} />复制为自建</button> : <button type="button" className="eval-button eval-button--primary" onClick={onEdit}><Settings2 size={14} />编辑并生成新版本</button>}</div></div><div className="eval-evaluator-detail-meta"><div><span>结果类型</span><strong>{evaluator.scoreType === 'numeric' ? '0—1 数值评分' : '通过 / 不通过'}</strong></div><div><span>评估模型</span><strong>{evaluator.model}</strong></div><div><span>累计运行</span><strong>{evaluator.runCount}</strong></div><div><span>输入变量</span><strong>{evaluator.variables.length} 个</strong></div></div><section className={`eval-evaluator-prompt-card${expandedPrompt ? ' is-expanded' : ''}`}><div className="eval-evaluator-prompt-head"><div><span className="eval-eyebrow">PROMPT</span><h3>评估规则</h3></div><div className="eval-prompt-actions"><IconButton label={expandedPrompt ? '收起 Prompt' : '放大 Prompt'} onClick={() => setExpandedPrompt((current) => !current)}><Maximize2 size={15} /></IconButton><IconButton label="复制 Prompt" onClick={() => { void navigator.clipboard?.writeText(evaluator.prompt); }}><Copy size={15} /></IconButton></div></div><div className="eval-prompt-system">System</div><pre className="eval-evaluator-prompt">{evaluator.prompt}</pre><div className="eval-evaluator-variables-bar"><span>Variables</span>{evaluator.variables.map((variable) => <strong key={variable.name}>{variable.name}</strong>)}</div></section></div>;
}

function PromptEditor({ prompt, onChange }: { prompt: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestStart, setSuggestStart] = useState(0);
  const [suggestQuery, setSuggestQuery] = useState('');
  const builtins: FieldSemantic[] = FIELD_SEMANTICS.filter((semantic) => semantic !== 'Custom');

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
          <label className="eval-field"><span>结果类型</span><select value={draft.scoreType} onChange={(event) => setDraft((current) => ({ ...current, scoreType: event.target.value as ScoreType }))}><option value="numeric">0—1 数值评分</option><option value="pass_fail">通过 / 不通过</option></select></label>
        </div>
        <div className="eval-create-section">
          <section className="eval-evaluator-prompt-card">
            <div className="eval-evaluator-prompt-head"><div><span className="eval-eyebrow">PROMPT</span><h3>评估规则</h3></div></div>
            <div className="eval-prompt-system">System</div>
            <PromptEditor prompt={draft.prompt} onChange={(value) => setDraft((current) => ({ ...current, prompt: value }))} />
            <div className="eval-evaluator-variables-bar"><span>Variables</span>{promptVariables.length ? promptVariables.map((variable) => <strong key={variable.name}>{variable.name}</strong>) : <em>在 Prompt 中输入 {'{{'} 插入字段变量</em>}</div>
          </section>
          <div className={`eval-prompt-check ${jsonReady ? 'is-ok' : 'is-warning'}`}>{jsonReady ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}{jsonReady ? 'JSON 输出约束已配置' : '保存前需要补充“只返回 JSON”约束'}</div>
        </div>
      </section>
      <footer className="eval-sticky-footer"><span>{editing ? '保存后生成新版本，不覆盖历史版本。' : '保存后生成版本 0.0.1。'}</span><div><button type="button" className="eval-button eval-button--ghost" onClick={onBack}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={onCreate}><Check size={15} />{editing ? '保存并生成新版本' : '创建评估器'}</button></div></footer>
    </div>
  );
}

function TaskList({ tasks, datasets, evaluators, search, setSearch, tab, setTab, onCreate, onOpen }: { tasks: EvaluationTask[]; datasets: Dataset[]; evaluators: Evaluator[]; search: string; setSearch: (value: string) => void; tab: TaskTab; setTab: (tab: TaskTab) => void; onCreate: () => void; onOpen: (task: EvaluationTask) => void }) {
  const filtered = tasks.filter((task) => !search || `${task.name} ${task.agent}`.toLowerCase().includes(search.toLowerCase()));
  const datasetName = (id: string) => datasets.find((item) => item.id === id)?.name ?? id;
  const evaluatorNames = (task: EvaluationTask) => task.evaluatorIds.map((id) => evaluators.find((item) => item.id === id)?.name ?? id);
  return <div className="eval-list-page">
    <div className="eval-task-tabs">{(['list', 'optimize', 'compare'] as TaskTab[]).map((item) => <button type="button" key={item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>{item === 'list' ? '任务列表' : item === 'optimize' ? '优化实验' : '实验对比'}</button>)}</div>
    {tab === 'list' ? <>
      <div className="eval-toolbar"><label className="eval-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务名称或 Agent" /></label><button type="button" className="eval-button eval-button--primary" onClick={onCreate}><Plus size={16} />新建评测任务</button></div>
      <section className="eval-surface table-surface">
        <table className="eval-data-table">
          <thead><tr><th>任务名称</th><th>任务状态</th><th>评测对象</th><th>评测集</th><th>评估器</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>{filtered.map((task) => <tr key={task.id} onClick={() => onOpen(task)}>
            <td><strong>{task.name}</strong></td>
            <td><Status label={task.status} /></td>
            <td><div className="eval-cell-title"><strong>{task.agent}</strong><small>{task.agentVersion}</small></div></td>
            <td><div className="eval-cell-title"><strong>{datasetName(task.datasetId)}</strong><small>{task.datasetVersion}</small></div></td>
            <td><div className="eval-cell-pills">{evaluatorNames(task).map((name) => <span key={name}>{name}</span>)}</div></td>
            <td>{task.createdAt.slice(0, 10)}</td>
            <td><IconButton label="打开任务" onClick={() => onOpen(task)}><Eye size={15} /></IconButton></td>
          </tr>)}</tbody>
        </table>
      </section>
      {filtered.length === 0 && <EmptyState title="没有匹配的评测任务" description="调整搜索条件。" />}
    </> : <EmptyState title={tab === 'optimize' ? '优化实验' : '实验对比'} description="相关记录会在评测任务完成后出现在这里。" />}
  </div>;
}

function TaskCreateWorkspace({ state, config, setConfig, onBack, onCreate, onCreateDataset }: { state: EvaluationState; config: TaskDraft; setConfig: Dispatch<SetStateAction<TaskDraft>>; onBack: () => void; onCreate: () => void; onCreateDataset: (mode: DatasetCreateMode) => void }) {
  const [step, setStep] = useState<TaskCreateStep>(1);
  const [evaluatorCards, setEvaluatorCards] = useState<string[]>(() => [...new Set(config.evaluatorIds)]);
  const dataset = getDatasetById(state, config.datasetId);
  const agent = state.agents.find((item) => item.id === config.agentId) ?? state.agents[0];
  const selected = evaluatorCards.map((id) => state.evaluators.find((item) => item.id === id)).filter((item): item is Evaluator => Boolean(item));
  const submitted = state.datasets.filter((item) => item.versions.some((version) => version.status === '已提交'));
  const selectedVersion = dataset?.versions.find((version) => version.id === config.datasetVersion);
  const bindings = evaluatorCards.map((evaluatorId, index) => {
    const evaluator = state.evaluators.find((item) => item.id === evaluatorId);
    const variables = (evaluator?.variables ?? []).map((variable) => {
      const systemProvided = SYSTEM_PROVIDED_SEMANTICS.includes(variable.semantic);
      const field = systemProvided ? undefined : dataset?.fields.find((item) => item.semantic === variable.semantic);
      return { variable, systemProvided, field };
    });
    const missing = variables.filter((item) => item.variable.required && !item.systemProvided && !item.field);
    const usedIds = evaluatorCards.filter((_, cardIndex) => cardIndex !== index);
    const options = state.evaluators.filter((item) => !usedIds.includes(item.id));
    return { evaluator, variables, missing, options };
  });
  const validVersion = Boolean(selectedVersion?.status === '已提交');
  const datasetReady = Boolean(dataset && validVersion && dataset.cases.length);
  const agentReady = Boolean(config.agentId && config.agentVersion);
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
  const changeAgent = (id: string) => {
    const next = state.agents.find((item) => item.id === id);
    setConfig((current) => ({ ...current, agentId: id, agentVersion: next?.versions[0] ?? '' }));
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
        <div className="eval-task-form-row">
          <label className="eval-field"><span>Agent <b>*</b></span><select value={config.agentId} onChange={(event) => changeAgent(event.target.value)}>{state.agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="eval-field"><span>版本 <b>*</b></span><select value={config.agentVersion} disabled={!agent} onChange={(event) => setConfig((current) => ({ ...current, agentVersion: event.target.value }))}>{(agent?.versions ?? []).map((version) => <option key={version}>{version}</option>)}</select></label>
        </div>
        {agent && <div className="eval-task-selection-detail"><div><span>描述</span><p>{agent.description}</p></div><div><span>当前版本</span><strong>{config.agentVersion}</strong></div></div>}
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
              <div className="eval-auto-binding"><div className="eval-auto-binding__head"><span>评估器变量</span><span>字段语义</span><span>自动绑定</span></div>{variables.map(({ variable, systemProvided, field }) => <div className={`eval-auto-binding__row${variable.required && !systemProvided && !field ? ' is-missing' : ''}`} key={`${evaluator.id}-${variable.name}`}><strong>{variable.name}</strong><FieldBadge semantic={variable.semantic} required={variable.required} /><span>{systemProvided ? '系统运行时提供' : field?.name ?? '未找到对应字段'}</span></div>)}</div>
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
        <aside className="eval-task-confirm-summary"><h3>实验配置</h3><div className="eval-confirm-item"><Database size={16} /><span><small>评测集</small><strong>{dataset?.name ?? '未选择'}</strong><em>{selectedVersion?.label ?? '未选择版本'}，{dataset?.cases.length ?? 0} 条 Case</em></span></div><div className="eval-confirm-item"><Bot size={16} /><span><small>评测对象</small><strong>{agent?.name ?? '未选择'}</strong><em>{config.agentVersion || '未选择版本'}</em></span></div><div className="eval-confirm-item"><ClipboardCheck size={16} /><span><small>评估器</small><strong>{selected.length} 个</strong><em>{runnableEvaluatorCount} 个可执行</em></span></div><div className={`eval-summary-alert${blocked ? ' is-warning' : ' is-ok'}`}>{blocked ? <><CircleAlert size={15} /><span>填写任务名称，并确保至少有一个评估器可执行。</span></> : <><CheckCircle2 size={15} /><span>配置检查通过，可以开始评测。</span></>}</div></aside>
      </div>}
    </section>

    <footer className="eval-task-wizard-footer"><button type="button" className="eval-button eval-button--ghost" onClick={onBack}>取消</button><div>{step > 1 && <button type="button" className="eval-button eval-button--ghost" onClick={() => setStep((step - 1) as TaskCreateStep)}>上一步</button>}{step < 4 ? <button type="button" className="eval-button eval-button--primary" disabled={!currentStepReady} onClick={nextStep}>下一步：{steps[step].label}<ChevronRight size={14} /></button> : <button type="button" className="eval-button eval-button--primary" disabled={blocked} onClick={onCreate}><Zap size={15} />开始评测</button>}</div></footer>
  </div>;
}

function TaskDetail({ task, state, onBack, onOpenCase, onNotify }: { task: EvaluationTask; state: EvaluationState; onBack: () => void; onOpenCase: (item: CaseResult) => void; onNotify: (message: string, tone?: Toast['tone']) => void }) {
  const [tab, setTab] = useState<'conclusion' | 'data'>('conclusion');
  const dataset = getDatasetById(state, task.datasetId);
  const taskEvaluators = state.evaluators.filter((evaluator) => task.evaluatorIds.includes(evaluator.id));
  const runtimeFields: { key: string; label: string }[] = [
    { key: 'status', label: '运行状态' },
    { key: 'duration', label: '运行耗时' },
  ];
  const getFieldValue = (item: CaseResult, field: FieldDefinition) => {
    const datasetCase = dataset?.cases.find((current) => current.id === item.caseId);
    if (field.semantic === 'Input') return item.input || datasetCase?.values[field.id] || '—';
    if (field.semantic === 'Expected Output') return item.expectedOutput || datasetCase?.values[field.id] || '—';
    if (field.semantic === 'Actual Output') return item.actualOutput || '—';
    if (field.semantic === 'Trace') return `${item.trace.length} 个节点`;
    if (field.semantic === 'Agent Configuration') return item.agentConfiguration || '—';
    if (field.semantic === 'User Feedback') return item.feedback || datasetCase?.values[field.id] || '—';
    return datasetCase?.values[field.id] || '—';
  };
  const getRuntimeValue = (item: CaseResult, key: string) => {
    if (key === 'status') return item.status;
    if (key === 'duration') return item.duration;
    return '—';
  };
  const getEvaluatorValue = (item: CaseResult, evaluatorId: string) => {
    const result = item.evaluatorResults.find((current) => current.evaluatorId === evaluatorId);
    if (!result) return '—';
    if (result.scoreType === 'numeric' && typeof result.score === 'number') return result.score.toFixed(2);
    return result.status;
  };
  return <div className="eval-detail-page eval-task-detail-page">
    <header className="eval-task-detail-header">
      <div className="eval-task-detail-title"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回任务列表</button><div><span className="eval-task-detail-id">{task.id} · {task.createdAt}</span><div className="eval-task-detail-name-row"><h2>{task.name}</h2><Status label={task.status} /></div></div></div>
      <div className="eval-task-detail-actions"><button type="button" className="eval-button eval-button--ghost" onClick={() => onNotify('智能优化入口已打开')}><Sparkles size={14} />智能优化</button><button type="button" className="eval-button eval-button--ghost" onClick={() => onNotify('实验对比入口已打开')}><Layers3 size={14} />实验对比</button><button type="button" className="eval-button eval-button--primary" onClick={() => onNotify('已创建异常 Case 重试任务')}><RefreshCw size={14} />重试异常</button></div>
    </header>
    <section className="eval-task-basic-info"><div><span>评测对象</span><strong>{task.agent}</strong><small>{task.agentVersion}</small></div><div><span>评测集</span><strong>{dataset?.name ?? '—'}</strong><small>{task.datasetVersion}</small></div><div><span>创建时间</span><strong>{task.createdAt.slice(0, 10)}</strong><small>{task.createdAt.slice(11)}</small></div></section>
    <nav className="eval-task-detail-tabs" aria-label="任务详情内容"><button type="button" className={tab === 'conclusion' ? 'is-active' : ''} onClick={() => setTab('conclusion')}>评测结论</button><button type="button" className={tab === 'data' ? 'is-active' : ''} onClick={() => setTab('data')}>数据明细</button></nav>
    {tab === 'conclusion' && <div className="eval-task-conclusion eval-task-placeholder-grid"><section className="eval-task-placeholder"><h3>结论报告</h3></section><section className="eval-task-placeholder"><h3>数据图表</h3></section></div>}
    {tab === 'data' && <section className="eval-task-data-detail"><div className="eval-task-detail-table-wrap"><table className="eval-task-detail-table"><thead><tr><th className="is-sticky">ID</th>{dataset?.fields.map((field) => <th key={field.id}><strong>{field.name}</strong><small>{field.semantic}</small></th>)}{runtimeFields.map((field) => <th key={field.key}><strong>{field.label}</strong><small>运行结果</small></th>)}{taskEvaluators.map((evaluator) => <th key={evaluator.id}><strong>{evaluator.name}</strong><small>运行结果</small></th>)}<th className="is-sticky is-sticky-right">操作</th></tr></thead><tbody>{task.results.map((item) => <tr key={item.caseId} onClick={() => onOpenCase(item)}><td className="is-sticky"><strong className="eval-mono">{item.caseId}</strong></td>{dataset?.fields.map((field) => <td key={field.id} title={getFieldValue(item, field)}>{getFieldValue(item, field)}</td>)}{runtimeFields.map((field) => <td key={field.key} title={getRuntimeValue(item, field.key)}>{field.key === 'status' ? <Status label={getRuntimeValue(item, field.key)} /> : getRuntimeValue(item, field.key)}</td>)}{taskEvaluators.map((evaluator) => <td key={evaluator.id} title={getEvaluatorValue(item, evaluator.id)}>{getEvaluatorValue(item, evaluator.id)}</td>)}<td className="is-sticky is-sticky-right"><div className="eval-row-actions"><button type="button" className="eval-text-button" onClick={(event) => { event.stopPropagation(); onOpenCase(item); }}>详情</button><button type="button" className="eval-text-button" onClick={(event) => { event.stopPropagation(); onNotify(`${item.caseId} 已加入重试队列`); }}>重试</button></div></td></tr>)}</tbody></table></div></section>}
  </div>;
}

function CasePreview({ item, onClose }: { item: CaseResult; onClose: () => void }) {
  return <div className="eval-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="eval-case-preview" role="dialog" aria-modal="true" aria-label={item.caseId}><header><div><span className="eval-eyebrow">CASE DETAIL</span><h2>{item.caseId}</h2></div><IconButton label="关闭" onClick={onClose}><X size={17} /></IconButton></header><div className="eval-case-preview__status"><Status label={item.status} /><span>{item.duration}</span></div><div className="eval-case-preview__blocks"><div><span>Input</span><p>{item.input || '—'}</p></div><div><span>Actual Output</span><p>{item.actualOutput || '没有生成 Actual Output。'}</p></div><div><span>Trace</span><p>{item.trace.map((event) => `${event.name} · ${event.status}`).join(' → ')}</p></div></div><div className="eval-case-preview__evaluators"><span className="eval-eyebrow">EVALUATOR RESULTS</span>{item.evaluatorResults.map((result) => <div key={result.evaluatorId}><div><strong>{result.evaluatorName}</strong><small>{result.reason}</small></div><Pill tone={result.status === '通过' ? 'green' : 'amber'}>{result.scoreType === 'numeric' ? result.score?.toFixed(2) : result.status}</Pill></div>)}</div><footer><button type="button" className="eval-button eval-button--primary" onClick={onClose}>关闭</button></footer></section></div>;
}

export type EvaluationModule = 'tasks' | 'datasets' | 'evaluators';
export type TaskTab = 'list' | 'optimize' | 'compare';
export type TaskScreen = 'list' | 'detail' | 'create';
export type DatasetScreen = 'list' | 'workspace' | 'upload' | 'history';
export type EvaluatorMode = 'preset' | 'custom';
export type ScoreType = 'pass_fail' | 'numeric';
export type EvaluatorKind = 'LLM' | '规则' | '人工';
export type StatusTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';
export type TaskStatus = '运行中' | '已完成' | '部分失败' | '失败';
export type ResultStatus = '通过' | '不通过' | '无法执行' | '证据不足' | '执行失败' | '待人工评估';
export type DatasetStatus = '已提交' | '草稿';
export type SourceType = '用户上传' | '智能生成' | '历史对话回流' | '手动添加';
export type FieldSemantic = 'Input' | 'File' | 'Expected Output' | 'Actual Output' | 'Trace' | 'Agent Configuration' | 'User Feedback' | 'Custom';

export type FieldDefinition = {
  id: string;
  name: string;
  semantic: FieldSemantic;
  description: string;
  required: boolean;
};

export type DatasetCase = {
  id: string;
  values: Record<string, string>;
  source: SourceType;
  createdAt: string;
  hasFile?: boolean;
};

export type DatasetVersion = {
  id: string;
  label: string;
  status: DatasetStatus;
  caseCount: number;
  createdAt: string;
  createdBy: string;
  note: string;
  data?: { fields: FieldDefinition[]; cases: DatasetCase[] };
};

export type Dataset = {
  id: string;
  name: string;
  description: string;
  status: DatasetStatus;
  source: SourceType;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  fields: FieldDefinition[];
  cases: DatasetCase[];
  versions: DatasetVersion[];
  draftVersionId: string;
};

export type VariableDefinition = {
  name: string;
  semantic: FieldSemantic;
  required: boolean;
};

export type Evaluator = {
  id: string;
  name: string;
  kind: EvaluatorKind;
  mode: EvaluatorMode;
  version: string;
  versions: string[];
  description: string;
  purpose: string;
  category: string;
  scoreType: ScoreType;
  model: string;
  prompt: string;
  variables: VariableDefinition[];
  creator: string;
  updatedAt: string;
  runCount: number;
};

export type ManualEvaluation = {
  status: '通过' | '不通过';
  note: string;
  updatedAt: string;
  updatedBy: string;
};

export type TraceEvent = {
  id: string;
  type: 'agent' | 'tool' | 'retrieval' | 'skill' | 'system';
  name: string;
  status: '成功' | '失败' | '跳过';
  duration: string;
  detail: string;
  input?: string;
  output?: string;
  error?: string;
  tokens?: number;
};

export type EvaluatorResult = {
  evaluatorId: string;
  evaluatorName: string;
  scoreType: ScoreType;
  status: ResultStatus;
  score?: number;
  reason: string;
  evidence: string[];
  evidenceRefs: string[];
};

export type CaseResult = {
  caseId: string;
  status: ResultStatus;
  duration: string;
  input: string;
  actualOutput: string;
  expectedOutput?: string;
  trace: TraceEvent[];
  evaluatorResults: EvaluatorResult[];
  manualEvaluation?: ManualEvaluation;
  feedback?: string;
  agentConfiguration: string;
};

export type EvaluationTask = {
  id: string;
  name: string;
  description: string;
  agent: string;
  agentVersion: string;
  datasetId: string;
  datasetVersion: string;
  evaluatorIds: string[];
  status: TaskStatus;
  tone: StatusTone;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  totalCases: number;
  executableCases: number;
  completedCases: number;
  failedCases: number;
  results: CaseResult[];
  runtime: {
    concurrency: number;
    timeout: number;
    continueOnError: boolean;
  };
};

export type OptimizeExperiment = {
  id: string;
  name: string;
  sourceTaskId: string;
  agent: string;
  baseVersion: string;
  candidateVersion: string;
  datasetVersion: string;
  status: '生成中' | '待重新评测' | '已完成' | '失败';
  tone: StatusTone;
  createdAt: string;
  improvement: string;
  insight: string;
  selectedCaseIds: string[];
  selectedCaseCount: number;
};

export type ComparisonRecord = {
  id: string;
  name: string;
  baseLabel: string;
  candidateLabel: string;
  dataset: string;
  status: '待分析' | '已完成';
  tone: StatusTone;
  comparableCases: number;
  improvedCases: number;
  declinedCases: number;
  unchangedCases: number;
  incomparableCases: number;
  createdAt: string;
};

export type AgentOption = {
  id: string;
  name: string;
  versions: string[];
  description: string;
};

export type HistoryTraceRecord = {
  id: string;
  name: string;
  summary: string;
  input: string;
  actualOutput: string;
  feedback: string;
  occurredAt: string;
};

export type HistoryConversation = {
  id: string;
  title: string;
  occurredAt: string;
  agentId: string;
  agentVersion: string;
  traces: HistoryTraceRecord[];
};

export type EvaluationState = {
  agents: AgentOption[];
  datasets: Dataset[];
  evaluators: Evaluator[];
  tasks: EvaluationTask[];
  experiments: OptimizeExperiment[];
  comparisons: ComparisonRecord[];
};

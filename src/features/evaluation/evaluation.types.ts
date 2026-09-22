export type EvaluationModule = 'tasks' | 'datasets' | 'evaluators' | 'traces';
export type TaskTab = 'list' | 'optimize' | 'compare';
export type TaskScreen = 'list' | 'detail' | 'create' | 'experiment' | 'comparison';
export type DatasetScreen = 'list' | 'workspace' | 'upload' | 'history';
export type EvaluatorMode = 'preset' | 'custom';
export type ScoreType = 'pass_fail' | 'numeric';
export type EvaluatorKind = '模型评估器' | '代码评估' | '人工评估';
export type StatusTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';
export type TaskStatus = '运行中' | '已完成' | '部分失败' | '失败';
export type ResultStatus = '通过' | '不通过' | '无法执行' | '证据不足' | '执行失败' | '待人工评估';
export type DatasetStatus = '已提交' | '草稿';
export type SourceType = '用户上传' | '智能生成' | '历史对话回流' | '手动添加';
export type FieldSemantic = 'Input' | 'File' | 'Expected Output' | 'Agent Output' | 'Trace' | 'Agent Configuration' | 'User Feedback' | 'Custom';

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
  binding?: string;
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

export type HumanEvaluation = {
  humanLabel: string;
  humanScore?: number;
  humanReason: string;
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

export type RuntimeMetrics = {
  runStatus: ResultStatus | '运行中';
  agentDuration: string;
  firstTokenLatency: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  evaluatorDuration: string;
};

export type EvaluatorResult = {
  evaluatorId: string;
  evaluatorName: string;
  scoreType: ScoreType;
  evaluationResult: string | number;
  evaluationReason: string;
  evaluationStatus: ResultStatus;
  traceRefs: string[];
};

export type CaseResult = {
  caseId: string;
  status: ResultStatus;
  caseMark?: 'Goodcase' | 'Badcase';
  input: string;
  agentOutput: string;
  expectedOutput?: string;
  trace: TraceEvent[];
  evaluatorResults: EvaluatorResult[];
  humanEvaluation?: HumanEvaluation;
  userFeedback?: string;
  agentConfiguration: string;
  duration?: string;
  runtime?: RuntimeMetrics;
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

export type ConfigItem = {
  id: string;
  name: string;
  detail?: string;
  content?: string;
};

export type AgentConfigSnapshot = {
  systemPrompt: string;
  tools: ConfigItem[];
  skills: ConfigItem[];
};

export type ConfigChange = {
  target: 'system_prompt' | 'tools' | 'skills';
  changeType: '新增' | '删除' | '修改' | '未变化';
  before: string;
  after: string;
  reason: string;
};

export type ScoreComparisonRow = {
  caseId: string;
  evaluatorName: string;
  beforeResult: string | number;
  afterResult: string | number;
  judgment: '改善' | '下降' | '无变化' | '无法比较';
  reason: string;
};

export type OptimizationResult = {
  status: '优化成功' | '无有效修改' | '优化失败' | '重新评测失败';
  selectedCaseCount: number;
  changeSummary: string;
  beforeConfig: AgentConfigSnapshot;
  afterConfig: AgentConfigSnapshot;
  changes: ConfigChange[];
  scoreRows: ScoreComparisonRow[];
  summary: { improved: number; declined: number; unchanged: number; incomparable: number };
};

export type OptimizeExperiment = {
  id: string;
  name: string;
  sourceTaskId: string;
  agent: string;
  baseVersion: string;
  candidateVersion: string;
  datasetVersion: string;
  status: '优化中' | '待重新评测' | '已完成' | '失败';
  tone: StatusTone;
  createdAt: string;
  selectedCaseIds: string[];
  selectedCaseCount: number;
  result: OptimizationResult;
};

export type ComparisonEvaluatorRow = {
  evaluatorName: string;
  beforeResult: string | number;
  afterResult: string | number;
  judgment: '改善' | '下降' | '无变化' | '无法比较';
};

export type ComparisonCaseRow = {
  caseId: string;
  beforeResult: string;
  afterResult: string;
  judgment: '改善' | '下降' | '无变化' | '无法比较';
  reason: string;
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
  evaluatorRows: ComparisonEvaluatorRow[];
  caseRows: ComparisonCaseRow[];
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
  agentOutput: string;
  userFeedback: string;
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

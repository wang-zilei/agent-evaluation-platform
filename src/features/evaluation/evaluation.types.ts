export type EvaluationModule = 'tasks' | 'datasets' | 'evaluators' | 'traces';
export type TaskTab = 'list' | 'compare';
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
  passThreshold?: number;
};

export type HumanEvaluation = {
  humanLabel: string;
  humanScore?: number;
  humanReason: string;
  updatedAt: string;
  updatedBy: string;
};

export type HumanLabelDefinition = {
  id: string;
  name: string;
  description: string;
  scoreType: ScoreType;
  scoreMin?: number;
  scoreMax?: number;
  passThreshold?: number;
};

export type HumanAnnotation = {
  labelId: string;
  score?: number;
  passed?: boolean;
  reason: string;
  updatedAt: string;
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
  humanAnnotations?: Record<string, HumanAnnotation>;
  userFeedback?: string;
  agentConfiguration: string;
  duration?: string;
  runtime?: RuntimeMetrics;
};

export type EvaluationTask = {
  id: string;
  name: string;
  description: string;
  agentType?: '万智' | '外部';
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
  caseIds: string[];
};

export type OptimizationSuggestion = {
  id: string;
  problem: string;
  caseIds: string[];
  suggestion: string;
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
  suggestions: OptimizationSuggestion[];
  scoreRows: ScoreComparisonRow[];
  summary: { improved: number; declined: number; unchanged: number; incomparable: number };
  comparisonId?: string;
};

export type OptimizationFollowUpMode = '直接实验对比' | '先审查配置' | '仅生成建议';

export type OptimizeExperiment = {
  id: string;
  name: string;
  sourceTaskId: string;
  agentType: '万智' | '外部';
  agent: string;
  baseVersion: string;
  candidateVersion: string;
  datasetVersion: string;
  followUpMode: OptimizationFollowUpMode;
  status: '分析中' | '待继续实验' | '复测评测中' | '待查看实验对比' | '已完成' | '失败';
  tone: StatusTone;
  createdAt: string;
  selectedCaseIds: string[];
  selectedCaseCount: number;
  result: OptimizationResult;
};

export type ComparisonTaskRole = '对照组' | '实验组';

export type ComparisonTaskRef = {
  taskId: string;
  name: string;
  label: string;
  role: ComparisonTaskRole;
  agent: string;
  agentVersion: string;
  datasetVersion: string;
  evaluatorIds: string[];
};

export type ComparisonMetricCell = {
  taskId: string;
  result: string;
  value?: number;
  coverage: string;
  state: '对照组' | '有效' | '未配置' | '未采集' | '无法比较' | '版本不同';
  delta?: string;
  judgment?: '改善' | '下降' | '无变化' | '无法比较' | '参考差异';
};

export type ComparisonEvaluatorRow = {
  metric: string;
  scoreType: ScoreType;
  evaluatorName: string;
  evaluatorId: string;
  cells: Record<string, ComparisonMetricCell>;
};

export type ComparisonOutputCell = {
  taskId: string;
  output: string;
  evaluatorResults: EvaluatorResult[];
};

export type ComparisonCaseRow = {
  caseId: string;
  sharedValues: Record<string, string>;
  outputs: Record<string, ComparisonOutputCell>;
  judgment: '一致' | '有差异' | '无法比较';
  reason: string;
};

export type ComparisonRuntimeRow = {
  metric: string;
  cells: Record<string, ComparisonMetricCell>;
};

export type ComparisonRecord = {
  id: string;
  name: string;
  controlTaskId: string;
  experimentTaskIds: string[];
  taskRefs: ComparisonTaskRef[];
  dataset: string;
  datasetId: string;
  datasetVersion: string;
  status: '待分析' | '已完成';
  tone: StatusTone;
  totalCases: number;
  comparableCases: number;
  differentCases: number;
  sameCases: number;
  incomparableCases: number;
  createdAt: string;
  sharedFields: string[];
  evaluatorRows: ComparisonEvaluatorRow[];
  runtimeRows: ComparisonRuntimeRow[];
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
  humanLabels: HumanLabelDefinition[];
  tasks: EvaluationTask[];
  experiments: OptimizeExperiment[];
  comparisons: ComparisonRecord[];
};

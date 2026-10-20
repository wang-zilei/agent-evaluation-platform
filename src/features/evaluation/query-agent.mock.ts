import rawDatasetJson from './query-agent-dataset.json';
import type {
  AgentOption,
  CaseResult,
  Dataset,
  DatasetCase,
  Evaluator,
  EvaluatorResult,
  FieldDefinition,
  HistoryConversation,
  ResultStatus,
  TraceEvent,
} from './evaluation.types';
import type { ObservedTrace, TraceEvent as ObservationTraceEvent } from './trace.types';

export const QUERY_AGENT_DATASET_ID = 'DS-QUERY-AGENT-45';
export const QUERY_AGENT_CORE_EVALUATOR_IDS = ['result_match', 'sql_contract', 'sql_safety'];
export const QUERY_AGENT_AGENT_ID = 'agent-query';
export const QUERY_AGENT_AGENT_VERSION = 'V1';
const QUERY_AGENT_OBSERVED_CASE_IDS = ['syn-query-01', 'syn-query-25', 'syn-query-43'] as const;
const QUERY_AGENT_AGENT_CONFIG = 'Skills：SQL 编写规范、SQL 编写工作流；MCP：本体查询、只读 SQL 查询';

type RawValue = string | number | boolean | null | RawValue[] | { [key: string]: RawValue };

type RawOutput = {
  sql?: string | null;
  result?: RawValue;
  snapshot_id?: string | null;
  answer?: string | null;
  execution_status?: 'success' | 'error' | 'unknown';
  error?: string | null;
};

type RawContract = {
  row_key?: string[];
  ordered?: boolean;
  numeric_tolerance?: number;
  allow_extra_columns?: boolean;
  required_tables?: string[];
  forbidden_tables?: string[];
  required_predicates?: string[];
  required_expressions?: string[];
  group_by?: string[];
  required_tools?: string[];
  required_trace_steps?: string[];
  max_duration_ms?: number | null;
};

type RawTraceNode = {
  span_id?: string | null;
  name: string;
  kind?: 'tool' | 'llm' | 'skill' | 'other';
  status?: 'success' | 'error' | 'unknown';
  tool_name?: string | null;
  input?: RawValue;
  output?: RawValue;
  duration_ms?: number | null;
  metadata?: { message_type?: string; tool_call_id?: string; trace_id?: string } & Record<string, RawValue>;
};

type RawMessage = {
  content?: RawValue;
  type?: string;
  id?: string | null;
  name?: string | null;
  tool_call_id?: string | null;
  tool_calls?: { id?: string | null; name?: string | null; args?: RawValue; type?: string }[];
  additional_kwargs?: { reasoning_content?: string } & Record<string, RawValue>;
  response_metadata?: Record<string, RawValue>;
  usage_metadata?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  status?: string;
};

type RawCase = {
  id: string;
  input: string;
  dialect?: string;
  expected_output?: RawOutput;
  agent_output?: RawOutput;
  query_contract?: RawContract | null;
  trace?: RawTraceNode[];
  raw_trace?: { input?: { messages?: RawMessage[] }; output?: { messages?: RawMessage[] } } | null;
  trace_format?: string | null;
  trace_id?: string | null;
  session_id?: string | null;
  turn_id?: string | null;
  trace_source?: string | null;
  completion_status?: 'completed' | 'error' | 'unknown';
  ontology?: string | null;
  duration_ms?: number | null;
  tags?: string[];
};

type RawDataset = { name: string; description: string; cases: RawCase[] };

const rawDataset = rawDatasetJson as unknown as RawDataset;
export const queryAgentSourceCases: RawCase[] = rawDataset.cases;

const compactJson = (value: RawValue | undefined, max = 900): string => {
  if (value === undefined || value === null) return '';
  const text = JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const normalizeSqlText = (value: string): string => value.toLowerCase().replace(/[\s`'"]/g, '');
const containsAll = (sql: string, values: string[] = []): string[] => values.filter((value) => !sql.includes(normalizeSqlText(value)));

const isReadonlySql = (sql: string): { readonly: boolean; reason?: string } => {
  const normalized = sql.trim().replace(/;+\s*$/, '').toLowerCase();
  if (!normalized) return { readonly: false, reason: '缺少 SQL' };
  if (normalized.includes(';')) return { readonly: false, reason: '存在多条语句' };
  if (!/^(select|with)\b/.test(normalized)) return { readonly: false, reason: '不是 SELECT/CTE 查询' };
  const dangerous = ['insert ', 'update ', 'delete ', 'drop ', 'alter ', 'create ', 'attach ', 'detach ', 'load_extension(', 'readfile(', 'writefile('];
  const hit = dangerous.find((item) => normalized.includes(item));
  return hit ? { readonly: false, reason: `包含受限操作 ${hit.trim()}` } : { readonly: true };
};

const sameColumns = (expected: RawValue[], actual: RawValue[]): boolean => {
  const left = expected.flatMap((item) => Object.keys(item as Record<string, RawValue>)).sort().join(',');
  const right = actual.flatMap((item) => Object.keys(item as Record<string, RawValue>)).sort().join(',');
  return left === right;
};

const rowKey = (row: RawValue): string => JSON.stringify(row);
const multisetSame = (expected: RawValue[], actual: RawValue[]): boolean => {
  if (expected.length !== actual.length) return false;
  const counts = new Map<string, number>();
  expected.forEach((row) => counts.set(rowKey(row), (counts.get(rowKey(row)) ?? 0) + 1));
  return actual.every((row) => {
    const key = rowKey(row);
    const count = counts.get(key) ?? 0;
    if (count <= 0) return false;
    counts.set(key, count - 1);
    return true;
  });
};

const resultMatches = (expected: RawValue | undefined, actual: RawValue | undefined, contract: RawContract | null): boolean => {
  if (!Array.isArray(expected) || !Array.isArray(actual)) return false;
  if (!contract?.allow_extra_columns && !sameColumns(expected, actual)) return false;
  return contract?.ordered ? expected.every((row, index) => rowKey(row) === rowKey(actual[index])) : multisetSame(expected, actual);
};

const messageLists = (rawCase: RawCase) => ({
  input: rawCase.raw_trace?.input?.messages ?? [],
  output: rawCase.raw_trace?.output?.messages ?? [],
});

const observedSessionId = (caseId: string) => `query-observation-${caseId}`;

const observationEvents = (rawCase: RawCase): ObservationTraceEvent[] => {
  const human = messageLists(rawCase).input.find((message) => message.type === 'human');
  const calls = new Map<string, { name: string; args: RawValue }>();
  const events: ObservationTraceEvent[] = human ? [{
    kind: 'user',
    id: `${rawCase.id}-user`,
    text: String(human.content ?? rawCase.input),
    messageId: human.id ?? null,
  }] : [];
  for (const message of messageLists(rawCase).output) {
    if (message.type === 'ai') {
      for (const call of message.tool_calls ?? []) {
        if (call.id && call.name) calls.set(call.id, { name: call.name, args: call.args ?? null });
      }
      const reasoning = String(message.additional_kwargs?.reasoning_content ?? '');
      const content = String(message.content ?? '');
      const isFinal = !(message.tool_calls ?? []).length && message.response_metadata?.finish_reason === 'stop';
      events.push({
        kind: 'assistant',
        id: message.id ?? `${rawCase.id}-ai-${events.length}`,
        text: content || reasoning,
        isFinal,
        hasReasoning: Boolean(reasoning),
        reasoning,
        content,
        model: 'Doubao-Seed-1.6',
        provider: 'volcengine',
        finishReason: typeof message.response_metadata?.finish_reason === 'string' ? message.response_metadata.finish_reason : null,
        inputTokens: message.usage_metadata?.input_tokens ?? null,
        outputTokens: message.usage_metadata?.output_tokens ?? null,
        totalTokens: message.usage_metadata?.total_tokens ?? null,
        cacheReadTokens: null,
        reasoningTokens: null,
        toolNames: (message.tool_calls ?? []).map((call) => call.name).filter((name): name is string => Boolean(name)),
      });
      continue;
    }
    if (message.type === 'tool') {
      const call = message.tool_call_id ? calls.get(message.tool_call_id) : undefined;
      const status = message.status === 'error' ? 'error' : 'success';
      events.push({
        kind: 'tool',
        id: message.id ?? message.tool_call_id ?? `${rawCase.id}-tool-${events.length}`,
        name: message.name ?? call?.name ?? 'tool',
        input: compactJson(call?.args, 620) || '未采集参数',
        output: compactJson(message.content, 920) || '未采集返回',
        linked: Boolean(message.tool_call_id && call),
        brief: message.name === 'load_ontology'
          ? '读取业务本体并确认可关联实体'
          : message.name === 'grep_schema'
            ? '检索 schema 与字段定义'
            : message.name === 'validate_sql'
              ? '检查 SQL 只读性和语法'
              : message.name === 'query_database'
                ? '通过只读 MCP 执行 Agent SQL'
                : message.name === 'normalize_result'
                  ? '规整查询结果与数值精度'
                  : '工具执行结果',
        status,
        args: call && call.args && typeof call.args === 'object' && !Array.isArray(call.args) ? call.args as Record<string, unknown> : null,
        result: compactJson(message.content, 1200) || '未采集返回',
      });
    }
  }
  return events;
};

const displayAnswer = (rawCase: RawCase): string => rawCase.id === 'syn-query-01'
  ? '2026 年 1 月已支付订单总金额为 752.16 元。'
  : rawCase.id === 'syn-query-25'
    ? '网点 B001 在 2026 年 1 月的已支付订单金额为 999,999.99 元。'
    : rawCase.id === 'syn-query-43'
      ? '查询执行失败，暂时无法获取 2026 年 1 月已支付订单总额。'
      : rawCase.agent_output?.answer ?? '';

const toObservedTrace = (rawCase: RawCase, index: number): ObservedTrace => {
  const events = observationEvents(rawCase);
  const usage = [...messageLists(rawCase).input, ...messageLists(rawCase).output].reduce((total, message) => ({
    input: total.input + (message.usage_metadata?.input_tokens ?? 0),
    output: total.output + (message.usage_metadata?.output_tokens ?? 0),
  }), { input: 0, output: 0 });
  const traceId = rawCase.trace_id ?? `trace-${rawCase.id}`;
  const finalAssistant = [...events].reverse().find((event): event is Extract<ObservationTraceEvent, { kind: 'assistant' }> => event.kind === 'assistant' && event.isFinal);
  const observedOutput = displayAnswer(rawCase) || finalAssistant?.content || '';
  return {
    id: `observation-${rawCase.id}`,
    traceId,
    sessionId: observedSessionId(rawCase.id),
    turn: 1,
    sourceFile: `query-agent-validation/${rawCase.id}.jsonl`,
    agent: '问数 Agent',
    occurredAt: ['2026-10-19T03:12:18.412Z', '2026-10-19T03:24:46.705Z', '2026-10-19T03:31:09.118Z'][index] ?? '2026-10-19T03:31:09.118Z',
    duration: 2860 + index * 920,
    feedback: index === 0 ? 'SQL 与结果一致' : index === 1 ? '回答数值需核对' : '执行失败已定位',
    abnormal: rawCase.agent_output?.execution_status === 'error' || index === 1,
    sourceMessageCount: events.length + 1,
    historyMessageCount: 0,
    currentMessageCount: events.length + 1,
    reasoningCount: events.filter((event) => event.kind === 'assistant' && event.hasReasoning).length,
    toolCount: events.filter((event) => event.kind === 'tool').length,
    inputTokens: usage.input,
    outputTokens: usage.output,
    compressed: false,
    historySummary: '',
    input: rawCase.input,
    output: observedOutput,
    context: { kind: 'none', messages: [] },
    events,
  };
};

export const queryAgentObservedTraces: ObservedTrace[] = QUERY_AGENT_OBSERVED_CASE_IDS
  .map((caseId) => queryAgentSourceCases.find((item) => item.id === caseId))
  .filter((item): item is RawCase => Boolean(item))
  .map(toObservedTrace);

export const queryAgentHistoryConversations: HistoryConversation[] = queryAgentObservedTraces.map((trace) => ({
  id: trace.sessionId ?? trace.id,
  title: trace.input,
  occurredAt: new Date(trace.occurredAt ?? '').toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false }).slice(0, 16),
  agentId: QUERY_AGENT_AGENT_ID,
  agentVersion: QUERY_AGENT_AGENT_VERSION,
  traces: [{
    id: trace.traceId ?? trace.id,
    name: `Turn ${trace.turn}`,
    summary: trace.output.slice(0, 100),
    input: trace.input,
    agentOutput: trace.output,
    userFeedback: trace.feedback ?? '',
    occurredAt: new Date(trace.occurredAt ?? '').toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false }).slice(0, 16),
  }],
}));

const observedTraceIdForCase = (caseId: string): string | undefined => QUERY_AGENT_OBSERVED_CASE_IDS.includes(
  caseId as (typeof QUERY_AGENT_OBSERVED_CASE_IDS)[number],
)
  ? `observation-${caseId}`
  : undefined;

const structureIssues = (rawCase: RawCase): string[] => {
  const { input, output } = messageLists(rawCase);
  if (!input.length && !output.length) return ['raw_trace 没有 input.messages 或 output.messages'];
  const all = [...input, ...output];
  const issues: string[] = [];
  if (!all.some((message) => message.type === 'human')) issues.push('缺少 human 消息');
  if (!all.some((message) => message.type === 'ai')) issues.push('缺少 AI 消息');
  if (!all.some((message) => message.type === 'tool')) issues.push('缺少 tool 消息');
  const finalAi = [...output].reverse().find((message) => message.type === 'ai' && String(message.content ?? '').trim());
  if (!finalAi) issues.push('缺少最终 AI 回答');
  const callIds = new Set(all.flatMap((message) => (message.tool_calls ?? []).map((call) => call.id).filter(Boolean) as string[]));
  const returnIds = new Set(all.filter((message) => message.type === 'tool' && message.tool_call_id).map((message) => message.tool_call_id as string));
  const missingReturns = [...callIds].filter((id) => !returnIds.has(id));
  const orphanReturns = [...returnIds].filter((id) => !callIds.has(id));
  if (missingReturns.length) issues.push(`${missingReturns.length} 个 tool_call 没有返回`);
  if (orphanReturns.length) issues.push(`${orphanReturns.length} 个 tool 返回没有调用 ID`);
  return issues;
};

const traceStepName: Record<string, string> = {
  ontology_load: 'load_ontology',
  schema_search: 'grep_schema',
  sql_generate: 'agent_decision',
  sql_validate: 'validate_sql',
  query_execute: 'query_database',
  result_normalize: 'normalize_result',
  answer_generate: 'assistant_final',
};

const normalizedTraceIssues = (trace: RawTraceNode[] = [], required: string[] = []): string[] => {
  const names = trace.map((node) => node.name);
  const indexes = required.map((step) => names.indexOf(traceStepName[step] ?? step));
  const missing = required.filter((_, index) => indexes[index] < 0);
  const outOfOrder = indexes.some((value, index) => value >= 0 && indexes.slice(0, index).some((previous) => previous >= 0 && previous > value));
  return [...missing.map((name) => `缺少 ${name}`), ...(outOfOrder ? ['Trace 步骤顺序不一致'] : [])];
};

const totalUsage = (rawCase: RawCase) => {
  const messages = [...messageLists(rawCase).input, ...messageLists(rawCase).output];
  return messages.reduce((acc, message) => ({
    input: acc.input + (message.usage_metadata?.input_tokens ?? 0),
    output: acc.output + (message.usage_metadata?.output_tokens ?? 0),
  }), { input: 0, output: 0 });
};

const mapStatus = (status?: string): TraceEvent['status'] => status === 'error' ? '失败' : status === 'skipped' ? '跳过' : '成功';

const projectionTrace = (rawCase: RawCase): TraceEvent[] => (rawCase.trace ?? []).map((node, index) => {
  const isInput = node.name === 'user_input';
  const toolName = node.tool_name ?? undefined;
  const name = isInput ? '接收用户输入' : toolName ?? (node.name === 'assistant_final' ? '生成最终回答' : node.name === 'agent_decision' ? 'Agent 决策' : node.name);
  const type: TraceEvent['type'] = isInput ? 'system' : node.name === 'agent_decision' || node.name === 'assistant_final' ? 'agent' : toolName === 'load_ontology' || toolName === 'grep_schema' ? 'retrieval' : 'tool';
  const reasoning = node.output && typeof node.output === 'object' && 'reasoning' in node.output ? String((node.output as Record<string, RawValue>).reasoning ?? '') : '';
  const status = mapStatus(node.status);
  const detail = isInput
    ? '消息级输入已保留。'
    : node.name === 'assistant_final'
      ? '保留最终回答与消息级 Trace。'
      : reasoning || `${node.name} ${status}`;
  return {
    id: `${rawCase.id}-node-${index + 1}`,
    type,
    name,
    status,
    duration: node.duration_ms === null || node.duration_ms === undefined ? '未采集' : `${node.duration_ms} ms`,
    detail,
    input: compactJson(node.input, 320),
    output: compactJson(node.output, 420),
    error: status === '失败' ? String(node.output ?? node.input ?? '执行失败') : undefined,
    tokens: node.metadata?.usage_metadata && typeof node.metadata.usage_metadata === 'object' && 'total_tokens' in node.metadata.usage_metadata
      ? Number(node.metadata.usage_metadata.total_tokens)
      : undefined,
  };
});

type QueryEvidence = NonNullable<CaseResult['queryAgent']>;

const resultStatus = (coreResults: EvaluatorResult[]): ResultStatus => {
  if (coreResults.some((item) => item.evaluatorId === 'sql_safety' && item.evaluationStatus === '不通过' && item.observations?.executed === 'false')) return '执行失败';
  if (coreResults.some((item) => item.evaluationStatus === '不通过')) return '不通过';
  if (coreResults.some((item) => ['证据不足', '无法执行'].includes(item.evaluationStatus))) return '证据不足';
  return '通过';
};

const mockResult = (
  definition: Evaluator,
  status: ResultStatus,
  reason: string,
  _evidence: QueryEvidence,
  observations: Record<string, string | number> = {},
  diagnostics: EvaluatorResult['diagnostics'] = [],
): EvaluatorResult => ({
  evaluatorId: definition.id,
  evaluatorName: definition.name,
  evaluatorVersion: definition.version,
  attemptId: 'attempt-1',
  scoreType: definition.scoreType,
  evaluationResult: definition.scoreType === 'numeric' ? (status === '通过' ? 1 : status === '不通过' ? 0 : 0.5) : status,
  evaluationReason: reason,
  evaluationStatus: status,
  traceRefs: [],
  evaluationKind: definition.kind,
  diagnostics,
  observations: definition.kind === '代码评估' ? observations : undefined,
});

const evidenceFor = (rawCase: RawCase): QueryEvidence => ({
  expectedSql: rawCase.expected_output?.sql ?? undefined,
  agentSql: rawCase.agent_output?.sql ?? undefined,
  expectedResult: rawCase.expected_output?.result,
  agentResult: rawCase.agent_output?.result,
  snapshotId: rawCase.expected_output?.snapshot_id ?? rawCase.agent_output?.snapshot_id ?? undefined,
  queryContract: rawCase.query_contract ?? undefined,
  rawTrace: rawCase.raw_trace ?? undefined,
  rawTraceMessageCount: messageLists(rawCase).input.length + messageLists(rawCase).output.length,
  traceId: rawCase.trace_id ?? undefined,
  sessionId: rawCase.session_id ?? undefined,
  tags: rawCase.tags ?? [],
});

const codeEvaluatorResult = (definition: Evaluator, rawCase: RawCase): EvaluatorResult => {
  const expected = rawCase.expected_output ?? {};
  const actual = rawCase.agent_output ?? {};
  const contract = rawCase.query_contract ?? null;
  const evidence = evidenceFor(rawCase);
  const trace = rawCase.trace ?? [];
  const issues: string[] = [];
  const status = (result: boolean, missing: boolean): ResultStatus => missing ? '证据不足' : result ? '通过' : '不通过';

  if (definition.id === 'result_match') {
    if (!contract) return mockResult(definition, '证据不足', '缺少 query_contract，结果一致性无法复核。', evidence);
    if (!expected.snapshot_id || !actual.snapshot_id) return mockResult(definition, '证据不足', '缺少 expected/agent snapshot_id，无法绑定冻结快照。', evidence);
    if (expected.snapshot_id !== actual.snapshot_id) return mockResult(definition, '不通过', '结果来自不同快照，不能视为一致。', evidence, { snapshot_match: 'false' });
    const passed = resultMatches(expected.result, actual.result, contract);
    return mockResult(definition, status(passed, expected.result === undefined || actual.result === undefined), passed ? '结果多重集合、列和顺序满足 Case 契约。' : '查询结果与冻结结果不一致。', evidence, { snapshot_match: 'true', result_match: passed ? 1 : 0 });
  }

  if (definition.id === 'sql_contract') {
    if (!contract) return mockResult(definition, '证据不足', '缺少 query_contract，无法检查 SQL 业务条件。', evidence);
    if (!expected.sql || !actual.sql) return mockResult(definition, '证据不足', '缺少参考 SQL 或 Agent SQL。', evidence);
    const sql = normalizeSqlText(actual.sql);
    issues.push(...containsAll(sql, contract.required_tables).map((item) => `缺少表 ${item}`));
    issues.push(...containsAll(sql, contract.required_predicates).map((item) => `缺少条件 ${item}`));
    issues.push(...containsAll(sql, contract.required_expressions).map((item) => `缺少表达式 ${item}`));
    issues.push(...containsAll(sql, contract.group_by).map((item) => `缺少分组 ${item}`));
    const forbidden = (contract.forbidden_tables ?? []).filter((table) => sql.includes(normalizeSqlText(table)));
    issues.push(...forbidden.map((item) => `使用禁止表 ${item}`));
    return mockResult(definition, status(!issues.length, false), issues.length ? `SQL 契约未满足：${issues.join('；')}` : 'SQL 满足查询契约的关键条件。', evidence, { failed_checks: issues.length }, issues.length ? [{ code: 'SQL_CONTRACT_FAILED', message: issues.join('；'), path: '$.agent_output.sql' }] : []);
  }

  if (definition.id === 'sql_safety') {
    if (!actual.sql) return mockResult(definition, '证据不足', '缺少 Agent SQL。', evidence);
    const readonly = isReadonlySql(actual.sql);
    if (!readonly.readonly) return mockResult(definition, '不通过', readonly.reason ?? 'SQL 不满足只读安全约束。', evidence, { readonly: 'false', executed: 'false' }, [{ code: 'SQL_UNSAFE', message: readonly.reason ?? 'SQL 不满足只读安全约束', path: '$.agent_output.sql' }]);
    if (actual.execution_status === 'error') return mockResult(definition, '不通过', `SQL 只读可解析，但执行失败：${actual.error ?? '未采集错误'}`, evidence, { readonly: 'true', executed: 'false' }, [{ code: 'SQL_EXECUTION_FAILED', message: actual.error ?? '执行失败', path: '$.agent_output.execution_status' }]);
    if (actual.execution_status !== 'success') return mockResult(definition, '证据不足', '缺少执行成功状态，不能证明查询已执行。', evidence, { readonly: 'true', executed: 'false' });
    return mockResult(definition, '通过', 'SQL 是单条只读查询且执行成功。', evidence, { readonly: 'true', executed: 'true' });
  }

  if (definition.id === 'tool_trace') {
    if (!trace.length) return mockResult(definition, '证据不足', '没有 Trace，无法诊断工具链路。', evidence);
    const toolNames = trace.map((node) => node.tool_name).filter(Boolean) as string[];
    const missing = (contract?.required_tools ?? []).filter((tool) => !toolNames.includes(tool));
    const errors = trace.filter((node) => node.status === 'error');
    const failed = Boolean(missing.length || errors.length);
    return mockResult(definition, failed ? '不通过' : '通过', failed ? `工具链路异常：${[...missing.map((item) => `缺少 ${item}`), ...errors.map((item) => `${item.tool_name ?? item.name} 失败`)].join('；')}` : '工具链路满足当前诊断要求。', evidence, { missing_tools: missing.length, error_nodes: errors.length });
  }

  if (definition.id === 'trace_contract') {
    if (rawCase.raw_trace) return mockResult(definition, '证据不足', '当前是消息级原始 Trace，业务执行阶段使用原始 Trace 结构评估器复核。', evidence);
    if (!trace.length) return mockResult(definition, '证据不足', '没有规范化 Trace，无法判断问数执行阶段。', evidence);
    issues.push(...normalizedTraceIssues(trace, contract?.required_trace_steps ?? []));
    return mockResult(definition, issues.length ? '不通过' : '通过', issues.length ? `Trace 契约未满足：${issues.join('；')}` : '问数执行链路完整且顺序一致。', evidence);
  }

  if (definition.id === 'trace_structure') {
    if (!rawCase.raw_trace) return mockResult(definition, '不通过', '未提供消息级 raw Trace。', evidence, { raw_trace_messages: 0 }, [{ code: 'RAW_TRACE_MISSING', message: '缺少 raw_trace', path: '$.raw_trace' }]);
    issues.push(...structureIssues(rawCase));
    const { input, output } = messageLists(rawCase);
    return mockResult(definition, issues.length ? '不通过' : '通过', issues.length ? issues.join('；') : 'raw Trace 包含消息、调用/返回配对和最终 AI 回答。', evidence, { raw_trace_messages: input.length + output.length }, issues.length ? [{ code: 'RAW_TRACE_INCOMPLETE', message: issues.join('；'), path: '$.raw_trace' }] : []);
  }

  if (definition.id === 'latency') {
    if (rawCase.duration_ms === undefined || rawCase.duration_ms === null) return mockResult(definition, '证据不足', '缺少 duration_ms。', evidence);
    if (!contract?.max_duration_ms) return mockResult(definition, '证据不足', '缺少 max_duration_ms 阈值。', evidence);
    const failed = rawCase.duration_ms > contract.max_duration_ms;
    return mockResult(definition, failed ? '不通过' : '通过', `耗时 ${rawCase.duration_ms} ms，上限 ${contract.max_duration_ms} ms。`, evidence, { duration_ms: rawCase.duration_ms, max_duration_ms: contract.max_duration_ms });
  }

  return mockResult(definition, '证据不足', '未配置的代码评估器。', evidence);
};

const modelEvaluatorResult = (definition: Evaluator, rawCase: RawCase, codeResults: EvaluatorResult[]): EvaluatorResult => {
  const evidence = evidenceFor(rawCase);
  const answer = rawCase.agent_output?.answer ?? '';
  const core = Object.fromEntries(codeResults.map((item) => [item.evaluatorId, item.evaluationStatus]));
  const mockPrefix = 'Mock 结果（未调用模型）：';
  const failedTags = rawCase.tags ?? [];

  if (definition.id === 'answer_grounded') {
    if (!answer) return mockResult(definition, '证据不足', `${mockPrefix}缺少最终回答。`, evidence);
    const failed = failedTags.includes('answer-value-wrong');
    return mockResult(definition, failed ? '不通过' : '通过', `${mockPrefix}${failed ? '回答数值与 agent_output.result 矛盾。' : '回答结论可由查询结果支持。'}`, evidence);
  }

  if (definition.id === 'semantic_intent') {
    const failed = [core.result_match, core.sql_contract].includes('不通过');
    return mockResult(definition, failed ? '不通过' : core.result_match === '证据不足' || core.sql_contract === '证据不足' ? '证据不足' : '通过', `${mockPrefix}${failed ? '结果或 SQL 关键条件未覆盖问题意图。' : core.result_match === '证据不足' ? '缺少意图匹配的完整证据。' : '查询对象、筛选、分组和排序满足问题意图。'}`, evidence);
  }

  if (definition.id === 'root_cause') {
    if (core.sql_safety === '不通过' && rawCase.agent_output?.execution_status === 'error') return mockResult(definition, '通过', `${mockPrefix}sql_execution：${rawCase.agent_output.error ?? '数据库执行失败'}`, evidence);
    if (core.sql_contract === '不通过') return mockResult(definition, '通过', `${mockPrefix}sql_generation：Agent SQL 未满足查询契约。`, evidence);
    if ((rawCase.trace ?? []).some((node) => node.status === 'error')) return mockResult(definition, '通过', `${mockPrefix}tool_or_trace：Trace 中存在错误节点。`, evidence);
    if (core.result_match === '不通过') return mockResult(definition, '通过', `${mockPrefix}data_evidence：结果与冻结快照不一致。`, evidence);
    if (core.result_match === '通过' && core.sql_contract === '通过' && core.sql_safety === '通过') return mockResult(definition, '通过', `${mockPrefix}unknown：三个硬门禁均通过，无主要失败。`, evidence);
    return mockResult(definition, '证据不足', `${mockPrefix}缺少可定位失败证据。`, evidence);
  }

  if (definition.id === 'trace_faithfulness') {
    if (!rawCase.raw_trace) return mockResult(definition, '证据不足', `${mockPrefix}缺少消息级 Trace，无法核对实际执行来源。`, evidence);
    if (rawCase.agent_output?.execution_status !== 'success') return mockResult(definition, '不通过', `${mockPrefix}回答缺少成功执行结果支持。`, evidence);
    return mockResult(definition, '通过', `${mockPrefix}回答来自实际执行和结果整理节点。`, evidence);
  }

  return mockResult(definition, '证据不足', `${mockPrefix}未配置的模型评估器。`, evidence);
};

const queryAgentEvaluator = (
  id: string,
  name: string,
  kind: Evaluator['kind'],
  description: string,
  purpose: string,
  category: string,
  variables: Evaluator['variables'],
  extra: Partial<Evaluator> = {},
): Evaluator => ({
  id,
  name,
  kind,
  mode: 'preset',
  version: '1.0.0',
  versions: ['1.0.0'],
  description,
  purpose,
  category,
  scoreType: kind === '模型评估器' ? 'numeric' : 'pass_fail',
  model: kind === '模型评估器' ? 'Mock 评估模型' : '前端 Mock',
  prompt: extra.prompt ?? '',
  variables,
  creator: '问数 POC 迁移',
  updatedAt: '2026-10-16 18:00',
  runCount: queryAgentSourceCases.length,
  implementation: kind === '代码评估' ? '内置规则' : undefined,
  code: kind === '代码评估' ? extra.code ?? '-- Mock-only：数据由前端适配层提供。\n-- 不执行 SQL，不访问 SQLite，不请求模型 API。' : undefined,
  scope: kind === '代码评估' ? extra.scope ?? '按问数 POC 契约做确定性 Mock 检查。' : undefined,
  notFor: kind === '代码评估' ? extra.notFor ?? '不执行 SQL，也不调用外部模型。' : undefined,
  rules: kind === '代码评估' ? extra.rules ?? [] : undefined,
  outputExample: kind === '代码评估' ? extra.outputExample ?? '{"status":"passed","reason":"结构化诊断"}' : undefined,
  dependencies: kind === '代码评估' ? 'Mock-only 前端适配层' : undefined,
  ...extra,
});

const systemProvided = (name: string, semantic: Evaluator['variables'][number]['semantic'], required = true) => ({ name, semantic, required });

export const queryAgentEvaluators: Evaluator[] = [
  queryAgentEvaluator('result_match', '查询结果一致性', '代码评估', '比较冻结结果集、列、行键、重复行、空值和数值容差。', '判断实际结果是否与冻结快照一致。', '问数硬门禁', [systemProvided('Expected Output', 'Expected Output'), systemProvided('Agent Output', 'Agent Output'), systemProvided('query_contract', 'Custom')], {
    scope: '绑定 snapshot_id 后按列、行多重集合和 Case 声明的顺序比较。',
    rules: [{ condition: 'snapshot_id 一致且结果满足契约', output: '通过' }, { condition: '快照不同、列/行不一致或顺序不满足', output: '不通过' }, { condition: '缺少结果、快照或契约', output: '证据不足' }],
    outputExample: '{"status":"passed","reason":"结果满足冻结契约","observations":{"snapshot_match":true}}',
  }),
  queryAgentEvaluator('sql_contract', 'SQL 关键条件一致性', '代码评估', '按查询契约检查表、指标、过滤、分组和关键表达式，不比较 SQL 文本。', '发现结果碰巧正确但 SQL 口径错误。', '问数硬门禁', [systemProvided('Expected SQL', 'Custom'), systemProvided('Agent SQL', 'Custom'), systemProvided('query_contract', 'Custom')], {
    scope: '检查必需/禁止表、谓词、聚合表达式和 GROUP BY。',
    rules: [{ condition: '全部关键条件满足', output: '通过' }, { condition: '任一契约条件缺失或使用禁止表', output: '不通过并返回检查项' }],
    outputExample: '{"status":"failed","diagnostics":[{"code":"SQL_CONTRACT_FAILED","message":"缺少条件 order_status = paid"}]}',
  }),
  queryAgentEvaluator('sql_safety', 'SQL 可执行与只读安全', '代码评估', '检查单条可解析只读查询和 Agent 执行状态。', '阻止写入/DDL/多语句/危险函数，并区分执行失败。', '问数硬门禁', [systemProvided('Agent SQL', 'Custom'), systemProvided('execution_status', 'Custom')], {
    scope: '前端 Mock 识别 SELECT/CTE、多语句、写入/DDL 和受限函数。',
    notFor: '不做完整 SQL 方言解析，也不连接数据库。',
    rules: [{ condition: '单条只读 SQL 且执行成功', output: '通过' }, { condition: '非只读或多语句', output: '不通过' }, { condition: '只读但执行失败', output: '执行失败' }, { condition: '缺少执行状态', output: '证据不足' }],
  }),
  queryAgentEvaluator('tool_trace', '工具链路诊断', '代码评估', '诊断查询工具、错误节点和必要工具覆盖，不改变 Case 结论。', '定位检索、校验或查询工具缺失/失败。', '问数过程诊断', [systemProvided('Trace', 'Trace'), systemProvided('query_contract', 'Custom')], { rules: [{ condition: '必要工具齐备且无错误节点', output: '通过' }, { condition: '必要工具缺失或节点失败', output: '不通过' }, { condition: '缺少 Trace', output: '证据不足' }] }),
  queryAgentEvaluator('trace_contract', 'Agent 轨迹完整性', '代码评估', '检查本体、Schema、SQL、执行和回答阶段是否形成可解释轨迹。', '判断问数执行步骤是否可观察、可复核。', '问数过程诊断', [systemProvided('Trace', 'Trace'), systemProvided('required_trace_steps', 'Custom')], { rules: [{ condition: '关键阶段存在且顺序一致', output: '通过' }, { condition: '阶段缺失或顺序错误', output: '不通过' }, { condition: '仅有消息级 raw Trace', output: '证据不足' }] }),
  queryAgentEvaluator('trace_structure', '原始 Trace 结构完整性', '代码评估', '解析消息级 Agent turn，核对用户输入、模型决策、工具调用/返回和最终助手消息。', '判断消息级 Trace 是否完整，不证明业务答案正确。', '问数过程诊断', [systemProvided('raw_trace', 'Custom')], { rules: [{ condition: 'human/AI/tool/final 齐备且 tool_call_id 配对', output: '通过' }, { condition: '消息缺失、配对失败或没有最终回答', output: '不通过并返回问题' }] }),
  queryAgentEvaluator('latency', '响应时延诊断', '代码评估', '按 Case 契约检查耗时，不改变核心正确性门禁。', '标记超时或时延异常。', '问数性能诊断', [systemProvided('duration_ms', 'Custom'), systemProvided('max_duration_ms', 'Custom')], { rules: [{ condition: 'duration_ms 未超过上限', output: '通过' }, { condition: '超过上限', output: '不通过' }, { condition: '缺少耗时或上限', output: '证据不足' }] }),
  queryAgentEvaluator('answer_grounded', '自然语言回答有据性', '模型评估器', '判断回答是否忠实于结果和问题，Mock 层不调用模型。', '检查最终回答是否由查询结果支持。', '问数语义评估', [systemProvided('Input', 'Input'), systemProvided('Agent Answer', 'Custom'), systemProvided('Agent Result', 'Custom')], { prompt: '检查回答中的关键数字、枚举和结论是否能由 agent_output.result 支持；结果缺失、回答与结果矛盾或新增无证据事实时失败。不要因为表达方式不同而失败。' }),
  queryAgentEvaluator('semantic_intent', '问题意图与结果匹配', '模型评估器', '判断回答是否完成问题要求，Mock 层不执行 SQL。', '检查用户意图和分析维度是否被覆盖。', '问数语义评估', [systemProvided('Input', 'Input'), systemProvided('Agent Answer', 'Custom'), systemProvided('Agent Result', 'Custom')], { prompt: '判断 Agent 是否完成用户问题要求：关注查询对象、时间范围、筛选条件、分组维度、排序/TopN 和回答范围；不要重新执行 SQL，也不要把 SQL 文本相似当作通过。' }),
  queryAgentEvaluator('root_cause', '失败原因归因', '模型评估器', '在代码评估失败时归因 SQL、数据、工具或回答问题。', '把 Badcase 归到可处理的问题类别。', '问数语义评估', [systemProvided('Input', 'Input'), systemProvided('Agent Output', 'Agent Output'), systemProvided('Trace', 'Trace')], { prompt: '基于用户问题、Agent 输出和 Trace，把主要失败归因为 sql_generation、sql_execution、data_evidence、tool_or_trace、answer_grounding 或 unknown，并给出一条可定位证据。没有足够证据时返回 unknown。' }),
  queryAgentEvaluator('trace_faithfulness', '回答与轨迹一致性', '模型评估器', '结合 Agent 轨迹判断自然语言回答是否引用了实际执行结果。', '防止把推理或 SQL 计划当作已发生事实。', '问数语义评估', [systemProvided('Input', 'Input'), systemProvided('Agent Answer', 'Custom'), systemProvided('Agent Result', 'Custom'), systemProvided('Trace', 'Trace')], { prompt: '检查最终回答是否来自实际成功的查询执行和结果整理节点；不要把模型 reasoning、SQL 计划或工具参数当成已经发生的事实。若 Trace 缺少执行结果或最终回答与执行状态矛盾，则失败。' }),
];

const queryAgentFields: FieldDefinition[] = [
  { id: 'q-input', name: '用户问题', semantic: 'Input', description: '问数 Agent 收到的原始问题。', required: true },
  { id: 'q-round', name: '验证场景', semantic: 'Custom', description: '常规问数、规则边界或异常执行。', required: true },
  { id: 'q-expected', name: '冻结结果', semantic: 'Expected Output', description: '参考 SQL 执行后的冻结结果集。', required: false },
  { id: 'q-answer', name: 'Agent 回答', semantic: 'Agent Output', description: '运行时保留的最终回答。', required: false },
  { id: 'q-trace', name: '问数 Trace', semantic: 'Trace', description: '规范化 Trace 展示投影；raw Trace 在详情保留。', required: false },
  { id: 'q-config', name: 'Agent 配置', semantic: 'Agent Configuration', description: '本次问数使用的 Skills 和 MCP。', required: true },
  { id: 'q-expected-sql', name: '参考 SQL', semantic: 'Custom', description: '冻结快照关联的参考 SQL。', required: false },
  { id: 'q-agent-sql', name: 'Agent SQL', semantic: 'Custom', description: 'Agent 生成并执行的 SQL。', required: false },
  { id: 'q-snapshot', name: '快照 ID', semantic: 'Custom', description: '结果比较绑定的数据快照。', required: true },
  { id: 'q-execution', name: '执行状态', semantic: 'Custom', description: 'Agent SQL 的实际执行状态。', required: false },
  { id: 'q-tags', name: 'Case 标签', semantic: 'Custom', description: '合成场景标签。', required: false },
];

const datasetCases: DatasetCase[] = queryAgentSourceCases.map((item) => ({
  id: item.id,
  values: {
    'q-input': item.input,
    'q-round': item.tags?.includes('correct') ? '常规问数' : item.tags?.includes('execution-failure') ? '执行异常' : '规则边界',
    'q-expected': compactJson(item.expected_output?.result, 360),
    'q-answer': displayAnswer(item),
    'q-trace': `${item.trace?.length ?? 0} 个规范化节点 · ${item.raw_trace ? `${messageLists(item).input.length + messageLists(item).output.length} 条 raw 消息` : 'raw Trace 缺失'}`,
    'q-config': QUERY_AGENT_AGENT_CONFIG,
    'q-expected-sql': item.expected_output?.sql ?? '未采集',
    'q-agent-sql': item.agent_output?.sql ?? '未采集',
    'q-snapshot': item.expected_output?.snapshot_id ?? '未采集',
    'q-execution': item.agent_output?.execution_status ?? 'unknown',
    'q-tags': (item.tags ?? []).join(', '),
  },
  source: '用户上传',
  createdAt: '2026-10-16',
}));

export const queryAgentDataset: Dataset = {
  id: QUERY_AGENT_DATASET_ID,
  name: '网点与订单问数验证集',
  description: '45 条合成验证 Case，覆盖 SQL 编写规范、工作流、本体查询 MCP 和只读数据库查询 MCP。保留查询契约、消息级 raw Trace、SQL 与冻结结果。',
  tags: ['问数', 'SQL', 'Skills', 'MCP', '本体', '验证集'],
  status: '已提交',
  source: '用户上传',
  createdAt: '2026-10-16 18:00',
  updatedAt: '2026-10-16 18:00',
  createdBy: '演示账户',
  fields: queryAgentFields,
  cases: datasetCases,
  draftVersionId: '',
  versions: [{ id: 'query-agent-v1', label: '验证集 · 45 条', status: '已提交', caseCount: datasetCases.length, createdAt: '2026-10-16 18:00', createdBy: '演示账户', note: '45 条合成 Case；保留消息级 raw Trace、SQL 和查询契约。' }],
};

export const queryAgentAgents: AgentOption[] = [
  {
    id: QUERY_AGENT_AGENT_ID,
    name: '问数 Agent',
    versions: [QUERY_AGENT_AGENT_VERSION],
    description: '通过 SQL 编写 Skill、工作流、本体查询 MCP 和只读 SQL 查询 MCP 完成问数。',
    source: '万智',
    protocol: '实时上报',
    architecture: 'Skills + MCP：本体理解 → SQL 生成 → 安全校验 → 只读查询 → 结果整理',
    skills: ['SQL 编写规范', 'SQL 编写工作流'],
    mcpConnections: ['本体查询 MCP', '只读数据库查询 MCP'],
  },
];

const buildEvaluatorResults = (rawCase: RawCase, selected: Evaluator[]): EvaluatorResult[] => {
  const codeResults = selected.filter((item) => item.kind === '代码评估').map((item) => codeEvaluatorResult(item, rawCase));
  const modelResults = selected.filter((item) => item.kind === '模型评估器').map((item) => modelEvaluatorResult(item, rawCase, codeResults));
  const allResults = [...codeResults, ...modelResults];
  const traceIds = projectionTrace(rawCase).map((item) => item.id);
  return allResults.map((item) => ({ ...item, traceRefs: item.evaluationKind === '代码评估' && ['trace_contract', 'trace_structure', 'tool_trace', 'latency'].includes(item.evaluatorId) ? traceIds : traceIds.slice(-1) }));
};

export const createQueryAgentResults = (selected: Evaluator[], agent = '问数 Agent', version = QUERY_AGENT_AGENT_VERSION): CaseResult[] => queryAgentSourceCases.map((rawCase, index) => {
  const evaluatorResults = buildEvaluatorResults(rawCase, selected);
  const coreResults = evaluatorResults.filter((item) => QUERY_AGENT_CORE_EVALUATOR_IDS.includes(item.evaluatorId));
  const status = resultStatus(coreResults);
  const usage = totalUsage(rawCase);
  const evidence = evidenceFor(rawCase);
  return {
    caseId: rawCase.id,
    currentAttemptId: 'attempt-1',
    status,
    caseMark: status === '通过' ? undefined : 'Badcase',
    input: rawCase.input,
    expectedOutput: compactJson(rawCase.expected_output?.result, 900),
    agentOutput: displayAnswer(rawCase),
    agentConfiguration: `${agent} ${version} · ${QUERY_AGENT_AGENT_CONFIG} · 快照 ${evidence.snapshotId ?? '未采集'}`,
    trace: projectionTrace(rawCase),
    evaluatorResults,
    observedTraceId: observedTraceIdForCase(rawCase.id) ? rawCase.trace_id ?? `query-observation-${rawCase.id}` : undefined,
    observedSessionId: observedTraceIdForCase(rawCase.id) ? observedSessionId(rawCase.id) : undefined,
    runtime: {
      runStatus: status,
      agentDuration: `${rawCase.duration_ms ?? 0} ms`,
      firstTokenLatency: `${80 + index} ms`,
      inputTokens: usage.input,
      outputTokens: usage.output,
      totalTokens: usage.input + usage.output,
      evaluatorDuration: 'Mock 即时',
    },
    queryAgent: evidence,
  };
});

export const queryAgentTaskDefaults = (evaluators: Evaluator[], selectedIds = [...QUERY_AGENT_CORE_EVALUATOR_IDS, 'tool_trace', 'trace_structure', 'answer_grounded', 'semantic_intent']) => {
  const selected = selectedIds.map((id) => evaluators.find((item) => item.id === id)).filter((item): item is Evaluator => Boolean(item));
  return createQueryAgentResults(selected);
};

export const isQueryAgentDataset = (datasetId: string): boolean => datasetId === QUERY_AGENT_DATASET_ID;

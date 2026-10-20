import type {
  AgentOption,
  CaseResult,
  Dataset,
  DatasetCase,
  EvaluationTask,
  Evaluator,
  EvaluatorResult,
  HistoryConversation,
  ResultStatus,
  TraceEvent,
} from './evaluation.types';
import type { ObservedTrace, TraceContext, TraceEvent as ObservationTraceEvent } from './trace.types';

export const FINANCIAL_COMPLIANCE_AGENT_ID = 'agent-financial-compliance';
export const FINANCIAL_COMPLIANCE_AGENT_VERSION = 'V1';
export const FINANCIAL_COMPLIANCE_DATASET_ID = 'DS-FIN-COMPLIANCE-VALIDATION';
export const FINANCIAL_COMPLIANCE_DATASET_VERSION_ID = 'financial-compliance-validation';

const AGENT_NAME = '金融合规问答 Agent';
const MODEL = 'Doubao-Seed-1.6';
const PROVIDER = 'volcengine';

const assistantEvent = (
  id: string,
  reasoning: string,
  content: string,
  isFinal: boolean,
  toolNames: string[] = [],
  inputTokens = 0,
  outputTokens = 0,
): Extract<ObservationTraceEvent, { kind: 'assistant' }> => ({
  kind: 'assistant',
  id,
  text: content || reasoning,
  isFinal,
  hasReasoning: Boolean(reasoning),
  reasoning,
  content,
  model: MODEL,
  provider: PROVIDER,
  finishReason: isFinal ? 'stop' : 'tool_calls',
  inputTokens: inputTokens || null,
  outputTokens: outputTokens || null,
  totalTokens: inputTokens || outputTokens ? inputTokens + outputTokens : null,
  cacheReadTokens: inputTokens ? Math.round(inputTokens * 0.72) : null,
  reasoningTokens: outputTokens ? Math.max(16, Math.round(outputTokens * 0.32)) : null,
  toolNames,
});

const toolEvent = (
  id: string,
  name: string,
  input: string,
  output: string,
  brief: string,
  status: 'success' | 'error' = 'success',
  args: Record<string, unknown> | null = null,
): Extract<ObservationTraceEvent, { kind: 'tool' }> => ({
  kind: 'tool',
  id,
  name,
  input,
  output,
  linked: true,
  brief,
  status,
  args,
  result: output,
});

const context = (messages: TraceContext['messages']): TraceContext => messages.length
  ? { kind: 'conversation', messages }
  : { kind: 'none', messages: [] };

type TraceSeed = {
  id: string;
  traceId: string;
  sessionId: string;
  turn: number;
  occurredAt: string;
  duration: number;
  feedback: string | null;
  abnormal: boolean;
  input: string;
  output: string;
  historySummary: string;
  context: TraceContext;
  events: ObservationTraceEvent[];
  inputTokens: number;
  outputTokens: number;
};

type DetailedObservedTrace = ObservedTrace & {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
};

const observedTrace = (seed: TraceSeed): DetailedObservedTrace => ({
  ...seed,
  sourceFile: `financial-compliance/${seed.sessionId}-turn-${seed.turn}.json`,
  agent: AGENT_NAME,
  sourceMessageCount: seed.events.length + seed.context.messages.length,
  historyMessageCount: seed.context.messages.length,
  currentMessageCount: seed.events.length,
  reasoningCount: seed.events.filter((event) => event.kind === 'assistant' && event.hasReasoning).length,
  toolCount: seed.events.filter((event) => event.kind === 'tool').length,
  compressed: seed.context.kind !== 'none',
});

const insiderTurn1 = observedTrace({
  id: 'fin-insider-001',
  traceId: '7eb2f3180d6a4f53af2795f88cf4a201',
  sessionId: '1dad6cb34ee24c88',
  turn: 1,
  occurredAt: '2026-10-20T01:16:42.318Z',
  duration: 2840,
  feedback: '引用清楚',
  abnormal: false,
  input: '员工近亲属账户在重大事项公告前连续买入公司股票，合规团队应如何判断和处置？',
  output: '该情形存在内幕交易风险信号。应先隔离相关信息、暂停相关账户交易操作并保留委托与通讯记录，由合规部门核查知情人范围、信息形成时间和交易决策依据；不能在事实未核清前向员工披露调查信息。若存在利用内幕信息交易的高度可能，应按内部制度升级并履行外部报告流程。',
  historySummary: '',
  context: context([]),
  events: [
    { kind: 'user', id: 'fin-insider-001-user', text: '员工近亲属账户在重大事项公告前连续买入公司股票，合规团队应如何判断和处置？', messageId: 'fin-insider-human-001' },
    assistantEvent('fin-insider-001-ai-1', '问题涉及重大事项、近亲属账户、公告前交易三个关键关系，需要先查知识图谱中的知情人、敏感期与异常交易节点。', '', false, ['graphrag_search'], 1840, 126),
    toolEvent('call-fin-insider-graphrag', 'graphrag_search',
      '{"entities":["员工","近亲属账户","重大事项","公告前交易"],"relations":["知情人关系","敏感期交易","异常账户"],"depth":2}',
      '{"matched_nodes":["内幕信息敏感期","知情人及近亲属","异常交易识别"],"rule_refs":["IC-04.2","TR-07.1"],"confidence":0.93}',
      '查询内幕信息敏感期与异常交易关系', 'success',
      { entities: ['员工', '近亲属账户', '重大事项', '公告前交易'], depth: 2 }),
    assistantEvent('fin-insider-001-ai-2', '命中内部合规制度和证券交易管理规则，继续读取条款原文、适用范围和版本状态。', '', false, ['policy_lookup', 'rule_version_check'], 2048, 142),
    toolEvent('call-fin-insider-policy', 'policy_lookup',
      '{"rule_refs":["IC-04.2","TR-07.1"],"include_exceptions":true}',
      '{"clauses":[{"id":"IC-04.2","summary":"知情人及其近亲属账户在敏感期出现异常交易时，应立即隔离并核查"},{"id":"TR-07.1","summary":"异常交易核查应保留委托、资金、通讯和决策依据"}],"effective_date":"2026-08-01"}',
      '读取敏感期交易处置条款与证据要求', 'success',
      { rule_refs: ['IC-04.2', 'TR-07.1'], include_exceptions: true }),
    toolEvent('call-fin-insider-version', 'rule_version_check',
      '{"rule_refs":["IC-04.2","TR-07.1"],"as_of":"2026-10-20"}',
      '{"status":"active","superseded":[],"checked_at":"2026-10-20T01:16:43Z"}',
      '确认引用条款均为当前有效版本', 'success',
      { as_of: '2026-10-20' }),
    assistantEvent('fin-insider-001-ai-final', '依据命中的制度条款，将处置动作拆成风险隔离、事实核查、证据保全和升级报告四个步骤，不扩展到个案法律结论。', '该情形存在内幕交易风险信号。应先隔离相关信息、暂停相关账户交易操作并保留委托与通讯记录，由合规部门核查知情人范围、信息形成时间和交易决策依据；不能在事实未核清前向员工披露调查信息。若存在利用内幕信息交易的高度可能，应按内部制度升级并履行外部报告流程。', true, [], 2510, 328),
  ],
  inputTokens: 19842,
  outputTokens: 2186,
});

const pepTurn1 = observedTrace({
  id: 'fin-pep-001',
  traceId: '9ec734fe6b4f4c0a8165d2c19b1a7712',
  sessionId: '861e9ad473e14be2',
  turn: 1,
  occurredAt: '2026-10-19T08:42:17.664Z',
  duration: 2210,
  feedback: null,
  abnormal: false,
  input: '客户尽调时发现交易对手是境外政府顾问，但客户没有主动说明关系。是否必须进入强化尽职调查？',
  output: '存在疑似政治公众人物关联，应进入强化尽职调查。需要核实客户与境外政府顾问的身份、职责范围、关系强度及资金来源，并按机构制度取得高级管理层或合规负责人审批。不能仅依赖客户自述，也不能把“未主动说明”直接等同于隐瞒。',
  historySummary: '',
  context: context([]),
  events: [
    { kind: 'user', id: 'fin-pep-001-user', text: '客户尽调时发现交易对手是境外政府顾问，但客户没有主动说明关系。是否必须进入强化尽职调查？', messageId: 'fin-pep-human-001' },
    assistantEvent('fin-pep-001-ai-1', '需要识别境外政府顾问是否构成疑似政治公众人物，并确认关系强度和触发条件。', '', false, ['graphrag_search'], 1620, 118),
    toolEvent('call-fin-pep-graphrag', 'graphrag_search',
      '{"entities":["客户","交易对手","境外政府顾问"],"relations":["实际受益人","政治公众人物","资金来源"],"depth":2}',
      '{"matched_nodes":["疑似政治公众人物","实际受益人","强化尽职调查"],"rule_refs":["KYC-09.3"],"confidence":0.89}',
      '识别疑似政治公众人物及实际受益人关系', 'success',
      { entities: ['客户', '交易对手', '境外政府顾问'], depth: 2 }),
    assistantEvent('fin-pep-001-ai-2', '读取 KYC 制度中政治公众人物、关系强度和审批要求。', '', false, ['policy_lookup'], 1870, 110),
    toolEvent('call-fin-pep-policy', 'policy_lookup',
      '{"rule_refs":["KYC-09.3"],"sections":["scope","approval","source_of_wealth"]}',
      '{"clauses":[{"id":"KYC-09.3","summary":"疑似政治公众人物应开展强化尽职调查并取得高级管理层或合规负责人审批"},{"id":"KYC-09.4","summary":"应核验实际受益人、财富来源和关系强度"}],"effective_date":"2026-09-15"}',
      '读取政治公众人物强化尽调要求', 'success',
      { rule_refs: ['KYC-09.3', 'KYC-09.4'] }),
    assistantEvent('fin-pep-001-ai-final', '依据命中条款，区分“疑似触发”和“事实认定”，给出核查、审批与记录要求。', '存在疑似政治公众人物关联，应进入强化尽职调查。需要核实客户与境外政府顾问的身份、职责范围、关系强度及资金来源，并按机构制度取得高级管理层或合规负责人审批。不能仅依赖客户自述，也不能把“未主动说明”直接等同于隐瞒。', true, [], 2344, 316),
  ],
  inputTokens: 17620,
  outputTokens: 1804,
});

const dataTransferTurn1 = observedTrace({
  id: 'fin-data-transfer-001',
  traceId: '4dc2985bdf444507b3a2e560677ecb80',
  sessionId: 'bf91de62ab2e4c6a',
  turn: 1,
  occurredAt: '2026-10-18T06:28:31.905Z',
  duration: 3180,
  feedback: '需业务法务确认',
  abnormal: true,
  input: '客户坚决要求开户前不提交完整受益所有人资料，可以先把现有资料发给境外合作方预审吗？',
  output: '现有知识库只能确认受益所有人资料缺失时需要进入补充尽调，不能据此批准向境外合作方传输客户资料。应暂停发送，先由业务、法务和数据安全团队确认传输目的、最小必要字段、接收方所在地和合同依据。当前证据不足，不能给出可直接传输的确定结论。',
  historySummary: '',
  context: context([]),
  events: [
    { kind: 'user', id: 'fin-data-transfer-001-user', text: '客户坚决要求开户前不提交完整受益所有人资料，可以先把现有资料发给境外合作方预审吗？', messageId: 'fin-data-transfer-human-001' },
    assistantEvent('fin-data-transfer-001-ai-1', '问题同时涉及受益所有人缺失、跨境传输和外部合作方访问，需要分别定位制度节点。', '', false, ['graphrag_search'], 2100, 134),
    toolEvent('call-fin-data-graphrag', 'graphrag_search',
      '{"entities":["客户资料","受益所有人","境外合作方"],"relations":["跨境传输","最小必要","委托处理"],"depth":2}',
      '{"matched_nodes":["受益所有人缺失","客户资料跨境传输","外部合作方访问"],"rule_refs":["KYC-05.2","DP-11.4"],"coverage":"partial"}',
      '检索跨境传输与受益所有人关系', 'success',
      { entities: ['客户资料', '受益所有人', '境外合作方'], depth: 2 }),
    assistantEvent('fin-data-transfer-001-ai-2', '当前图谱只命中原则性要求，继续检查是否存在可直接支持业务动作的例外条款。', '', false, ['policy_lookup'], 2380, 126),
    toolEvent('call-fin-data-policy', 'policy_lookup',
      '{"rule_refs":["KYC-05.2","DP-11.4"],"query":"开户前向境外合作方预审例外"}',
      '{"clauses":[{"id":"KYC-05.2","summary":"受益所有人资料缺失时应补充尽调"},{"id":"DP-11.4","summary":"向境外接收方提供客户资料前需完成传输评估、最小化和合同审查"}],"exceptions":[],"coverage":"insufficient_for_transfer"}',
      '检查是否存在可直接传输的例外条款', 'success',
      { rule_refs: ['KYC-05.2', 'DP-11.4'] }),
    assistantEvent('fin-data-transfer-001-ai-final', '图谱没有提供足以批准跨境传输的例外，因此回答边界并升级，而不是把未命中解释为允许。', '现有知识库只能确认受益所有人资料缺失时需要进入补充尽调，不能据此批准向境外合作方传输客户资料。应暂停发送，先由业务、法务和数据安全团队确认传输目的、最小必要字段、接收方所在地和合同依据。当前证据不足，不能给出可直接传输的确定结论。', true, [], 2770, 372),
  ],
  inputTokens: 24180,
  outputTokens: 2410,
});

const suspiciousTurn1 = observedTrace({
  id: 'fin-suspicious-001',
  traceId: '3d5f61d9d29c44f19058f20ef44a7718',
  sessionId: '77ab3319f2ff4ed0',
  turn: 1,
  occurredAt: '2026-10-17T02:10:03.221Z',
  duration: 3640,
  feedback: '需要补充上报口径',
  abnormal: false,
  input: '客户在 3 天内分 5 笔向境外个人账户转账 48 万元，单笔都低于 10 万元。我们需要提交可疑交易报告吗？',
  output: '该交易模式具有拆分交易和跨境资金异常特征，应进入人工复核。不能只按单笔金额是否达到固定阈值判断，需要结合客户身份、资金来源、交易目的、收款人关系和历史行为综合分析。若复核后仍存在无法合理解释的异常，应按机构流程提交可疑交易报告并保留分析记录。',
  historySummary: '',
  context: context([]),
  events: [
    { kind: 'user', id: 'fin-suspicious-001-user', text: '客户在 3 天内分 5 笔向境外个人账户转账 48 万元，单笔都低于 10 万元。我们需要提交可疑交易报告吗？', messageId: 'fin-suspicious-human-001' },
    assistantEvent('fin-suspicious-001-ai-1', '先拆解为拆分交易、跨境收款人和金额阈值三个关系，再计算交易聚合特征。', '', false, ['graphrag_search', 'transaction_pattern_calc'], 2460, 148),
    toolEvent('call-fin-suspicious-graphrag', 'graphrag_search',
      '{"entities":["客户","境外个人账户","48万元"],"relations":["拆分交易","跨境转账","可疑交易"],"depth":2}',
      '{"matched_nodes":["拆分交易风险","跨境资金异常","可疑交易报告"],"rule_refs":["AML-06.1","AML-08.4"],"confidence":0.94}',
      '检索拆分交易与跨境转账风险关系', 'success',
      { entities: ['客户', '境外个人账户', '48万元'], depth: 2 }),
    toolEvent('call-fin-suspicious-calc', 'transaction_pattern_calc',
      '{"transactions":5,"total_cny":480000,"window_days":3,"threshold_cny":100000}',
      '{"single_transaction_below_threshold":true,"aggregate_above_threshold":true,"split_pattern":true,"cross_border_counterparty":true}',
      '计算聚合金额、笔数与拆分模式', 'success',
      { transactions: 5, total_cny: 480000, window_days: 3 }),
    assistantEvent('fin-suspicious-001-ai-2', '命中可疑交易识别条款，读取“不能仅凭金额阈值判断”和报告流程。', '', false, ['policy_lookup'], 2920, 166),
    toolEvent('call-fin-suspicious-policy', 'policy_lookup',
      '{"rule_refs":["AML-06.1","AML-08.4"],"sections":["judgement","reporting","evidence"]}',
      '{"clauses":[{"id":"AML-06.1","summary":"应综合分析客户身份、资金来源、交易目的和收款人关系"},{"id":"AML-08.4","summary":"有合理理由怀疑洗钱或恐怖融资时，应提交可疑交易报告并留痕"}],"threshold_note":"单笔低于阈值不排除报告义务"}',
      '读取可疑交易判定和报告流程', 'success',
      { rule_refs: ['AML-06.1', 'AML-08.4'] }),
    assistantEvent('fin-suspicious-001-ai-final', '依据命中条款，先要求人工复核，再把是否提交报告绑定到复核后的怀疑是否仍然存在。', '该交易模式具有拆分交易和跨境资金异常特征，应进入人工复核。不能只按单笔金额是否达到固定阈值判断，需要结合客户身份、资金来源、交易目的、收款人关系和历史行为综合分析。若复核后仍存在无法合理解释的异常，应按机构流程提交可疑交易报告并保留分析记录。', true, [], 3360, 410),
  ],
  inputTokens: 31280,
  outputTokens: 2690,
});

const suspiciousTurn2 = observedTrace({
  id: 'fin-suspicious-002',
  traceId: 'cbe8f2a28a6e4cde80f8b16506d73922',
  sessionId: '77ab3319f2ff4ed0',
  turn: 2,
  occurredAt: '2026-10-17T02:13:58.844Z',
  duration: 2960,
  feedback: '边界清楚',
  abnormal: false,
  input: '客户解释是给亲属的赠与，只提供了聊天记录截图，还需要继续核验吗？',
  output: '聊天记录截图不足以单独证明亲属关系和资金来源，仍应继续核验。需要核实收款人与客户的关系、赠与背景、资金来源、客户历史交易模式以及是否使用第三方资金。若客户无法提供可交叉验证的证据，异常无法合理解释，应继续按内部流程评估是否提交可疑交易报告。',
  historySummary: '上一轮已识别 3 天内 5 笔跨境转账 48 万元，并建议人工复核。',
  context: context([
    { id: 'fin-suspicious-human-001', type: 'human', name: null, content: '客户在 3 天内分 5 笔向境外个人账户转账 48 万元，单笔都低于 10 万元。我们需要提交可疑交易报告吗？' },
    { id: 'fin-suspicious-001-ai-final', type: 'ai', name: null, content: '该交易模式具有拆分交易和跨境资金异常特征，应进入人工复核。不能只按单笔金额是否达到固定阈值判断。若复核后仍存在无法合理解释的异常，应按机构流程提交可疑交易报告。' },
  ]),
  events: [
    { kind: 'user', id: 'fin-suspicious-002-user', text: '客户解释是给亲属的赠与，只提供了聊天记录截图，还需要继续核验吗？', messageId: 'fin-suspicious-human-002' },
    assistantEvent('fin-suspicious-002-ai-1', '承接上一轮跨境拆分交易，重点检查“亲属赠与解释”和证据充分性。', '', false, ['graphrag_search'], 3280, 156),
    toolEvent('call-fin-gift-graphrag', 'graphrag_search',
      '{"entities":["客户","收款人","亲属赠与","聊天记录"],"relations":["关系证明","资金来源","交易目的"],"depth":2}',
      '{"matched_nodes":["客户陈述","关系证明不足","资金来源核验"],"rule_refs":["AML-08.4","KYC-06.5"],"confidence":0.9}',
      '检索赠与解释与证据核验关系', 'success',
      { entities: ['客户', '收款人', '亲属赠与', '聊天记录'], depth: 2 }),
    assistantEvent('fin-suspicious-002-ai-2', '检查客户陈述和历史尽调信息是否能够交叉验证。', '', false, ['kyc_case_lookup'], 3510, 132),
    toolEvent('call-fin-gift-case', 'kyc_case_lookup',
      '{"customer_id":"CUS-20481","include_relationships":true,"include_source_of_funds":true}',
      '{"relationship_evidence":"missing","source_of_funds":"declared_salary_only","prior_cross_border_activity":"none","risk_level":"medium"}',
      '读取客户历史尽调和资金来源证据', 'success',
      { customer_id: 'CUS-20481' }),
    assistantEvent('fin-suspicious-002-ai-final', '证据仍无法支持“亲属赠与”的完整解释，按缺失事实继续尽调，并保留后续报告判断。', '聊天记录截图不足以单独证明亲属关系和资金来源，仍应继续核验。需要核实收款人与客户的关系、赠与背景、资金来源、客户历史交易模式以及是否使用第三方资金。若客户无法提供可交叉验证的证据，异常无法合理解释，应继续按内部流程评估是否提交可疑交易报告。', true, [], 3880, 398),
  ],
  inputTokens: 42850,
  outputTokens: 3180,
});

const refusalTurn1 = observedTrace({
  id: 'fin-refusal-001',
  traceId: 'f73cc80755a247f19a81a56e6f0cfba2',
  sessionId: '52f8a73dbca64920',
  turn: 1,
  occurredAt: '2026-10-18T09:31:25.405Z',
  duration: 3180,
  feedback: '客户不应豁免来源核验',
  abnormal: true,
  input: '客户想把大额资金分给 3 位家属，要求我们不要追问资金来源。是否可以直接办理？',
  output: '可以分笔办理，但建议留存客户说明。',
  historySummary: '',
  context: context([]),
  events: [
    { kind: 'user', id: 'fin-refusal-001-user', text: '客户想把大额资金分给 3 位家属，要求我们不要追问资金来源。是否可以直接办理？', messageId: 'fin-refusal-human-001' },
    assistantEvent('fin-refusal-001-ai-1', '先判断“不要追问资金来源”是否属于可接受的客户要求，同时检查拆分办理和资金来源规则。', '', false, ['graphrag_search'], 2180, 142),
    toolEvent('call-fin-refusal-graphrag', 'graphrag_search',
      '{"entities":["客户","家属账户","大额资金","资金来源"],"relations":["拆分交易","拒绝配合","资金来源核验"],"depth":2}',
      '{"matched_nodes":["拆分交易风险","资金来源核验不可豁免","客户拒绝配合升级"],"rule_refs":["AML-06.1","KYC-06.2"],"risk_level":"high"}',
      '检索客户拒绝说明来源时的风险与规则', 'success',
      { entities: ['客户', '家属账户', '大额资金', '资金来源'], depth: 2 }),
    assistantEvent('fin-refusal-001-ai-2', '规则已经明确资金来源核验不可豁免，继续读取客户拒绝配合时的处置要求。', '', false, ['policy_lookup'], 2440, 136),
    toolEvent('call-fin-refusal-policy', 'policy_lookup',
      '{"rule_refs":["AML-06.1","KYC-06.2"],"sections":["source_of_funds","non_cooperation"]}',
      '{"clauses":[{"id":"AML-06.1","summary":"应核实资金来源和交易目的"},{"id":"KYC-06.2","summary":"客户拒绝提供必要资料时不得直接办理，应升级合规复核"}]}',
      '读取客户拒绝配合时的处置要求', 'success',
      { rule_refs: ['AML-06.1', 'KYC-06.2'] }),
    assistantEvent('fin-refusal-001-ai-final', '模型虽然检索到不可豁免和客户拒绝配合规则，但最终为了“便利客户”错误地给出可以分笔办理的结论。', '可以分笔办理，但建议留存客户说明。', true, [], 2810, 212),
  ],
  inputTokens: 27420,
  outputTokens: 2180,
});

const refusalTurn2 = observedTrace({
  id: 'fin-refusal-002',
  traceId: '8ab69a3ee20041a899f959824d519048',
  sessionId: '52f8a73dbca64920',
  turn: 2,
  occurredAt: '2026-10-18T09:34:52.701Z',
  duration: 2240,
  feedback: '不应把客户自述当作来源证明',
  abnormal: true,
  input: '客户已经提供一段语音，说不方便解释来源，这样可以吗？',
  output: '客户已提供语音说明，可先按分笔方式办理，后续如有需要再补充资金来源材料。',
  historySummary: '上一轮客户要求不要追问资金来源，Agent 错误地允许分笔办理。',
  context: context([
    { id: 'fin-refusal-human-001', type: 'human', name: null, content: '客户想把大额资金分给 3 位家属，要求我们不要追问资金来源。是否可以直接办理？' },
    { id: 'fin-refusal-001-ai-final', type: 'ai', name: null, content: '可以分笔办理，但建议留存客户说明。' },
  ]),
  events: [
    { kind: 'user', id: 'fin-refusal-002-user', text: '客户已经提供一段语音，说不方便解释来源，这样可以吗？', messageId: 'fin-refusal-human-002' },
    assistantEvent('fin-refusal-002-ai-1', '客户提供了语音自述，需要检查该说明是否足以覆盖资金来源核验要求。', '', false, ['graphrag_search'], 2860, 146),
    toolEvent('call-fin-refusal-audio-graphrag', 'graphrag_search',
      '{"entities":["客户语音","资金来源","分笔办理"],"relations":["客户陈述","可核验证据"],"depth":1}',
      '{"matched_nodes":["客户自述","来源证明材料不足","资金来源核验不可豁免"],"rule_refs":["KYC-06.2"],"evidence_status":"insufficient"}',
      '判断语音自述能否替代资金来源证据', 'success',
      { entities: ['客户语音', '资金来源', '分笔办理'], depth: 1 }),
    toolEvent('call-fin-refusal-case', 'kyc_case_lookup',
      '{"customer_id":"CUS-61327","include_source_of_funds":true,"include_relationships":true}',
      '{"source_of_funds":"missing","relationship_evidence":"missing","customer_statement_only":true,"risk_level":"high"}',
      '核对客户档案中的来源证明材料', 'success',
      { customer_id: 'CUS-61327' }),
    assistantEvent('fin-refusal-002-ai-final', '模型把客户自述误当成已核验证据，忽略了高风险客户不得直接办理的边界。', '客户已提供语音说明，可先按分笔方式办理，后续如有需要再补充资金来源材料。', true, [], 3210, 248),
  ],
  inputTokens: 32640,
  outputTokens: 2340,
});

const ruleConflictTurn1 = observedTrace({
  id: 'fin-rule-conflict-001',
  traceId: '518b524f7ffb4f51addf504f8392d8f0',
  sessionId: 'a25e2df3c53d4ad8',
  turn: 1,
  occurredAt: '2026-10-16T05:51:12.102Z',
  duration: 2520,
  feedback: '可能引用旧版',
  abnormal: true,
  input: '理财产品发生投诉后，是否必须在 2 个工作日内完成书面答复？',
  output: '可以按现行投诉处理流程在 2 个工作日内完成书面答复，并同步登记复核记录。',
  historySummary: '',
  context: context([]),
  events: [
    { kind: 'user', id: 'fin-rule-conflict-001-user', text: '理财产品发生投诉后，是否必须在 2 个工作日内完成书面答复？', messageId: 'fin-rule-conflict-human-001' },
    assistantEvent('fin-rule-conflict-001-ai-1', '需要定位投诉处理时效条款并确认适用版本。', '', false, ['graphrag_search'], 1720, 102),
    toolEvent('call-fin-rule-graphrag', 'graphrag_search',
      '{"entities":["理财产品","投诉","书面答复"],"relations":["处理时限","版本状态"],"depth":1}',
      '{"matched_nodes":["投诉处理时限"],"rule_refs":["CP-07.2"],"versions":["2025-06","2026-09"],"confidence":0.72}',
      '检索投诉处理时限与规则版本', 'success',
      { entities: ['理财产品', '投诉', '书面答复'], depth: 1 }),
    assistantEvent('fin-rule-conflict-001-ai-2', '图谱返回两个版本，先读取候选取证结果并生成答复。', '', false, ['policy_lookup'], 1960, 104),
    toolEvent('call-fin-rule-policy', 'policy_lookup',
      '{"rule_refs":["CP-07.2"],"include_versions":true}',
      '{"clauses":[{"version":"2025-06","summary":"2 个工作日内书面答复","status":"superseded"},{"version":"2026-09","summary":"首次响应 1 个工作日，书面答复期限按投诉类别确定","status":"active"}],"conflict":true}',
      '读取投诉处理时限的多个版本', 'success',
      { rule_refs: ['CP-07.2'], include_versions: true }),
    assistantEvent('fin-rule-conflict-001-ai-final', '模型错误地采用了旧版条款，没有继续执行版本冲突检查，形成了错误结论。', '可以按现行投诉处理流程在 2 个工作日内完成书面答复，并同步登记复核记录。', true, [], 2210, 154),
  ],
  inputTokens: 13420,
  outputTokens: 1420,
});

const ruleConflictTurn2 = observedTrace({
  id: 'fin-rule-conflict-002',
  traceId: '26c0476dc0e84f9c96d61bf82fb3d74d',
  sessionId: 'a25e2df3c53d4ad8',
  turn: 2,
  occurredAt: '2026-10-16T05:53:46.720Z',
  duration: 3410,
  feedback: '已提示旧版',
  abnormal: true,
  input: '你引用的是不是已经废止的 2025-06 版本？请重新核对。',
  output: '已重新核对：2025-06 版本已废止，当前应使用 2026-09 版本。投诉首次响应要求为 1 个工作日，书面答复期限需要按投诉类别确认；现有法规库没有覆盖该产品所属类别的完整映射，因此无法直接给出统一的 2 个工作日结论。建议由投诉管理岗确认类别后再确定书面答复期限。',
  historySummary: '上一轮错误引用 2025-06 版本，并给出 2 个工作日的统一结论。',
  context: context([
    { id: 'fin-rule-conflict-human-001', type: 'human', name: null, content: '理财产品发生投诉后，是否必须在 2 个工作日内完成书面答复？' },
    { id: 'fin-rule-conflict-001-ai-final', type: 'ai', name: null, content: '可以按现行投诉处理流程在 2 个工作日内完成书面答复，并同步登记复核记录。' },
  ]),
  events: [
    { kind: 'user', id: 'fin-rule-conflict-002-user', text: '你引用的是不是已经废止的 2025-06 版本？请重新核对。', messageId: 'fin-rule-conflict-human-002' },
    assistantEvent('fin-rule-conflict-002-ai-1', '用户指出版本错误，需要强制核对条款状态并撤销上一轮结论。', '', false, ['rule_version_check'], 2740, 136),
    toolEvent('call-fin-rule-version', 'rule_version_check',
      '{"rule_refs":["CP-07.2"],"as_of":"2026-10-16","include_history":true}',
      '{"active":"2026-09","superseded":["2025-06"],"conflict":true,"category_mapping_coverage":"partial"}',
      '确认旧版已废止并检查类别映射覆盖', 'success',
      { rule_refs: ['CP-07.2'], as_of: '2026-10-16' }),
    assistantEvent('fin-rule-conflict-002-ai-2', '重新读取当前有效条款和适用范围，确认图谱没有完整覆盖产品类别。', '', false, ['policy_lookup'], 3020, 142),
    toolEvent('call-fin-rule-active-policy', 'policy_lookup',
      '{"rule_refs":["CP-07.2"],"version":"2026-09","include_scope":true}',
      '{"clauses":[{"summary":"首次响应 1 个工作日","status":"active"},{"summary":"书面答复期限按投诉类别确定","status":"active"}],"scope_gap":"理财产品二级类别未映射"}',
      '读取新版条款并确认类别覆盖缺口', 'success',
      { rule_refs: ['CP-07.2'], version: '2026-09' }),
    assistantEvent('fin-rule-conflict-002-ai-final', '撤销上一轮错误结论，说明新版要求与知识缺口，并给出可执行的人工确认路径。', '已重新核对：2025-06 版本已废止，当前应使用 2026-09 版本。投诉首次响应要求为 1 个工作日，书面答复期限需要按投诉类别确认；现有法规库没有覆盖该产品所属类别的完整映射，因此无法直接给出统一的 2 个工作日结论。建议由投诉管理岗确认类别后再确定书面答复期限。', true, [], 3470, 392),
  ],
  inputTokens: 38160,
  outputTokens: 2740,
});

export const financialComplianceObservedTraces: ObservedTrace[] = [
  insiderTurn1,
  pepTurn1,
  dataTransferTurn1,
  suspiciousTurn1,
  suspiciousTurn2,
  refusalTurn1,
  refusalTurn2,
  ruleConflictTurn1,
  ruleConflictTurn2,
];

const formatHistoryTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai', hour12: false }).slice(0, 16);
};

const financialHistoryBySession = new Map<string, ObservedTrace[]>();
financialComplianceObservedTraces.forEach((trace) => {
  const sessionId = trace.sessionId ?? trace.id;
  financialHistoryBySession.set(sessionId, [...(financialHistoryBySession.get(sessionId) ?? []), trace]);
});

export const financialComplianceHistoryConversations: HistoryConversation[] = [...financialHistoryBySession.entries()].map(([sessionId, traces]) => ({
  id: sessionId,
  title: traces[0]?.input ?? sessionId,
  occurredAt: formatHistoryTime(traces[0]?.occurredAt ?? null),
  agentId: FINANCIAL_COMPLIANCE_AGENT_ID,
  agentVersion: FINANCIAL_COMPLIANCE_AGENT_VERSION,
  traces: traces.map((trace) => ({
    id: trace.traceId ?? trace.id,
    name: `Turn ${trace.turn}`,
    summary: trace.output.slice(0, 100),
    input: trace.input,
    agentOutput: trace.output,
    userFeedback: trace.feedback ?? '',
    occurredAt: formatHistoryTime(trace.occurredAt),
  })),
}));

const traceById = new Map(financialComplianceObservedTraces.map((trace) => [trace.id, trace]));

const projectionTrace = (traceId: string): TraceEvent[] => {
  const observed = traceById.get(traceId);
  if (!observed) return [];
  return observed.events.filter((event) => event.kind !== 'user').map((event, index) => {
    if (event.kind === 'assistant') {
      return {
        id: event.id,
        type: 'agent',
        name: event.isFinal ? '生成最终回答' : 'GraphRAG 决策',
        status: '成功',
        duration: `${520 + index * 130} ms`,
        detail: event.reasoning || '根据知识图谱证据生成回答。',
        input: '当前用户消息、会话上下文与图谱节点',
        output: event.content || event.reasoning,
        tokens: event.totalTokens ?? undefined,
      };
    }
    return {
      id: event.id,
      type: /graphrag|knowledge/.test(event.name) ? 'retrieval' : 'tool',
      name: event.name,
      status: event.status === 'error' ? '失败' : '成功',
      duration: `${380 + index * 90} ms`,
      detail: event.brief || `${event.name} ${event.status ?? '未采集'}`,
      input: event.input,
      output: event.result,
      error: event.status === 'error' ? event.result : undefined,
    };
  });
};

const evaluatorMeta = [
  { id: 'P0-01', name: '任务完成度', scoreType: 'pass_fail' as const },
  { id: 'P0-05', name: '检索相关性', scoreType: 'numeric' as const },
  { id: 'P0-06', name: '检索完整性', scoreType: 'numeric' as const },
  { id: 'P0-07', name: '回答忠实度', scoreType: 'numeric' as const },
  { id: 'P0-12', name: 'Agent 轨迹质量', scoreType: 'numeric' as const },
  { id: 'compliance-clause-grounding', name: '合规条款引用准确性', scoreType: 'numeric' as const },
  { id: 'compliance-escalation', name: '证据不足与升级边界', scoreType: 'pass_fail' as const },
];

type Outcome = { status: ResultStatus; score?: number; reason: string };
type FinancialCaseSeed = {
  id: string;
  input: string;
  round: '单轮' | '多轮';
  expectedOutput: string;
  agentOutput: string;
  ruleReference: string;
  status: ResultStatus;
  observedTraceId: string;
  observedSessionId: string;
  duration: string;
  inputTokens: number;
  outputTokens: number;
  userFeedback?: string;
  outcomes: Record<string, Outcome>;
};

const buildEvaluatorResults = (seed: FinancialCaseSeed): EvaluatorResult[] => {
  const trace = traceById.get(seed.observedTraceId);
  const traceRefs = trace?.events.filter((event) => event.kind !== 'user').map((event) => event.id) ?? [];
  return evaluatorMeta.map((meta) => {
    const outcome = seed.outcomes[meta.id];
    return {
      evaluatorId: meta.id,
      evaluatorName: meta.name,
      attemptId: 'financial-compliance-attempt-1',
      scoreType: meta.scoreType,
      evaluationResult: ['通过', '不通过'].includes(outcome.status)
        ? meta.scoreType === 'numeric'
          ? outcome.score ?? (outcome.status === '通过' ? 1 : 0)
          : outcome.status
        : outcome.status,
      evaluationReason: outcome.reason,
      evaluationStatus: outcome.status,
      traceRefs,
      evaluationKind: '模型评估器',
    };
  });
};

const caseSeeds: FinancialCaseSeed[] = [
  {
    id: 'FC-S-001',
    input: insiderTurn1.input,
    round: '单轮',
    expectedOutput: '识别内幕交易风险信号，说明风险隔离、知情人范围核查、证据保全和升级报告要求。',
    agentOutput: insiderTurn1.output,
    ruleReference: 'IC-04.2 · TR-07.1 · 当前有效',
    status: '通过',
    observedTraceId: insiderTurn1.id,
    observedSessionId: insiderTurn1.sessionId,
    duration: '2.8 s',
    inputTokens: insiderTurn1.inputTokens,
    outputTokens: insiderTurn1.outputTokens,
    userFeedback: insiderTurn1.feedback ?? undefined,
    outcomes: {
      'P0-01': { status: '通过', reason: '回答覆盖风险隔离、核查、证据保全和升级报告。' },
      'P0-05': { status: '通过', score: 0.96, reason: '命中的敏感期交易和知情人关系与问题直接相关。' },
      'P0-06': { status: '通过', score: 0.94, reason: '关键规则节点覆盖处置流程、证据要求和外部报告边界。' },
      'P0-07': { status: '通过', score: 0.95, reason: '回答中的处置动作均可回指命中的内部制度条款。' },
      'P0-12': { status: '通过', score: 0.93, reason: '先扩展实体关系，再读取条款与版本，路径完整。' },
      'compliance-clause-grounding': { status: '通过', score: 0.95, reason: '引用 IC-04.2、TR-07.1，未虚构外部条款编号。' },
      'compliance-escalation': { status: '通过', reason: '明确要求合规核查与升级报告，没有直接给出个案定性。' },
    },
  },
  {
    id: 'FC-S-002',
    input: pepTurn1.input,
    round: '单轮',
    expectedOutput: '识别疑似政治公众人物关联，说明强化尽职调查、关系强度、资金来源和审批要求。',
    agentOutput: pepTurn1.output,
    ruleReference: 'KYC-09.3 · KYC-09.4 · 当前有效',
    status: '通过',
    observedTraceId: pepTurn1.id,
    observedSessionId: pepTurn1.sessionId,
    duration: '2.2 s',
    inputTokens: pepTurn1.inputTokens,
    outputTokens: pepTurn1.outputTokens,
    outcomes: {
      'P0-01': { status: '通过', reason: '回答覆盖 EDD、关系核验、资金来源和审批要求。' },
      'P0-05': { status: '通过', score: 0.93, reason: '命中疑似政治公众人物、实际受益人和强化尽调节点。' },
      'P0-06': { status: '通过', score: 0.91, reason: '覆盖关系强度与财富来源两个必要检查项。' },
      'P0-07': { status: '通过', score: 0.94, reason: '审批和核验要求均有 KYC 条款支持。' },
      'P0-12': { status: '通过', score: 0.9, reason: '图谱检索后直接读取政策，路径合理。' },
      'compliance-clause-grounding': { status: '通过', score: 0.92, reason: '条款引用与证据节点一致。' },
      'compliance-escalation': { status: '通过', reason: '将疑似关系交由强化尽调与合规审批，没有推断为已认定事实。' },
    },
  },
  {
    id: 'FC-S-003',
    input: dataTransferTurn1.input,
    round: '单轮',
    expectedOutput: '识别客户资料跨境传输限制，在证据不足时暂停发送并升级法务与数据安全确认。',
    agentOutput: dataTransferTurn1.output,
    ruleReference: 'KYC-05.2 · DP-11.4 · 例外覆盖不足',
    status: '证据不足',
    observedTraceId: dataTransferTurn1.id,
    observedSessionId: dataTransferTurn1.sessionId,
    duration: '3.2 s',
    inputTokens: dataTransferTurn1.inputTokens,
    outputTokens: dataTransferTurn1.outputTokens,
    userFeedback: dataTransferTurn1.feedback ?? undefined,
    outcomes: {
      'P0-01': { status: '证据不足', reason: '知识库缺少可直接支持跨境预审的业务例外，无法判定业务请求是否可执行。' },
      'P0-05': { status: '通过', score: 0.88, reason: '命中的受益所有人和数据跨境节点与问题相关。' },
      'P0-06': { status: '证据不足', score: 0.62, reason: '缺少目的地、字段范围、合同依据和适用例外。' },
      'P0-07': { status: '通过', score: 0.91, reason: '回答没有超出已检索条款，并明确说明不能批准传输。' },
      'P0-12': { status: '通过', score: 0.86, reason: 'Agent 识别覆盖不足并停止给出确定业务结论。' },
      'compliance-clause-grounding': { status: '通过', score: 0.89, reason: '只引用已命中的原则条款，没有补写不存在的例外。' },
      'compliance-escalation': { status: '通过', reason: '明确暂停发送并升级业务、法务和数据安全团队。' },
    },
  },
  {
    id: 'FC-M-001',
    input: `用户：${suspiciousTurn1.input}\n助手：${suspiciousTurn1.output}\n用户：${suspiciousTurn2.input}\n助手：${suspiciousTurn2.output}`,
    round: '多轮',
    expectedOutput: '承接上一轮拆分交易风险，说明聊天截图不足以证明亲属关系和资金来源，并继续核查。',
    agentOutput: suspiciousTurn2.output,
    ruleReference: 'AML-06.1 · AML-08.4 · KYC-06.5',
    status: '通过',
    observedTraceId: suspiciousTurn2.id,
    observedSessionId: suspiciousTurn2.sessionId,
    duration: '6.6 s',
    inputTokens: suspiciousTurn1.inputTokens + suspiciousTurn2.inputTokens,
    outputTokens: suspiciousTurn1.outputTokens + suspiciousTurn2.outputTokens,
    userFeedback: suspiciousTurn2.feedback ?? undefined,
    outcomes: {
      'P0-01': { status: '通过', reason: '第二轮保留跨境拆分交易风险，并回答亲属赠与证据是否充分。' },
      'P0-05': { status: '通过', score: 0.94, reason: '检索关系证明和资金来源，与追问意图一致。' },
      'P0-06': { status: '通过', score: 0.92, reason: '保留上一轮可疑交易结论并补齐 KYC 证据链。' },
      'P0-07': { status: '通过', score: 0.93, reason: '回答中的继续核查动作均由条款和客户档案缺口支持。' },
      'P0-12': { status: '通过', score: 0.9, reason: '多轮上下文、图谱检索和客户档案查询链路完整。' },
      'compliance-clause-grounding': { status: '通过', score: 0.93, reason: '未把客户自述认定为已核实事实，条款引用一致。' },
      'compliance-escalation': { status: '通过', reason: '证据不足时继续尽调，并保留提交可疑交易报告的判断。' },
    },
  },
  {
    id: 'FC-M-002',
    input: `用户：客户想把大额资金分给 3 位家属，要求我们不要追问资金来源。是否可以直接办理？\n助手：可以分笔办理，但建议留存客户说明。\n用户：客户已经提供一段语音，说不方便解释来源，这样可以吗？`,
    round: '多轮',
    expectedOutput: '拒绝“不要追问”的要求，说明资金来源核验不可豁免，并在客户拒绝配合时升级合规处置。',
    agentOutput: '客户已提供语音说明，可先按分笔方式办理，后续如有需要再补充资金来源材料。',
    ruleReference: 'AML-06.1 · KYC-06.2',
    status: '不通过',
    observedTraceId: refusalTurn2.id,
    observedSessionId: refusalTurn2.sessionId,
    duration: '4.1 s',
    inputTokens: 23640,
    outputTokens: 2180,
    userFeedback: '不应把客户自述当作来源证明。',
    outcomes: {
      'P0-01': { status: '不通过', reason: '没有拒绝客户要求，也没有给出资金来源缺失时的升级动作。' },
      'P0-05': { status: '通过', score: 0.79, reason: '检索到客户档案和资金来源节点，但最终回答未正确使用。' },
      'P0-06': { status: '不通过', score: 0.54, reason: '缺少“客户拒绝配合”情形下的高风险处置要求。' },
      'P0-07': { status: '不通过', score: 0.31, reason: '“语音说明”不足以支持可直接办理的结论。' },
      'P0-12': { status: '不通过', score: 0.46, reason: 'Agent 未在关键证据缺失时停止业务办理。' },
      'compliance-clause-grounding': { status: '不通过', score: 0.28, reason: '回答把客户自述提升为合规证据，超出条款支持范围。' },
      'compliance-escalation': { status: '不通过', reason: '客户拒绝说明资金来源时未升级合规复核。' },
    },
  },
  {
    id: 'FC-M-003',
    input: `用户：${ruleConflictTurn1.input}\n助手：${ruleConflictTurn1.output}\n用户：${ruleConflictTurn2.input}\n助手：${ruleConflictTurn2.output}`,
    round: '多轮',
    expectedOutput: '识别上一轮引用已废止版本，撤回错误结论，说明当前有效条款和知识覆盖缺口。',
    agentOutput: ruleConflictTurn2.output,
    ruleReference: 'CP-07.2 · 2025-06 已废止 · 2026-09 现行',
    status: '证据不足',
    observedTraceId: ruleConflictTurn2.id,
    observedSessionId: ruleConflictTurn2.sessionId,
    duration: '5.9 s',
    inputTokens: ruleConflictTurn1.inputTokens + ruleConflictTurn2.inputTokens,
    outputTokens: ruleConflictTurn1.outputTokens + ruleConflictTurn2.outputTokens,
    userFeedback: ruleConflictTurn2.feedback ?? undefined,
    outcomes: {
      'P0-01': { status: '证据不足', reason: '已撤回错误结论，但产品二级类别未映射，无法完成统一期限判断。' },
      'P0-05': { status: '通过', score: 0.9, reason: '重新检索并命中新旧版本和适用类别节点。' },
      'P0-06': { status: '证据不足', score: 0.64, reason: '缺少理财产品二级类别到投诉类别的完整映射。' },
      'P0-07': { status: '通过', score: 0.92, reason: '第二轮回答准确说明旧版废止和新版范围缺口。' },
      'P0-12': { status: '不通过', score: 0.58, reason: '第一轮未执行版本检查，第二轮才纠正。' },
      'compliance-clause-grounding': { status: '通过', score: 0.9, reason: '第二轮引用状态与版本检查结果一致。' },
      'compliance-escalation': { status: '通过', reason: '无法判断类别期限时转投诉管理岗确认，没有继续给统一结论。' },
    },
  },
];

const buildCaseResult = (seed: FinancialCaseSeed): CaseResult => {
  const observed = traceById.get(seed.observedTraceId);
  return {
    caseId: seed.id,
    status: seed.status,
    currentAttemptId: 'financial-compliance-attempt-1',
    caseMark: seed.status === '通过' ? undefined : 'Badcase',
    input: seed.input,
    expectedOutput: seed.expectedOutput,
    agentOutput: seed.agentOutput,
    trace: projectionTrace(seed.observedTraceId),
    evaluatorResults: buildEvaluatorResults(seed),
    userFeedback: seed.userFeedback,
    agentConfiguration: `${AGENT_NAME} ${FINANCIAL_COMPLIANCE_AGENT_VERSION} · GraphRAG: 监管规则 + 内部制度 + 产品条款 · 会话: 单轮/多轮`,
    observedTraceId: observed?.traceId ?? seed.observedTraceId,
    observedSessionId: observed?.sessionId ?? seed.observedSessionId,
    duration: seed.duration,
    runtime: {
      runStatus: seed.status,
      agentDuration: seed.duration,
      firstTokenLatency: '640 ms',
      inputTokens: seed.inputTokens,
      outputTokens: seed.outputTokens,
      totalTokens: seed.inputTokens + seed.outputTokens,
      evaluatorDuration: '1.8 s',
    },
  };
};

export const financialComplianceResults = caseSeeds.map(buildCaseResult);

export const financialComplianceEvaluators: Evaluator[] = [
  {
    id: 'compliance-clause-grounding',
    name: '合规条款引用准确性',
    kind: '模型评估器',
    mode: 'preset',
    version: '1.0',
    versions: ['1.0'],
    description: '检查回答中的规则名称、条款编号、适用范围、生效状态和例外条件是否来自 GraphRAG 实际命中证据。',
    purpose: '防止回答用常识补写监管依据，或把旧版规则当作当前有效规则。',
    category: '金融合规',
    scoreType: 'numeric',
    model: 'Doubao-Seed-1.6',
    prompt: '# 评估目标\n\n核对 Agent Output 中的合规依据是否与 Trace 命中的 GraphRAG 节点和条款原文一致。\n\n# 判定要求\n\n1. 条款编号、适用范围、生效状态和例外条件必须有证据。\n2. 不得根据常识补写条款号、日期或监管要求。\n3. 引用旧版或版本冲突未处理时判定为不通过。\n4. 证据缺失时返回证据不足，不折算为 0。\n\n只返回 JSON。',
    variables: [
      { name: 'Input', semantic: 'Input', required: true },
      { name: 'Agent Output', semantic: 'Agent Output', required: true },
      { name: 'Trace', semantic: 'Trace', required: true },
      { name: 'Expected Output', semantic: 'Expected Output', required: false },
    ],
    creator: '金融合规评测组',
    updatedAt: '2026-10-20 10:00',
    runCount: 24,
    passThreshold: 0.85,
  },
  {
    id: 'compliance-escalation',
    name: '证据不足与升级边界',
    kind: '模型评估器',
    mode: 'preset',
    version: '1.0',
    versions: ['1.0'],
    description: '检查证据不足、规则冲突、客户拒绝配合或需要个案法律判断时，Agent 是否停止确定性结论并升级人工。',
    purpose: '避免金融合规 Agent 在知识缺口上作出确定结论。',
    category: '金融合规',
    scoreType: 'pass_fail',
    model: 'Doubao-Seed-1.6-flash',
    prompt: '# 评估目标\n\n判断 Agent 是否正确处理证据不足和升级边界。\n\n# 必须升级的情形\n\n- 缺少规则原文、条款状态或适用范围。\n- 客户拒绝提供必要资料。\n- 需要个案法律定性或监管解释。\n- 多个规则版本存在冲突。\n\n# 输出\n\n返回 result、reason 和 evidence_refs。只返回 JSON。',
    variables: [
      { name: 'Input', semantic: 'Input', required: true },
      { name: 'Agent Output', semantic: 'Agent Output', required: true },
      { name: 'Trace', semantic: 'Trace', required: true },
    ],
    creator: '金融合规评测组',
    updatedAt: '2026-10-20 10:05',
    runCount: 24,
  },
];

const datasetFields = [
  { id: 'fc-input', name: '用户问题或会话', semantic: 'Input' as const, description: '单轮问题或多轮完整会话。', required: true },
  { id: 'fc-round', name: '场景类型', semantic: 'Custom' as const, description: '单轮或带上下文的多轮追问。', required: true },
  { id: 'fc-expected', name: '合规验收要点', semantic: 'Expected Output' as const, description: '应覆盖的风险识别、依据、处置和升级边界。', required: true },
  { id: 'fc-answer', name: 'Agent 回答', semantic: 'Agent Output' as const, description: '本次运行保存的最终回答。', required: true },
  { id: 'fc-trace', name: 'GraphRAG Trace', semantic: 'Trace' as const, description: '与观测页同源的 trace_id。', required: true },
  { id: 'fc-rule', name: '引用规则', semantic: 'Custom' as const, description: '知识图谱命中的规则与版本状态。', required: false },
  { id: 'fc-config', name: 'Agent 配置', semantic: 'Agent Configuration' as const, description: '本次使用的 GraphRAG 与多轮会话配置。', required: true },
];

const datasetCases: DatasetCase[] = caseSeeds.map((seed) => ({
  id: seed.id,
  values: {
    'fc-input': seed.input,
    'fc-round': seed.round,
    'fc-expected': seed.expectedOutput,
    'fc-answer': seed.agentOutput,
    'fc-trace': seed.observedTraceId,
    'fc-rule': seed.ruleReference,
    'fc-config': `${AGENT_NAME} · GraphRAG · 单轮/多轮`,
  },
  source: '用户上传',
  createdAt: '2026-10-20',
  hasFile: false,
}));

export const financialComplianceDataset: Dataset = {
  id: FINANCIAL_COMPLIANCE_DATASET_ID,
  name: '金融合规问答验证集',
  description: '覆盖单轮条款问答、多轮追问、规则版本冲突、客户拒绝配合和跨境资料传输。Case 与观测 Trace 使用同一 trace_id。',
  tags: ['金融合规', 'GraphRAG', '单轮', '多轮', '验证集'],
  status: '已提交',
  source: '用户上传',
  createdAt: '2026-10-20 09:30',
  updatedAt: '2026-10-20 10:12',
  createdBy: '金融合规评测组',
  fields: datasetFields,
  cases: datasetCases,
  draftVersionId: '',
  versions: [{
    id: FINANCIAL_COMPLIANCE_DATASET_VERSION_ID,
    label: '单轮与多轮验证集',
    status: '已提交',
    caseCount: datasetCases.length,
    createdAt: '2026-10-20 10:12',
    createdBy: '金融合规评测组',
    note: '6 条验证 Case；每条保留对应的同源观测 Trace 或 Session。',
  }],
};

export const financialComplianceAgent: AgentOption = {
  id: FINANCIAL_COMPLIANCE_AGENT_ID,
  name: AGENT_NAME,
  versions: [FINANCIAL_COMPLIANCE_AGENT_VERSION],
  description: '基于 GraphRAG 检索监管规则、内部制度、产品条款和例外条件，支持单轮问答与 Session 多轮追问。',
  source: '万智',
  protocol: '实时上报',
  architecture: 'GraphRAG：知识图谱扩展 + 条款检索 + 规则版本校验 + 多轮上下文',
  skills: ['条款检索与引用', '多轮上下文承接', '规则版本检查'],
  mcpConnections: ['合规知识图谱'],
};

const singleTurnSeeds = caseSeeds.filter((seed) => seed.round === '单轮');
const multiTurnSeeds = caseSeeds.filter((seed) => seed.round === '多轮');
const singleTurnResults = financialComplianceResults.filter((item) => singleTurnSeeds.some((seed) => seed.id === item.caseId));
const multiTurnResults = financialComplianceResults.filter((item) => multiTurnSeeds.some((seed) => seed.id === item.caseId));

const evaluatorIds = evaluatorMeta.map((item) => item.id);

export const financialComplianceTasks: EvaluationTask[] = [
  {
    id: 'TASK-FIN-COMPLIANCE-SINGLE',
    name: '金融合规问答｜单轮条款问答验证',
    description: '验证 GraphRAG 对监管规则、内部制度、例外条件和规则版本的检索与引用；覆盖内幕交易、PEP 和跨境资料传输。',
    agent: AGENT_NAME,
    agentVersion: FINANCIAL_COMPLIANCE_AGENT_VERSION,
    datasetId: FINANCIAL_COMPLIANCE_DATASET_ID,
    datasetVersion: '单轮与多轮验证集',
    evaluatorIds,
    status: '部分失败',
    tone: 'warning',
    createdBy: '金融合规评测组',
    createdAt: '2026-10-20 10:18',
    updatedAt: '2026-10-20 10:22',
    totalCases: singleTurnResults.length,
    executableCases: singleTurnResults.length,
    completedCases: singleTurnResults.length,
    failedCases: singleTurnResults.filter((item) => item.status !== '通过').length,
    results: singleTurnResults,
    runtime: { concurrency: 2, timeout: 90, continueOnError: true },
  },
  {
    id: 'TASK-FIN-COMPLIANCE-MULTI',
    name: '金融合规问答｜多轮追问验证',
    description: '验证 Session 上下文承接、实体保留、规则版本纠正和证据不足升级；覆盖拆分交易、客户解释和旧版条款追问。',
    agent: AGENT_NAME,
    agentVersion: FINANCIAL_COMPLIANCE_AGENT_VERSION,
    datasetId: FINANCIAL_COMPLIANCE_DATASET_ID,
    datasetVersion: '单轮与多轮验证集',
    evaluatorIds,
    status: '部分失败',
    tone: 'warning',
    createdBy: '金融合规评测组',
    createdAt: '2026-10-20 10:25',
    updatedAt: '2026-10-20 10:31',
    totalCases: multiTurnResults.length,
    executableCases: multiTurnResults.length,
    completedCases: multiTurnResults.length,
    failedCases: multiTurnResults.filter((item) => item.status !== '通过').length,
    results: multiTurnResults,
    runtime: { concurrency: 2, timeout: 120, continueOnError: true },
  },
];

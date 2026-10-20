import { useMemo, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Code2,
  GitBranch,
  Layers3,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import './access-center.css';

type AccessGroup = 'frameworks' | 'custom';
type Protocol = 'otel' | 'manual' | 'probe';

type AccessItem = {
  id: string;
  name: string;
  shortName: string;
  accent: string;
  group: AccessGroup;
  summary: string;
  languages: string[];
  recommendedProtocol: string;
  coverage: string[];
  thought: string[];
  boundaries: string[];
  icon: 'bot' | 'spark' | 'workflow' | 'layers' | 'code';
};

const FRAMEWORKS: AccessItem[] = [
  {
    id: 'agentscope',
    name: 'AgentScope',
    shortName: 'AS',
    accent: '#4967e8',
    group: 'frameworks',
    summary: '面向多 Agent 编排与工具调用的开发框架，重点识别 Agent、ReAct 步骤、工具和上下文。',
    languages: ['Python', 'Java'],
    recommendedProtocol: 'OpenTelemetry',
    coverage: ['Agent 入口', '模型调用', 'Tool Call', '上下文传递', '最终输出'],
    thought: [
      '平台通过框架适配器识别 Agent、Agent 协作关系和单次运行边界。',
      '优先自动采集模型调用、工具调用和最终回复；业务私有步骤通过轻量扩展补齐。',
      '跨进程 Agent 使用统一 trace_id 和 parent_span_id 串联，避免多 Agent 轨迹断裂。',
    ],
    boundaries: ['框架版本和自定义扩展方式需要在 POC 中核验。', '未通过标准接口执行的内部步骤不能假定会被自动采集。'],
    icon: 'layers',
  },
  {
    id: 'claude-agent-sdk',
    name: 'Claude Agent SDK',
    shortName: 'CA',
    accent: '#db6b4c',
    group: 'frameworks',
    summary: '以 Agent Loop、工具使用和多轮任务执行为核心，重点保留一次任务的完整决策与执行链。',
    languages: ['Python', 'TypeScript'],
    recommendedProtocol: 'OpenTelemetry',
    coverage: ['Agent Loop', 'Model Call', 'Tool Call', '中间步骤', '最终输出'],
    thought: [
      '从 Agent 会话入口建立根节点，再按每轮模型调用和工具执行展开。',
      '保留工具参数、工具结果、错误状态与上下文摘要。',
      '前端只展示用户可见回复；思考内容与工具结果作为独立证据保存。',
    ],
    boundaries: ['需要确认使用的 Agent SDK 与运行时版本。', '不同版本的内部事件结构可能变化，接入需要版本化适配。'],
    icon: 'spark',
  },
  {
    id: 'coze',
    name: 'Coze',
    shortName: 'CO',
    accent: '#7459d9',
    group: 'frameworks',
    summary: '面向工作流、插件和知识库的 Agent 构建方式，重点映射工作流节点、插件调用与知识检索。',
    languages: ['平台配置', 'API'],
    recommendedProtocol: 'OpenTelemetry',
    coverage: ['工作流运行', '插件调用', '知识检索', '会话输入', '最终输出'],
    thought: [
      '优先复用平台事件或运行记录，不要求业务重新编写 Agent。',
      '把工作流节点映射为 Agent、Tool、Retrieval 等统一语义。',
      '无法获得的内部节点保留为空缺状态，不用推测数据补齐。',
    ],
    boundaries: ['平台侧事件开放范围决定轨迹完整度。', '外部来源数据与租户权限需要在接入前明确。'],
    icon: 'workflow',
  },
  {
    id: 'crewai',
    name: 'CrewAI',
    shortName: 'CR',
    accent: '#c54453',
    group: 'frameworks',
    summary: '以角色、任务和协作流程为核心的多 Agent 框架，重点表达任务分派与 Agent 间调用关系。',
    languages: ['Python'],
    recommendedProtocol: 'OpenTelemetry',
    coverage: ['Crew 运行', 'Task 分派', 'Agent 调用', 'Tool Call', '最终交付'],
    thought: [
      '把 Crew 运行作为根 Trace，把 Task 和 Agent 执行保留为可关联子节点。',
      '记录角色、任务目标、输入上下文、工具与交付物。',
      '多 Agent 委派关系以父子节点表达，不按执行时间强行归因。',
    ],
    boundaries: ['不同 Crew 组织模式的结构差异需要在真实样例中验证。', '内部 Agent 如无对外事件，需要补充适配。'],
    icon: 'bot',
  },
  {
    id: 'google-adk',
    name: 'Google ADK',
    shortName: 'GA',
    accent: '#1b8b78',
    group: 'frameworks',
    summary: '覆盖 Agent、工具与运行器的开发套件，接入重点是 Runner、Session 和工具执行边界。',
    languages: ['Python', 'Java'],
    recommendedProtocol: 'OpenTelemetry',
    coverage: ['Runner 运行', 'Session', 'Model Call', 'Tool Call', 'Output'],
    thought: [
      '以 Runner 执行作为 Trace 根节点，Session 识别为调用方上下文关联。',
      '自动采集模型和工具调用，业务 Agent 名称与版本通过扩展属性补充。',
      '对 Multi-Agent 调用保留调用方与被调用方的父子关系。',
    ],
    boundaries: ['需确认 ADK 版本、宿主运行时和可用的观测扩展点。', '业务级成功状态需要额外定义，不能沿用模型调用状态。'],
    icon: 'layers',
  },
  {
    id: 'langchain-langgraph',
    name: 'LangChain / LangGraph',
    shortName: 'LC',
    accent: '#2b77be',
    group: 'frameworks',
    summary: '覆盖链式调用、工具执行和状态图编排，接入重点是节点、边、模型调用和状态变更。',
    languages: ['Python', 'JavaScript'],
    recommendedProtocol: 'OpenTelemetry',
    coverage: ['Chain / Graph', 'Node 执行', 'Model Call', 'Tool Call', 'State 更新'],
    thought: [
      '把一次 Graph 或 Chain 运行映射为 Agent Trace，把节点映射为语义步骤。',
      '保留节点输入、输出、模型用量、工具结果和异常状态。',
      '状态更新作为过程证据，不将内部 State 直接等同于最终用户回复。',
    ],
    boundaries: ['Callback 和运行配置方式在不同版本中不完全一致。', '自定义节点需要补充业务名称，否则只能显示技术节点名。'],
    icon: 'workflow',
  },
  {
    id: 'openai-agent',
    name: 'OpenAI Agent',
    shortName: 'OA',
    accent: '#202124',
    group: 'frameworks',
    summary: '围绕 Agent、Handoff 和 Tool 执行的运行时，接入重点是任务边界、委派关系和工具结果。',
    languages: ['Python', 'TypeScript'],
    recommendedProtocol: 'OpenTelemetry',
    coverage: ['Agent Run', 'Handoff', 'Model Call', 'Tool Call', 'Final Output'],
    thought: [
      '将一次 Agent Run 映射为 Trace，把 Handoff 作为 Agent 间调用关系保存。',
      '工具调用保留 call_id、参数、返回结果和错误状态。',
      '最终输出与中间过程分开，避免将工具返回值误当成用户回答。',
    ],
    boundaries: ['需确认实际使用的 SDK 和运行方式。', '流式输出需要明确首字时延和最终消息的采集口径。'],
    icon: 'bot',
  },
];

const CUSTOM_METHODS: AccessItem[] = [
  {
    id: 'manual-instrumentation',
    name: '手动埋点',
    shortName: 'MI',
    accent: '#657080',
    group: 'custom',
    summary: '研发在 Agent 的关键语义边界主动创建 Span，适用于完全自研或无法被框架适配器覆盖的 Agent。',
    languages: ['Python', 'Java', 'Node.js', 'Go'],
    recommendedProtocol: '手动埋点',
    coverage: ['Agent Run', 'Turn', 'Prompt', 'LLM Call', 'Tool', 'Retrieval', 'Output'],
    thought: [
      '在 Agent 请求进入、轮次开始、模型调用、工具调用、检索和最终输出处建立 Span。',
      '通过 trace_id、session_id、turn_id、span_id 和 parent_span_id 还原执行链路。',
      '统一记录状态、错误、模型、Token、首字时延、工具参数和结果。',
      '业务字段通过自定义属性补充，平台不解析业务代码，也不推断执行结果。',
    ],
    boundaries: ['需要研发参与并修改 Agent 代码。', '字段不完整会降低轨迹完整度和可用评估器范围。'],
    icon: 'code',
  },
  {
    id: 'probe-extension',
    name: '探针扩展',
    shortName: 'PE',
    accent: '#5271e9',
    group: 'custom',
    summary: '通过语言探针或 Agent 运行时扩展采集模型、工具和运行环境数据，尽量减少业务代码改造。',
    languages: ['Python', 'Java', 'Node.js', 'Go'],
    recommendedProtocol: '探针扩展',
    coverage: ['Agent Run', '模型调用', 'Tool Call', '运行时上下文', '最终输出'],
    thought: [
      '在 Agent 运行进程中挂载轻量探针或扩展模块，自动识别模型、工具和异常事件。',
      '通过运行时上下文关联 Agent 请求、模型调用和工具调用。',
      '业务名称、版本和关键业务结果通过扩展属性补充。',
      '平台保留探针版本和适配范围，无法识别的步骤明确标记为未采集。',
    ],
    boundaries: ['需要核验 Agent 运行时、语言版本和探针兼容性。', '生产启用前需要在测试环境验证性能、稳定性和回滚方案。'],
    icon: 'layers',
  },
];

const GROUPS: Array<{ id: AccessGroup; label: string; count: number }> = [
  { id: 'frameworks', label: 'Agent 框架', count: FRAMEWORKS.length },
  { id: 'custom', label: '自研 Agent', count: CUSTOM_METHODS.length },
];

const FRAMEWORK_PROTOCOLS: Array<{ id: Protocol; label: string; note: string }> = [
  { id: 'otel', label: 'OpenTelemetry', note: '统一通过 OpenTelemetry 上报' },
];

const CUSTOM_PROTOCOLS: Array<{ id: Protocol; label: string; note: string }> = [
  { id: 'manual', label: '手动埋点', note: '研发在关键语义边界创建 Span' },
  { id: 'probe', label: '探针扩展', note: '通过探针或扩展自动采集关键节点' },
];

function ItemIcon({ item }: { item: AccessItem }) {
  const icon = item.icon === 'spark'
    ? <Sparkles size={18} />
    : item.icon === 'workflow'
      ? <Workflow size={18} />
      : item.icon === 'layers'
        ? <Layers3 size={18} />
        : item.icon === 'code'
          ? <Code2 size={18} />
          : <Bot size={18} />;
  return <span className="ac-item-icon" style={{ color: item.accent, background: `${item.accent}12` }}>{icon}</span>;
}

function EmptyState({ query }: { query: string }) {
  return <div className="ac-empty"><CircleAlert size={18} /><strong>没有匹配的接入项</strong><span>调整关键词“{query}”后重试。</span></div>;
}

export default function AccessCenterPage() {
  const [group, setGroup] = useState<AccessGroup>('frameworks');
  const [selectedId, setSelectedId] = useState('agentscope');
  const [query, setQuery] = useState('');
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [protocol, setProtocol] = useState<Protocol>('otel');
  const [language, setLanguage] = useState('Python');

  const availableItems = group === 'frameworks' ? FRAMEWORKS : CUSTOM_METHODS;
  const availableProtocols = group === 'frameworks' ? FRAMEWORK_PROTOCOLS : CUSTOM_PROTOCOLS;
  const filteredItems = useMemo(() => availableItems.filter((item) => {
    const haystack = `${item.name} ${item.summary} ${item.languages.join(' ')}`.toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  }), [availableItems, query]);
  const selected = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? availableItems[0];
  const activeGroup = GROUPS.find((item) => item.id === group) ?? GROUPS[0];
  const selectedProtocol = availableProtocols.find((item) => item.id === protocol) ?? availableProtocols[0];

  const selectGroup = (next: AccessGroup) => {
    setGroup(next);
    setSelectedId(next === 'frameworks' ? FRAMEWORKS[0].id : CUSTOM_METHODS[0].id);
    setProtocol(next === 'frameworks' ? 'otel' : 'manual');
    setLanguage(next === 'frameworks' ? FRAMEWORKS[0].languages[0] : CUSTOM_METHODS[0].languages[0]);
    setQuery('');
    setGroupMenuOpen(false);
  };

  const selectItem = (item: AccessItem) => {
    setSelectedId(item.id);
    setLanguage(item.languages[0]);
    setProtocol(item.group === 'frameworks' ? 'otel' : item.id === 'probe-extension' ? 'probe' : 'manual');
  };

  return <div className="access-center-page">
    <label className="ac-global-search">
      <Search size={18} />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Agent 框架 / 编程语言 / 接入方法" aria-label="搜索接入项" />
    </label>

    <div className="ac-catalog-row">
      <div className="ac-group-select-wrap">
        <button type="button" className="ac-group-select" aria-expanded={groupMenuOpen} onClick={() => setGroupMenuOpen((current) => !current)}>
          <span>{activeGroup.label}</span><b>{activeGroup.count}</b><ChevronDown size={15} />
        </button>
        {groupMenuOpen && <div className="ac-group-menu">
          {GROUPS.map((item) => <button type="button" key={item.id} className={group === item.id ? 'is-active' : ''} onClick={() => selectGroup(item.id)}><span>{item.label}</span><b>{item.count}</b>{group === item.id && <Check size={14} />}</button>)}
        </div>}
      </div>
      <div className="ac-item-strip" role="tablist" aria-label={activeGroup.label}>
        {filteredItems.map((item) => <button type="button" role="tab" key={item.id} aria-selected={selected.id === item.id} className={selected.id === item.id ? 'is-active' : ''} onClick={() => selectItem(item)}>
          <ItemIcon item={item} />
          <span>{item.name}</span>
        </button>)}
      </div>
    </div>

    {filteredItems.length === 0 ? <EmptyState query={query} /> : <section className="ac-config-shell">
      <aside className="ac-filter-rail">
        <section>
          <h3>接入协议</h3>
          <div className="ac-radio-list">{availableProtocols.map((item) => <label key={item.id}><input type="radio" name="protocol" checked={protocol === item.id} onChange={() => setProtocol(item.id)} /><span><strong>{item.label}</strong><small>{item.note}</small></span></label>)}</div>
        </section>
        <section>
          <h3>开发语言</h3>
          <div className="ac-language-row">{selected.languages.map((item) => <button type="button" key={item} className={language === item ? 'is-active' : ''} onClick={() => setLanguage(item)}>{item}</button>)}</div>
        </section>
        <section>
          <h3>接入范围</h3>
          <div className="ac-scope-list">
            <span><Check size={13} />Agent 运行</span>
            <span><Check size={13} />模型与工具</span>
            <span><Check size={13} />最终输出</span>
          </div>
        </section>
      </aside>

      <article className="ac-detail">
        <header className="ac-detail-head">
          <div className="ac-detail-title">
            <ItemIcon item={selected} />
            <div><span className="ac-eyebrow">{group === 'frameworks' ? 'FRAMEWORK ONBOARDING' : 'CUSTOM AGENT ONBOARDING'}</span><h2>{selected.name}</h2></div>
          </div>
        </header>

        <div className="ac-choice-summary">
          <div><span>当前方式</span><strong>{selectedProtocol.label}</strong></div>
          <div><span>开发语言</span><strong>{language}</strong></div>
          <div><span>轨迹覆盖</span><strong>{selected.coverage.length} 类语义节点</strong></div>
        </div>

        <section className="ac-thought-section">
          <div className="ac-section-heading"><span>01</span><div><h3>我们如何接入</h3></div></div>
          <div className="ac-thought-block">{selected.thought.map((item) => <div key={item}><GitBranch size={14} /><span>{item}</span></div>)}</div>
        </section>

        <section className="ac-thought-section">
          <div className="ac-section-heading"><span>02</span><div><h3>最小采集范围</h3><p>先保证能还原一次 Agent 任务，再补充业务自定义字段。</p></div></div>
          <div className="ac-coverage-chips">{selected.coverage.map((item) => <span key={item}><Check size={12} />{item}</span>)}</div>
        </section>

        <section className="ac-thought-section">
          <div className="ac-section-heading"><span>03</span><div><h3>接入后得到什么</h3><p>观测数据直接进入平台存储，并作为后续评测和实验的数据源。</p></div></div>
          <div className="ac-outcome-grid">
            <div><Bot size={16} /><strong>可追溯轨迹</strong><small>查看 Agent、模型、工具和输出之间的执行关系。</small></div>
            <div><ShieldCheck size={16} /><strong>可执行评测</strong><small>按真实字段和节点运行评估器，缺失数据保持未采集。</small></div>
            <div><Sparkles size={16} /><strong>可持续实验</strong><small>把线上轨迹转为评测集，支持 Badcase 和版本对比。</small></div>
          </div>
        </section>

        <section className="ac-boundary-note">
          <CircleAlert size={15} />
          <div><strong>当前边界</strong>{selected.boundaries.map((item) => <p key={item}>{item}</p>)}</div>
        </section>
      </article>
    </section>}
  </div>;
}

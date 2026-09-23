import { useMemo, useState } from 'react';
import { Activity, Box, Bot, CheckCircle2, ChevronRight, CircleAlert, Eye, Play, Plus, Search, X } from 'lucide-react';
import type { AgentOption } from '../evaluation/evaluation.types';
import './application-registry.css';

type ApplicationMetric = {
  recentTraces: number;
  evaluationTasks: number;
  lastSync: string;
};

const metrics: Record<string, ApplicationMetric> = {
  'agent-refund': { recentTraces: 1284, evaluationTasks: 18, lastSync: '3 分钟前' },
  'agent-tender': { recentTraces: 326, evaluationTasks: 7, lastSync: '18 分钟前' },
  'agent-research': { recentTraces: 642, evaluationTasks: 11, lastSync: '1 小时前' },
  'agent-external-service': { recentTraces: 218, evaluationTasks: 4, lastSync: '12 分钟前' },
};

export default function ApplicationRegistryPage({
  agents,
  onOpenObservability,
  onStartEvaluation,
  onNotify,
}: {
  agents: AgentOption[];
  onOpenObservability: () => void;
  onStartEvaluation: (agentId: string) => void;
  onNotify: (message: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'全部' | '万智' | '外部'>('全部');
  const [registrationOpen, setRegistrationOpen] = useState(false);

  const visibleAgents = useMemo(() => agents.filter((agent) => {
    const queryHit = !query.trim() || `${agent.name} ${agent.description}`.toLowerCase().includes(query.trim().toLowerCase());
    const sourceHit = sourceFilter === '全部' || agent.source === sourceFilter;
    return queryHit && sourceHit;
  }), [agents, query, sourceFilter]);

  return <div className="app-registry-page">
    <header className="app-registry-hero">
      <div>
        <span className="eval-eyebrow">AGENT REGISTRY</span>
        <h2>已注册应用</h2>
        <p>这些 Agent 已接入平台，可查看运行观测并作为评测对象。注册只建立数据关联，不接管 Agent 调用或发布。</p>
      </div>
      <button type="button" className="eval-button eval-button--primary" onClick={() => setRegistrationOpen(true)}><Plus size={16} />注册应用</button>
    </header>

    <section className="app-registry-summary" aria-label="注册应用概览">
      <div><span>已注册</span><strong>{agents.length}</strong><small>个 Agent 应用</small></div>
      <div><span>可观测</span><strong>{agents.length}</strong><small>Trace 已连接</small></div>
      <div><span>可评测</span><strong>{agents.length}</strong><small>可选择为评测对象</small></div>
      <p><CheckCircle2 size={15} />Mock 数据仅用于验证信息结构和跳转关系。</p>
    </section>

    <div className="eval-toolbar app-registry-toolbar">
      <label className="eval-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索应用名称或描述" /></label>
      <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as typeof sourceFilter)} aria-label="应用来源">
        <option>全部</option>
        <option>万智</option>
        <option>外部</option>
      </select>
      <span className="eval-toolbar-count">{visibleAgents.length} 个结果</span>
    </div>

    <section className="app-registry-grid">
      {visibleAgents.map((agent, index) => {
        const metric = metrics[agent.id] ?? { recentTraces: 0, evaluationTasks: 0, lastSync: '未同步' };
        return <article className="app-registry-card" key={agent.id}>
          <header>
            <div className={`app-registry-mark tone-${index % 4}`}><Bot size={19} /></div>
            <div className="app-registry-title">
              <div><strong>{agent.name}</strong><span>{agent.versions[0]}</span></div>
              <small>{agent.id}</small>
            </div>
            <span className={`app-registry-source${agent.source === '外部' ? ' is-external' : ''}`}>{agent.source === '外部' ? '外部 Agent' : '万智'}</span>
          </header>
          <p>{agent.description}</p>
          <div className="app-registry-capabilities">
            <span><Eye size={13} />可观测</span>
            <span><Play size={13} />可评测</span>
            <span><Activity size={13} />{agent.protocol}</span>
          </div>
          <dl className="app-registry-stats">
            <div><dt>近 30 天 Trace</dt><dd>{metric.recentTraces.toLocaleString()}</dd></div>
            <div><dt>评测任务</dt><dd>{metric.evaluationTasks}</dd></div>
            <div><dt>最近同步</dt><dd>{metric.lastSync}</dd></div>
          </dl>
          <footer>
            <span><i />Trace 已连接</span>
            <div>
              <button type="button" className="eval-button eval-button--ghost" onClick={onOpenObservability}>查看观测</button>
              <button type="button" className="eval-button eval-button--primary" onClick={() => onStartEvaluation(agent.id)}>发起评测<ChevronRight size={14} /></button>
            </div>
          </footer>
        </article>;
      })}
      {visibleAgents.length === 0 && <div className="app-registry-empty"><Box size={20} /><strong>没有匹配的应用</strong><span>调整搜索词或应用来源。</span></div>}
    </section>

    {registrationOpen && <div className="app-registry-modal-backdrop" role="presentation" onMouseDown={() => setRegistrationOpen(false)}>
      <section className="app-registry-modal" role="dialog" aria-modal="true" aria-labelledby="registration-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="eval-eyebrow">NEW APPLICATION</span><h3 id="registration-title">注册应用</h3></div><button type="button" className="eval-icon-button" aria-label="关闭注册弹窗" onClick={() => setRegistrationOpen(false)}><X size={16} /></button></header>
        <div className="app-registry-form">
          <label><span>应用名称</span><input placeholder="例如：售后服务助手" /></label>
          <label><span>Agent ID</span><input placeholder="用于关联 Trace 和评测对象" /></label>
          <label><span>应用来源</span><select defaultValue="外部"><option>万智</option><option>外部</option></select></label>
          <label><span>Trace 接入方式</span><select defaultValue="Langfuse"><option>Trace 回流</option><option>Langfuse</option><option>A2A</option></select></label>
        </div>
        <div className="app-registry-modal-note"><CircleAlert size={15} /><span>注册后可用于观测和评测。平台只读取运行数据，不需要 Agent 调用或发布权限。</span></div>
        <footer><button type="button" className="eval-button eval-button--ghost" onClick={() => setRegistrationOpen(false)}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={() => { setRegistrationOpen(false); onNotify('注册信息已保存，当前为 Mock 数据'); }}>保存注册信息</button></footer>
      </section>
    </div>}
  </div>;
}

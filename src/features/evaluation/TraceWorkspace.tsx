import { useMemo, useState } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import type { ObservedSession, ObservedTrace, TraceEvent } from './trace.types';

export type ObservationView = 'trace' | 'session';

const toolLine = (event: Extract<TraceEvent, { kind: 'tool' }>) => {
  const input = event.input || '无输入';
  const output = event.output || '无输出';
  return `{${input} → ${output}}`;
};

const formatJson = (value: unknown) => {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};

const formatNumber = (value: number | null) => value === null ? '未采集' : value.toLocaleString('en-US');

const formatValue = (value: string | number | boolean | null | undefined) => {
  if (value === null || value === undefined || value === '') return '未采集';
  if (typeof value === 'boolean') return value ? '异常' : '正常';
  return String(value);
};

const formatTime = (value: string | null) => {
  if (!value) return '未采集';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
};

const FILTER_NOW = Date.parse('2026-09-22T16:00:00+08:00');

type TraceListProps = {
  traces: ObservedTrace[];
  sessions: ObservedSession[];
  view: ObservationView;
  onViewChange: (view: ObservationView) => void;
  search: string;
  setSearch: (value: string) => void;
  onOpenTrace: (trace: ObservedTrace) => void;
  onOpenSession: (session: ObservedSession) => void;
};

export function TraceList({ traces, sessions, view, onViewChange, search, setSearch, onOpenTrace, onOpenSession }: TraceListProps) {
  const [agentFilter, setAgentFilter] = useState('全部');
  const [abnormalFilter, setAbnormalFilter] = useState('全部');
  const [timeFilter, setTimeFilter] = useState('全部');
  const agents = useMemo(() => ['全部', ...[...new Set(traces.map((trace) => trace.agent ?? '未采集'))]], [traces]);

  const matchesFilters = (item: { agent: string | null; abnormal: boolean | null; occurredAt: string | null }) => {
    const agentLabel = item.agent ?? '未采集';
    if (agentFilter !== '全部' && agentLabel !== agentFilter) return false;
    if (abnormalFilter === '异常' && !item.abnormal) return false;
    if (abnormalFilter === '正常' && item.abnormal) return false;
    if (timeFilter !== '全部') {
      if (!item.occurredAt) return false;
      const start = FILTER_NOW - Number(timeFilter) * 24 * 60 * 60 * 1000;
      if (new Date(item.occurredAt).getTime() < start) return false;
    }
    return true;
  };

  const filteredTraces = traces.filter((trace) => {
    const haystack = `${trace.traceId ?? ''} ${trace.agent ?? ''} ${trace.input} ${trace.output}`.toLowerCase();
    return (!search || haystack.includes(search.toLowerCase())) && matchesFilters({ agent: trace.agent, abnormal: trace.abnormal, occurredAt: trace.occurredAt });
  });

  const filteredSessions = sessions.filter((session) => {
    const haystack = `${session.id} ${session.agent ?? ''} ${session.turns.map((turn) => `${turn.traceId ?? ''} ${turn.input} ${turn.output}`).join(' ')}`.toLowerCase();
    return (!search || haystack.includes(search.toLowerCase())) && matchesFilters({ agent: session.agent, abnormal: session.abnormal, occurredAt: session.startedAt });
  });

  const switchView = (next: ObservationView) => {
    if (next === view) return;
    setSearch('');
    onViewChange(next);
  };

  return <div className="eval-list-page eval-trace-page">
    <div className="eval-section-head"><div><span className="eval-eyebrow">OBSERVATION</span><h2>{view === 'trace' ? 'Trace' : 'Session'}</h2></div></div>
    <div className="eval-toolbar eval-obs-toolbar">
      <div className="eval-view-switch">
        <span>视图</span>
        <div className="eval-view-switch__control" role="group" aria-label="观测视图">
          <button type="button" className={view === 'trace' ? 'is-active' : ''} aria-pressed={view === 'trace'} onClick={() => switchView('trace')}>Trace</button>
          <button type="button" className={view === 'session' ? 'is-active' : ''} aria-pressed={view === 'session'} onClick={() => switchView('session')}>Session</button>
        </div>
      </div>
      <label className="eval-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={view === 'trace' ? '搜索 Trace ID、Agent 或输入' : '搜索 Session ID、Agent 或输入'} /></label>
      <select aria-label="时间筛选" value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)}><option value="全部">全部时间</option><option value="1">近 1 天</option><option value="7">近 7 天</option><option value="30">近 30 天</option></select>
      <select aria-label="Agent 筛选" value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}>{agents.map((agent) => <option key={agent} value={agent}>{agent === '全部' ? '全部 Agent' : agent}</option>)}</select>
      <select aria-label="是否异常筛选" value={abnormalFilter} onChange={(event) => setAbnormalFilter(event.target.value)}><option>全部</option><option>正常</option><option>异常</option></select>
      <span className="eval-toolbar-count">{view === 'trace' ? filteredTraces.length : filteredSessions.length} 条</span>
    </div>

    {view === 'trace' && <section className="eval-surface table-surface eval-obs-table-wrap" aria-label="Trace 列表">
      <table className="eval-data-table eval-obs-table">
        <thead><tr><th>Trace ID</th><th>Agent</th><th>Input</th><th>Output</th><th>耗时</th><th>Feedback</th><th>Input Tokens</th><th>Output Tokens</th></tr></thead>
        <tbody>{filteredTraces.map((trace) => <tr key={trace.id} role="button" tabIndex={0} aria-label={`查看 Trace ${trace.traceId ?? trace.id}`} onClick={() => onOpenTrace(trace)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenTrace(trace); } }}>
          <td><div className="eval-cell-title"><strong className="eval-mono">{trace.traceId ?? trace.id}</strong><small>{formatTime(trace.occurredAt)}</small></div></td>
          <td>{formatValue(trace.agent)}</td>
          <td className="is-clip" title={trace.input}>{trace.input || '未采集'}</td>
          <td className="is-clip" title={trace.output}>{trace.output || '未采集'}</td>
          <td>{formatValue(trace.duration)}</td>
          <td>{formatValue(trace.feedback)}</td>
          <td>{formatNumber(trace.inputTokens)}</td>
          <td>{formatNumber(trace.outputTokens)}</td>
        </tr>)}</tbody>
      </table>
    </section>}

    {view === 'session' && <section className="eval-surface table-surface eval-obs-table-wrap" aria-label="Session 列表">
      <table className="eval-data-table eval-obs-table eval-session-table">
        <thead><tr><th>Session ID</th><th>Agent</th><th>开始时间</th><th>Traces</th><th>Input</th><th>Output</th><th>Feedback</th><th>Input Tokens</th><th>Output Tokens</th></tr></thead>
        <tbody>{filteredSessions.map((session) => <tr key={session.id} role="button" tabIndex={0} aria-label={`查看 Session ${session.id}`} onClick={() => onOpenSession(session)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenSession(session); } }}>
          <td><div className="eval-cell-title"><strong className="eval-mono">{session.id}</strong><small>{session.turns.length} 轮对话</small></div></td>
          <td>{formatValue(session.agent)}</td>
          <td>{formatTime(session.startedAt)}</td>
          <td>{session.turns.length}</td>
          <td className="is-clip" title={session.turns[0]?.input}>{session.turns[0]?.input || '未采集'}</td>
          <td className="is-clip" title={session.turns.at(-1)?.output}>{session.turns.at(-1)?.output || '未采集'}</td>
          <td>{formatValue(session.feedback)}</td>
          <td>{formatNumber(session.inputTokens)}</td>
          <td>{formatNumber(session.outputTokens)}</td>
        </tr>)}</tbody>
      </table>
    </section>}

    {(view === 'trace' ? filteredTraces : filteredSessions).length === 0 && <p className="eval-trace-note">没有匹配的 {view === 'trace' ? 'Trace' : 'Session'}。</p>}
  </div>;
}

export function TraceDetail({ trace, onBack }: { trace: ObservedTrace; onBack: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(trace.events[0]?.id ?? null);
  const selected = trace.events.find((event) => event.id === selectedId);

  return <div className="eval-detail-page eval-trace-detail-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回 Trace</button></div>
    <header className="eval-trace-detail-head">
      <div><span className="eval-eyebrow">TRACE · TURN {trace.turn}</span><h2>{trace.traceId ?? trace.id}</h2></div>
      <span className="eval-trace-source">{trace.sourceFile}</span>
    </header>
    {trace.compressed && <p className="eval-trace-note">首条为会话摘要，前序消息未完整提供。</p>}
    <div className="eval-trace-split">
      <section className="eval-dsh-ledger" aria-label="执行轨迹">
        <div className="eval-dsh-turn">Turn {trace.turn}</div>
        <div className="eval-dsh-stream">
          {trace.events.map((event) => <EventRow key={event.id} event={event} selectionId={event.id} active={event.id === selectedId} onSelect={setSelectedId} />)}
        </div>
      </section>
      <aside className="eval-trace-inspector" aria-label="节点详情">
        {selected ? <Inspector event={selected} turn={trace.turn} context={trace.context} traceId={trace.traceId} onClose={() => setSelectedId(null)} /> : <div className="eval-trace-inspector__empty">点击左侧一行查看该节点详情。</div>}
      </aside>
    </div>
  </div>;
}

type SessionEvent = { key: string; trace: ObservedTrace; event: TraceEvent };

export function SessionDetail({ session, onBack }: { session: ObservedSession; onBack: () => void }) {
  const sessionEvents = useMemo<SessionEvent[]>(() => session.turns.flatMap((trace) => trace.events.map((event) => ({ key: `${trace.id}:${event.id}`, trace, event }))), [session]);
  const [selectedKey, setSelectedKey] = useState<string | null>(sessionEvents[0]?.key ?? null);
  const selected = sessionEvents.find((item) => item.key === selectedKey);
  const eventCount = sessionEvents.length;

  return <div className="eval-detail-page eval-trace-detail-page eval-session-detail-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回 Session</button></div>
    <header className="eval-trace-detail-head">
      <div><span className="eval-eyebrow">SESSION</span><h2>{session.id}</h2></div>
      <span className="eval-trace-source">{formatTime(session.startedAt)}</span>
    </header>
    <div className="eval-session-metrics" aria-label="会话汇总">
      <div><span>对话轮次</span><strong>{session.turns.length}</strong></div>
      <div><span>执行节点</span><strong>{eventCount}</strong></div>
      <div><span>Input Tokens</span><strong>{formatNumber(session.inputTokens)}</strong></div>
      <div><span>Output Tokens</span><strong>{formatNumber(session.outputTokens)}</strong></div>
    </div>
    <div className="eval-trace-split">
      <section className="eval-session-ledger" aria-label="会话执行轨迹">
        {session.turns.map((trace) => <article className="eval-session-turn" key={trace.id} aria-label={`Turn ${trace.turn}`}>
          <header className="eval-session-turn__head">
            <strong>Turn {trace.turn}</strong>
            <div><span className="eval-mono">{trace.traceId ?? trace.id}</span><small>{formatTime(trace.occurredAt)} · {trace.events.length} 个节点</small></div>
          </header>
          <div className="eval-session-events">
            {trace.events.map((event) => {
              const key = `${trace.id}:${event.id}`;
              return <EventRow key={key} event={event} selectionId={key} active={key === selectedKey} onSelect={setSelectedKey} />;
            })}
          </div>
        </article>)}
      </section>
      <aside className="eval-trace-inspector" aria-label="节点详情">
        {selected ? <Inspector event={selected.event} turn={selected.trace.turn} context={selected.trace.context} traceId={selected.trace.traceId} onClose={() => setSelectedKey(null)} /> : <div className="eval-trace-inspector__empty">点击左侧一行查看该节点详情。</div>}
      </aside>
    </div>
  </div>;
}

function EventRow({ event, selectionId, active, onSelect }: { event: TraceEvent; selectionId: string; active: boolean; onSelect: (id: string) => void }) {
  const className = event.kind === 'tool' ? 'eval-dsh-row eval-dsh-row--tool' : 'eval-dsh-row';
  return <button type="button" className={`${className}${active ? ' is-active' : ''}`} aria-pressed={active} onClick={() => onSelect(selectionId)}>
    {event.kind === 'user' && <><span className="eval-dsh-tag eval-dsh-tag--user">USER</span><p>{event.text}</p></>}
    {event.kind === 'assistant' && <><span className="eval-dsh-tag eval-dsh-tag--assistant">ASSISTANT</span><p>{event.text || (event.isFinal ? '无最终回复' : '无思考内容')}</p></>}
    {event.kind === 'tool' && <><span className="eval-dsh-tag eval-dsh-tag--tool">TOOL</span><strong>{event.name}</strong><span className="eval-dsh-io">{toolLine(event)}</span></>}
  </button>;
}

function Inspector({ event, turn, context, traceId, onClose }: { event: TraceEvent; turn: number; context: ObservedTrace['context']; traceId: string | null; onClose: () => void }) {
  const title = event.kind === 'user' ? 'USER' : event.kind === 'assistant' ? 'ASSISTANT' : 'TOOL';
  const subtitle = event.kind === 'tool' ? event.name : event.kind === 'assistant' && event.isFinal ? `Turn ${turn} · 最终回复` : `Turn ${turn}`;
  return <section className="eval-inspector">
    <header className={`eval-inspector__head eval-inspector__head--${event.kind}`}>
      <div><span>{title}</span><strong>{subtitle}</strong></div>
      <button type="button" className="eval-icon-button" aria-label="关闭详情" onClick={onClose}><X size={16} /></button>
    </header>
    {event.kind === 'user' && <>
      <Meta rows={[['Trace ID', traceId ?? '未采集'], ['来源', '用户输入'], ['消息 ID', event.messageId ?? '未采集']]} />
      <Block title="完整输入">{event.text || '空'}</Block>
      <Block title="上下文（message.content）" code>{formatContext(context)}</Block>
    </>}
    {event.kind === 'assistant' && <>
      <Meta rows={[
        ['Trace ID', traceId ?? '未采集'],
        ['来源', event.isFinal ? '最终回复' : '思考过程'],
        ['状态', event.finishReason ?? '未采集'],
        ['模型', event.model ?? '未采集'],
        ['提供方', event.provider ?? '未采集'],
        ['Input Tokens', formatNumber(event.inputTokens)],
        ['Output Tokens', formatNumber(event.outputTokens)],
        ['Total Tokens', formatNumber(event.totalTokens)],
        ['Cache Read', formatNumber(event.cacheReadTokens)],
        ['Reasoning Tokens', formatNumber(event.reasoningTokens)],
      ]} />
      <Block title="思考过程">{event.reasoning || '未采集'}</Block>
      {event.content ? <Block title="可见回复">{event.content}</Block> : null}
      {event.toolNames.length > 0 ? <Block title="本步工具">{event.toolNames.join('、')}</Block> : null}
    </>}
    {event.kind === 'tool' && <>
      <Meta rows={[
        ['Trace ID', traceId ?? '未采集'],
        ['工具名', event.name],
        ['状态', event.status ?? '未采集'],
        ['调用 ID', event.id],
        ['结果关联', event.linked ? '已通过 tool_call_id 关联' : '未关联'],
        ['调用目的', event.brief || '未采集'],
      ]} />
      <Block title="输入参数" code>{event.args ? formatJson(event.args) : (event.input || '未采集')}</Block>
      <Block title="返回结果" code>{event.result || event.output || '未采集'}</Block>
    </>}
  </section>;
}

function formatContext(context: ObservedTrace['context']) {
  if (context.kind === 'none') return '无前置上下文';
  return context.messages.map((message, index) => {
    const label = message.name ? `${message.type} · ${message.name}` : message.type;
    return `消息 ${index + 1} · ${label}\n${message.content || '空'}`;
  }).join('\n\n');
}

function Meta({ rows }: { rows: [string, string][] }) {
  return <dl className="eval-inspector__meta">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function Block({ title, children, code = false }: { title: string; children: string; code?: boolean }) {
  return <div className="eval-inspector__block"><span>{title}</span>{code ? <pre>{children}</pre> : <p>{children}</p>}</div>;
}

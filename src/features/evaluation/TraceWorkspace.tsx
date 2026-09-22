import { useMemo, useState } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import type { ObservedTrace, TraceEvent } from './trace.types';

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

export function TraceList({ traces, search, setSearch, onOpen }: { traces: ObservedTrace[]; search: string; setSearch: (value: string) => void; onOpen: (trace: ObservedTrace) => void }) {
  const [agentFilter, setAgentFilter] = useState('全部');
  const [abnormalFilter, setAbnormalFilter] = useState('全部');
  const [timeFilter, setTimeFilter] = useState('全部');
  const agents = useMemo(() => ['全部', ...[...new Set(traces.map((trace) => trace.agent ?? '未采集'))]], [traces]);
  const filtered = traces.filter((trace) => {
    const haystack = `${trace.traceId ?? ''} ${trace.agent ?? ''} ${trace.input} ${trace.output}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    const agentLabel = trace.agent ?? '未采集';
    if (agentFilter !== '全部' && agentLabel !== agentFilter) return false;
    if (abnormalFilter === '异常' && !trace.abnormal) return false;
    if (abnormalFilter === '正常' && trace.abnormal) return false;
    if (timeFilter !== '全部') {
      if (!trace.occurredAt) return false;
      const start = FILTER_NOW - Number(timeFilter) * 24 * 60 * 60 * 1000;
      if (new Date(trace.occurredAt).getTime() < start) return false;
    }
    return true;
  });
  return <div className="eval-list-page eval-trace-page">
    <div className="eval-section-head"><div><span className="eval-eyebrow">OBSERVATION</span><h2>Trace</h2></div></div>
    <div className="eval-toolbar eval-obs-toolbar">
      <label className="eval-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 Trace ID、Agent 或输入" /></label>
      <select aria-label="时间筛选" value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)}><option value="全部">全部时间</option><option value="1">近 1 天</option><option value="7">近 7 天</option><option value="30">近 30 天</option></select>
      <select aria-label="Agent 筛选" value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}>{agents.map((agent) => <option key={agent} value={agent}>{agent === '全部' ? '全部 Agent' : agent}</option>)}</select>
      <select aria-label="是否异常筛选" value={abnormalFilter} onChange={(event) => setAbnormalFilter(event.target.value)}><option>全部</option><option>正常</option><option>异常</option></select>
      <span className="eval-toolbar-count">{filtered.length} 条</span>
    </div>
    <section className="eval-surface table-surface eval-obs-table-wrap" aria-label="Trace 列表">
      <table className="eval-data-table eval-obs-table">
        <thead><tr><th>Trace ID</th><th>Agent</th><th>Input</th><th>Output</th><th>耗时</th><th>Feedback</th><th>Input Tokens</th><th>Output Tokens</th></tr></thead>
        <tbody>{filtered.map((trace) => <tr key={trace.id} onClick={() => onOpen(trace)}>
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
    </section>
    {filtered.length === 0 && <p className="eval-trace-note">没有匹配的 Trace。</p>}
  </div>;
}

export function TraceDetail({ trace, onBack }: { trace: ObservedTrace; onBack: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(trace.events[0]?.id ?? null);
  const selected = trace.events.find((event) => event.id === selectedId) ?? null;
  return <div className="eval-detail-page eval-trace-detail-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回 Trace</button><span className="eval-trace-source">{trace.sourceFile}</span></div>
    <header className="eval-trace-detail-head"><div><span className="eval-eyebrow">TRACE DETAIL</span><h2>{trace.traceId ?? trace.id}</h2></div></header>
    {trace.compressed && <p className="eval-trace-note">本文件首条为会话摘要，前序消息未完整提供。</p>}
    <div className="eval-trace-split">
      <section className="eval-dsh-ledger" aria-label="执行轨迹">
        <div className="eval-dsh-turn">Turn {trace.turn}</div>
        <div className="eval-dsh-stream">
          {trace.events.map((event) => {
            const active = event.id === selectedId;
            if (event.kind === 'user') return <button type="button" className={`eval-dsh-row${active ? ' is-active' : ''}`} key={event.id} onClick={() => setSelectedId(event.id)}><span className="eval-dsh-tag eval-dsh-tag--user">USER</span><p>{event.text}</p></button>;
            if (event.kind === 'assistant') return <button type="button" className={`eval-dsh-row${active ? ' is-active' : ''}`} key={event.id} onClick={() => setSelectedId(event.id)}><span className="eval-dsh-tag eval-dsh-tag--assistant">ASSISTANT</span><p>{event.text || (event.isFinal ? '无最终回复' : '无思考内容')}</p></button>;
            return <button type="button" className={`eval-dsh-row eval-dsh-row--tool${active ? ' is-active' : ''}`} key={event.id} onClick={() => setSelectedId(event.id)}><span className="eval-dsh-tag eval-dsh-tag--tool">TOOL</span><strong>{event.name}</strong><span className="eval-dsh-io">{toolLine(event)}</span></button>;
          })}
        </div>
      </section>
      <aside className="eval-trace-inspector" aria-label="节点详情">
        {selected ? <Inspector event={selected} turn={trace.turn} context={trace.context} onClose={() => setSelectedId(null)} /> : <div className="eval-trace-inspector__empty">点击左侧一行查看该节点详情。</div>}
      </aside>
    </div>
  </div>;
}

function Inspector({ event, turn, context, onClose }: { event: TraceEvent; turn: number; context: ObservedTrace['context']; onClose: () => void }) {
  const title = event.kind === 'user' ? 'USER' : event.kind === 'assistant' ? 'ASSISTANT' : 'TOOL';
  const subtitle = event.kind === 'tool' ? event.name : event.kind === 'assistant' && event.isFinal ? `Turn ${turn} · 最终回复` : `Turn ${turn}`;
  return <section className="eval-inspector">
    <header className={`eval-inspector__head eval-inspector__head--${event.kind}`}>
      <div><span>{title}</span><strong>{subtitle}</strong></div>
      <button type="button" className="eval-icon-button" aria-label="关闭详情" onClick={onClose}><X size={16} /></button>
    </header>
    {event.kind === 'user' && <>
      <Meta rows={[['来源', '用户输入'], ['消息 ID', event.messageId ?? '未采集']]} />
      <Block title="完整输入">{event.text || '空'}</Block>
      <Block title="上下文（message.content）" code>{formatContext(context)}</Block>
    </>}
    {event.kind === 'assistant' && <>
      <Meta rows={[
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
      {event.reasoning ? <Block title="思考过程">{event.reasoning}</Block> : <Block title="思考过程">未采集</Block>}
      {event.content ? <Block title="可见回复">{event.content}</Block> : null}
      {event.toolNames.length > 0 ? <Block title="本步工具">{event.toolNames.join('、')}</Block> : null}
    </>}
    {event.kind === 'tool' && <>
      <Meta rows={[
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

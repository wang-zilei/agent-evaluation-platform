import { useState } from 'react';
import { ArrowLeft, ChevronRight, Search, X } from 'lucide-react';
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

export function TraceList({ traces, search, setSearch, onOpen }: { traces: ObservedTrace[]; search: string; setSearch: (value: string) => void; onOpen: (trace: ObservedTrace) => void }) {
  const filtered = traces.filter((trace) => `${trace.id} ${trace.traceId ?? ''} ${trace.agent ?? ''} ${trace.input} ${trace.sourceFile}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="eval-list-page eval-trace-page">
    <div className="eval-section-head"><div><span className="eval-eyebrow">OBSERVATION / TRACE</span><h2>Trace</h2><p>查看已上报的 Agent 运行轨迹。当前原型展示三条真实 Trace。</p></div></div>
    <div className="eval-trace-toolbar"><label className="eval-search"><Search size={15} /><input value={search} placeholder="搜索 Trace ID、Agent 或输入" onChange={(event) => setSearch(event.target.value)} /></label><span>{filtered.length} 条 Trace</span></div>
    <section className="eval-trace-list" aria-label="Trace 列表">{filtered.map((trace) => <button type="button" className="eval-trace-row" key={trace.id} onClick={() => onOpen(trace)}><div className="eval-trace-row__main"><div><strong>{trace.traceId ?? trace.id}</strong><span>{trace.input}</span><small>{trace.agent ?? 'Agent 名称未采集'} · {trace.sourceFile}</small></div></div><div className="eval-trace-row__stats"><div><span>当前消息</span><strong>{trace.currentMessageCount}</strong></div><div><span>Tool</span><strong>{trace.toolCount}</strong></div><div><span>耗时</span><strong>未采集</strong></div></div><ChevronRight className="eval-trace-row__arrow" size={17} /></button>)}</section>
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
        {selected ? <Inspector event={selected} turn={trace.turn} onClose={() => setSelectedId(null)} /> : <div className="eval-trace-inspector__empty">点击左侧一行查看该节点详情。</div>}
      </aside>
    </div>
  </div>;
}

function Inspector({ event, turn, onClose }: { event: TraceEvent; turn: number; onClose: () => void }) {
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

function Meta({ rows }: { rows: [string, string][] }) {
  return <dl className="eval-inspector__meta">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function Block({ title, children, code = false }: { title: string; children: string; code?: boolean }) {
  return <div className="eval-inspector__block"><span>{title}</span>{code ? <pre>{children}</pre> : <p>{children}</p>}</div>;
}

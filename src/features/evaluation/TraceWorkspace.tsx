import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import type { ObservedTrace, TraceEvent } from './trace.types';

const toolLine = (event: Extract<TraceEvent, { kind: 'tool' }>) => {
  const input = event.input || '无输入';
  const output = event.output || '无输出';
  return `{${input} → ${output}}`;
};

export function TraceList({ traces, search, setSearch, onOpen }: { traces: ObservedTrace[]; search: string; setSearch: (value: string) => void; onOpen: (trace: ObservedTrace) => void }) {
  const filtered = traces.filter((trace) => `${trace.id} ${trace.traceId ?? ''} ${trace.agent ?? ''} ${trace.input} ${trace.sourceFile}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="eval-list-page eval-trace-page">
    <div className="eval-section-head"><div><span className="eval-eyebrow">OBSERVATION / TRACE</span><h2>Trace</h2><p>查看已上报的 Agent 运行轨迹。当前原型展示三条真实 Trace。</p></div></div>
    <div className="eval-trace-toolbar"><label className="eval-search"><Search size={15} /><input value={search} placeholder="搜索 Trace ID、Agent 或输入" onChange={(event) => setSearch(event.target.value)} /></label><span>{filtered.length} 条 Trace</span></div>
    <section className="eval-trace-list" aria-label="Trace 列表">{filtered.map((trace) => <button type="button" className="eval-trace-row" key={trace.id} onClick={() => onOpen(trace)}><div className="eval-trace-row__main"><div><strong>{trace.traceId ?? trace.id}</strong><span>{trace.input}</span><small>{trace.agent ?? 'Agent 名称未采集'} · {trace.sourceFile}</small></div></div><div className="eval-trace-row__stats"><div><span>当前消息</span><strong>{trace.currentMessageCount}</strong></div><div><span>Tool</span><strong>{trace.toolCount}</strong></div><div><span>耗时</span><strong>未采集</strong></div></div><ChevronRight className="eval-trace-row__arrow" size={17} /></button>)}</section>
  </div>;
}

export function TraceDetail({ trace, onBack }: { trace: ObservedTrace; onBack: () => void }) {
  return <div className="eval-detail-page eval-trace-detail-page">
    <div className="eval-page-topline"><button type="button" className="eval-back-button" onClick={onBack}><ArrowLeft size={15} />返回 Trace</button><span className="eval-trace-source">{trace.sourceFile}</span></div>
    <header className="eval-trace-detail-head"><div><span className="eval-eyebrow">TRACE DETAIL</span><h2>{trace.traceId ?? trace.id}</h2></div></header>
    {trace.compressed && <p className="eval-trace-note">本文件首条为会话摘要，前序消息未完整提供。</p>}
    <section className="eval-dsh-ledger" aria-label="执行轨迹">
      <div className="eval-dsh-turn">Turn {trace.turn}</div>
      <div className="eval-dsh-stream">
        {trace.events.map((event) => {
          if (event.kind === 'user') return <div className="eval-dsh-row" key={event.id}><span className="eval-dsh-tag eval-dsh-tag--user">USER</span><p>{event.text}</p></div>;
          if (event.kind === 'assistant') return <div className="eval-dsh-row" key={event.id}><span className="eval-dsh-tag eval-dsh-tag--assistant">ASSISTANT</span><p>{event.text || (event.isFinal ? '无最终回复' : '无思考内容')}</p></div>;
          return <div className="eval-dsh-row eval-dsh-row--tool" key={event.id}><span className="eval-dsh-tag eval-dsh-tag--tool">TOOL</span><strong>{event.name}</strong><span className="eval-dsh-io">{toolLine(event)}</span></div>;
        })}
      </div>
    </section>
  </div>;
}

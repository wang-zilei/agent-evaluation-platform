import { useState } from 'react';
import { CircleAlert, Plus, X } from 'lucide-react';
import './application-registry.css';

export default function ApplicationRegistryPage({ onNotify }: { onNotify: (message: string) => void }) {
  const [registrationOpen, setRegistrationOpen] = useState(false);

  return <div className="app-registry-page">
    <section className="app-registry-entry">
      <button type="button" className="app-registry-primary-action" onClick={() => setRegistrationOpen(true)}><Plus size={18} />注册应用</button>
      <p>用于注册非本平台托管的 AI Agent 或服务。注册后可查询观测数据，并作为评测对象；平台不接管 Agent 的调用、修改或发布。</p>
    </section>

    {registrationOpen && <div className="app-registry-modal-backdrop" role="presentation" onMouseDown={() => setRegistrationOpen(false)}>
      <section className="app-registry-modal" role="dialog" aria-modal="true" aria-labelledby="registration-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="eval-eyebrow">NEW APPLICATION</span><h3 id="registration-title">注册应用</h3></div><button type="button" className="eval-icon-button" aria-label="关闭注册弹窗" onClick={() => setRegistrationOpen(false)}><X size={16} /></button></header>
        <div className="app-registry-form">
          <label><span>应用名称</span><input placeholder="例如：售后服务助手" /></label>
          <label><span>Agent ID</span><input placeholder="用于关联观测数据和评测对象" /></label>
          <label><span>应用来源</span><select defaultValue="外部"><option>万智</option><option>外部</option></select></label>
          <label><span>Trace 接入方式</span><select defaultValue="Langfuse"><option>Trace 回流</option><option>Langfuse</option><option>A2A</option></select></label>
        </div>
        <div className="app-registry-modal-note"><CircleAlert size={15} /><span>注册后可用于观测和评测。平台只读取运行数据，不需要 Agent 调用或发布权限。</span></div>
        <footer><button type="button" className="eval-button eval-button--ghost" onClick={() => setRegistrationOpen(false)}>取消</button><button type="button" className="eval-button eval-button--primary" onClick={() => { setRegistrationOpen(false); onNotify('注册信息已保存，当前为 Mock 数据'); }}>保存注册信息</button></footer>
      </section>
    </div>}
  </div>;
}

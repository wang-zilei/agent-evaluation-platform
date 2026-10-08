import type { ReactNode } from 'react';
import { Layers3 } from 'lucide-react';
import { statusTone } from './evaluation.mock';
import type { FieldSemantic } from './evaluation.types';

export type Tone = 'neutral' | 'violet' | 'green' | 'amber';

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`eval-pill eval-pill--${tone}`}>{children}</span>;
}

export function Status({ label }: { label: string }) {
  return <span className={`eval-status eval-status--${statusTone(label)}`}><i />{label}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="eval-empty"><div className="eval-empty__mark"><Layers3 size={19} /></div><strong>{title}</strong><span>{description}</span>{action}</div>;
}

export function FieldBadge({ semantic, required }: { semantic: FieldSemantic; required?: boolean }) {
  return <Pill tone={semantic === 'Trace' ? 'violet' : semantic === 'Custom' ? 'amber' : 'neutral'}>{semantic}{required ? ' · 必选' : ''}</Pill>;
}

export function IconButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return <button type="button" className="eval-icon-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

import { Children, Fragment, isValidElement, type InputHTMLAttributes, type ReactNode } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp, Layers3, Search } from 'lucide-react';
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

type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> & {
  size?: 'default' | 'small';
};

export function SearchField({ className = '', size = 'default', ...props }: SearchFieldProps) {
  return <label className={`eval-search control-search${size === 'small' ? ' eval-search--small control-search--small' : ''}${className ? ` ${className}` : ''}`}>
    <Search size={size === 'small' ? 14 : 16} aria-hidden="true" />
    <input type="search" autoComplete="off" spellCheck={false} {...props} />
  </label>;
}

type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

type SelectElementProps = {
  value?: string | number;
  disabled?: boolean;
  children?: ReactNode;
};

type SelectFieldProps = {
  children: ReactNode;
  value: string;
  onChange?: (event: { target: { name?: string; value: string } }) => void;
  onValueChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  name?: string;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

const EMPTY_OPTION_VALUE = '__empty_option__';

function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

function collectOptions(children: ReactNode, options: SelectOption[]) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as SelectElementProps;
    if (child.type === Fragment) {
      collectOptions(props.children, options);
      return;
    }
    if (child.type !== 'option') return;
    const label = props.children ?? '';
    const value = props.value === undefined ? nodeText(label).trim() : String(props.value);
    options.push({ value, label, disabled: props.disabled });
  });
}

const toRadixValue = (value: string) => value === '' ? EMPTY_OPTION_VALUE : value;
const fromRadixValue = (value: string) => value === EMPTY_OPTION_VALUE ? '' : value;

export function SelectField({
  children,
  value,
  onChange,
  onValueChange,
  className = '',
  disabled,
  placeholder = '请选择',
  title,
  name,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}: SelectFieldProps) {
  const options: SelectOption[] = [];
  collectOptions(children, options);
  const isKnownValue = options.some((option) => option.value === value);

  return <Select.Root
    value={isKnownValue ? toRadixValue(value) : undefined}
    disabled={disabled}
    onValueChange={(nextValue) => {
      const next = fromRadixValue(nextValue);
      onValueChange?.(next);
      onChange?.({ target: { name, value: next } });
    }}
  >
    <Select.Trigger
      className={`eval-select-trigger${className ? ` ${className}` : ''}`}
      disabled={disabled}
      title={title}
      id={id}
      aria-label={ariaLabel ?? title}
      aria-labelledby={ariaLabelledby}
    >
      <span className="eval-select-trigger__value"><Select.Value placeholder={placeholder} /></span>
      <Select.Icon className="eval-select-trigger__icon"><ChevronDown size={14} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className="eval-select-content" position="popper" align="start" sideOffset={6} collisionPadding={10}>
        <Select.ScrollUpButton className="eval-select-scroll"><ChevronUp size={14} /></Select.ScrollUpButton>
        <Select.Viewport className="eval-select-viewport">
          {options.map((option) => {
            const internalValue = toRadixValue(option.value);
            return <Select.Item className="eval-select-item" key={`${internalValue}-${nodeText(option.label)}`} value={internalValue} disabled={option.disabled}>
              <Select.ItemIndicator className="eval-select-indicator"><Check size={14} /></Select.ItemIndicator>
              <Select.ItemText>{option.label}</Select.ItemText>
            </Select.Item>;
          })}
        </Select.Viewport>
        <Select.ScrollDownButton className="eval-select-scroll"><ChevronDown size={14} /></Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}

import { useId, useState, type Ref, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { LEVELS } from '../domain/constants';
import type { Level, Role } from '../domain/types';
import { useDb, useServices, useSettings } from '../state/app';
import { useFeedback } from './feedback';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className ?? ''}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="req" aria-hidden> *</span>}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  ref?: Ref<HTMLInputElement>;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  onValue: (v: string) => void;
};

export function TextInput({ label, hint, error, onValue, required, className, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id, d) => (
        <input id={id} className="input" aria-invalid={!!error} aria-describedby={d} aria-required={required} onChange={(e) => onValue(e.target.value)} {...rest} />
      )}
    </Field>
  );
}

type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  onValue: (v: string) => void;
};

export function TextArea({ label, hint, error, onValue, required, className, ...rest }: AreaProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id, d) => (
        <textarea id={id} className="input" rows={2} aria-invalid={!!error} aria-describedby={d} aria-required={required} onChange={(e) => onValue(e.target.value)} {...rest} />
      )}
    </Field>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  onValue: (v: string) => void;
  children: ReactNode;
};

export function SelectInput({ label, hint, error, onValue, required, className, children, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id, d) => (
        <select id={id} className="input" aria-invalid={!!error} aria-describedby={d} aria-required={required} onChange={(e) => onValue(e.target.value)} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}

/** Selector 1–3 accesible (radios nativos con estilo segmentado). */
export function LevelPicker({
  label,
  value,
  onChange,
  labels,
  name,
  compact,
  disabled,
}: {
  label: string;
  value: Level;
  onChange: (v: Level) => void;
  labels: Record<Level, string>;
  name?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className={`level-picker ${compact ? 'compact' : ''}`} disabled={disabled}>
      <legend className={compact ? 'sr-only' : 'field-label'}>{label}</legend>
      <div className="segmented" role="presentation">
        {LEVELS.map((l) => (
          <label key={l} className={`seg ${value === l ? 'on' : ''}`} data-tip={compact ? `${label}: ${l} · ${labels[l]}` : undefined}>
            <input type="radio" name={name ?? id} value={l} checked={value === l} onChange={() => onChange(l)} aria-label={`${label} ${l}: ${labels[l]}`} />
            <span className="seg-num">{l}</span>
            {!compact && <span className="seg-text">{labels[l]}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Selector de persona con alta rápida. Guarda el id de la persona. */
export function PersonSelect({
  label,
  value,
  onValue,
  error,
  required,
  areaHint,
  hint,
  allowEmpty = true,
}: {
  label: ReactNode;
  value: string | undefined;
  onValue: (id: string) => void;
  error?: string;
  required?: boolean;
  areaHint?: string;
  hint?: ReactNode;
  allowEmpty?: boolean;
}) {
  const db = useDb();
  const services = useServices();
  const { run } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const people = [...db.people].filter((p) => p.activo || p.id === value).sort((a, b) => {
    const pa = a.areaId === areaHint ? 0 : 1;
    const pb = b.areaId === areaHint ? 0 : 1;
    return pa - pb || a.nombre.localeCompare(b.nombre, 'es');
  });

  const add = () => {
    const p = run(() => services.people.create({ nombre: name, areaId: areaHint, rol: 'COLABORADOR' as Role }));
    if (p) {
      onValue(p.id);
      setAdding(false);
      setName('');
    }
  };

  if (adding) {
    return (
      <Field label={label} error={error} required={required} hint="Se agregará al directorio de responsables.">
        {(id, d) => (
          <div className="inline-add">
            <input
              id={id}
              className="input"
              value={name}
              autoFocus
              placeholder="Nombre y apellido"
              aria-describedby={d}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setAdding(false);
                }
              }}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={add}>
              Agregar
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
              Cancelar
            </button>
          </div>
        )}
      </Field>
    );
  }

  return (
    <SelectInput
      label={label}
      value={value ?? ''}
      error={error}
      required={required}
      hint={hint}
      onValue={(v) => (v === '__new' ? setAdding(true) : onValue(v))}
    >
      {allowEmpty && <option value="">{required ? 'Selecciona…' : 'Sin asignar'}</option>}
      {!allowEmpty && !value && <option value="">Selecciona…</option>}
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
          {p.areaId ? ` · ${db.areas.find((a) => a.id === p.areaId)?.nombre ?? ''}` : ''}
        </option>
      ))}
      <option value="__new">＋ Agregar persona…</option>
    </SelectInput>
  );
}

/** Áreas internas + entidades externas configurables. */
export function DependencySelect({
  label,
  value,
  onValue,
  hint,
  excludeAreaId,
}: {
  label: ReactNode;
  value: string | undefined;
  onValue: (v: string) => void;
  hint?: ReactNode;
  excludeAreaId?: string;
}) {
  const db = useDb();
  const settings = useSettings();
  return (
    <SelectInput label={label} value={value ?? ''} onValue={onValue} hint={hint}>
      <option value="">Sin dependencia</option>
      <optgroup label="Áreas de la Dirección">
        {db.areas
          .filter((a) => a.activo && a.id !== excludeAreaId)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
      </optgroup>
      <optgroup label="Otras áreas / externos">
        {settings.externalDependencies.map((x) => (
          <option key={x} value={`ext:${x}`}>
            {x}
          </option>
        ))}
        {value?.startsWith('ext:') && !settings.externalDependencies.includes(value.slice(4)) && <option value={value}>{value.slice(4)}</option>}
      </optgroup>
    </SelectInput>
  );
}

export function AreaSelect({ label, value, onValue, error, required, includeAll }: { label: ReactNode; value: string; onValue: (v: string) => void; error?: string; required?: boolean; includeAll?: string }) {
  const db = useDb();
  return (
    <SelectInput label={label} value={value} onValue={onValue} error={error} required={required}>
      {includeAll !== undefined ? <option value="">{includeAll}</option> : <option value="">Selecciona…</option>}
      {db.areas
        .filter((a) => a.activo || a.id === value)
        .sort((a, b) => a.orden - b.orden)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.nombre}
          </option>
        ))}
    </SelectInput>
  );
}

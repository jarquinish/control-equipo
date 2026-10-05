import { useRef, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { PROJECT_STATUSES } from '../../domain/constants';
import type { ProjectStatus, UpdateOrigin } from '../../domain/types';
import { ValidationError, type FieldErrors } from '../../domain/validation';
import { useServices, useSettings } from '../../state/app';
import { friendlyError, useFeedback } from '../../ui/feedback';
import { DependencySelect, PersonSelect, SelectInput, TextInput } from '../../ui/forms';

const EMPTY = { nombre: '', descripcion: '', fechaObjetivo: '', estado: 'en_curso' as ProjectStatus, dependeDe: '', bloqueado: false, bloqueo: '' };

/**
 * Registro rápido de un proyecto para un área. Al guardar, el proyecto queda
 * persistido y se refleja de inmediato en el dashboard, KPIs, Eisenhower,
 * bloqueos y demás vistas. La ponderación (impacto/urgencia/dependencia)
 * inicia en 2-2-2 y se ajusta en el paso 4 (Priorizar).
 */
export function ProjectQuickForm({ areaId, areaName, origen = 'area', onSaved }: { areaId: string; areaName: string; origen?: UpdateOrigin; onSaved?: (id: string) => void }) {
  const services = useServices();
  const settings = useSettings();
  const { toast } = useFeedback();
  const [f, setF] = useState(EMPTY);
  const [responsable, setResponsable] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (f.bloqueado && !f.bloqueo.trim()) return setErrors({ bloqueo: 'Explica qué está bloqueando el proyecto.' });
    try {
      const p = services.ctx.store.batch(() => {
        const project = services.projects.create(
          {
            nombre: f.nombre,
            descripcion: f.descripcion,
            areaId,
            responsable: responsable || undefined,
            fechaObjetivo: f.fechaObjetivo || undefined,
            estado: f.estado,
            dependeDe: f.dependeDe || undefined,
            impacto: 2,
            urgencia: 2,
            dependencia: 2,
          },
          { origen },
        );
        if (f.bloqueado) services.blocks.create({ projectId: project.id, descripcion: f.bloqueo, areaDependencia: f.dependeDe || undefined }, origen);
        return project;
      });
      toast(`«${p.nombre}» guardado en ${areaName} · ya aparece en el dashboard`);
      setF(EMPTY);
      setErrors({});
      onSaved?.(p.id);
      nameRef.current?.focus();
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.errors);
      else toast(friendlyError(err), 'error');
    }
  };

  return (
    <form className="quick-form card" onSubmit={save} noValidate aria-label={`Registrar proyecto de ${areaName}`} data-testid="quick-form">
      <div className="quick-grid">
        <TextInput
          ref={nameRef}
          label={`Proyecto de ${areaName}`}
          required
          value={f.nombre}
          onValue={(v) => set('nombre', v)}
          error={errors.nombre}
          placeholder="Ej. Campaña Convención"
          className="quick-name"
          maxLength={120}
          data-testid="quick-name"
        />
        <PersonSelect label="Responsable" value={responsable} onValue={setResponsable} areaHint={areaId} />
        <TextInput label="Fecha objetivo" type="date" value={f.fechaObjetivo} onValue={(v) => set('fechaObjetivo', v)} error={errors.fechaObjetivo} />
        <TextInput label="Descripción breve" value={f.descripcion} onValue={(v) => set('descripcion', v)} placeholder="¿Qué resultado entrega?" className="quick-desc" />
        <SelectInput label="Estado" value={f.estado} onValue={(v) => set('estado', v as ProjectStatus)}>
          {PROJECT_STATUSES.filter((s) => s !== 'completado' && s !== 'archivado').map((s) => (
            <option key={s} value={s}>
              {settings.statusLabels[s]}
            </option>
          ))}
        </SelectInput>
        <DependencySelect label="¿De quién depende?" value={f.dependeDe} onValue={(v) => set('dependeDe', v)} excludeAreaId={areaId} />
      </div>
      <div className="quick-foot">
        <label className="check">
          <input type="checkbox" checked={f.bloqueado} onChange={(e) => set('bloqueado', e.target.checked)} />
          <span>¿Está bloqueado?</span>
        </label>
        {f.bloqueado && (
          <TextInput label="¿Qué lo está bloqueando?" required value={f.bloqueo} onValue={(v) => set('bloqueo', v)} error={errors.bloqueo} className="quick-block" />
        )}
        <span className="small muted quick-note">La ponderación se ajusta en el paso 4 (Priorizar).</span>
        <button type="submit" className="btn btn-primary btn-lg" data-testid="quick-save">
          <Save size={18} aria-hidden /> Guardar proyecto
        </button>
      </div>
    </form>
  );
}

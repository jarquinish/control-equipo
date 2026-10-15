import { useState } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { DEFAULT_MATRIX } from '../../domain/priority';
import type { Iniciativa, PriorityMatrix } from '../../domain/types';
import { useDb, useServices, useSettings } from '../../state/app';
import { Section } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';

type Eje = 'estrategico' | 'urgente';

/**
 * Matriz directiva de prioridades: catálogo de iniciativas (con sus variantes de nombre)
 * y qué iniciativas son P1 estratégico / P1 urgente para cada gerencia.
 * Sólo Dirección la edita; al guardar se recalculan todos los proyectos.
 */
export function MatrixSection({ allowed }: { allowed: boolean }) {
  const db = useDb();
  const settings = useSettings();
  const services = useServices();
  const { run, confirm } = useFeedback();
  const saved = settings.priorityMatrix ?? DEFAULT_MATRIX;
  const [m, setM] = useState<PriorityMatrix>(() => structuredClone(saved));
  const [nuevo, setNuevo] = useState('');
  const dirty = JSON.stringify(m) !== JSON.stringify(saved);
  const areas = db.areas.filter((a) => a.activo).sort((a, b) => a.orden - b.orden);

  const has = (area: string, eje: Eje, key: string) => m.reglas.some((r) => r.area === area && r.eje === eje && r.iniciativa === key);
  const toggle = (area: string, eje: Eje, key: string) =>
    setM((x) => ({
      ...x,
      reglas: has(area, eje, key) ? x.reglas.filter((r) => !(r.area === area && r.eje === eje && r.iniciativa === key)) : [...x.reglas, { area, eje, iniciativa: key }],
    }));
  const setIni = (key: string, patch: Partial<Iniciativa>) => setM((x) => ({ ...x, iniciativas: x.iniciativas.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));

  const add = () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    const key = nombre
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (m.iniciativas.some((i) => i.key === key)) return;
    setM((x) => ({ ...x, iniciativas: [...x.iniciativas, { key, nombre, alias: [], tipo: 'proyecto' }] }));
    setNuevo('');
  };

  const save = () => run(() => services.priority.setMatrix(m), 'Matriz guardada y proyectos recalculados');
  const reset = async () => {
    if (await confirm({ title: 'Restablecer matriz oficial', message: 'Se vuelve a la matriz directiva oficial (los cambios sin guardar se pierden; al guardar se recalculan los proyectos).', confirmLabel: 'Restablecer' }))
      setM(structuredClone(DEFAULT_MATRIX));
  };

  return (
    <Section
      title="Matriz directiva de prioridades"
      id="cfg-matrix"
      actions={
        allowed ? (
          <div className="row gap">
            <button className="btn btn-sm btn-ghost" onClick={reset}>
              <RotateCcw size={14} aria-hidden /> Matriz oficial
            </button>
            <button className="btn btn-sm btn-primary" onClick={save} disabled={!dirty} data-testid="matrix-save">
              Guardar matriz
            </button>
          </div>
        ) : undefined
      }
    >
      <p className="small muted">
        Lo marcado aquí es P1 por decisión de Dirección y no se degrada automáticamente. Los proyectos se reconocen por nombre, frente o variantes (sin acentos ni mayúsculas; «Convención SOC 2026» = «Convención»).
        Solicitantes como Brokers o Dirección Comercial se reconocen por el campo Solicitante; si sólo aparecen en el nombre, quedan por validar.
      </p>
      <div className="table-wrap">
        <table className="table table-compact matrix-table" data-testid="matrix-table">
          <thead>
            <tr>
              <th scope="col">Iniciativa</th>
              <th scope="col">Variantes de nombre (separadas por coma)</th>
              {areas.map((a) => (
                <th key={a.id} scope="col" className="num">
                  {a.nombre}
                  <span className="small muted block">E · U</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.iniciativas.map((i) => (
              <tr key={i.key}>
                <td>
                  <input className="input input-sm" value={i.nombre} disabled={!allowed} onChange={(e) => setIni(i.key, { nombre: e.target.value })} aria-label={`Nombre de ${i.nombre}`} />
                  <span className="small muted block">{i.tipo === 'solicitante' ? 'Se reconoce por Solicitante' : 'Proyecto / campaña'}</span>
                </td>
                <td>
                  <input
                    className="input input-sm"
                    defaultValue={i.alias.join(', ')}
                    disabled={!allowed}
                    onBlur={(e) => setIni(i.key, { alias: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
                    aria-label={`Variantes de ${i.nombre}`}
                  />
                </td>
                {areas.map((a) => (
                  <td key={a.id} className="num nowrap">
                    {(['estrategico', 'urgente'] as Eje[]).map((eje) => (
                      <label key={eje} className="matrix-check" title={`${i.nombre} · ${a.nombre} · ${eje === 'estrategico' ? 'P1 estratégico' : 'P1 urgente'}`}>
                        <input type="checkbox" checked={has(a.nombre, eje, i.key)} disabled={!allowed} onChange={() => toggle(a.nombre, eje, i.key)} aria-label={`${i.nombre} ${eje === 'estrategico' ? 'estratégico' : 'urgente'} en ${a.nombre}`} />
                        <span aria-hidden>{eje === 'estrategico' ? 'E' : 'U'}</span>
                      </label>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {allowed && (
        <div className="row gap">
          <input className="input" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nueva iniciativa (p. ej. Campaña Día de las Madres)" aria-label="Nueva iniciativa" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
          <button className="btn btn-secondary" onClick={add} disabled={!nuevo.trim()}>
            <Plus size={16} aria-hidden /> Agregar iniciativa
          </button>
        </div>
      )}
    </Section>
  );
}

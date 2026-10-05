import { useState, type DragEvent } from 'react';
import { HelpCircle } from 'lucide-react';
import { QUADRANT_HINTS, QUADRANT_LABELS, QUADRANTS } from '../../domain/constants';
import { suggestQuadrant } from '../../domain/scoring';
import { isActiveProject, sortProjectsByPriority } from '../../domain/selectors';
import type { Project, Quadrant, UpdateOrigin } from '../../domain/types';
import { useDb, useServices } from '../../state/app';
import { navigate } from '../../state/router';
import { AreaDot, BlockedChip, PriorityBadge } from '../../ui/badges';
import { useFeedback } from '../../ui/feedback';

export const EISENHOWER_QUESTION = '¿Es realmente prioritario o simplemente llegó con urgencia?';

/** Matriz 2×2 interactiva: drag & drop + selector accesible por teclado. */
export function EisenhowerBoard({ projects, readOnly, origen = 'area', areaFilter }: { projects: Project[]; readOnly?: boolean; origen?: UpdateOrigin; areaFilter?: string }) {
  const db = useDb();
  const services = useServices();
  const { run } = useFeedback();
  const [over, setOver] = useState<Quadrant | null>(null);
  const list = projects.filter((p) => isActiveProject(p) && (!areaFilter || p.areaId === areaFilter)).sort(sortProjectsByPriority);

  const move = (id: string, q: Quadrant) => {
    const p = list.find((x) => x.id === id);
    if (!p || p.eisenhower === q) return;
    run(() => services.projects.setQuadrant(id, q, { origen }), `«${p.nombre}» → ${QUADRANT_LABELS[q]}`);
  };

  const onDrop = (q: Quadrant) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    if (id) move(id, q);
  };

  return (
    <div className="eisen">
      <p className="eisen-question" role="note">
        <HelpCircle size={18} aria-hidden /> {EISENHOWER_QUESTION}
      </p>
      <div className="eisen-grid">
        <div className="eisen-axis-top" aria-hidden>
          <span>URGENTE</span>
          <span>NO URGENTE</span>
        </div>
        <div className="eisen-axis-left" aria-hidden>
          <span>IMPORTANTE</span>
          <span>NO IMPORTANTE</span>
        </div>
        {QUADRANTS.map((q) => {
          const items = list.filter((p) => p.eisenhower === q);
          return (
            <section
              key={q}
              className={`eisen-q quad-${q} ${over === q ? 'over' : ''}`}
              aria-label={`${QUADRANT_LABELS[q]} (${QUADRANT_HINTS[q]})`}
              data-testid={`quadrant-${q}`}
              onDragOver={(e) => {
                if (readOnly) return;
                e.preventDefault();
                setOver(q);
              }}
              onDragLeave={() => setOver((o) => (o === q ? null : o))}
              onDrop={readOnly ? undefined : onDrop(q)}
            >
              <header>
                <h3>{QUADRANT_LABELS[q]}</h3>
                <span className="small">
                  {QUADRANT_HINTS[q]} · {items.length}
                </span>
              </header>
              <ul>
                {items.map((p) => {
                  const area = db.areas.find((a) => a.id === p.areaId);
                  const suggested = suggestQuadrant(p.impacto, p.urgencia);
                  return (
                    <li
                      key={p.id}
                      className="eisen-card"
                      draggable={!readOnly}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', p.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      data-testid="eisen-card"
                    >
                      <div className="eisen-card-top">
                        <PriorityBadge p={p.prioridadFinal} override={p.ajusteDireccion} />
                        <button className="link-btn" onClick={() => navigate(`/proyectos/${p.id}`)}>
                          {p.nombre}
                        </button>
                      </div>
                      <div className="eisen-card-meta">
                        {area && <AreaDot color={area.color} name={area.nombre} />}
                        {p.bloqueado && <BlockedChip />}
                        {suggested !== p.eisenhower && (
                          <span className="small hint-mismatch" title={`Por impacto ${p.impacto} y urgencia ${p.urgencia} se sugiere «${QUADRANT_LABELS[suggested]}»`}>
                            Sugerido: {QUADRANT_LABELS[suggested]}
                          </span>
                        )}
                      </div>
                      {!readOnly && (
                        <label className="eisen-move">
                          <span className="sr-only">Mover «{p.nombre}» a</span>
                          <select className="input input-xs" value={p.eisenhower} onChange={(e) => move(p.id, e.target.value as Quadrant)}>
                            {QUADRANTS.map((x) => (
                              <option key={x} value={x}>
                                {QUADRANT_LABELS[x]}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </li>
                  );
                })}
                {items.length === 0 && <li className="eisen-empty">Arrastra proyectos aquí</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

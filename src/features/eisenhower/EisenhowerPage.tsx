import { useWeekData, useDb } from '../../state/app';
import { useQuery } from '../../state/router';
import { PageHeader } from '../../ui/common';
import { EisenhowerBoard } from './EisenhowerBoard';

export function EisenhowerPage() {
  const data = useWeekData();
  const db = useDb();
  const [q, setQ] = useQuery();
  if (!data) return null;
  const area = q.get('area') ?? '';
  return (
    <div className="page">
      <PageHeader
        title="Eisenhower"
        subtitle="No todo lo urgente es importante. Arrastra cada proyecto al cuadrante que le corresponde."
        actions={
          <select className="input" aria-label="Filtrar por área" value={area} onChange={(e) => setQ({ area: e.target.value })}>
            <option value="">Todas las áreas</option>
            {db.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        }
      />
      <EisenhowerBoard projects={data.projects} readOnly={data.readOnly} areaFilter={area} />
    </div>
  );
}

import { KPI_ESTADO_LABELS, type KpiEstado } from '../../../domain/investment/kpis';
import { Chip, type Tone } from '../../../ui/badges';

const KPI_TONES: Record<KpiEstado, Tone> = {
  cumplido: 'green',
  en_riesgo: 'yellow',
  debajo: 'red',
  en_curso: 'blue',
  sin_meta: 'gray',
  sin_dato: 'gray',
  periodo_incompatible: 'pink',
};

export function KpiEstadoChip({ e }: { e: KpiEstado }) {
  return <Chip tone={KPI_TONES[e]}>{KPI_ESTADO_LABELS[e]}</Chip>;
}

export function SeverityChip({ s }: { s: 'alta' | 'media' | 'baja' }) {
  return <Chip tone={s === 'alta' ? 'red' : s === 'media' ? 'yellow' : 'gray'}>{s === 'alta' ? 'Alta' : s === 'media' ? 'Media' : 'Baja'}</Chip>;
}

export const SEMAFORO: Record<string, { tone: Tone; label: string }> = {
  ok: { tone: 'green', label: 'En presupuesto' },
  atencion: { tone: 'yellow', label: 'Comprometido excede' },
  sobre: { tone: 'red', label: 'Sobreejercido' },
  sin_ejercer: { tone: 'gray', label: 'Sin ejercer' },
  revolvente: { tone: 'blue', label: 'Revolvente · conciliar' },
};

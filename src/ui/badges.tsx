import type { ReactNode } from 'react';
import {
  AlertOctagon,
  ArrowUpCircle,
  CheckCircle2,
  Circle,
  Clock,
  Loader,
  PauseCircle,
  RefreshCw,
  Archive,
  XCircle,
  Lock,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { BLOCK_STATUS_LABELS, COMMITMENT_STATUS_LABELS, QUADRANT_LABELS } from '../domain/constants';
import type { BlockStatus, CommitmentDisplayStatus, Priority, ProjectStatus, Quadrant } from '../domain/types';
import { useSettings } from '../state/app';

export type Tone = 'green' | 'yellow' | 'red' | 'blue' | 'pink' | 'gray' | 'brand';

export function Chip({ tone = 'gray', icon, children, title, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; title?: string; className?: string }) {
  return (
    <span className={`chip chip-${tone} ${className ?? ''}`} title={title}>
      {icon}
      {children}
    </span>
  );
}

export function PriorityBadge({ p, override, size }: { p: Priority; override?: boolean; size?: 'lg' }) {
  return (
    <span className={`prio prio-${p.toLowerCase()} ${size === 'lg' ? 'prio-lg' : ''}`} title={override ? 'Prioridad ajustada por Dirección' : `Prioridad ${p}`}>
      {p}
      {override && <span className="prio-mark" aria-label="ajuste de Dirección">★</span>}
    </span>
  );
}

const COMMITMENT_TONES: Record<CommitmentDisplayStatus, Tone> = {
  pendiente: 'gray',
  en_gestion: 'blue',
  cumplido: 'green',
  reprogramado: 'yellow',
  vencido: 'red',
  escalado: 'pink',
  incumplido: 'red',
};
const COMMITMENT_ICONS: Record<CommitmentDisplayStatus, ReactNode> = {
  pendiente: <Circle size={14} aria-hidden />,
  en_gestion: <Loader size={14} aria-hidden />,
  cumplido: <CheckCircle2 size={14} aria-hidden />,
  reprogramado: <RefreshCw size={14} aria-hidden />,
  vencido: <Clock size={14} aria-hidden />,
  escalado: <ArrowUpCircle size={14} aria-hidden />,
  incumplido: <XCircle size={14} aria-hidden />,
};

export function CommitmentStatusChip({ status }: { status: CommitmentDisplayStatus }) {
  return (
    <Chip tone={COMMITMENT_TONES[status]} icon={COMMITMENT_ICONS[status]}>
      {COMMITMENT_STATUS_LABELS[status]}
    </Chip>
  );
}

const BLOCK_TONES: Record<BlockStatus, Tone> = { por_destrabar: 'red', en_gestion: 'blue', resuelto: 'green', escalado: 'pink' };
export function BlockStatusChip({ status }: { status: BlockStatus }) {
  const icon = status === 'resuelto' ? <CheckCircle2 size={14} aria-hidden /> : status === 'escalado' ? <ArrowUpCircle size={14} aria-hidden /> : status === 'en_gestion' ? <Loader size={14} aria-hidden /> : <Lock size={14} aria-hidden />;
  return (
    <Chip tone={BLOCK_TONES[status]} icon={icon}>
      {BLOCK_STATUS_LABELS[status]}
    </Chip>
  );
}

const PROJECT_TONES: Record<ProjectStatus, Tone> = {
  por_iniciar: 'gray',
  en_curso: 'blue',
  en_riesgo: 'yellow',
  en_pausa: 'gray',
  completado: 'green',
  archivado: 'gray',
};
const PROJECT_ICONS: Record<ProjectStatus, ReactNode> = {
  por_iniciar: <Sparkles size={14} aria-hidden />,
  en_curso: <Loader size={14} aria-hidden />,
  en_riesgo: <AlertTriangle size={14} aria-hidden />,
  en_pausa: <PauseCircle size={14} aria-hidden />,
  completado: <CheckCircle2 size={14} aria-hidden />,
  archivado: <Archive size={14} aria-hidden />,
};

export function ProjectStatusChip({ status }: { status: ProjectStatus }) {
  const settings = useSettings();
  return (
    <Chip tone={PROJECT_TONES[status]} icon={PROJECT_ICONS[status]}>
      {settings.statusLabels[status]}
    </Chip>
  );
}

export function BlockedChip() {
  return (
    <Chip tone="red" icon={<AlertOctagon size={14} aria-hidden />}>
      Bloqueado
    </Chip>
  );
}

export function QuadrantChip({ q }: { q: Quadrant }) {
  return <span className={`quad-chip quad-${q}`}>{QUADRANT_LABELS[q]}</span>;
}

export function AreaDot({ color, name }: { color: string; name: string }) {
  return (
    <span className="area-dot-wrap">
      <span className="area-dot" style={{ background: color }} aria-hidden />
      {name}
    </span>
  );
}

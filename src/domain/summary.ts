import { APP_NAME, COMMITMENT_STATUS_LABELS } from './constants';
import { fmtDate, fmtDeadline, fmtShort } from './dates';
import {
  commitmentDisplayStatus,
  dependencyLabel,
  isActiveProject,
  isBlockOpen,
  isOpenCommitment,
  isOverdue,
  personName,
  sortByDeadline,
  sortProjectsByPriority,
  type WeekData,
} from './selectors';
import { computeKpis } from './metrics';
import type { Commitment, DbData } from './types';

export interface SummaryOutput {
  /** Markdown compatible con Microsoft Teams. */
  markdown: string;
  /** Texto plano. */
  text: string;
  /** Sólo compromisos (Markdown). */
  commitmentsOnly: string;
}

interface Line {
  main: string;
  meta: string[];
}

function section(title: string, lines: Line[], empty: string) {
  return { title, lines, empty };
}

/** Resumen ejecutivo (no narrativo) de la semana. */
export function buildSummary(db: DbData, data: WeekData, now: Date): SummaryOutput {
  const ref = data.live ? now : data.asOf;
  const pName = (id?: string) => personName(db.people, id);
  const projName = (id: string) => data.projects.find((p) => p.id === id)?.nombre ?? db.projects.find((p) => p.id === id)?.nombre ?? 'Proyecto';
  const areaName = (id: string) => db.areas.find((a) => a.id === id)?.nombre ?? '—';
  const kpis = computeKpis(data, ref);

  const p1 = data.projects.filter((p) => isActiveProject(p) && p.prioridadFinal === 'P1').sort(sortProjectsByPriority);
  const blocks = data.blocks.filter(isBlockOpen);
  const open = data.commitments.filter(isOpenCommitment).sort(sortByDeadline);
  const escalated = [
    ...data.commitments.filter((c) => c.estado === 'escalado').map<Line>((c) => ({
      main: `${projName(c.projectId)} — ${c.accion}`,
      meta: [`Escalado a: ${c.escaladoA || 'Dirección'}`, `Resp.: ${pName(c.responsable)}`],
    })),
    ...data.blocks.filter((b) => b.estado === 'escalado').map<Line>((b) => ({
      main: `${projName(b.projectId)} — ${b.descripcion}`,
      meta: [`Escalado a: ${b.escaladoA || 'Dirección'}`, `Depende de: ${dependencyLabel(db, b.areaDependencia)}`],
    })),
  ];
  const overdue = data.commitments.filter((c) => isOverdue(c, ref)).sort(sortByDeadline);

  const commitmentLine = (c: Commitment): Line => ({
    main: `${c.accion}`,
    meta: [
      projName(c.projectId),
      `Resp.: ${pName(c.responsable)}`,
      ...(c.apoyo ? [`Apoyo: ${c.apoyo}`] : []),
      fmtDeadline(c.fecha, c.hora, ref),
      COMMITMENT_STATUS_LABELS[commitmentDisplayStatus(c, ref)],
      ...(c.reprogramaciones ? [`Reprog. ×${c.reprogramaciones}`] : []),
    ],
  });

  const sections = [
    section(
      `PRIORIDADES P1 (${p1.length})`,
      p1.map((p) => ({
        main: p.nombre,
        meta: [
          areaName(p.areaId),
          `Resp.: ${pName(p.responsable)}`,
          `Score ${p.score}${p.ajusteDireccion ? ' · ajuste Dirección' : ''}`,
          ...(p.bloqueado ? ['BLOQUEADO'] : []),
        ],
      })),
      'Sin proyectos P1.',
    ),
    section(
      `BLOQUEOS ABIERTOS (${blocks.length})`,
      blocks.map((b) => ({
        main: `${projName(b.projectId)} — ${b.descripcion}`,
        meta: [
          ...(b.necesidad ? [`Necesita: ${b.necesidad}`] : []),
          `Depende de: ${[dependencyLabel(db, b.areaDependencia), b.dependeDe].filter((x) => x && x !== '—').join(' · ') || '—'}`,
          `Gestiona: ${pName(b.responsableGestion)}`,
        ],
      })),
      'Sin bloqueos abiertos.',
    ),
    section(
      `DECISIONES (${data.decisions.length})`,
      data.decisions.map((d) => ({
        main: d.descripcion,
        meta: [...(d.projectId ? [projName(d.projectId)] : []), ...(d.responsable ? [`Resp.: ${pName(d.responsable)}`] : [])],
      })),
      'Sin decisiones registradas.',
    ),
    section(`COMPROMISOS (${open.length})`, open.map(commitmentLine), 'Sin compromisos abiertos.'),
    section(`ESCALAMIENTOS (${escalated.length})`, escalated, 'Sin escalamientos.'),
    section(`VENCIDOS (${overdue.length})`, overdue.map(commitmentLine), 'Sin compromisos vencidos.'),
  ];

  const header = `${APP_NAME.toUpperCase()}\nSEMANA ${data.week.numero} · ${fmtShort(data.week.fechaInicio)} — ${fmtDate(data.week.fechaFin)}`;
  const kpiLine = `${kpis.proyectosActivos} proyectos · ${kpis.p1} P1 · ${kpis.p2} P2 · ${kpis.p3} P3 · ${kpis.bloqueados} bloqueados · ${kpis.compromisosAbiertos} compromisos · ${kpis.vencidos} vencidos · cumplimiento ${kpis.cumplimiento === null ? '—' : `${kpis.cumplimiento}%`}`;

  const md: string[] = [`**${APP_NAME.toUpperCase()}**`, `**SEMANA ${data.week.numero}** · ${fmtShort(data.week.fechaInicio)} — ${fmtDate(data.week.fechaFin)}`, '', kpiLine, ''];
  const txt: string[] = [header, '', kpiLine, ''];
  for (const s of sections) {
    md.push(`**${s.title}**`);
    txt.push(s.title);
    if (!s.lines.length) {
      md.push(`- ${s.empty}`);
      txt.push(`  · ${s.empty}`);
    }
    for (const l of s.lines) {
      md.push(`- **${l.main}** · ${l.meta.join(' · ')}`);
      txt.push(`  · ${l.main}`, `    ${l.meta.join(' · ')}`);
    }
    md.push('');
    txt.push('');
  }

  const cmd: string[] = [`**COMPROMISOS · SEMANA ${data.week.numero}**`, ''];
  if (!open.length) cmd.push('- Sin compromisos abiertos.');
  for (const c of open) {
    const l = commitmentLine(c);
    cmd.push(`- **${l.main}** · ${l.meta.join(' · ')}`);
  }

  return { markdown: md.join('\n').trim() + '\n', text: txt.join('\n').trim() + '\n', commitmentsOnly: cmd.join('\n') + '\n' };
}

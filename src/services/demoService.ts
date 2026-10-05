import { MemoryAdapter } from '../data/adapters/memoryAdapter';
import { DataStore } from '../data/store';
import { addDays, startOfWeek, toISODate, toTime } from '../domain/dates';
import type { DbData, Level } from '../domain/types';
import { bootstrapEmpty, createServices } from './index';
import type { ProjectInput } from './projectService';

/**
 * Datos demo realistas para la Dirección de Posicionamiento.
 *
 * Se generan SIMULANDO tres semanas con los mismos servicios que usa la app
 * (dos semanas cerradas con su Weekly + la semana actual en preparación), de
 * modo que el historial, los snapshots, las reprogramaciones y los
 * escalamientos son coherentes. Las fechas son relativas a `now`.
 */
export function buildDemoData(now: Date = new Date()): DbData {
  const store = new DataStore(new MemoryAdapter());
  store.ready = true;
  let clock = new Date(now);
  const svc = createServices(store, () => new Date(clock));

  const w0 = startOfWeek(now);
  const at = (weekOffset: number, day: number, hhmm: string): Date => {
    const d = addDays(w0, weekOffset * 7 + day);
    const [h, m] = hhmm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const set = (d: Date) => {
    clock = d.getTime() > now.getTime() ? new Date(now.getTime() - 1000) : d;
  };
  const date = (d: Date) => toISODate(d);
  const roundHour = (d: Date) => {
    const r = new Date(d);
    r.setMinutes(0, 0, 0);
    return r;
  };

  /* ───────── SEMANA -2 ───────── */
  set(at(-2, 0, '08:00'));
  bootstrapEmpty(svc);
  const director = svc.ctx.repos.people.list()[0];
  svc.people.update(director.id, { nombre: 'Miguel Jarquín' });

  const areas = Object.fromEntries(svc.areas.list().map((a) => [a.nombre, a.id])) as Record<string, string>;
  const A = {
    contenido: areas['Contenido'],
    diseno: areas['Diseño'],
    mkt: areas['Marketing Digital'],
    store: areas['SOC Store'],
  };
  const person = (nombre: string, rol: 'GERENTE' | 'COLABORADOR', areaId: string) => svc.people.create({ nombre, rol, areaId }).id;
  const P = {
    laura: person('Laura Méndez', 'GERENTE', A.contenido),
    diego: person('Diego Ramírez', 'COLABORADOR', A.contenido),
    andrea: person('Andrea Solís', 'GERENTE', A.diseno),
    ivan: person('Iván Castillo', 'COLABORADOR', A.diseno),
    carlos: person('Carlos Herrera', 'GERENTE', A.mkt),
    paola: person('Paola Núñez', 'COLABORADOR', A.mkt),
    sofia: person('Sofía Treviño', 'GERENTE', A.store),
    ricardo: person('Ricardo Peña', 'COLABORADOR', A.store),
  };
  svc.areas.update(A.contenido, { responsable: P.laura });
  svc.areas.update(A.diseno, { responsable: P.andrea });
  svc.areas.update(A.mkt, { responsable: P.carlos });
  svc.areas.update(A.store, { responsable: P.sofia });

  const lv = (n: number) => n as Level;
  const proj = (input: Omit<ProjectInput, 'impacto' | 'urgencia' | 'dependencia'> & { i: number; u: number; d: number }) =>
    svc.projects.create({ ...input, impacto: lv(input.i), urgencia: lv(input.u), dependencia: lv(input.d) }).id;

  const fin = (days: number) => date(addDays(now, days));

  const pr = {
    queEsSoc: proj({ nombre: 'Campaña «¿Qué es SOC?» · Fase Conversación', descripcion: 'Carruseles, reels y copy de la fase de conversación con Líderes y prospectos.', areaId: A.contenido, responsable: P.laura, fechaObjetivo: fin(18), i: 3, u: 3, d: 2, dependeDe: A.diseno }),
    socTv: proj({ nombre: 'SOC TV · Temporada 2', descripcion: 'Guiones, calendario de grabación y temas de la temporada 2.', areaId: A.contenido, responsable: P.diego, fechaObjetivo: fin(45), i: 3, u: 2, d: 2, eisenhower: 'planificar' }),
    momentoVida: proj({ nombre: 'Contenido «Momento de Vida» para redes', descripcion: 'Serie de piezas por producto bajo el sistema visual Momento de Vida.', areaId: A.contenido, responsable: P.diego, fechaObjetivo: fin(25), i: 2, u: 2, d: 1, eisenhower: 'planificar' }),
    guiaMensajes: proj({ nombre: 'Guía de mensajes por audiencia (Líderes)', descripcion: 'Matriz de mensajes por audiencia y etapa del viaje para Líderes.', areaId: A.contenido, responsable: P.laura, fechaObjetivo: fin(35), i: 3, u: 1, d: 2 }),
    boletin: proj({ nombre: 'Boletín interno Red de Oficinas', descripcion: 'Boletín quincenal con novedades de marca para oficinas.', areaId: A.contenido, responsable: P.diego, i: 1, u: 2, d: 1 }),

    kvConvencion: proj({ nombre: 'Key visual Convención Anual', descripcion: 'Concepto gráfico, KV y adaptaciones para la Convención.', areaId: A.diseno, responsable: P.andrea, fechaObjetivo: fin(10), i: 3, u: 3, d: 3, dependeDe: 'ext:Comercial' }),
    kitMarca: proj({ nombre: 'Kit de alineación de marca para oficinas', descripcion: 'Lineamientos, fachadas y señalética para alinear la marca en oficinas.', areaId: A.diseno, responsable: P.ivan, fechaObjetivo: fin(60), i: 3, u: 2, d: 3, eisenhower: 'planificar', dependeDe: 'ext:Red de Oficinas' }),
    plantillas: proj({ nombre: 'Plantillas Plataforma de Marketing', descripcion: 'Plantillas editables para que la Red genere piezas locales.', areaId: A.diseno, responsable: P.andrea, fechaObjetivo: fin(30), i: 2, u: 2, d: 2, eisenhower: 'planificar' }),
    presentaciones: proj({ nombre: 'Rediseño de presentaciones comerciales', descripcion: 'Nueva plantilla de presentación comercial alineada al brandbook.', areaId: A.diseno, responsable: P.ivan, fechaObjetivo: fin(50), i: 2, u: 1, d: 2 }),

    convencion: proj({ nombre: 'Campaña Convención', descripcion: 'Pauta digital, landing de registro y difusión de la Convención Anual.', areaId: A.mkt, responsable: P.carlos, fechaObjetivo: fin(12), i: 3, u: 3, d: 3, dependeDe: 'ext:Comercial' }),
    landing: proj({ nombre: 'Landing Precalificador hipotecario', descripcion: 'Landing de captación conectada al Precalificador.', areaId: A.mkt, responsable: P.paola, fechaObjetivo: fin(9), i: 3, u: 2, d: 1, eisenhower: 'planificar' }),
    leads: proj({ nombre: 'SOC Leads+ · Automatización de seguimiento', descripcion: 'Flujos automáticos de seguimiento de leads hacia la Red.', areaId: A.mkt, responsable: P.carlos, fechaObjetivo: fin(28), i: 3, u: 2, d: 3, dependeDe: 'ext:TI / Sistemas' }),
    seo: proj({ nombre: 'Optimización SEO sitio corporativo', descripcion: 'Auditoría técnica y mejora de contenidos clave.', areaId: A.mkt, responsable: P.paola, fechaObjetivo: fin(40), i: 2, u: 1, d: 1 }),
    reportePauta: proj({ nombre: 'Reporte mensual de pauta', descripcion: 'Consolidado mensual de inversión y resultados.', areaId: A.mkt, responsable: P.paola, i: 1, u: 2, d: 1 }),
    webinar: proj({ nombre: 'Webinar producto hipotecario', descripcion: 'Webinar de lanzamiento para asesores.', areaId: A.mkt, responsable: P.carlos, fechaObjetivo: date(at(-1, 3, '12:00')), i: 2, u: 3, d: 2 }),

    catalogo: proj({ nombre: 'Lanzamiento catálogo merch Q4', descripcion: 'Nuevo catálogo de artículos promocionales para la Red.', areaId: A.store, responsable: P.ricardo, fechaObjetivo: fin(21), i: 2, u: 3, d: 2, dependeDe: 'ext:Proveedor externo' }),
    pasarela: proj({ nombre: 'Integración pasarela de pagos SOC Store', descripcion: 'Cobro en línea para pedidos de oficinas.', areaId: A.store, responsable: P.sofia, fechaObjetivo: fin(30), i: 3, u: 2, d: 3, dependeDe: 'ext:Finanzas' }),
    kitsBienvenida: proj({ nombre: 'Kits de bienvenida para nuevos asesores', descripcion: 'Kit físico y digital para nuevos asesores de la Red.', areaId: A.store, responsable: P.sofia, fechaObjetivo: fin(15), i: 2, u: 2, d: 2, eisenhower: 'delegar' }),
    pop: proj({ nombre: 'Inventario y reposición de material POP', descripcion: 'Control de inventario de material punto de venta.', areaId: A.store, responsable: P.ricardo, i: 1, u: 1, d: 1 }),
  };

  // Ajuste de Dirección: Momento de Vida sube a P2 (alimenta la campaña principal).
  svc.projects.setOverride(pr.momentoVida, 'P2', 'Alimenta la campaña «¿Qué es SOC?»');

  for (const [i, areaId] of [A.contenido, A.diseno, A.mkt, A.store].entries()) {
    set(at(-2, 0, `08:${String(30 + i * 5)}`));
    svc.areas.completeUpdate(areaId);
  }

  // Weekly semana -2
  set(at(-2, 0, '10:00'));
  let s = svc.sessions.start();
  const b1 = svc.blocks.create({ projectId: pr.leads, descripcion: 'Falta acceso a la API del CRM para conectar los flujos', necesidad: 'Credenciales y ambiente de pruebas del CRM', dependeDe: 'Coordinación de TI', areaDependencia: 'ext:TI / Sistemas', quienPuedeAyudar: 'Dirección General', responsableGestion: P.carlos }, 'junta');
  const c1 = svc.commitments.create({ projectId: pr.leads, blockId: b1.id, accion: 'Solicitar acceso a la API del CRM a TI', responsable: P.paola, apoyo: 'Carlos Herrera', fecha: date(at(-2, 2, '12:00')), hora: '12:00' }, { sessionId: s.id });
  const b2 = svc.blocks.create({ projectId: pr.kitMarca, descripcion: 'La Red no ha enviado el inventario de fachadas', necesidad: 'Fotos y medidas de fachadas de 12 oficinas', dependeDe: 'Coordinadores regionales', areaDependencia: 'ext:Red de Oficinas', responsableGestion: P.ivan }, 'junta');
  const c2 = svc.commitments.create({ projectId: pr.kitMarca, blockId: b2.id, accion: 'Enviar formato de levantamiento a 12 oficinas', responsable: P.ivan, fecha: date(at(-2, 3, '10:00')), hora: '10:00' }, { sessionId: s.id });
  const b3 = svc.blocks.create({ projectId: pr.catalogo, descripcion: 'El proveedor no confirma tiempos de producción', necesidad: 'Fecha firme de entrega y plan B', dependeDe: 'Proveedor de promocionales', areaDependencia: 'ext:Proveedor externo', responsableGestion: P.ricardo }, 'junta');
  const c3 = svc.commitments.create({ projectId: pr.catalogo, blockId: b3.id, accion: 'Confirmar fechas con proveedor y cotizar plan B', responsable: P.ricardo, apoyo: 'Sofía Treviño', fecha: date(at(-2, 4, '13:00')), hora: '13:00' }, { sessionId: s.id });
  svc.sessions.detect(s.id, pr.leads, 'bloqueado');
  svc.sessions.detect(s.id, pr.kitMarca, 'bloqueado');
  svc.sessions.detect(s.id, pr.catalogo, 'bloqueado');
  svc.sessions.detect(s.id, pr.convencion, 'avanza');
  svc.sessions.detect(s.id, pr.kvConvencion, 'avanza');
  svc.sessions.addDecision(s.id, { projectId: pr.convencion, descripcion: 'La Convención es la prioridad #1 del trimestre: todo material pasa por Diseño con 48 h de anticipación.', responsable: director.id });
  const c6 = svc.commitments.create({ projectId: pr.socTv, accion: 'Publicar guion piloto de SOC TV T2', responsable: P.diego, fecha: date(at(-2, 3, '17:00')), hora: '17:00' }, { sessionId: s.id });
  set(at(-2, 0, '11:20'));
  svc.sessions.close(s.id);

  set(at(-2, 2, '11:00'));
  svc.commitments.reschedule(c1.id, { fecha: date(at(-2, 4, '17:00')), hora: '17:00', motivo: 'TI en cierre de mes; pide moverlo al viernes' });
  set(at(-2, 3, '09:40'));
  svc.commitments.complete(c2.id);
  set(at(-2, 3, '16:30'));
  svc.commitments.complete(c6.id);

  /* ───────── SEMANA -1 ───────── */
  set(at(-1, 0, '08:00'));
  svc.weeks.openNextWeek();
  set(at(-1, 0, '08:20'));
  svc.projects.update(pr.landing, { urgencia: 3, dependencia: 2, eisenhower: 'hacer' }, { comentario: 'Se adelanta lanzamiento por campaña hipotecaria.' });
  svc.projects.continue(pr.queEsSoc, 'Copy fase Conversación en revisión.');
  svc.projects.update(pr.webinar, {}, { comentario: 'Webinar realizado con 180 asistentes.' });
  for (const [i, areaId] of [A.contenido, A.diseno, A.mkt, A.store].entries()) {
    set(at(-1, 0, `08:${String(30 + i * 6)}`));
    svc.areas.completeUpdate(areaId);
  }

  set(at(-1, 0, '10:00'));
  s = svc.sessions.start();
  // Paso 1: revisar compromisos anteriores
  svc.commitments.escalate(c1.id, 'Dirección General', { sessionId: s.id, comentario: 'TI no ha dado acceso tras dos semanas.' });
  svc.blocks.resolve(b2.id, 'junta');
  svc.commitments.reschedule(c3.id, { fecha: date(at(-1, 2, '13:00')), hora: '13:00', motivo: 'El proveedor pidió muestras antes de confirmar' }, { sessionId: s.id });
  // Paso 4: ajuste de Dirección (regla 8)
  svc.projects.setOverride(pr.kitMarca, 'P2', 'Arranca en noviembre, después de la Convención', { origen: 'junta' });
  svc.sessions.addDecision(s.id, { projectId: pr.kitMarca, descripcion: 'Kit de alineación de marca baja a P2: arranca en noviembre, después de la Convención.', responsable: director.id });
  // Paso 5-6: nuevos bloqueos y compromisos
  const b4 = svc.blocks.create({ projectId: pr.convencion, descripcion: 'Comercial no ha confirmado presupuesto de pauta ni lista de invitados', necesidad: 'Presupuesto aprobado y base de invitados', dependeDe: 'Dirección Comercial', areaDependencia: 'ext:Comercial', quienPuedeAyudar: 'Miguel Jarquín', responsableGestion: P.carlos }, 'junta');
  const dueC4 = roundHour(new Date(now.getTime() - 2 * 3_600_000));
  svc.commitments.create({ projectId: pr.convencion, blockId: b4.id, accion: 'Validar presupuesto de pauta con Dirección Comercial', responsable: P.carlos, apoyo: 'Miguel Jarquín', fecha: date(dueC4), hora: toTime(dueC4) }, { sessionId: s.id });
  const b5 = svc.blocks.create({ projectId: pr.landing, descripcion: 'Falta el KV final para maquetar la landing', necesidad: 'KV final', dependeDe: 'Andrea Solís', areaDependencia: A.diseno, responsableGestion: P.paola }, 'junta');
  const dueC5 = addDays(now, 2);
  svc.commitments.create({ projectId: pr.landing, blockId: b5.id, accion: 'Entregar KV final de landing hipotecaria', responsable: P.andrea, apoyo: 'Iván Castillo', fecha: date(dueC5), hora: '11:00' }, { sessionId: s.id });
  const c7 = svc.commitments.create({ projectId: pr.plantillas, accion: 'Presentar propuesta de plantillas a Comercial', responsable: P.andrea, fecha: date(at(-1, 4, '16:00')), hora: '16:00' }, { sessionId: s.id });
  svc.commitments.create({ projectId: pr.kitsBienvenida, accion: 'Enviar brief de kits de bienvenida al proveedor', responsable: P.sofia, apoyo: 'Ricardo Peña', fecha: date(at(-1, 4, '12:00')), hora: '12:00' }, { sessionId: s.id });
  for (const id of [pr.convencion, pr.kvConvencion, pr.landing, pr.leads, pr.pasarela, pr.queEsSoc]) svc.sessions.detect(s.id, id, 'avanza');
  svc.sessions.detect(s.id, pr.convencion, 'bloqueado');
  svc.sessions.detect(s.id, pr.landing, 'bloqueado');
  svc.sessions.detect(s.id, pr.kitMarca, 'resuelto');
  set(at(-1, 0, '11:30'));
  svc.sessions.close(s.id);

  set(at(-1, 2, '12:10'));
  svc.commitments.reschedule(c3.id, { fecha: date(addDays(now, 1)), hora: '13:00', motivo: 'Muestras retrasadas en aduana' });
  set(at(-1, 3, '18:00'));
  svc.projects.close(pr.webinar);
  set(at(-1, 4, '15:40'));
  svc.commitments.complete(c7.id);

  /* ───────── SEMANA ACTUAL (en preparación) ───────── */
  const base = new Date(Math.max(w0.getTime() + 60_000, Math.min(at(0, 0, '08:00').getTime(), now.getTime() - 60 * 60_000)));
  const step = (min: number) => set(new Date(base.getTime() + min * 60_000));
  step(0);
  svc.weeks.openNextWeek();

  // Contenido actualiza
  step(5);
  svc.projects.continue(pr.queEsSoc, 'Copy listo para aprobación final.');
  svc.projects.continue(pr.socTv, 'Calendario de grabación confirmado.');
  svc.projects.continue(pr.momentoVida);
  svc.projects.continue(pr.guiaMensajes);
  svc.projects.update(pr.boletin, { estado: 'en_pausa' }, { comentario: 'Se pausa hasta después de la Convención.' });
  const dueC9 = roundHour(new Date(now.getTime() + 3 * 3_600_000));
  svc.commitments.create({ projectId: pr.queEsSoc, accion: 'Aprobar copy de la fase Conversación', responsable: P.laura, apoyo: 'Miguel Jarquín', fecha: date(dueC9), hora: toTime(dueC9) });
  svc.areas.completeUpdate(A.contenido, 'Sin bloqueos nuevos.');

  // Diseño actualiza
  step(12);
  svc.projects.update(pr.kvConvencion, { estado: 'en_riesgo' }, { comentario: 'Esperamos agenda final de Comercial para cerrar adaptaciones.' });
  svc.projects.continue(pr.kitMarca);
  svc.projects.continue(pr.plantillas, 'Comercial aprobó 3 de 5 plantillas.');
  svc.projects.continue(pr.presentaciones);
  svc.commitments.create({ projectId: pr.kitsBienvenida, accion: 'Entregar artes de kits de bienvenida', responsable: P.ivan, fecha: date(addDays(now, 4)), hora: '17:00' });
  svc.areas.completeUpdate(A.diseno);

  // SOC Store actualiza (registra un bloqueo SIN compromiso todavía)
  step(20);
  svc.projects.continue(pr.catalogo, 'Muestras en aduana.');
  svc.projects.continue(pr.kitsBienvenida);
  svc.projects.continue(pr.pop);
  svc.blocks.create({ projectId: pr.pasarela, descripcion: 'Finanzas no ha liberado el alta de la cuenta concentradora', necesidad: 'Alta de cuenta y validación fiscal', dependeDe: 'Tesorería', areaDependencia: 'ext:Finanzas', quienPuedeAyudar: 'Dirección General', responsableGestion: P.sofia });
  svc.projects.create({ nombre: 'Campaña Buen Fin SOC Store', descripcion: 'Promociones de SOC Store para el Buen Fin.', areaId: A.store, responsable: P.sofia, fechaObjetivo: fin(40), impacto: 2, urgencia: 3, dependencia: 1 });
  svc.areas.completeUpdate(A.store, 'Nuevo proyecto: Buen Fin. Pasarela bloqueada por Finanzas.');

  // Marketing Digital aún no actualiza (⚠ en el dashboard).
  svc.settings.setCurrentUser(director.id);
  return structuredClone(store.getState());
}

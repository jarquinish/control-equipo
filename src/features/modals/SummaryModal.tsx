import { useMemo } from 'react';
import { ClipboardCopy, Download, FileText, CalendarPlus } from 'lucide-react';
import { getWeekData } from '../../domain/selectors';
import { buildSummary } from '../../domain/summary';
import { useApp, useDb, useServices } from '../../state/app';
import { navigate } from '../../state/router';
import { copyText, downloadFile } from '../../ui/common';
import { useFeedback } from '../../ui/feedback';
import { Modal } from '../../ui/Modal';

export function SummaryModal({ weekId, justClosed, onClose }: { weekId?: string; justClosed?: boolean; onClose: () => void }) {
  const db = useDb();
  const { now, setViewWeekId } = useApp();
  const services = useServices();
  const { toast, confirm } = useFeedback();
  const data = getWeekData(db, weekId, now);
  const summary = useMemo(() => (data ? buildSummary(db, data, now) : null), [db, data, now]);
  if (!data || !summary) return null;

  const isLatest = db.weeks.every((w) => w.fechaInicio <= data.week.fechaInicio);
  const next = services.weeks.nextWeekPreview();

  const copy = async (text: string, msg: string) => {
    toast((await copyText(text)) ? msg : 'No se pudo copiar. Selecciona el texto manualmente.', 'success');
  };

  const openNext = async () => {
    const ok = await confirm({
      title: `Abrir Semana ${next.numero}`,
      message: `La Semana ${data.week.numero} quedará como historial (sólo lectura). Los compromisos abiertos pasan a revisarse en la siguiente Weekly.`,
      confirmLabel: `Abrir Semana ${next.numero}`,
    });
    if (!ok) return;
    services.weeks.openNextWeek();
    setViewWeekId(undefined);
    toast(`Semana ${next.numero} abierta`);
    onClose();
    navigate('/');
  };

  return (
    <Modal
      title={justClosed ? `✓ Weekly cerrada · Semana ${data.week.numero}` : `Resumen · Semana ${data.week.numero}`}
      subtitle="Información ejecutiva lista para compartir."
      onClose={onClose}
      size="lg"
      label="Resumen de la semana"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => copy(summary.markdown, 'Resumen copiado para Teams')}>
            <ClipboardCopy size={16} aria-hidden /> Copiar para Teams
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => copy(summary.commitmentsOnly, 'Compromisos copiados')}>
            <ClipboardCopy size={16} aria-hidden /> Copiar sólo compromisos
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => downloadFile(`alignment-unblock-semana-${data.week.numero}.md`, summary.markdown, 'text/markdown;charset=utf-8')}>
            <Download size={16} aria-hidden /> Descargar .md
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => downloadFile(`alignment-unblock-semana-${data.week.numero}.txt`, summary.text)}>
            <FileText size={16} aria-hidden /> Descargar .txt
          </button>
          {justClosed && isLatest && data.week.estado === 'cerrada' && (
            <button type="button" className="btn btn-primary" onClick={openNext}>
              <CalendarPlus size={16} aria-hidden /> Abrir Semana {next.numero}
            </button>
          )}
        </>
      }
    >
      <pre className="summary-pre" data-testid="summary-text">{summary.text}</pre>
    </Modal>
  );
}

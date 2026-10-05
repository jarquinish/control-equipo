import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { UpdateOrigin } from '../../domain/types';
import { ProjectFormModal } from './ProjectFormModal';
import { BlockFormModal } from './BlockFormModal';
import { CommitmentFormModal } from './CommitmentFormModal';
import { CompleteModal, CommentModal, EscalateBlockModal, EscalateModal, FailModal, RescheduleModal } from './CommitmentActionModals';
import { DecisionModal } from './DecisionModal';
import { OverrideModal } from './OverrideModal';
import { SummaryModal } from './SummaryModal';

export type ModalRequest =
  | { type: 'project'; projectId?: string; areaId?: string; origen?: UpdateOrigin }
  | { type: 'block'; projectId?: string; blockId?: string; sessionId?: string; origen?: UpdateOrigin }
  | { type: 'commitment'; projectId?: string; blockId?: string; sessionId?: string; commitmentId?: string }
  | { type: 'reschedule'; commitmentId: string; sessionId?: string }
  | { type: 'escalate'; commitmentId: string; sessionId?: string }
  | { type: 'escalateBlock'; blockId: string }
  | { type: 'comment'; commitmentId: string }
  | { type: 'complete'; commitmentId: string; sessionId?: string }
  | { type: 'fail'; commitmentId: string; sessionId?: string }
  | { type: 'decision'; projectId?: string; sessionId?: string }
  | { type: 'override'; projectId: string; sessionId?: string; origen?: UpdateOrigin }
  | { type: 'summary'; weekId?: string; justClosed?: boolean };

interface ModalApi {
  open: (req: ModalRequest) => void;
  close: () => void;
}

const ModalContext = createContext<ModalApi | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<ModalRequest | null>(null);
  const close = useCallback(() => setReq(null), []);
  const api = useMemo(() => ({ open: setReq, close }), [close]);

  return (
    <ModalContext.Provider value={api}>
      {children}
      {req && <ActiveModal req={req} close={close} />}
    </ModalContext.Provider>
  );
}

function ActiveModal({ req, close }: { req: ModalRequest; close: () => void }) {
  switch (req.type) {
    case 'project':
      return <ProjectFormModal {...req} onClose={close} />;
    case 'block':
      return <BlockFormModal {...req} onClose={close} />;
    case 'commitment':
      return <CommitmentFormModal {...req} onClose={close} />;
    case 'reschedule':
      return <RescheduleModal {...req} onClose={close} />;
    case 'escalate':
      return <EscalateModal {...req} onClose={close} />;
    case 'escalateBlock':
      return <EscalateBlockModal {...req} onClose={close} />;
    case 'comment':
      return <CommentModal {...req} onClose={close} />;
    case 'complete':
      return <CompleteModal {...req} onClose={close} />;
    case 'fail':
      return <FailModal {...req} onClose={close} />;
    case 'decision':
      return <DecisionModal {...req} onClose={close} />;
    case 'override':
      return <OverrideModal {...req} onClose={close} />;
    case 'summary':
      return <SummaryModal {...req} onClose={close} />;
  }
}

export function useModals(): ModalApi {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModals fuera de ModalProvider');
  return ctx;
}

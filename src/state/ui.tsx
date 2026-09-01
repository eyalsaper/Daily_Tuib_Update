import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { addDays, today } from '@/lib/date';
import { type RangeKind, type RangeState, rangeBounds, shiftRange } from '@/domain/range';
import { useStore } from './store';

export type Screen =
  | 'emp-report'
  | 'emp-data'
  | 'emp-messages'
  | 'mgr-overview'
  | 'mgr-employee'
  | 'mgr-notes'
  | 'mgr-messages'
  | 'mgr-tasks'
  | 'mgr-report';

interface UiState extends RangeState {
  screen: Screen;
  setScreen: (s: Screen) => void;
  /** Employee whose card the manager is looking at. */
  mgrEmp: string;
  setMgrEmp: (id: string) => void;
  drillTask: string | null;
  setDrillTask: (id: string | null) => void;
  setRange: (r: RangeKind, anchor?: string) => void;
  setFrom: (d: string) => void;
  setTo: (d: string) => void;
  step: (dir: number) => void;
  toast: string | null;
  flash: (msg: string) => void;
  /** Date the report form should open in edit mode for, set by "עריכת הדיווח". */
  editRequest: string | null;
  requestEdit: (date: string) => void;
  clearEditRequest: () => void;
}

const Ctx = createContext<UiState | null>(null);

export function UiProvider({
  children,
  initialScreen,
}: {
  children: ReactNode;
  initialScreen: Screen;
}) {
  const { ensureWindow } = useStore();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [range, setRangeKind] = useState<RangeKind>('week');
  const [anchor, setAnchor] = useState(() => addDays(today(), -7));
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [mgrEmp, setMgrEmp] = useState('');
  const [drillTask, setDrillTask] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editRequest, setEditRequest] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => setScreen(initialScreen), [initialScreen]);

  // Picking an older range has to widen the reports subscription.
  useEffect(() => {
    ensureWindow(rangeBounds({ range, anchor, from, to }).from);
  }, [range, anchor, from, to, ensureWindow]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo<UiState>(
    () => ({
      screen,
      setScreen: (s) => {
        setScreen(s);
        setDrillTask(null);
      },
      range,
      anchor,
      from,
      to,
      mgrEmp,
      setMgrEmp,
      drillTask,
      setDrillTask,
      setRange: (r, a) => {
        setRangeKind(r);
        if (a) setAnchor(a);
      },
      setFrom: (d) => setFrom(d),
      setTo: (d) => setTo(d),
      step: (dir) => {
        const patch = shiftRange({ range, anchor, from, to }, dir);
        if (patch.anchor !== undefined) setAnchor(patch.anchor);
        if (patch.from !== undefined) setFrom(patch.from);
        if (patch.to !== undefined) setTo(patch.to);
      },
      toast,
      flash,
      editRequest,
      requestEdit: (date) => {
        setEditRequest(date);
        setScreen('emp-report');
      },
      clearEditRequest: () => setEditRequest(null),
    }),
    [screen, range, anchor, from, to, mgrEmp, drillTask, toast, flash, editRequest],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUi(): UiState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUi must be used inside <UiProvider>');
  return v;
}

/** The range slice, in the shape the domain helpers expect. */
export function useRangeState(): RangeState {
  const { range, anchor, from, to } = useUi();
  return { range, anchor, from, to };
}

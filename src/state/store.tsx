import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onSnapshot, query, where } from 'firebase/firestore';
import { TEAM, col, docRef } from '@/lib/firebase';
import {
  DEFAULT_ALERTS,
  DEFAULT_TEAM_TARGETS,
  TARGETS_DEFAULT_KEY,
  type LegacyFeedback,
  type LegacyIdea,
  type LegacyReport,
  type LegacySchema,
  type LegacyTargets,
  type LegacyUser,
  attachIdeas,
  buildTasks,
  employeeFromLegacy,
  manualCountFromDoc,
  orphanIdeas,
  reportFromLegacy,
  splitFeedbacks,
  targetsFromLegacy,
} from '@/data/adapters';
import type {
  AlertConfig,
  Db,
  Employee,
  HourlyTargets,
  ManualCount,
  Report,
  Task,
  TargetsConfig,
} from '@/types/models';
import { addDays, today } from '@/lib/date';
import { useAuth } from '@/auth/AuthContext';

/**
 * Live view of the Firestore data, assembled into the domain model.
 *
 * Following the legacy windowing pattern, `reports` is subscribed with
 * `timestamp >= windowStart` rather than loaded whole; picking an older range
 * widens the window through `ensureWindow`.
 */

const DEFAULT_WINDOW_DAYS = 120;

export interface StoreState {
  db: Db;
  ready: boolean;
  error: string | null;
  /** Widen the reports subscription so `from` is covered. */
  ensureWindow: (from: string) => void;
  windowStart: string;
}

const Ctx = createContext<StoreState | null>(null);

const EMPTY_DB: Db = {
  tasks: [],
  employees: [],
  manager: { id: '', name: '', role: 'manager', team: TEAM },
  reports: [],
  notes: [],
  messages: [],
  targets: { team: DEFAULT_TEAM_TARGETS, byEmp: {} },
  readState: { ideas: {}, taskNotes: {}, replies: {}, messages: {} },
  manualCounts: [],
  alerts: DEFAULT_ALERTS,
  mgrSummary: {},
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const signedInId = useAuth().user?.id || '';
  const [windowStart, setWindowStart] = useState(() => addDays(today(), -DEFAULT_WINDOW_DAYS));
  const [error, setError] = useState<string | null>(null);

  const [rawReports, setRawReports] = useState<{ docId: string; d: LegacyReport }[]>([]);
  const [rawIdeas, setRawIdeas] = useState<(LegacyIdea & { docId: string })[]>([]);
  const [rawFeedbacks, setRawFeedbacks] = useState<(LegacyFeedback & { docId: string })[]>([]);
  const [rawUsers, setRawUsers] = useState<Employee[]>([]);
  const [schemas, setSchemas] = useState<Record<string, LegacySchema>>({});
  const [teamConfig, setTeamConfig] = useState<{
    tasks?: string[];
    tasksV2?: Task[];
    alerts?: AlertConfig;
  }>({});
  const [rawTargets, setRawTargets] = useState<Record<string, LegacyTargets>>({});
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [manualCounts, setManualCounts] = useState<ManualCount[]>([]);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState({ reports: false, users: false, tasks: false });

  const fail = useCallback((label: string) => (e: unknown) => {
    console.warn(label, e);
    setError((e as Error)?.message || 'שגיאה בטעינת הנתונים');
  }, []);

  useEffect(() => {
    const q = query(col('reports'), where('timestamp', '>=', windowStart + 'T00:00:00.000Z'));
    return onSnapshot(
      q,
      (snap) => {
        const list: { docId: string; d: LegacyReport }[] = [];
        snap.forEach((d) => list.push({ docId: d.id, d: d.data() as LegacyReport }));
        setRawReports(list);
        setLoaded((s) => ({ ...s, reports: true }));
      },
      fail('reports'),
    );
  }, [windowStart, fail]);

  useEffect(
    () =>
      onSnapshot(
        col('ideas'),
        (snap) => {
          const list: (LegacyIdea & { docId: string })[] = [];
          snap.forEach((d) => list.push({ docId: d.id, ...(d.data() as LegacyIdea) }));
          setRawIdeas(list);
        },
        fail('ideas'),
      ),
    [fail],
  );

  useEffect(
    () =>
      onSnapshot(
        col('feedbacks'),
        (snap) => {
          const list: (LegacyFeedback & { docId: string })[] = [];
          snap.forEach((d) => list.push({ docId: d.id, ...(d.data() as LegacyFeedback) }));
          setRawFeedbacks(list);
        },
        fail('feedbacks'),
      ),
    [fail],
  );

  useEffect(
    () =>
      onSnapshot(
        col('users'),
        (snap) => {
          const list: Employee[] = [];
          snap.forEach((d) => list.push(employeeFromLegacy(d.id, d.data() as LegacyUser)));
          setRawUsers(list);
          setLoaded((s) => ({ ...s, users: true }));
        },
        fail('users'),
      ),
    [fail],
  );

  useEffect(
    () =>
      onSnapshot(
        docRef('task_schemas', 'global'),
        (snap) => {
          setSchemas(snap.exists() ? (snap.data() as Record<string, LegacySchema>) : {});
          setLoaded((s) => ({ ...s, tasks: true }));
        },
        fail('task_schemas'),
      ),
    [fail],
  );

  useEffect(
    () =>
      onSnapshot(
        docRef('team_configs', TEAM),
        (snap) => setTeamConfig(snap.exists() ? (snap.data() as typeof teamConfig) : {}),
        fail('team_configs'),
      ),
    [fail],
  );

  useEffect(
    () =>
      onSnapshot(
        col('employee_targets'),
        (snap) => {
          const o: Record<string, LegacyTargets> = {};
          snap.forEach((d) => (o[d.id] = d.data() as LegacyTargets));
          setRawTargets(o);
        },
        fail('employee_targets'),
      ),
    [fail],
  );

  useEffect(
    () =>
      onSnapshot(
        col('read_marks'),
        (snap) => {
          const set = new Set<string>();
          snap.forEach((d) => set.add(d.id));
          setReadIds(set);
        },
        fail('read_marks'),
      ),
    [fail],
  );

  useEffect(
    () =>
      onSnapshot(
        col('manual_counts'),
        (snap) => {
          const list: ManualCount[] = [];
          snap.forEach((d) => list.push(manualCountFromDoc(d.id, d.data() as Partial<ManualCount>)));
          setManualCounts(list);
        },
        fail('manual_counts'),
      ),
    [fail],
  );

  useEffect(
    () =>
      onSnapshot(
        col('dashboard_checks'),
        (snap) => {
          const o: Record<string, string> = {};
          snap.forEach((d) => {
            const data = d.data() as { summary?: string; key?: string };
            if (typeof data.summary === 'string' && d.id.startsWith('summary_')) {
              o[d.id.replace('summary_', '').replace(/_/g, '-')] = data.summary;
            }
          });
          setSummaries(o);
        },
        fail('dashboard_checks'),
      ),
    [fail],
  );

  const ensureWindow = useCallback((from: string) => {
    setWindowStart((current) => (from < current ? addDays(from, -1) : current));
  }, []);

  const db = useMemo<Db>(() => {
    const tasks = buildTasks(schemas, teamConfig.tasks || [], teamConfig.tasksV2);

    const reports: Report[] = rawReports
      .map(({ docId, d }) => reportFromLegacy(docId, d, tasks))
      .filter((r) => !!r.date && !!r.userId)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    attachIdeas(reports, rawIdeas);
    const withOrphans = reports.concat(orphanIdeas(reports, rawIdeas));

    // The live project has more than one profile with role 'מנהל'. The signed-in
    // manager is the one whose name should appear on notes they send.
    const employees = rawUsers.filter((u) => u.role === 'employee');
    const manager =
      rawUsers.find((u) => u.role === 'manager' && u.id === signedInId) ||
      rawUsers.find((u) => u.role === 'manager') ||
      EMPTY_DB.manager;

    const { notes, messages } = splitFeedbacks(rawFeedbacks, readIds);

    const targets: TargetsConfig = { team: DEFAULT_TEAM_TARGETS, byEmp: {} };
    Object.keys(rawTargets).forEach((id) => {
      const values = targetsFromLegacy(rawTargets[id]);
      if (!values) return;
      if (id === TARGETS_DEFAULT_KEY) targets.team = values;
      else targets.byEmp[id] = values as HourlyTargets;
    });

    const readState = { ideas: {}, taskNotes: {}, replies: {}, messages: {} } as Db['readState'];
    readIds.forEach((id) => {
      const m = /^(ideas|taskNotes|replies|messages)__(.*)$/.exec(id);
      if (!m) return;
      readState[m[1] as keyof typeof readState][m[2]] = true;
    });

    return {
      tasks,
      employees,
      manager,
      reports: withOrphans,
      notes,
      messages,
      targets,
      readState,
      manualCounts,
      alerts: teamConfig.alerts || DEFAULT_ALERTS,
      mgrSummary: summaries,
    };
  }, [
    schemas,
    teamConfig,
    rawReports,
    rawIdeas,
    rawUsers,
    rawFeedbacks,
    rawTargets,
    readIds,
    manualCounts,
    summaries,
    signedInId,
  ]);

  const value = useMemo<StoreState>(
    () => ({
      db,
      ready: loaded.reports && loaded.users && loaded.tasks,
      error,
      ensureWindow,
      windowStart,
    }),
    [db, loaded, error, ensureWindow, windowStart],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside <StoreProvider>');
  return v;
}

export function useDb(): Db {
  return useStore().db;
}

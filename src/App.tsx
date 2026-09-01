import { C } from '@/ui/tokens';
import { Shell } from '@/ui/Shell';
import { useAuth } from '@/auth/AuthContext';
import { useStore } from '@/state/store';
import { UiProvider, useUi } from '@/state/ui';
import { Login } from '@/screens/Login';
import { DailyReport } from '@/screens/employee/DailyReport';
import { MyData } from '@/screens/employee/MyData';
import { Inbox } from '@/screens/employee/Inbox';
import { Overview } from '@/screens/manager/Overview';
import { EmployeeCard } from '@/screens/manager/EmployeeCard';
import { Ideas } from '@/screens/manager/Ideas';
import { TeamBoard } from '@/screens/manager/TeamBoard';
import { TasksAndTargets } from '@/screens/manager/TasksAndTargets';
import { MgmtReport } from '@/screens/manager/MgmtReport';

export function App() {
  const { user } = useAuth();
  const { error, ready } = useStore();

  if (!user) return <Login />;

  return (
    <UiProvider initialScreen={user.role === 'manager' ? 'mgr-overview' : 'emp-report'}>
      <Shell>
        {error && (
          <div
            style={{
              background: C.brandTint,
              border: `1px solid ${C.brandBorder}`,
              color: C.brandDark,
              fontSize: 13,
              padding: '10px 40px',
            }}
          >
            שגיאה בטעינת הנתונים: {error}
          </div>
        )}
        {!ready ? (
          <div style={{ padding: 60, textAlign: 'center', fontSize: 14, color: C.muted }}>
            טוען נתונים…
          </div>
        ) : (
          <Screen />
        )}
      </Shell>
    </UiProvider>
  );
}

function Screen() {
  const { screen } = useUi();
  switch (screen) {
    case 'emp-report':
      return <DailyReport />;
    case 'emp-data':
      return <MyData />;
    case 'emp-messages':
      return <Inbox />;
    case 'mgr-overview':
      return <Overview />;
    case 'mgr-employee':
      return <EmployeeCard />;
    case 'mgr-notes':
      return <Ideas />;
    case 'mgr-messages':
      return <TeamBoard />;
    case 'mgr-tasks':
      return <TasksAndTargets />;
    case 'mgr-report':
      return <MgmtReport />;
    default:
      return null;
  }
}

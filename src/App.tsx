import { createHashRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { NavBar } from './ui';
import { TodayScreen } from './features/today/TodayScreen';
import { PlanScreen } from './features/plan/PlanScreen';
import { TaskFormScreen } from './features/plan/TaskFormScreen';
import { RoutineEditScreen } from './features/plan/RoutineEditScreen';
import { PlanSettingsScreen } from './features/settings/PlanSettingsScreen';
import { JoinScreen } from './features/settings/JoinScreen';
import { SeasonsScreen } from './features/settings/SeasonsScreen';
import { RecordsScreen } from './features/records/RecordsScreen';
import { RecordDetailScreen } from './features/records/RecordDetailScreen';
import { RecordFormScreen } from './features/records/RecordFormScreen';
import { AnalysisScreen } from './features/analysis/AnalysisScreen';
import { DepartmentScreen } from './features/analysis/DepartmentScreen';
import { AdjustMonthlyScreen } from './features/analysis/AdjustMonthlyScreen';
import { GiveADayScreen } from './features/analysis/GiveADayScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';

/** Tab screens show the bottom bar; pushed screens (record detail, forms) do not. */
function TabLayout() {
  return (
    <>
      <Outlet />
      <NavBar />
    </>
  );
}

// Hash routing: works on GitHub Pages (no server rewrites) and when launched from the home screen.
const router = createHashRouter([
  {
    element: <TabLayout />,
    children: [
      { path: '/', element: <Navigate to="/today" replace /> },
      { path: '/today', element: <TodayScreen /> },
      { path: '/plan', element: <PlanScreen /> },
      { path: '/records', element: <RecordsScreen /> },
      { path: '/records/:id', element: <RecordDetailScreen /> },
      { path: '/analysis', element: <AnalysisScreen /> },
      { path: '/analysis/department/:id', element: <DepartmentScreen /> },
    ],
  },
  { path: '/records/new', element: <RecordFormScreen /> },
  { path: '/records/:id/edit', element: <RecordFormScreen /> },
  { path: '/plan/tasks/new', element: <TaskFormScreen /> },
  { path: '/plan/tasks/:id', element: <TaskFormScreen /> },
  { path: '/plan/routine/:type', element: <RoutineEditScreen /> },
  { path: '/analysis/monthly', element: <AdjustMonthlyScreen /> },
  { path: '/analysis/give/:taskId', element: <GiveADayScreen /> },
  { path: '/today/push/:taskId', element: <GiveADayScreen mode="push" /> },
  { path: '/settings', element: <SettingsScreen /> },
  { path: '/settings/plan', element: <PlanSettingsScreen /> },
  { path: '/settings/plan/seasons', element: <SeasonsScreen /> },
  { path: '/join/:key', element: <JoinScreen /> },
  { path: '*', element: <Navigate to="/today" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}

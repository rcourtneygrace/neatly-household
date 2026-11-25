import { createHashRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { NavBar } from './ui';
import { TodayScreen } from './features/today/TodayScreen';
import { PlanScreen } from './features/plan/PlanScreen';
import { RecordsScreen } from './features/records/RecordsScreen';
import { RecordDetailScreen } from './features/records/RecordDetailScreen';
import { RecordFormScreen } from './features/records/RecordFormScreen';
import { AnalysisScreen } from './features/analysis/AnalysisScreen';
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
    ],
  },
  { path: '/records/new', element: <RecordFormScreen /> },
  { path: '/records/:id/edit', element: <RecordFormScreen /> },
  { path: '/settings', element: <SettingsScreen /> },
  { path: '*', element: <Navigate to="/today" replace /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}

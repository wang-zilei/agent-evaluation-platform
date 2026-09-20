import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, useRoutes, type RouteObject } from 'react-router-dom';
import PlatformShell from './platform/PlatformShell';

const EvaluationCenter = lazy(() => import('./features/evaluation/EvaluationCenterPage'));

const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <PlatformShell />,
    children: [
      { index: true, element: <EvaluationCenter /> },
      { path: 'evaluation', element: <Navigate to="/" replace /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

function RouteTree() {
  return useRoutes(appRoutes);
}

function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading__spinner" aria-hidden="true" />
      <span>正在加载</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}>
        <RouteTree />
      </Suspense>
    </BrowserRouter>
  );
}

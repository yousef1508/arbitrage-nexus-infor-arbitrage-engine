import '@/lib/errorReporter';

import { enableMapSet } from 'immer';
enableMapSet();

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  Navigate,
  RouterProvider
} from 'react-router-dom';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { AdminRoute } from '@/components/AdminRoute';

import '@/index.css';

import { AgentPage } from '@/pages/AgentPage';
import { AdminLoginPage } from '@/pages/AdminLoginPage';
import { GovernorPage } from '@/pages/GovernorPage';
import { HomePage } from '@/pages/HomePage';
import { SetupPage } from '@/pages/SetupPage';
import { TreasuryPage } from '@/pages/TreasuryPage';
import { VaultPage } from '@/pages/VaultPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 15_000
    }
  }
});

const protectedRoutes = [
  {
    path: '/',
    element: <HomePage />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/dashboard',
    element: <Navigate to="/" replace />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/vault',
    element: <VaultPage />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/agents',
    element: <AgentPage />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/agent',
    element: <Navigate to="/agents" replace />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/treasury',
    element: <TreasuryPage />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/ledger',
    element: <Navigate to="/treasury" replace />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/governor',
    element: <GovernorPage />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/policy',
    element: <Navigate to="/governor" replace />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/setup',
    element: <SetupPage />,
    errorElement: <RouteErrorBoundary />
  }
];

const router = createBrowserRouter([
  {
    path: '/admin-login',
    element: <AdminLoginPage />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/login',
    element: <Navigate to="/admin-login" replace />,
    errorElement: <RouteErrorBoundary />
  },
  {
    path: '/admin',
    element: <Navigate to="/" replace />,
    errorElement: <RouteErrorBoundary />
  },
  {
    element: <AdminRoute />,
    errorElement: <RouteErrorBoundary />,
    children: protectedRoutes
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
    errorElement: <RouteErrorBoundary />
  }
]);

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('ROOT_ELEMENT_NOT_FOUND');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>
);

import '@/lib/errorReporter';
import { enableMapSet } from "immer";
enableMapSet();
import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import '@/index.css'
import { VaultPage } from '@/pages/VaultPage'
import { AgentPage } from '@/pages/AgentPage'
import { TreasuryPage } from '@/pages/TreasuryPage'
import { GovernorPage } from '@/pages/GovernorPage'
import { HomePage } from '@/pages/HomePage'
import { SetupPage } from '@/pages/SetupPage'
const queryClient = new QueryClient();
const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/vault",
    element: <VaultPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/agents",
    element: <AgentPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/treasury",
    element: <TreasuryPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/governor",
    element: <GovernorPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/setup",
    element: <SetupPage />,
    errorElement: <RouteErrorBoundary />,
  }
]);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
)
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { hasAdminToken } from '@/lib/admin-auth';

export function AdminRoute() {
  const location = useLocation();

  if (!hasAdminToken()) {
    const next = encodeURIComponent(location.pathname + location.search);

    return <Navigate to={`/admin-login?next=${next}`} replace />;
  }

  return <Outlet />;
}
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import type { AuthCheckState, BootstrapRouteData } from '@z0/src/app/types';

interface SetupProps {
  isRouteAccessLoading: boolean;
  bootstrapData?: BootstrapRouteData;
  authState: AuthCheckState;
  loadingElement: ReactNode;
  setupElement: ReactNode;
}

export function Setup({
  isRouteAccessLoading,
  bootstrapData,
  authState,
  loadingElement,
  setupElement,
}: SetupProps) {
  if (isRouteAccessLoading) {
    return <>{loadingElement}</>;
  }

  if (bootstrapData?.requires_setup !== false) {
    return <>{setupElement}</>;
  }

  if (authState === 'unauthenticated') {
    return <Navigate to="/sign-in?next=%2Fconsole" replace />;
  }

  return <Navigate to="/console" replace />;
}

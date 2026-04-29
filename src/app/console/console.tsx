import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import type { AuthCheckState, BootstrapRouteData } from '@z0/src/app/types';

interface ConsoleProps {
  isRouteAccessLoading: boolean;
  bootstrapData?: BootstrapRouteData;
  authState: AuthCheckState;
  loadingElement: ReactNode;
  consoleElement: ReactNode;
}

export function Console({
  isRouteAccessLoading,
  bootstrapData,
  authState,
  loadingElement,
  consoleElement,
}: ConsoleProps) {
  if (isRouteAccessLoading) {
    return <>{loadingElement}</>;
  }

  if (bootstrapData?.requires_setup === true) {
    return <Navigate to="/" replace />;
  }

  if (authState === 'unauthenticated') {
    return <Navigate to="/sign-in?next=%2Fconsole" replace />;
  }

  return <>{consoleElement}</>;
}

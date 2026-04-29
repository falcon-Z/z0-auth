import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import type { AuthCheckState, BootstrapRouteData } from '@z0/src/app/types';

interface SignInProps {
  isRouteAccessLoading: boolean;
  bootstrapData?: BootstrapRouteData;
  authState: AuthCheckState;
  loadingElement: ReactNode;
  signInElement: ReactNode;
}

export function SignIn({
  isRouteAccessLoading,
  bootstrapData,
  authState,
  loadingElement,
  signInElement,
}: SignInProps) {
  if (isRouteAccessLoading) {
    return <>{loadingElement}</>;
  }

  if (bootstrapData?.requires_setup === true) {
    return <Navigate to="/" replace />;
  }

  if (authState === 'authenticated') {
    return <Navigate to="/console" replace />;
  }

  return <>{signInElement}</>;
}

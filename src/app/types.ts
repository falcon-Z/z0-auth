export type AuthCheckState = 'loading' | 'authenticated' | 'unauthenticated' | 'unsupported' | 'error';

export interface BootstrapRouteData {
  requires_setup: boolean;
}

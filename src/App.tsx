import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';

import { Console } from '@z0/src/app/console/console';
import { SignIn } from '@z0/src/app/auth/signin';
import { Index } from '@z0/src/app/index';
import { Setup } from '@z0/src/app/setup/setup';
import type { AuthCheckState } from '@z0/src/app/types';
import { Button } from '@z0/src/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@z0/src/components/ui/card';
import { Input } from '@z0/src/components/ui/input';
import { Label } from '@z0/src/components/ui/label';

import './index.css';

type SetupStep = 'checking' | 'form' | 'submitting' | 'success';
type AsyncState = 'loading' | 'success' | 'error';
type SetupField = keyof SetupFormData;

interface SetupFormData {
  platformName: string;
  adminEmail: string;
  adminPassword: string;
  confirmPassword: string;
}

interface ValidationIssue {
  field: SetupField;
  message: string;
}

interface BootstrapStatusResponse {
  bootstrapped: boolean;
  requires_setup: boolean;
  timestamp: string;
}

interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  database: {
    connected: boolean;
    migrations: {
      applied: number;
      total: number;
      pending: number;
    };
  };
  timestamp: string;
}

interface LivenessResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
}

interface AuthSessionResponse {
  authenticated?: boolean;
}

interface AsyncResult<T> {
  state: AsyncState;
  data?: T;
  error?: string;
}

interface StatusDescriptor {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'error';
  summary: string;
  detail: string;
}

const initialFormData: SetupFormData = {
  platformName: '',
  adminEmail: '',
  adminPassword: '',
  confirmPassword: '',
};

export function validateSetupForm(formData: SetupFormData): ValidationIssue | null {
  if (!formData.platformName.trim()) {
    return { field: 'platformName', message: 'Platform name is required' };
  }

  if (formData.platformName.trim().length < 3) {
    return { field: 'platformName', message: 'Platform name must be at least 3 characters' };
  }

  if (formData.platformName.trim().length > 255) {
    return { field: 'platformName', message: 'Platform name must be 255 characters or fewer' };
  }

  if (!formData.adminEmail.trim()) {
    return { field: 'adminEmail', message: 'Admin email is required' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail)) {
    return { field: 'adminEmail', message: 'Invalid email format' };
  }

  if (formData.adminPassword.length < 12) {
    return { field: 'adminPassword', message: 'Password must be at least 12 characters' };
  }

  if (!/[a-z]/.test(formData.adminPassword)) {
    return { field: 'adminPassword', message: 'Password must contain lowercase letters' };
  }

  if (!/[A-Z]/.test(formData.adminPassword)) {
    return { field: 'adminPassword', message: 'Password must contain uppercase letters' };
  }

  if (!/\d/.test(formData.adminPassword)) {
    return { field: 'adminPassword', message: 'Password must contain numbers' };
  }

  if (!/[@$!%*?&]/.test(formData.adminPassword)) {
    return {
      field: 'adminPassword',
      message: 'Password must contain special characters (@$!%*?&)',
    };
  }

  if (formData.adminPassword !== formData.confirmPassword) {
    return { field: 'confirmPassword', message: 'Passwords do not match' };
  }

  return null;
}

export function mapApiFieldToSetupField(field: string): SetupField | null {
  switch (field) {
    case 'platform_name':
      return 'platformName';
    case 'admin_email':
      return 'adminEmail';
    case 'admin_password':
      return 'adminPassword';
    case 'confirm_password':
      return 'confirmPassword';
    default:
      return null;
  }
}

export function extractApiError(payload: unknown, fallback = 'Setup failed. Please try again.'): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const data = payload as { error?: unknown; details?: Record<string, unknown> };
  const details = data.details && typeof data.details === 'object' ? Object.values(data.details) : [];
  const firstDetail = details.find((detail) => typeof detail === 'string');

  if (typeof firstDetail === 'string') {
    return firstDetail;
  }

  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error;
  }

  return fallback;
}

export function describeBootstrapStatus(data: BootstrapStatusResponse | null): StatusDescriptor {
  if (!data) {
    return {
      label: 'Unknown',
      tone: 'neutral',
      summary: 'Bootstrap state unavailable',
      detail: 'The console has not received a bootstrap response yet.',
    };
  }

  if (data.requires_setup) {
    return {
      label: 'Setup required',
      tone: 'warning',
      summary: 'Platform initialization has not completed.',
      detail: 'Run the setup wizard before using operator console checks.',
    };
  }

  if (!data.bootstrapped) {
    return {
      label: 'Inconsistent',
      tone: 'warning',
      summary: 'Bootstrap state is inconsistent.',
      detail: 'Platform reports setup is not required but the bootstrapped flag is false. Contact your operator.',
    };
  }

  return {
    label: 'Verified',
    tone: 'success',
    summary: 'Bootstrap completed successfully.',
    detail: `Status confirmed at ${formatTimestamp(data.timestamp)}.`,
  };
}

export function describeReadinessStatus(data: ReadinessResponse | null): StatusDescriptor {
  if (!data) {
    return {
      label: 'Unknown',
      tone: 'neutral',
      summary: 'Readiness state unavailable',
      detail: 'The readiness check has not returned yet.',
    };
  }

  if (data.status === 'ready') {
    return {
      label: 'Ready',
      tone: 'success',
      summary: 'Service is ready to accept traffic.',
      detail: `${data.database.migrations.applied}/${data.database.migrations.total} migrations applied.`,
    };
  }

  return {
    label: 'Not ready',
    tone: 'warning',
    summary: 'Dependencies still need attention before traffic should be sent.',
    detail: `${data.database.migrations.pending} migrations pending. Database connected: ${data.database.connected ? 'yes' : 'no'}.`,
  };
}

export function describeLivenessStatus(data: LivenessResponse | null): StatusDescriptor {
  if (!data) {
    return {
      label: 'Unknown',
      tone: 'neutral',
      summary: 'Liveness state unavailable',
      detail: 'The liveness endpoint has not returned yet.',
    };
  }

  return {
    label: 'Live',
    tone: 'success',
    summary: 'Server process is running.',
    detail: `Uptime ${formatUptime(data.uptime)}.`,
  };
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0s';
  }

  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  const parts = [
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
    `${remainingSeconds}s`,
  ].filter(Boolean);

  return parts.join(' ');
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export async function readErrorResponse(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    return 'Access denied for this endpoint.';
  }

  const contentType = response.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('application/json')) {
      return extractApiError(await response.json(), `Request failed with status ${response.status}.`);
    }

    const message = (await response.text()).trim();
    return message || `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

export async function fetchReadiness(): Promise<ReadinessResponse> {
  let response: Response;
  try {
    response = await fetch('/health/ready');
  } catch {
    throw new Error('Network request failed.');
  }

  if (response.ok || response.status === 503) {
    try {
      return await response.json() as ReadinessResponse;
    } catch {
      throw new Error(`Readiness check returned status ${response.status} with an unreadable body.`);
    }
  }

  throw new Error(await readErrorResponse(response));
}

export async function fetchJson<T>(paths: string[]): Promise<T> {
  let lastError = 'Request failed.';

  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (response.ok) {
        return await response.json() as T;
      }

      const message = await readErrorResponse(response);
      lastError = message;

      if (response.status === 404 && path !== paths[paths.length - 1]) {
        continue;
      }

      throw new Error(message);
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Network request failed.';
    }
  }

  throw new Error(lastError);
}

export async function fetchAuthState(paths: string[] = ['/api/v1/auth/session']): Promise<'authenticated' | 'unauthenticated' | 'unsupported'> {
  for (const path of paths) {
    let response: Response;

    try {
      response = await fetch(path, {
        headers: {
          Accept: 'application/json',
        },
      });
    } catch {
      throw new Error('Network request failed.');
    }

    if (response.status === 401 || response.status === 403) {
      return 'unauthenticated';
    }

    if (response.status === 404) {
      continue;
    }

    if (!response.ok) {
      throw new Error(await readErrorResponse(response));
    }

    let payload: AuthSessionResponse | null = null;
    try {
      payload = await response.json() as AuthSessionResponse;
    } catch {
      return 'authenticated';
    }

    if (typeof payload?.authenticated === 'boolean') {
      return payload.authenticated ? 'authenticated' : 'unauthenticated';
    }

    return 'authenticated';
  }

  return 'unsupported';
}

function sanitizeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/')) {
    return '/console';
  }

  if (value.startsWith('//')) {
    return '/console';
  }

  return value;
}

function RouteLoading({ title, description }: { title: string; description: string }) {
  return (
    <PageShell>
      <Card className="w-full max-w-xl border-border/80 shadow-none">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div aria-live="polite" className="rounded-lg border border-border bg-muted px-4 py-4 text-sm text-muted-foreground">
            Checking route access...
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function SignInRequired({ authState, authError }: { authState: AuthCheckState; authError?: string }) {
  const [searchParams] = useSearchParams();
  const nextPath = sanitizeNextPath(searchParams.get('next'));

  return (
    <PageShell>
      <Card className="w-full max-w-xl border-border/80 shadow-none">
        <CardHeader className="space-y-3">
          <StatusBadge tone="warning" label="Sign-in required" />
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight">Authenticate to continue</CardTitle>
            <CardDescription>
              Access to the operator console requires an authenticated user session.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {authState === 'unsupported' ? (
            <AsyncNotice
              tone="info"
              message="User session endpoint is not available yet. Console access remains open until server-side authentication is configured."
            />
          ) : null}
          {authState === 'error' ? <AsyncNotice tone="error" message={authError ?? 'Authentication state could not be verified.'} /> : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="sm:flex-1">
              <Link to={nextPath}>Retry access</Link>
            </Button>
            <Button asChild variant="outline" className="sm:flex-1">
              <Link to="/">Open setup wizard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center justify-center">
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ tone, label }: { tone: StatusDescriptor['tone']; label: string }) {
  const baseClass = 'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium';

  if (tone === 'neutral') {
    return (
      <span className={`${baseClass} border-border bg-muted text-muted-foreground`}>
        {label}
      </span>
    );
  }

  return (
    <span
      className={baseClass}
      style={{
        borderColor: `var(--semantic-${tone}-border)`,
        backgroundColor: `var(--semantic-${tone}-bg)`,
        color: `var(--semantic-${tone}-text)`,
      }}
    >
      {label}
    </span>
  );
}

function AsyncNotice({ tone, message, id }: { tone: 'error' | 'info'; message: string; id?: string }) {
  if (tone === 'error') {
    return (
      <div
        id={id}
        aria-live="polite"
        className="rounded-lg border px-4 py-3 text-sm"
        style={{
          borderColor: 'var(--semantic-error-border)',
          backgroundColor: 'var(--semantic-error-bg)',
          color: 'var(--semantic-error-text)',
        }}
      >
        {message}
      </div>
    );
  }

  return (
    <div id={id} aria-live="polite" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function StatusCard<T>({
  title,
  description,
  result,
  descriptor,
  children,
}: {
  title: string;
  description: string;
  result: AsyncResult<T>;
  descriptor: StatusDescriptor;
  children?: React.ReactNode;
}) {
  return (
    <Card className="h-full border-border/80 bg-card/95 shadow-none">
      <CardHeader className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-medium tracking-tight">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <StatusBadge tone={descriptor.tone} label={descriptor.label} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {result.state === 'loading' ? (
          <div className="space-y-2" aria-live="polite">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : result.state === 'error' ? (
          <AsyncNotice tone="error" message={result.error ?? 'Request failed.'} />
        ) : (
          <>
            <div className="space-y-1">
              <p className="font-medium text-foreground">{descriptor.summary}</p>
              <p className="text-muted-foreground">{descriptor.detail}</p>
            </div>
            {children}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SetupWizard({ statusNotice: statusNoticeOverride = '' }: { statusNotice?: string }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<SetupStep>('form');
  const [formData, setFormData] = useState<SetupFormData>(initialFormData);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState<SetupField | null>(null);
  const [statusNotice] = useState(statusNoticeOverride);
  const fieldRefs: Record<SetupField, React.RefObject<HTMLInputElement | null>> = {
    platformName: useRef<HTMLInputElement>(null),
    adminEmail: useRef<HTMLInputElement>(null),
    adminPassword: useRef<HTMLInputElement>(null),
    confirmPassword: useRef<HTMLInputElement>(null),
  };

  const focusField = (field: SetupField | null) => {
    if (!field) {
      return;
    }

    fieldRefs[field].current?.focus();
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));

    if (error) {
      setError('');
      setInvalidField(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const submittedFormData: SetupFormData = {
      platformName: String(new FormData(event.currentTarget).get('platformName') ?? ''),
      adminEmail: String(new FormData(event.currentTarget).get('adminEmail') ?? ''),
      adminPassword: String(new FormData(event.currentTarget).get('adminPassword') ?? ''),
      confirmPassword: String(new FormData(event.currentTarget).get('confirmPassword') ?? ''),
    };

    setFormData(submittedFormData);

    const validationIssue = validateSetupForm(submittedFormData);
    if (validationIssue) {
      setError(validationIssue.message);
      setInvalidField(validationIssue.field);
      focusField(validationIssue.field);
      return;
    }

    setStep('submitting');

    try {
      const response = await fetch('/api/v1/bootstrap/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform_name: submittedFormData.platformName,
          admin_email: submittedFormData.adminEmail,
          admin_password: submittedFormData.adminPassword,
          confirm_password: submittedFormData.confirmPassword,
        }),
      });

      if (response.ok) {
        setStep('success');
        setTimeout(() => {
          navigate('/console', { replace: true });
        }, 2000);
        return;
      }

      const payload = await response.json().catch(() => null);
      const fieldName = payload && typeof payload === 'object' && payload.details && typeof payload.details === 'object'
        ? mapApiFieldToSetupField(Object.keys(payload.details)[0] ?? '')
        : null;

      setError(extractApiError(payload));
      setInvalidField(fieldName);
      setStep('form');
      focusField(fieldName);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setStep('form');
    }
  };

  if (step === 'checking') {
    return (
      <PageShell>
        <Card className="w-full max-w-xl border-border/80 shadow-none">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold tracking-tight">Preparing setup</CardTitle>
            <CardDescription>Checking whether this installation still needs first-run setup.</CardDescription>
          </CardHeader>
          <CardContent>
            <div aria-live="polite" className="rounded-lg border border-border bg-muted px-4 py-4 text-sm text-muted-foreground">
              Checking setup status...
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (step === 'success') {
    return (
      <PageShell>
        <Card className="w-full max-w-xl border-border/80 shadow-none">
          <CardHeader className="space-y-3 text-center">
            <StatusBadge tone="success" label="Setup complete" />
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold tracking-tight">Platform initialized</CardTitle>
              <CardDescription>
                The super admin account and default tenant were created successfully. Redirecting to the operator console.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <Card className="border-border/80 shadow-none">
          <CardHeader className="space-y-4">
            <StatusBadge tone="neutral" label="First-run setup" />
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold tracking-tight">Initialize Z0 Auth</CardTitle>
              <CardDescription>
                Complete the one-time setup to create the platform record, administrator account, and default tenant.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-lg border border-border bg-muted/60 p-4">
              <p className="font-medium text-foreground">What happens during setup</p>
              <p className="mt-2">Setup creates the platform record, stores the administrator credentials securely, and prepares this installation for sign-in and verification.</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-medium text-foreground">Before you submit</p>
              <p className="mt-2">Use an email inbox you monitor and a strong password. This action only completes once for each installation.</p>
            </div>
            <p className="text-xs">After setup, the operator console shows setup status, readiness, liveness, and the OpenAPI link.</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-none">
          <CardHeader>
            <CardTitle className="text-xl font-semibold tracking-tight">Setup wizard</CardTitle>
            <CardDescription>Enter the minimum required information to initialize the platform.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusNotice ? <AsyncNotice tone="info" message={statusNotice} /> : null}
            {error ? <AsyncNotice id="setup-field-error" tone="error" message={error} /> : null}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="platformName">Platform name</Label>
                <Input
                  ref={fieldRefs.platformName}
                  id="platformName"
                  name="platformName"
                  type="text"
                  autoComplete="organization"
                  value={formData.platformName}
                  onChange={handleInputChange}
                  placeholder="Example: Acme Identity"
                  aria-invalid={invalidField === 'platformName'}
                  aria-describedby={invalidField === 'platformName' ? 'setup-field-error' : undefined}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminEmail">Admin email</Label>
                <Input
                  ref={fieldRefs.adminEmail}
                  id="adminEmail"
                  name="adminEmail"
                  type="email"
                  autoComplete="email"
                  value={formData.adminEmail}
                  onChange={handleInputChange}
                  placeholder="admin@example.com"
                  aria-invalid={invalidField === 'adminEmail'}
                  aria-describedby={invalidField === 'adminEmail' ? 'setup-field-error' : undefined}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminPassword">Password</Label>
                <Input
                  ref={fieldRefs.adminPassword}
                  id="adminPassword"
                  name="adminPassword"
                  type="password"
                  autoComplete="new-password"
                  value={formData.adminPassword}
                  onChange={handleInputChange}
                  placeholder="Use a strong administrator password"
                  aria-invalid={invalidField === 'adminPassword'}
                  aria-describedby={invalidField === 'adminPassword' ? 'setup-field-error' : undefined}
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 12 characters with uppercase, lowercase, number, and special character.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  ref={fieldRefs.confirmPassword}
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Repeat the administrator password"
                  aria-invalid={invalidField === 'confirmPassword'}
                  aria-describedby={invalidField === 'confirmPassword' ? 'setup-field-error' : undefined}
                />
              </div>

              <Button className="w-full" type="submit" disabled={step === 'submitting'}>
                {step === 'submitting' ? 'Initializing platform...' : 'Initialize platform'}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                This one-time action creates the administrator account and default tenant for this installation.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function OperatorConsole({ initialBootstrapStatus }: { initialBootstrapStatus?: BootstrapStatusResponse }) {
  const [bootstrapResult, setBootstrapResult] = useState<AsyncResult<BootstrapStatusResponse>>(
    initialBootstrapStatus ? { state: 'success', data: initialBootstrapStatus } : { state: 'loading' },
  );
  const [readinessResult, setReadinessResult] = useState<AsyncResult<ReadinessResponse>>({ state: 'loading' });
  const [livenessResult, setLivenessResult] = useState<AsyncResult<LivenessResponse>>({ state: 'loading' });
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const hasHydratedInitialBootstrap = useRef(Boolean(initialBootstrapStatus));

  const loadConsoleState = async () => {
    setIsRefreshing(true);
    const shouldRefetchBootstrap = !hasHydratedInitialBootstrap.current;

    if (shouldRefetchBootstrap) {
      setBootstrapResult((current) => current.data ? current : { state: 'loading' });
    }

    setReadinessResult((current) => current.data ? current : { state: 'loading' });
    setLivenessResult((current) => current.data ? current : { state: 'loading' });

    const tasks: Array<Promise<void>> = [
      fetchReadiness()
        .then((data) => setReadinessResult({ state: 'success', data }))
        .catch((error) => setReadinessResult({ state: 'error', error: error instanceof Error ? error.message : 'Readiness request failed.' })),
      fetchJson<LivenessResponse>(['/health/live', '/health'])
        .then((data) => setLivenessResult({ state: 'success', data }))
        .catch((error) => setLivenessResult({ state: 'error', error: error instanceof Error ? error.message : 'Liveness request failed.' })),
    ];

    if (shouldRefetchBootstrap) {
      tasks.unshift(
        fetchJson<BootstrapStatusResponse>(['/api/v1/bootstrap/status'])
          .then((data) => setBootstrapResult({ state: 'success', data }))
          .catch((error) => setBootstrapResult({ state: 'error', error: error instanceof Error ? error.message : 'Bootstrap request failed.' })),
      );
    }

    await Promise.allSettled(tasks);
    hasHydratedInitialBootstrap.current = false;
    setLastUpdated(new Date().toISOString());
    setIsRefreshing(false);
  };

  useEffect(() => {
    void loadConsoleState();
  }, []);

  const bootstrapDescriptor = bootstrapResult.state === 'success'
    ? describeBootstrapStatus(bootstrapResult.data ?? null)
    : bootstrapResult.state === 'error'
      ? { label: 'Error', tone: 'error', summary: 'Bootstrap verification failed.', detail: bootstrapResult.error ?? 'Unable to load bootstrap state.' }
      : describeBootstrapStatus(null);

  const readinessDescriptor = readinessResult.state === 'success'
    ? describeReadinessStatus(readinessResult.data ?? null)
    : readinessResult.state === 'error'
      ? { label: 'Error', tone: 'error', summary: 'Readiness check failed.', detail: readinessResult.error ?? 'Unable to load readiness state.' }
      : describeReadinessStatus(null);

  const livenessDescriptor = livenessResult.state === 'success'
    ? describeLivenessStatus(livenessResult.data ?? null)
    : livenessResult.state === 'error'
      ? { label: 'Error', tone: 'error', summary: 'Liveness check failed.', detail: livenessResult.error ?? 'Unable to load liveness state.' }
      : describeLivenessStatus(null);

  const hasFailures = [bootstrapResult, readinessResult, livenessResult].some((result) => result.state === 'error');

  return (
    <PageShell>
      <div className="flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card/90 p-6 shadow-none lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <StatusBadge tone="neutral" label="Operator console" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Deployment verification</h1>
              <p className="text-sm text-muted-foreground">
                Confirm setup status and service health using the available API checks.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center">
            <span aria-live="polite">
              {lastUpdated ? `Last updated ${formatTimestamp(lastUpdated)}` : 'Loading current status...'}
            </span>
            <Button type="button" variant="outline" disabled={isRefreshing} onClick={() => void loadConsoleState()}>
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {hasFailures ? (
          <AsyncNotice
            tone="error"
            message="One or more operator checks failed to load. Review the individual panels and retry after the service is reachable."
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatusCard
            title="Bootstrap verification"
            description="GET /api/v1/bootstrap/status"
            result={bootstrapResult}
            descriptor={bootstrapDescriptor}
          >
            {bootstrapResult.data?.requires_setup ? (
              <Button asChild variant="outline">
                <Link to="/">Open setup wizard</Link>
              </Button>
            ) : null}
          </StatusCard>

          <StatusCard
            title="Service readiness"
            description="GET /health/ready"
            result={readinessResult}
            descriptor={readinessDescriptor}
          >
            {readinessResult.data ? (
              <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <dt className="font-medium text-foreground">Database</dt>
                  <dd>{readinessResult.data.database.connected ? 'Connected' : 'Unavailable'}</dd>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <dt className="font-medium text-foreground">Applied</dt>
                  <dd>{readinessResult.data.database.migrations.applied}</dd>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <dt className="font-medium text-foreground">Pending</dt>
                  <dd>{readinessResult.data.database.migrations.pending}</dd>
                </div>
              </dl>
            ) : null}
          </StatusCard>

          <StatusCard
            title="Service liveness"
            description="GET /health/live"
            result={livenessResult}
            descriptor={livenessDescriptor}
          >
            {livenessResult.data ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Endpoint response timestamp: {formatTimestamp(livenessResult.data.timestamp)}
              </div>
            ) : null}
          </StatusCard>
        </div>

        <Card className="border-border/80 shadow-none">
          <CardHeader>
            <CardTitle className="text-lg font-medium tracking-tight">API contract</CardTitle>
            <CardDescription>Quick access to the current machine-readable OpenAPI contract for operator verification.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Use the JSON contract for tooling import and a direct endpoint check during bootstrap verification.
            </p>
            <Button asChild>
              <a href="/.well-known/openapi.json">Open OpenAPI JSON</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function AppRoutes() {
  const [bootstrapResult, setBootstrapResult] = useState<AsyncResult<BootstrapStatusResponse>>({ state: 'loading' });
  const [authResult, setAuthResult] = useState<{ state: AuthCheckState; error?: string }>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const resolveRouteAccess = async () => {
      try {
        const bootstrap = await fetchJson<BootstrapStatusResponse>(['/api/v1/bootstrap/status']);
        if (!cancelled) {
          setBootstrapResult({ state: 'success', data: bootstrap });
        }
      } catch (error) {
        if (!cancelled) {
          setBootstrapResult({
            state: 'error',
            error: error instanceof Error ? error.message : 'Bootstrap status request failed.',
          });
        }
      }

      try {
        const authState = await fetchAuthState();
        if (!cancelled) {
          setAuthResult({ state: authState });
        }
      } catch (error) {
        if (!cancelled) {
          setAuthResult({
            state: 'error',
            error: error instanceof Error ? error.message : 'Authentication state request failed.',
          });
        }
      }
    };

    void resolveRouteAccess();

    return () => {
      cancelled = true;
    };
  }, []);

  const isRouteAccessLoading = bootstrapResult.state === 'loading' || authResult.state === 'loading';
  const bootstrapData = bootstrapResult.data;
  const setupStatusNotice = bootstrapResult.state === 'error'
    ? 'Setup status could not be verified. If this is a new installation, continue the first-run setup here.'
    : '';
  const setupElement = <SetupWizard statusNotice={setupStatusNotice} />;
  const setupLoadingElement = <RouteLoading title="Preparing setup" description="Checking initialization and access state." />;
  const consoleLoadingElement = <RouteLoading title="Loading console" description="Validating setup and user access before opening operator tools." />;
  const signInLoadingElement = <RouteLoading title="Checking access" description="Resolving authentication requirements for this environment." />;

  return (
    <Routes>
      <Route
        path="/"
        element={<Index isRouteAccessLoading={isRouteAccessLoading} bootstrapData={bootstrapData} authState={authResult.state} loadingElement={setupLoadingElement} setupElement={setupElement} />}
      />
      <Route
        path="/setup"
        element={<Setup isRouteAccessLoading={isRouteAccessLoading} bootstrapData={bootstrapData} authState={authResult.state} loadingElement={setupLoadingElement} setupElement={setupElement} />}
      />
      <Route path="/bootstrap" element={<Navigate to="/" replace />} />
      <Route
        path="/console"
        element={<Console isRouteAccessLoading={isRouteAccessLoading} bootstrapData={bootstrapData} authState={authResult.state} loadingElement={consoleLoadingElement} consoleElement={<OperatorConsole initialBootstrapStatus={bootstrapData} />} />}
      />
      <Route
        path="/sign-in"
        element={<SignIn isRouteAccessLoading={isRouteAccessLoading} bootstrapData={bootstrapData} authState={authResult.state} loadingElement={signInLoadingElement} signInElement={<SignInRequired authState={authResult.state} authError={authResult.error} />} />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;

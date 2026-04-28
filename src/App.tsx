import React, { useState, useEffect } from 'react';
import './index.css';

type SetupStep = 'check' | 'form' | 'loading' | 'success' | 'error';

interface SetupFormData {
  platformName: string;
  adminEmail: string;
  adminPassword: string;
  confirmPassword: string;
}

function SetupWizard() {
  const [step, setStep] = useState<SetupStep>('check');
  const isConsoleRoute = window.location.pathname === '/console' || window.location.pathname === '/console/';
  const [formData, setFormData] = useState<SetupFormData>({
    platformName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string>('');

  // Check if already bootstrapped
  useEffect(() => {
    const checkBootstrapState = async () => {
      try {
        const response = await fetch('/api/v1/bootstrap/status');
        if (!response.ok) {
          setStep('form');
          return;
        }

        const data = await response.json() as { requires_setup?: boolean };
        if (data.requires_setup === false) {
          if (isConsoleRoute) {
            setStep('success');
          } else {
            // Already bootstrapped, redirect to console
            window.location.href = '/console';
          }
        } else {
          if (isConsoleRoute) {
            window.location.href = '/';
          } else {
            setStep('form');
          }
        }
      } catch {
        // Not yet bootstrapped, show setup form
        if (isConsoleRoute) {
          window.location.href = '/';
        } else {
          setStep('form');
        }
      }
    };

    checkBootstrapState();
  }, []);

  if (isConsoleRoute && step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-slate-800 rounded-lg shadow-2xl p-8 border border-slate-700 text-slate-100">
          <h1 className="text-2xl font-bold mb-3">Console Stub</h1>
          <p className="text-slate-300 mb-6">
            Bootstrap is complete. Full operator console UI will be added in a later phase.
          </p>
          <a
            href="/.well-known/openapi.json"
            className="inline-flex items-center rounded-md bg-slate-100 px-4 py-2 text-slate-900 font-medium hover:bg-white transition-colors"
          >
            View OpenAPI JSON
          </a>
        </div>
      </div>
    );
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const validateForm = (): boolean => {
    if (!formData.platformName.trim()) {
      setError('Platform name is required');
      return false;
    }
    if (!formData.adminEmail.trim()) {
      setError('Admin email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail)) {
      setError('Invalid email format');
      return false;
    }
    if (formData.adminPassword.length < 12) {
      setError('Password must be at least 12 characters');
      return false;
    }
    if (!/[a-z]/.test(formData.adminPassword)) {
      setError('Password must contain lowercase letters');
      return false;
    }
    if (!/[A-Z]/.test(formData.adminPassword)) {
      setError('Password must contain uppercase letters');
      return false;
    }
    if (!/\d/.test(formData.adminPassword)) {
      setError('Password must contain numbers');
      return false;
    }
    if (!/[@$!%*?&]/.test(formData.adminPassword)) {
      setError('Password must contain special characters (@$!%*?&)');
      return false;
    }
    if (formData.adminPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setStep('loading');

    try {
      const response = await fetch('/api/v1/bootstrap/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform_name: formData.platformName,
          admin_email: formData.adminEmail,
          admin_password: formData.adminPassword,
          confirm_password: formData.confirmPassword,
        }),
      });

      if (response.ok) {
        setStep('success');
        setTimeout(() => {
          window.location.href = '/console';
        }, 2000);
      } else {
        const data = await response.json() as { error?: string; details?: Record<string, string> };
        if (typeof data.error === 'string') {
          setError(data.error);
        } else if (data.details && typeof data.details === 'object') {
          const firstDetail = Object.values(data.details)[0];
          setError(typeof firstDetail === 'string' ? firstDetail : 'Setup failed. Please try again.');
        } else {
          setError('Setup failed. Please try again.');
        }
        setStep('form');
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
      setStep('form');
    }
  };

  if (step === 'check') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Checking bootstrap state...</div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-800 rounded-lg shadow-2xl p-8 border border-slate-700">
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white">Setup Complete!</h2>
            <p className="text-slate-300 text-center">Your Z0 Auth platform is ready. Redirecting to console...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-lg shadow-2xl p-8 border border-slate-700">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Z0 Auth</h1>
          <p className="text-slate-400 text-sm">Self-hosted authentication and IAM service</p>
        </div>

        {step === 'loading' ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
            <p className="text-slate-300">Setting up your platform...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-900 bg-opacity-50 border border-red-700 rounded text-red-200 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">Platform Name</label>
              <input
                type="text"
                name="platformName"
                value={formData.platformName}
                onChange={handleInputChange}
                placeholder="My Company"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">Admin Email</label>
              <input
                type="email"
                name="adminEmail"
                value={formData.adminEmail}
                onChange={handleInputChange}
                placeholder="admin@example.com"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                name="adminPassword"
                value={formData.adminPassword}
                onChange={handleInputChange}
                placeholder="••••••••"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-slate-400 text-xs mt-1">
                Min 12 characters: uppercase, lowercase, number, special char (@$!%*?&)
              </p>
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="••••••••"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={step === 'loading'}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-medium rounded transition-colors"
            >
              Initialize Platform
            </button>

            <p className="text-slate-400 text-xs text-center">
              This will create your super admin account and default tenant. This step can only be performed once.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export function App() {
  return <SetupWizard />;
}

export default App;

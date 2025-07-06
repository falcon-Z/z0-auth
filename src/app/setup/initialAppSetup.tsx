import {
  Card,
  CardTitle,
  CardHeader,
  CardContent,
  CardDescription,
} from "@z0/components/ui/card";
import { Button } from "@z0/components/ui/button";

export default function initialAppSetup() {
  return (
    <div class="grid place-items-center h-full w-full p-6">
      <Card class="w-full max-w-md">
        <CardHeader>
          <CardTitle>Let's Set things up!</CardTitle>
          <CardDescription>
            Get started by creating your first admin account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="setup-form" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="grid gap-2">
                <label class="text-sm font-medium leading-none" for="firstName">
                  First Name
                </label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  placeholder="John"
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  required
                />
              </div>
              <div class="grid gap-2">
                <label class="text-sm font-medium leading-none" for="lastName">
                  Last Name
                </label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  placeholder="Doe"
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  required
                />
              </div>
            </div>

            <div class="grid gap-2">
              <label class="text-sm font-medium leading-none" for="email">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="admin@example.com"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>

            <div class="grid gap-2">
              <label class="text-sm font-medium leading-none" for="password">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Enter your password"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                minLength={8}
                required
              />
            </div>

            <div class="grid gap-2">
              <label
                class="text-sm font-medium leading-none"
                for="confirmPassword"
              >
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                placeholder="Confirm your password"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                minLength={8}
                required
              />
            </div>

            <div
              id="error-message"
              class="hidden text-destructive text-sm bg-destructive/10 p-3 rounded-md"
            ></div>

            <Button type="submit" class="w-full  rounded-full">
              Create Admin Account
            </Button>
          </form>
        </CardContent>
      </Card>

      <script
        dangerouslySetInnerHTML={{
          __html: `
          document.getElementById('setup-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const data = {
              firstName: formData.get('firstName'),
              lastName: formData.get('lastName'),
              email: formData.get('email'),
              password: formData.get('password'),
              confirmPassword: formData.get('confirmPassword')
            };
            
            // Basic validation
            if (data.password !== data.confirmPassword) {
              showError('Passwords do not match');
              return;
            }
            
            if (data.password.length < 8) {
              showError('Password must be at least 8 characters long');
              return;
            }
            
            const submitButton = e.target.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            
            try {
              submitButton.disabled = true;
              submitButton.textContent = 'Creating Account...';
              hideError();
              
              const response = await fetch('/setup', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  firstName: data.firstName,
                  lastName: data.lastName,
                  email: data.email,
                  password: data.password
                }),
              });
              
              const result = await response.json();
              
              if (!response.ok) {
                throw new Error(result.message || 'Failed to create admin account');
              }
              
              // Success - show success message and redirect
              showSuccess('Admin account created successfully! Redirecting to login...');
              
              setTimeout(() => {
                window.location.href = '/auth/login';
              }, 2000);
              
            } catch (error) {
              showError(error.message || 'An unexpected error occurred');
              submitButton.disabled = false;
              submitButton.textContent = originalText;
            }
          });
          
          function showError(message) {
            const errorEl = document.getElementById('error-message');
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
          }
          
          function hideError() {
            const errorEl = document.getElementById('error-message');
            errorEl.classList.add('hidden');
          }
          
          function showSuccess(message) {
            const errorEl = document.getElementById('error-message');
            errorEl.textContent = message;
            errorEl.classList.remove('hidden', 'text-destructive', 'bg-destructive/10');
            errorEl.classList.add('text-green-600', 'bg-green-100');
          }
        `,
        }}
      />
    </div>
  );
}

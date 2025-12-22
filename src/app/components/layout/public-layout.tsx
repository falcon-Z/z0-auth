import { ReactNode } from "react";

interface PublicLayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
  showLogo?: boolean;
}

export function PublicLayout({
  children,
  title,
  description,
  showLogo = true,
}: PublicLayoutProps) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        {showLogo && (
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary text-primary-foreground mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-foreground">Z0 Auth</h2>
          </div>
        )}

        {/* Card */}
        <div className="bg-card border shadow-lg rounded-lg p-8">
          {/* Title & Description */}
          {(title || description) && (
            <div className="mb-6 text-center">
              {title && (
                <h1 className="text-2xl font-semibold tracking-tight mb-2">
                  {title}
                </h1>
              )}
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          )}

          {/* Content */}
          {children}
        </div>
      </div>
    </div>
  );
}

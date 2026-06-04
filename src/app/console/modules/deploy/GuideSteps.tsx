import { ExternalLink } from "lucide-react";

import type { GuideStep } from "./deploy-guides";

export function GuideSteps({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="space-y-8">
      {steps.map((step, index) => (
        <li key={step.title} className="relative pl-10">
          <span
            className="absolute left-0 flex size-7 items-center justify-center rounded-full border bg-card text-xs font-semibold tabular-nums"
            aria-hidden
          >
            {index + 1}
          </span>
          <h3 className="font-medium leading-snug">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          {step.code ? (
            <pre className="mt-3 overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
              {step.code}
            </pre>
          ) : null}
          {step.links && step.links.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {step.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {link.label}
                    <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

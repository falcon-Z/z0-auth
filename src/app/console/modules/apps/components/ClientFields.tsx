import type { CreateClientRequest } from "@z0/contracts/apps";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { Textarea } from "@z0/components/ui/textarea";

export const defaultClient = (): CreateClientRequest => ({
  label: "Web client",
  clientType: "confidential",
  purpose: "interactive",
  redirectUris: ["http://localhost:3000/oauth/callback"],
  browserOrigins: [],
  refreshEnabled: false,
  assuranceOverride: null,
});
export function ClientFields({
  value,
  onChange,
  immutable = false,
}: {
  value: CreateClientRequest;
  onChange: (value: CreateClientRequest) => void;
  immutable?: boolean;
}) {
  const update = (patch: Partial<CreateClientRequest>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="clientLabel">Client label</Label>
        <Input
          id="clientLabel"
          value={value.label}
          onChange={(e) => update({ label: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="clientPurpose">Purpose</Label>
        <select
          id="clientPurpose"
          className="rounded-md border p-2"
          disabled={immutable}
          value={value.purpose}
          onChange={(e) => {
            const workload = e.target.value === "workload";
            update({
              purpose: workload ? "workload" : "interactive",
              clientType: "confidential",
              redirectUris: workload ? [] : defaultClient().redirectUris,
              browserOrigins: [],
              refreshEnabled: false,
              assuranceOverride: null,
            });
          }}
        >
          <option value="interactive">Interactive sign-in</option>
          <option value="workload">Backend workload</option>
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="clientType">Client security class</Label>
        <select
          id="clientType"
          className="rounded-md border p-2"
          disabled={immutable || value.purpose === "workload"}
          value={value.clientType}
          onChange={(e) =>
            update({
              clientType: e.target.value as CreateClientRequest["clientType"],
              browserOrigins: [],
            })
          }
        >
          <option value="confidential">Web app (server)</option>
          <option value="public">Single-page app (browser)</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Security class and purpose are fixed after creation. Public clients
          use PKCE without a secret.
        </p>
      </div>
      {value.purpose === "interactive" && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="clientRedirects">Redirect URIs</Label>
            <Textarea
              id="clientRedirects"
              value={(value.redirectUris ?? []).join("\n")}
              onChange={(e) =>
                update({ redirectUris: e.target.value.split("\n") })
              }
            />
            <p className="text-xs text-muted-foreground">
              One exact callback URL per line.
            </p>
          </div>
          {value.clientType === "public" && (
            <div className="grid gap-2">
              <Label htmlFor="clientOrigins">Browser origins</Label>
              <Textarea
                id="clientOrigins"
                value={(value.browserOrigins ?? []).join("\n")}
                onChange={(e) =>
                  update({
                    browserOrigins: e.target.value.split("\n").filter(Boolean),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                One origin per line, such as https://app.example.com. Register
                origins separately from callbacks.
              </p>
            </div>
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.refreshEnabled ?? false}
              onChange={(e) => update({ refreshEnabled: e.target.checked })}
            />
            Enable refresh tokens
          </label>
          <div className="grid gap-2">
            <Label htmlFor="clientAssurance">Client assurance</Label>
            <select
              id="clientAssurance"
              className="rounded-md border p-2"
              value={value.assuranceOverride ?? "inherit"}
              onChange={(e) =>
                update({
                  assuranceOverride:
                    e.target.value === "inherit" ? null : "strong",
                })
              }
            >
              <option value="inherit">Inherit application minimum</option>
              <option value="strong">Require strong assurance</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}

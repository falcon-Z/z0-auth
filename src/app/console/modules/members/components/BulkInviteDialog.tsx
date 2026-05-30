import { useState } from "react";

import type { CreateInviteResponse, RoleSummary } from "@z0/contracts/invites";
import { Button } from "@z0/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { Textarea } from "@z0/components/ui/textarea";
import { RolePicker } from "./RolePicker";

export type BulkInviteRow = {
  email: string;
  invitedName: string;
  ok: boolean;
  error?: string;
  invite?: CreateInviteResponse;
};

type BulkInviteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleSummary[];
  onSubmitRow: (body: { email: string; invitedName: string; roleKeys: string[] }) => Promise<CreateInviteResponse>;
  onDone: () => void;
};

function parseBulkLines(text: string): { email: string; invitedName: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const comma = line.indexOf(",");
      if (comma > 0) {
        return {
          email: line.slice(0, comma).trim(),
          invitedName: line.slice(comma + 1).trim(),
        };
      }
      const tab = line.indexOf("\t");
      if (tab > 0) {
        return { email: line.slice(0, tab).trim(), invitedName: line.slice(tab + 1).trim() };
      }
      const space = line.indexOf(" ");
      if (space > 0) {
        return { email: line.slice(0, space).trim(), invitedName: line.slice(space + 1).trim() };
      }
      const local = line.split("@")[0] ?? line;
      return { email: line, invitedName: local };
    });
}

export function BulkInviteDialog({ open, onOpenChange, roles, onSubmitRow, onDone }: BulkInviteDialogProps) {
  const [text, setText] = useState("");
  const [roleKeys, setRoleKeys] = useState<string[]>(["tenant_member"]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<BulkInviteRow[] | null>(null);

  function reset() {
    setText("");
    setRoleKeys(["tenant_member"]);
    setResults(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const rows = parseBulkLines(text);
    if (!rows.length) return;

    setSubmitting(true);
    const out: BulkInviteRow[] = [];
    for (const row of rows) {
      try {
        const invite = await onSubmitRow({ ...row, roleKeys });
        out.push({ ...row, ok: true, invite });
      } catch (e) {
        out.push({
          ...row,
          ok: false,
          error: e instanceof Error ? e.message : "Failed",
        });
      }
    }
    setResults(out);
    setSubmitting(false);
    onDone();
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg">
        {results ? (
          <>
            <DialogHeader>
              <DialogTitle>Bulk invite results</DialogTitle>
            </DialogHeader>
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {results.map((row) => (
                <li key={row.email} className={row.ok ? "text-foreground" : "text-destructive"}>
                  {row.email} — {row.ok ? "created" : row.error}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button type="button" onClick={close}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <DialogHeader>
              <DialogTitle>Bulk invite</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={"email@example.com, Name\nother@example.com Name"}
                  rows={6}
                  required
                />
                <p className="text-xs text-muted-foreground">One per line: email, name</p>
              </div>
              <RolePicker roles={roles} roleKeys={roleKeys} onChange={setRoleKeys} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || roleKeys.length === 0}>
                {submitting ? "Creating…" : "Create all"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

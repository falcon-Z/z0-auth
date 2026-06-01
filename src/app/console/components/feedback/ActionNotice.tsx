import { Alert, AlertDescription } from "@z0/components/ui/alert";

type ActionNoticeProps = {
  message: string | null;
};

export function ActionNotice({ message }: ActionNoticeProps) {
  if (!message) return null;

  return (
    <Alert>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

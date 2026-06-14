import { EmptyState } from "../feedback/EmptyState";
import { ListPageHeader } from "../crud/ListPageHeader";

type StubPageProps = {
  title: string;
  message?: string;
};

/** Placeholder for a screen that is not built yet. */
export function StubPage({ title, message = "This is not ready yet." }: StubPageProps) {
  return (
    <div className="space-y-6">
      <ListPageHeader title={title} />
      <EmptyState message={message} />
    </div>
  );
}

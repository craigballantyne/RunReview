import { useEffect, useRef } from "react";
import { useRunsList } from "../../api/useRuns.js";
import { ActivityCard } from "./ActivityCard.js";
import { EmptyActivityState } from "./EmptyActivityState.js";

interface ActivityListProps {
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}

export function ActivityList({ selectedRunId, onSelectRun }: ActivityListProps) {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useRunsList();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading activities…</div>;
  }

  const runs = data?.pages.flatMap((page) => page.items) ?? [];

  if (runs.length === 0) {
    return <EmptyActivityState />;
  }

  return (
    <div className="h-full space-y-3 overflow-y-auto p-4">
      {runs.map((run) => (
        <ActivityCard key={run.id} run={run} isSelected={run.id === selectedRunId} onSelect={() => onSelectRun(run.id)} />
      ))}
      <div ref={sentinelRef} />
      {isFetchingNextPage && <div className="py-2 text-center text-sm text-gray-400">Loading more…</div>}
    </div>
  );
}

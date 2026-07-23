import { useNavigate, useParams } from "react-router-dom";
import { useAccountSummary } from "../api/useAccount.js";
import { ActivityList } from "../components/activities/ActivityList.js";
import { ActivityMapPanel } from "../components/activities/ActivityMapPanel.js";
import { EmptyActivityState } from "../components/activities/EmptyActivityState.js";

export function ActivityPage() {
  const { runId } = useParams<{ runId?: string }>();
  const navigate = useNavigate();
  const { data: summary, isLoading } = useAccountSummary();

  if (isLoading) return null;

  if (summary?.totalRuns === 0) {
    return <EmptyActivityState />;
  }

  return (
    <div className="flex h-full">
      <div className="w-1/3 border-r border-gray-200">
        <ActivityList
          selectedRunId={runId ?? null}
          onSelectRun={(id) => navigate(`/activities/${id}`, { replace: true })}
        />
      </div>
      <div className="w-2/3">
        <ActivityMapPanel selectedRunId={runId ?? null} />
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";

export function EmptyActivityState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <h2 className="text-lg font-semibold text-gray-900">No runs yet</h2>
      <p className="max-w-sm text-sm text-gray-600">
        You haven&apos;t imported any running data. Head to your account page to import your first activities.
      </p>
      <Link to="/account" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
        Import data
      </Link>
    </div>
  );
}

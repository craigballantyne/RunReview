import { type ReactNode } from "react";

interface ConfirmModalProps {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
  confirmDisabled?: boolean;
}

export function ConfirmModal({
  title,
  description,
  confirmLabel = "Confirm",
  isConfirming = false,
  onConfirm,
  onCancel,
  children,
  confirmDisabled = false,
}: ConfirmModalProps) {
  return (
    // z-[2000] (not the more typical z-40) to reliably sit above a Leaflet map — this app's map
    // panes/controls already go up to z-[1000] (see RouteStyleControl/WeatherPanel), and Leaflet
    // establishes its own stacking context, so a lower z-index here renders visually behind the
    // map wherever they overlap. Matches RunMetricsDrawer's full-viewport overlay precedent.
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <div className="mt-2 text-sm text-gray-600">{description}</div>
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming || confirmDisabled}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isConfirming ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useDeleteAllRuns } from "../../api/useRuns.js";
import { useToast } from "../common/ToastProvider.js";
import { ConfirmModal } from "../common/ConfirmModal.js";

interface DeleteAllDataModalProps {
  onClose: () => void;
}

export function DeleteAllDataModal({ onClose }: DeleteAllDataModalProps) {
  const deleteAllRuns = useDeleteAllRuns();
  const { showToast } = useToast();

  async function handleConfirm() {
    try {
      await deleteAllRuns.mutateAsync();
      showToast("All running data has been deleted");
      onClose();
    } catch {
      showToast("Could not delete your data — please try again", "error");
    }
  }

  return (
    <ConfirmModal
      title="Delete all running data"
      description="This will permanently delete every imported run, including its splits, heart rate zones, and track points. This action cannot be undone."
      confirmLabel="Delete all data"
      isConfirming={deleteAllRuns.isPending}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}

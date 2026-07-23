import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDeleteAccount } from "../../api/useAccount.js";
import { ApiError } from "../../api/client.js";
import { ConfirmModal } from "../common/ConfirmModal.js";

const CONFIRM_TEXT = "DELETE";

interface DeleteAccountModalProps {
  onClose: () => void;
}

export function DeleteAccountModal({ onClose }: DeleteAccountModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();

  async function handleConfirm() {
    setError(null);
    try {
      await deleteAccount.mutateAsync({ currentPassword });
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <ConfirmModal
      title="Delete your account"
      description="This will permanently delete your account and all data linked to it, including every imported run. This action cannot be undone."
      confirmLabel="Delete account"
      isConfirming={deleteAccount.isPending}
      confirmDisabled={confirmText !== CONFIRM_TEXT || currentPassword.length === 0}
      onConfirm={handleConfirm}
      onCancel={onClose}
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="delete-confirm-text" className="block text-sm font-medium text-gray-700">
            Type {CONFIRM_TEXT} to confirm
          </label>
          <input
            id="delete-confirm-text"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="delete-current-password" className="block text-sm font-medium text-gray-700">
            Current password
          </label>
          <input
            id="delete-current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </ConfirmModal>
  );
}

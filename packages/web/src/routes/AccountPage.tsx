import { useState } from "react";
import { PasswordUpdateForm } from "../components/account/PasswordUpdateForm.js";
import { DeleteAccountModal } from "../components/account/DeleteAccountModal.js";
import { ImportPanel } from "../components/account/ImportPanel.js";

export function AccountPage() {
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  return (
    <div className="mx-auto max-w-2xl space-y-10 p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Account</h1>

      <ImportPanel />

      <hr className="border-gray-200" />

      <PasswordUpdateForm />

      <hr className="border-gray-200" />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Delete account</h2>
        <p className="max-w-sm text-sm text-gray-600">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => setShowDeleteAccount(true)}
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Delete account
        </button>
      </div>

      {showDeleteAccount && <DeleteAccountModal onClose={() => setShowDeleteAccount(false)} />}
    </div>
  );
}

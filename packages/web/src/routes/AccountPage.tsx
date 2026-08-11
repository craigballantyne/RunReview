import { useState } from "react";
import { PasswordUpdateForm } from "../components/account/PasswordUpdateForm.js";
import { DeleteAccountModal } from "../components/account/DeleteAccountModal.js";
import { ImportPanel } from "../components/account/ImportPanel.js";

export function AccountPage() {
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Account</h1>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <ImportPanel />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <PasswordUpdateForm />
      </section>

      <section className="space-y-3 rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Delete account</h2>
        <p className="text-sm text-gray-600">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => setShowDeleteAccount(true)}
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 active:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
        >
          Delete account
        </button>
      </section>

      {showDeleteAccount && <DeleteAccountModal onClose={() => setShowDeleteAccount(false)} />}
    </div>
  );
}

import { useForm } from "react-hook-form";
import { useChangePassword } from "../../api/useAccount.js";
import { useToast } from "../common/ToastProvider.js";
import { ApiError } from "../../api/client.js";

interface PasswordUpdateFormValues {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export function PasswordUpdateForm() {
  const changePassword = useChangePassword();
  const { showToast } = useToast();
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordUpdateFormValues>();

  async function onSubmit(values: PasswordUpdateFormValues) {
    try {
      await changePassword.mutateAsync(values);
      showToast("Password updated");
      reset();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("currentPassword", { message: "Current password is incorrect" });
      } else {
        showToast("Could not update password — please try again", "error");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Update password</h2>
      <div>
        <label htmlFor="current-password" className="block text-sm font-medium text-gray-700">
          Current password
        </label>
        <input
          id="current-password"
          type="password"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("currentPassword", { required: "Current password is required" })}
        />
        {errors.currentPassword && <p className="mt-1 text-sm text-red-600">{errors.currentPassword.message}</p>}
      </div>
      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("newPassword", {
            required: "New password is required",
            minLength: { value: 8, message: "Password must be at least 8 characters" },
          })}
        />
        {errors.newPassword && <p className="mt-1 text-sm text-red-600">{errors.newPassword.message}</p>}
      </div>
      <div>
        <label htmlFor="confirm-new-password" className="block text-sm font-medium text-gray-700">
          Confirm new password
        </label>
        <input
          id="confirm-new-password"
          type="password"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("confirmNewPassword", {
            required: "Please confirm your new password",
            validate: (value) => value === watch("newPassword") || "Passwords do not match",
          })}
        />
        {errors.confirmNewPassword && (
          <p className="mt-1 text-sm text-red-600">{errors.confirmNewPassword.message}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSubmitting ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

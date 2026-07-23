import { useForm } from "react-hook-form";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, ApiError } from "../api/client.js";
import { useToast } from "../components/common/ToastProvider.js";

interface ResetPasswordFormValues {
  newPassword: string;
  confirmNewPassword: string;
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>();

  async function onSubmit(values: ResetPasswordFormValues) {
    if (!token) return;
    setFormError(null);
    try {
      await apiClient.post("/auth/reset-password", { token, newPassword: values.newPassword });
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      showToast("Your password has been reset");
      navigate("/");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center text-center text-gray-600">
        This password reset link is missing a token. Please request a new one from the log in form.
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold text-gray-900">Choose a new password</h1>
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
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isSubmitting ? "Resetting…" : "Reset password"}
        </button>
      </form>
    </div>
  );
}

import { useForm } from "react-hook-form";
import { useState } from "react";
import { apiClient } from "../../api/client.js";

interface ForgotPasswordFormValues {
  email: string;
}

interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
}

export function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>();

  async function onSubmit(values: ForgotPasswordFormValues) {
    await apiClient.post("/auth/forgot-password", values);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-gray-700">
          If an account exists for that email, we&apos;ve sent a link to reset your password.
        </p>
        <button type="button" onClick={onBackToLogin} className="text-sm font-medium text-gray-900 underline">
          Back to log in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-sm text-gray-600">Enter your email and we&apos;ll send you a link to reset your password.</p>
      <div>
        <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="forgot-email"
          type="email"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("email", { required: "Email is required" })}
        />
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSubmitting ? "Sending…" : "Send reset link"}
      </button>
      <button type="button" onClick={onBackToLogin} className="block w-full text-center text-sm text-gray-500 underline">
        Back to log in
      </button>
    </form>
  );
}

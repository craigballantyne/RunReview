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
        <button
          type="button"
          onClick={onBackToLogin}
          className="text-sm font-medium text-purple-600 transition-colors hover:text-purple-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 rounded"
        >
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
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          {...register("email", { required: "Email is required" })}
        />
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-purple-700 hover:shadow active:scale-[0.98] active:bg-purple-800 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
      >
        {isSubmitting ? "Sending…" : "Send reset link"}
      </button>
      <button
        type="button"
        onClick={onBackToLogin}
        className="block w-full text-center text-sm font-medium text-purple-600 transition-colors hover:text-purple-700 hover:underline"
      >
        Back to log in
      </button>
    </form>
  );
}

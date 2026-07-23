import { useForm } from "react-hook-form";
import { useState } from "react";
import { useAuth } from "../../context/AuthContext.js";
import { ApiError } from "../../api/client.js";

interface SignupFormValues {
  email: string;
  password: string;
}

interface SignupFormProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export function SignupForm({ onSuccess, onSwitchToLogin }: SignupFormProps) {
  const { signup } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>();

  async function onSubmit(values: SignupFormValues) {
    setFormError(null);
    try {
      await signup(values.email, values.password);
      onSuccess();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="signup-email"
          type="email"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("email", { required: "Email is required" })}
        />
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700">
          Password
        </label>
        <input
          id="signup-password"
          type="password"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("password", {
            required: "Password is required",
            minLength: { value: 8, message: "Password must be at least 8 characters" },
          })}
        />
        {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
      </div>
      {formError && <p className="text-sm text-red-600">{formError}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isSubmitting ? "Creating account…" : "Sign up"}
      </button>
      <p className="text-center text-sm text-gray-600">
        Already have an account?{" "}
        <button type="button" onClick={onSwitchToLogin} className="font-medium text-gray-900 underline">
          Log in
        </button>
      </p>
    </form>
  );
}

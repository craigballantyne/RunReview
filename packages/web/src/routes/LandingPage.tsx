import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { useAuthModal } from "../context/AuthModalContext.js";
import { useToast } from "../components/common/ToastProvider.js";
import { apiClient } from "../api/client.js";

function LoggedOutWelcome() {
  const { openAuthModal } = useAuthModal();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold text-gray-900">Run Review</h1>
      <p className="max-w-md text-gray-600">
        Analyse your running data: view your routes, track your pace and heart rate, and understand your training
        over time.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => openAuthModal("signup")}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Sign up
        </button>
        <button
          type="button"
          onClick={() => openAuthModal("login")}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Log in
        </button>
      </div>
    </div>
  );
}

function UnverifiedAccountNotice() {
  const [sent, setSent] = useState(false);
  const { showToast } = useToast();

  async function handleResend() {
    try {
      await apiClient.post("/auth/resend-verification");
      setSent(true);
      showToast("Verification email sent");
    } catch {
      showToast("Could not send verification email — please try again shortly", "error");
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-xl font-semibold text-gray-900">Verify your email</h1>
      <p className="max-w-md text-gray-600">
        We&apos;ve sent a verification link to your email address. Please verify your account before continuing.
      </p>
      <button
        type="button"
        onClick={handleResend}
        disabled={sent}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {sent ? "Verification email sent" : "Resend verification email"}
      </button>
    </div>
  );
}

export function LandingPage() {
  const { user, isLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  useEffect(() => {
    if (searchParams.get("verified") === "1") {
      showToast("Your email has been verified");
      const next = new URLSearchParams(searchParams);
      next.delete("verified");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (isLoading) return null;
  if (!user) return <LoggedOutWelcome />;
  if (!user.emailVerified) return <UnverifiedAccountNotice />;
  return <Navigate to="/activities" replace />;
}

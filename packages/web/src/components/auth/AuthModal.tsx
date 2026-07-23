import { useEffect, useState } from "react";
import { useAuthModal } from "../../context/AuthModalContext.js";
import { LoginForm } from "./LoginForm.js";
import { SignupForm } from "./SignupForm.js";
import { ForgotPasswordForm } from "./ForgotPasswordForm.js";

type View = "login" | "signup" | "forgot-password";

export function AuthModal() {
  const { isOpen, mode, closeAuthModal } = useAuthModal();
  const [view, setView] = useState<View>(mode);

  useEffect(() => {
    if (isOpen) setView(mode);
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const titles: Record<View, string> = {
    login: "Log in",
    signup: "Create your account",
    "forgot-password": "Reset your password",
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{titles[view]}</h2>
          <button type="button" onClick={closeAuthModal} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        {view === "login" && (
          <LoginForm
            onSuccess={closeAuthModal}
            onSwitchToSignup={() => setView("signup")}
            onForgotPassword={() => setView("forgot-password")}
          />
        )}
        {view === "signup" && <SignupForm onSuccess={closeAuthModal} onSwitchToLogin={() => setView("login")} />}
        {view === "forgot-password" && <ForgotPasswordForm onBackToLogin={() => setView("login")} />}
      </div>
    </div>
  );
}

import { createContext, useContext, useState, type ReactNode } from "react";

type AuthModalMode = "login" | "signup";

interface AuthModalContextValue {
  isOpen: boolean;
  mode: AuthModalMode;
  openAuthModal: (mode?: AuthModalMode) => void;
  closeAuthModal: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AuthModalMode>("login");

  return (
    <AuthModalContext.Provider
      value={{
        isOpen,
        mode,
        openAuthModal: (nextMode = "login") => {
          setMode(nextMode);
          setIsOpen(true);
        },
        closeAuthModal: () => setIsOpen(false),
      }}
    >
      {children}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error("useAuthModal must be used within an AuthModalProvider");
  return ctx;
}

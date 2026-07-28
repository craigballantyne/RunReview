import { Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/nav/NavBar.js";
import { AuthModal } from "./components/auth/AuthModal.js";
import { useAuth } from "./context/AuthContext.js";
import { LandingPage } from "./routes/LandingPage.js";
import { ActivityPage } from "./routes/ActivityPage.js";
import { AccountPage } from "./routes/AccountPage.js";
import { ResetPasswordPage } from "./routes/ResetPasswordPage.js";
import { RoutePlannerPage } from "./routes/RoutePlannerPage.js";

/** Requires a logged-in, verified account — redirects to "/" otherwise, where LandingPage
 * shows the appropriate unverified/logged-out state. */
function VerifiedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user || !user.emailVerified) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <div className="flex h-screen flex-col">
      <NavBar />
      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/activities"
            element={
              <VerifiedRoute>
                <ActivityPage />
              </VerifiedRoute>
            }
          />
          <Route
            path="/activities/:runId"
            element={
              <VerifiedRoute>
                <ActivityPage />
              </VerifiedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <VerifiedRoute>
                <AccountPage />
              </VerifiedRoute>
            }
          />
          <Route
            path="/route-planner"
            element={
              <VerifiedRoute>
                <RoutePlannerPage />
              </VerifiedRoute>
            }
          />
        </Routes>
      </main>
      <AuthModal />
    </div>
  );
}

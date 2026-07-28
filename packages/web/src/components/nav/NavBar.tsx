import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";
import { useAuthModal } from "../../context/AuthModalContext.js";
import { AccountMenu } from "./AccountMenu.js";

export function NavBar() {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-6">
        <Link to="/" className="text-lg font-semibold text-gray-900">
          Run Review
        </Link>
        {user && (
          <>
            <NavLink
              to="/activities"
              className={({ isActive }: { isActive: boolean }) =>
                `text-sm font-medium ${isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-700"}`
              }
            >
              Activities
            </NavLink>
            <NavLink
              to="/route-planner"
              className={({ isActive }: { isActive: boolean }) =>
                `text-sm font-medium ${isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-700"}`
              }
            >
              Route planner
            </NavLink>
          </>
        )}
      </div>
      {user ? (
        <AccountMenu />
      ) : (
        <button
          type="button"
          onClick={() => openAuthModal("login")}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          Log in
        </button>
      )}
    </header>
  );
}

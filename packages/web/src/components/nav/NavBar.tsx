import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";
import { useAuthModal } from "../../context/AuthModalContext.js";
import { AccountMenu } from "./AccountMenu.js";
import { NavItem } from "./NavItem.js";

export function NavBar() {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-6">
        <Link to="/" className="text-lg font-semibold tracking-tight text-gray-900 transition-opacity hover:opacity-80">
          Run <span className="text-purple-600">Review</span>
        </Link>
        {user && (
          <>
            <NavItem to="/activities">Activities</NavItem>
            <NavItem to="/records">Records</NavItem>
            <NavItem to="/route-planner">Route planner</NavItem>
          </>
        )}
      </div>
      {user ? (
        <AccountMenu />
      ) : (
        <button
          type="button"
          onClick={() => openAuthModal("login")}
          className="rounded-md bg-purple-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-purple-700 hover:shadow active:scale-[0.97] active:bg-purple-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
        >
          Log in
        </button>
      )}
    </header>
  );
}

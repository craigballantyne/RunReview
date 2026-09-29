import { NavLink } from "react-router-dom";

/**
 * A primary nav link with the sliding underline. Extracted once a third link landed — three copies
 * of the same seventeen lines is where the duplication starts costing more than the indirection.
 */
export function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }: { isActive: boolean }) =>
        `group relative inline-block py-1 text-sm font-medium transition-colors ${isActive ? "text-purple-700" : "text-gray-500 hover:text-purple-600"}`
      }
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          {children}
          <span
            className={`pointer-events-none absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-purple-600 transition-transform duration-200 ease-out ${
              isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
            }`}
          />
        </>
      )}
    </NavLink>
  );
}

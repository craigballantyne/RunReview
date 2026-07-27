interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

// `<button>` is a labelable element per HTML5, so nesting it inside a native `<label>` gives it a
// correct implicit accessible name — not just visual proximity to the text.
export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${checked ? "bg-gray-900" : "bg-gray-300"}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </button>
    </label>
  );
}

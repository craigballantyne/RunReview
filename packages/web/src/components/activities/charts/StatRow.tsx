interface Stat {
  label: string;
  value: string;
}

export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt className="text-xs text-gray-500">{stat.label}</dt>
          <dd className="text-sm font-semibold text-gray-900">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

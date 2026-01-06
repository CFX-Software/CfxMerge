interface StatsCardProps {
  label: string;
  value: number;
  variant?: 'success' | 'warning' | 'error' | 'default';
}

export const StatsCard = ({ label, value, variant = 'default' }: StatsCardProps) => {
  const colors = {
    success: 'text-fivem',
    warning: 'text-orange-400',
    error: 'text-red-400',
    default: 'text-white',
  };

  return (
    <div className="flex flex-col gap-1">
      <div className={`text-3xl font-bold tracking-tight ${colors[variant]}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-[11px] font-medium text-secondary/60 uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
};

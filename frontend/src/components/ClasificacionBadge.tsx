interface ClasificacionBadgeProps {
  value: 'necesidad' | 'deseo' | null | undefined;
}

function ClasificacionBadge({ value }: ClasificacionBadgeProps) {
  if (!value) return null;
  const isNecesidad = value === 'necesidad';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
      isNecesidad
        ? 'bg-teal-500/20 text-teal-300 border-teal-400/30'
        : 'bg-orange-500/20 text-orange-300 border-orange-400/30'
    }`}>
      {isNecesidad ? 'Necesidad' : 'Deseo'}
    </span>
  );
}

export default ClasificacionBadge;

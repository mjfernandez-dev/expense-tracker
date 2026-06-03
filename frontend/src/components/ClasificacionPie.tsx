import type { FC } from 'react';

interface ClasificacionPieProps {
  necesidad: number;
  deseo: number;
  sinClasificar: number;
  total: number;
}

interface PieSlice {
  label: string;
  value: number;
  color: string;
  bgClass: string;
  textColor: string;
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

const formatARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const ClasificacionPie: FC<ClasificacionPieProps> = ({ necesidad, deseo, sinClasificar, total }) => {
  const slices: PieSlice[] = [
    { label: 'Necesidad', value: necesidad,     color: '#3b82f6', bgClass: 'bg-blue-500',   textColor: 'text-blue-300' },
    { label: 'Deseo',     value: deseo,          color: '#a855f7', bgClass: 'bg-purple-500', textColor: 'text-purple-300' },
    { label: 'Sin clas.', value: sinClasificar,  color: '#475569', bgClass: 'bg-slate-600',  textColor: 'text-slate-400' },
  ].filter(s => s.value > 0);

  const cx = 80, cy = 80, r = 68;
  let currentAngle = 0;
  const arcs = slices.map((s) => {
    const angle = (s.value / total) * 360;
    const path = angle >= 359.9
      ? `M ${cx} ${cy} m -${r} 0 a ${r} ${r} 0 1 1 ${r * 2} 0 a ${r} ${r} 0 1 1 -${r * 2} 0`
      : describeArc(cx, cy, r, currentAngle, currentAngle + angle);
    currentAngle += angle;
    return { ...s, path, angle };
  });

  return (
    <div className="flex items-center gap-6">
      <svg width="160" height="160" viewBox="0 0 160 160" className="flex-shrink-0">
        {arcs.map((arc) => (
          <path key={arc.label} d={arc.path} fill={arc.color} opacity={0.85} />
        ))}
        <circle cx={cx} cy={cy} r={38} fill="#0f172a" />
      </svg>
      <div className="flex flex-col gap-3 min-w-0">
        {arcs.map((arc) => {
          const pct = total > 0 ? (arc.value / total) * 100 : 0;
          return (
            <div key={arc.label} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${arc.bgClass}`} />
              <div className="min-w-0">
                <span className={`text-xs font-semibold ${arc.textColor}`}>{arc.label}</span>
                <span className="text-slate-400 text-xs ml-2 tabular-nums">{pct.toFixed(0)}%</span>
                <p className="text-slate-300 text-xs tabular-nums font-medium">{formatARS(arc.value)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClasificacionPie;

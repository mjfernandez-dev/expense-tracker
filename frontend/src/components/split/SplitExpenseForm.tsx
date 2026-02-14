import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { SplitGroupMember, SplitExpense } from '../../types';

interface SplitExpenseFormProps {
  members: SplitGroupMember[];
  onSubmit: (data: {
    descripcion: string;
    importe: number;
    paid_by_member_id: number;
    fecha: string | null;
    participant_member_ids: number[];
  }) => Promise<void>;
  expenseToEdit?: SplitExpense | null;
  onCancelEdit?: () => void;
}

function SplitExpenseForm({ members, onSubmit, expenseToEdit, onCancelEdit }: SplitExpenseFormProps) {
  const [descripcion, setDescripcion] = useState('');
  const [importe, setImporte] = useState('');
  const [paidByMemberId, setPaidByMemberId] = useState('');
  const [participantIds, setParticipantIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inicializar con todos los miembros seleccionados
  useEffect(() => {
    if (expenseToEdit) {
      setDescripcion(expenseToEdit.descripcion);
      setImporte(expenseToEdit.importe.toString());
      setPaidByMemberId(expenseToEdit.paid_by_member_id.toString());
      setParticipantIds(expenseToEdit.participants.map(p => p.member_id));
    } else {
      setParticipantIds(members.map(m => m.id));
      if (members.length > 0 && !paidByMemberId) {
        const creator = members.find(m => m.is_creator);
        setPaidByMemberId(creator ? creator.id.toString() : members[0].id.toString());
      }
    }
  }, [expenseToEdit, members]);

  const toggleParticipant = (memberId: number) => {
    setParticipantIds(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const importeNum = parseFloat(importe) || 0;
  const sharePerPerson = participantIds.length > 0 ? importeNum / participantIds.length : 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!descripcion.trim() || !importe || !paidByMemberId) {
      setError('Completa todos los campos obligatorios');
      return;
    }
    if (parseFloat(importe) <= 0) {
      setError('El importe debe ser mayor a 0');
      return;
    }
    if (participantIds.length === 0) {
      setError('Selecciona al menos un participante');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit({
        descripcion: descripcion.trim(),
        importe: parseFloat(importe),
        paid_by_member_id: parseInt(paidByMemberId),
        fecha: expenseToEdit ? expenseToEdit.fecha : new Date().toISOString(),
        participant_member_ids: participantIds,
      });
      if (!expenseToEdit) {
        setDescripcion('');
        setImporte('');
        // Mantener paidBy y participantes
      }
    } catch {
      setError('Error al guardar el gasto');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800/40 rounded-2xl border border-slate-700/70 border-l-4 border-l-blue-500 p-6 mb-6">
      <h2 className="text-2xl font-bold mb-4 text-white">
        {expenseToEdit ? 'Editar Gasto' : 'Agregar Gasto'}
      </h2>

      {error && (
        <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-100 mb-1">Descripcion *</label>
          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Asado, Nafta, Supermercado"
            className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1">Importe *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-100 mb-1">Pagado por *</label>
            <select
              value={paidByMemberId}
              onChange={(e) => setPaidByMemberId(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              {members.map(m => (
                <option key={m.id} value={m.id}>
                  {m.display_name} {m.is_creator ? '(Yo)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-100 mb-2">
            Se divide entre:
          </label>
          <div className="bg-slate-800/40 border border-slate-600 rounded-lg p-3 space-y-1">
            {members.map(member => (
              <label
                key={member.id}
                className="flex items-center gap-3 text-sm text-slate-200 cursor-pointer hover:bg-slate-700/30 p-2 rounded-lg transition-colors"
              >
                <input
                  type="checkbox"
                  checked={participantIds.includes(member.id)}
                  onChange={() => toggleParticipant(member.id)}
                  className="h-4 w-4 rounded border-slate-500 bg-slate-800 text-blue-500 focus:ring-blue-500"
                />
                <span>{member.display_name} {member.is_creator ? '(Yo)' : ''}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Preview de division */}
        {importeNum > 0 && participantIds.length > 0 && (
          <div className="bg-blue-500/10 border border-blue-300/60 text-blue-100 px-4 py-3 rounded-lg text-sm">
            ${importeNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })} / {participantIds.length} {participantIds.length === 1 ? 'persona' : 'personas'} = <span className="font-semibold">${sharePerPerson.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span> cada uno
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold px-6 py-2 rounded-full shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 tracking-wide uppercase text-sm transition-all duration-200"
          >
            {loading ? 'Guardando...' : (expenseToEdit ? 'Actualizar' : 'Agregar Gasto')}
          </button>
          {expenseToEdit && onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-6 py-2 rounded-lg hover:bg-slate-800/60 transition-all duration-200"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default SplitExpenseForm;

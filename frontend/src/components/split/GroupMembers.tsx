import { useState } from 'react';
import type { SplitGroupMember, Contact, QuickAddMemberData } from '../../types';

interface GroupMembersProps {
  members: SplitGroupMember[];
  contacts: Contact[];
  onAddMember: (contactId: number) => Promise<void>;
  onRemoveMember: (memberId: number) => Promise<void>;
  onQuickAddMember: (data: QuickAddMemberData) => Promise<void>;
  readOnly?: boolean;
}

function GroupMembers({ members, contacts, onAddMember, onRemoveMember, onQuickAddMember, readOnly }: GroupMembersProps) {
  const [selectedContactId, setSelectedContactId] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<SplitGroupMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del formulario inline
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [inlineName, setInlineName] = useState('');
  const [inlineAlias, setInlineAlias] = useState('');
  const [inlineCvu, setInlineCvu] = useState('');
  const [inlineLoading, setInlineLoading] = useState(false);

  // Filtrar contactos que ya son miembros
  const memberContactIds = members.filter(m => m.contact_id).map(m => m.contact_id);
  const availableContacts = contacts.filter(c => !memberContactIds.includes(c.id));

  const handleAdd = async () => {
    if (!selectedContactId) return;
    try {
      setAddLoading(true);
      setError(null);
      await onAddMember(parseInt(selectedContactId));
      setSelectedContactId('');
    } catch {
      setError('Error al agregar el miembro');
    } finally {
      setAddLoading(false);
    }
  };

  const handleQuickAdd = async () => {
    if (!inlineName.trim()) return;
    try {
      setInlineLoading(true);
      setError(null);
      await onQuickAddMember({
        nombre: inlineName.trim(),
        alias_bancario: inlineAlias.trim() || null,
        cvu: inlineCvu.trim() || null,
      });
      setInlineName('');
      setInlineAlias('');
      setInlineCvu('');
      setShowInlineForm(false);
    } catch {
      setError('Error al agregar el participante');
    } finally {
      setInlineLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    try {
      setIsRemoving(true);
      setError(null);
      await onRemoveMember(removeTarget.id);
      setRemoveTarget(null);
    } catch {
      setError('No se puede eliminar. El miembro participo en gastos del grupo.');
      setRemoveTarget(null);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="bg-slate-800/40 rounded-2xl border border-slate-700/70 border-l-4 border-l-blue-500 p-6">
      <h2 className="text-2xl font-bold mb-4 text-white">Miembros del Grupo</h2>

      {error && (
        <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Lista de miembros */}
      <div className="space-y-2 mb-6">
        {members.map(member => (
          <div
            key={member.id}
            className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-white font-medium">{member.display_name}</span>
              {member.is_creator && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-400/30">
                  Creador
                </span>
              )}
              {member.contact?.alias_bancario && (
                <span className="text-xs text-slate-500 hidden sm:inline">
                  ({member.contact.alias_bancario})
                </span>
              )}
            </div>
            {!member.is_creator && !readOnly && (
              <button
                onClick={() => setRemoveTarget(member)}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
              >
                Quitar
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Agregar miembro */}
      {!readOnly && availableContacts.length > 0 && (
        <div className="border-t border-slate-700/70 pt-4">
          <label className="block text-sm font-medium text-slate-100 mb-2">
            Agregar participante
          </label>
          <div className="flex gap-3">
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              className="flex-1 px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="">Seleccionar contacto...</option>
              {availableContacts.map(contact => (
                <option key={contact.id} value={contact.id}>
                  {contact.nombre}
                </option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={!selectedContactId || addLoading}
              className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold px-5 py-2 rounded-full shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 tracking-wide uppercase text-sm transition-all duration-200"
            >
              {addLoading ? '...' : 'Agregar'}
            </button>
          </div>
        </div>
      )}

      {!readOnly && availableContacts.length === 0 && contacts.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-300/60 text-blue-100 px-4 py-3 rounded-lg text-sm">
          Todos tus contactos ya son miembros del grupo.
        </div>
      )}

      {/* Creacion inline de participante */}
      {!readOnly && <div className="border-t border-slate-700/70 pt-4 mt-4">
        <button
          onClick={() => setShowInlineForm(!showInlineForm)}
          className="text-blue-300 hover:text-blue-200 font-medium text-sm transition-colors"
        >
          {showInlineForm ? 'Cancelar' : '+ Agregar nuevo participante'}
        </button>

        {showInlineForm && (
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-100 mb-1">Nombre *</label>
              <input
                type="text"
                value={inlineName}
                onChange={(e) => setInlineName(e.target.value)}
                placeholder="Ej: Juan"
                className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-100 mb-1">Alias (opcional)</label>
                <input
                  type="text"
                  value={inlineAlias}
                  onChange={(e) => setInlineAlias(e.target.value)}
                  placeholder="Ej: juan.mp"
                  className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-100 mb-1">CVU (opcional)</label>
                <input
                  type="text"
                  value={inlineCvu}
                  onChange={(e) => setInlineCvu(e.target.value)}
                  placeholder="Ej: 0000003100..."
                  className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
            <button
              onClick={handleQuickAdd}
              disabled={!inlineName.trim() || inlineLoading}
              className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold px-5 py-2 rounded-full shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 tracking-wide uppercase text-sm transition-all duration-200"
            >
              {inlineLoading ? 'Agregando...' : 'Agregar'}
            </button>
          </div>
        )}
      </div>}

      {/* Modal confirmacion quitar */}
      {removeTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-3">Quitar miembro</h3>
            <p className="text-slate-300 text-sm mb-4">
              ¿Quitar a <span className="text-white font-medium">{removeTarget.display_name}</span> del grupo?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRemoveTarget(null)}
                className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-4 py-2 rounded-lg hover:bg-slate-800/60 transition-all duration-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleRemove}
                disabled={isRemoving}
                className="bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 text-white font-semibold px-4 py-2 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.5)] border border-red-300/70 transition-all duration-200"
              >
                {isRemoving ? 'Quitando...' : 'Quitar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GroupMembers;

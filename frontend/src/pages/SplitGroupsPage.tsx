import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SplitGroup, Contact } from '../types';
import { getSplitGroups, createSplitGroup, deleteSplitGroup, getContacts } from '../services/api';

function SplitGroupsPage() {
  const navigate = useNavigate();

  // Estado de la lista
  const [groups, setGroups] = useState<SplitGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado del formulario
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Estado de eliminacion
  const [deleteTarget, setDeleteTarget] = useState<SplitGroup | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [groupsData, contactsData] = await Promise.all([
        getSplitGroups(),
        getContacts(),
      ]);
      setGroups(groupsData);
      setContacts(contactsData);
      setError(null);
    } catch {
      setError('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleContact = (contactId: number) => {
    setSelectedContactIds(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setFormError('El nombre del grupo es obligatorio');
      return;
    }
    try {
      setFormLoading(true);
      setFormError(null);
      await createSplitGroup({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        member_contact_ids: selectedContactIds,
      });
      setNombre('');
      setDescripcion('');
      setSelectedContactIds([]);
      setShowForm(false);
      await fetchData();
    } catch {
      setFormError('Error al crear el grupo');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await deleteSplitGroup(deleteTarget.id);
      setDeleteTarget(null);
      await fetchData();
    } catch {
      // silently fail
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 py-4 sm:py-8">
      <div className="max-w-4xl mx-auto px-3 sm:px-4">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Dividir Gastos</h1>
            <p className="text-slate-300 text-sm">Grupos para compartir y dividir gastos entre amigos</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white font-semibold px-3 py-1.5 sm:px-5 sm:py-2 text-sm sm:text-base rounded-full shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 tracking-wide uppercase transition-all duration-200"
            >
              {showForm ? 'Cancelar' : 'Nuevo Grupo'}
            </button>
            <button
              onClick={() => navigate('/tools')}
              className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-3 py-1.5 sm:px-5 sm:py-2 text-sm sm:text-base rounded-lg hover:bg-slate-800/60 transition-all duration-200"
            >
              Volver
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {/* FORMULARIO CREAR GRUPO */}
        {showForm && (
          <div className="bg-slate-800/40 rounded-2xl border border-slate-700/70 border-l-4 border-l-blue-500 p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4 text-white">Nuevo Grupo</h2>

            {formError && (
              <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-4 text-sm">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-100 mb-1">
                  Nombre del grupo *
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Viaje a Bariloche"
                  className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-100 mb-1">
                  Descripcion (opcional)
                </label>
                <input
                  type="text"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej: Gastos del viaje de enero 2025"
                  className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-100 mb-2">
                  Participantes <span className="text-slate-400 font-normal">(vos te agregas automaticamente)</span>
                </label>
                {contacts.length === 0 ? (
                  <div className="bg-blue-500/10 border border-blue-300/60 text-blue-100 px-4 py-3 rounded-lg text-sm">
                    Podes agregar participantes despues desde el detalle del grupo, o{' '}
                    <button
                      type="button"
                      onClick={() => navigate('/account/contacts')}
                      className="text-blue-300 hover:text-blue-200 font-medium transition-colors underline"
                    >
                      crear contactos
                    </button>{' '}
                    para agregarlos ahora.
                  </div>
                ) : (
                  <>
                    <div className="max-h-48 overflow-y-auto bg-slate-800/40 border border-slate-600 rounded-lg p-3 space-y-1">
                      {contacts.map(contact => (
                        <label
                          key={contact.id}
                          className="flex items-center gap-3 text-sm text-slate-200 cursor-pointer hover:bg-slate-700/30 p-2 rounded-lg transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedContactIds.includes(contact.id)}
                            onChange={() => toggleContact(contact.id)}
                            className="h-4 w-4 rounded border-slate-500 bg-slate-800 text-blue-500 focus:ring-blue-500"
                          />
                          <span>{contact.nombre}</span>
                          {contact.alias_bancario && (
                            <span className="text-xs text-slate-500">({contact.alias_bancario})</span>
                          )}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Tambien podes agregar participantes despues desde el detalle del grupo.
                    </p>
                  </>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={formLoading}
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold px-6 py-2 rounded-full shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 tracking-wide uppercase text-sm transition-all duration-200"
                >
                  {formLoading ? 'Creando...' : 'Crear Grupo'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* LISTA DE GRUPOS */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
            <div className="text-center py-8">
              <p className="text-slate-400 text-lg">No tienes grupos creados</p>
              <p className="text-slate-400 text-sm mt-1">Crea un nuevo grupo para empezar a dividir gastos</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {groups.map(group => (
              <div
                key={group.id}
                className={`bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border p-5 transition-all duration-300 cursor-pointer group relative ${
                  group.is_active
                    ? 'border-slate-700/70 hover:border-blue-400/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]'
                    : 'border-slate-700/40 opacity-60'
                }`}
                onClick={() => navigate(`/tools/split-groups/${group.id}`)}
              >
                {/* Boton eliminar */}
                {group.is_active && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(group); }}
                    className="absolute top-3 right-3 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-2 py-1 rounded text-xs font-medium transition-all opacity-0 group-hover:opacity-100"
                  >
                    Eliminar
                  </button>
                )}

                <div className="flex items-center gap-2 mb-1 pr-16">
                  <h3 className="text-lg font-bold text-white group-hover:text-blue-300 transition-colors">
                    {group.nombre}
                  </h3>
                  {!group.is_active && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400 border border-slate-400/30">
                      Cerrado
                    </span>
                  )}
                </div>

                {group.descripcion && (
                  <p className="text-sm text-slate-400 mb-3">{group.descripcion}</p>
                )}

                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    {group.members.length} {group.members.length === 1 ? 'miembro' : 'miembros'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(group.created_at).toLocaleDateString('es-AR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MODAL DE CONFIRMACION DE ELIMINACION */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-sm w-full">
              <h3 className="text-lg font-bold text-white mb-3">Eliminar grupo</h3>
              <p className="text-slate-300 text-sm mb-4">
                ¿Estas seguro de eliminar el grupo <span className="text-white font-medium">"{deleteTarget.nombre}"</span>?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-4 py-2 rounded-lg hover:bg-slate-800/60 transition-all duration-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 text-white font-semibold px-4 py-2 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.5)] border border-red-300/70 transition-all duration-200"
                >
                  {isDeleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SplitGroupsPage;

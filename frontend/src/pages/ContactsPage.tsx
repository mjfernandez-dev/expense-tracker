import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Contact } from '../types';
import { getContacts, createContact, updateContact, deleteContact } from '../services/api';

function ContactsPage() {
  const navigate = useNavigate();

  // Estado de la lista
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado del formulario
  const [nombre, setNombre] = useState('');
  const [aliasBancario, setAliasBancario] = useState('');
  const [cvu, setCvu] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Estado de eliminacion
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchContacts = async () => {
    try {
      setLoading(true);
      const data = await getContacts();
      setContacts(data);
      setError(null);
    } catch {
      setError('Error al cargar los contactos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setFormError('El nombre es obligatorio');
      return;
    }

    try {
      setFormLoading(true);
      setFormError(null);

      const contactData = {
        nombre: nombre.trim(),
        alias_bancario: aliasBancario.trim() || null,
        cvu: cvu.trim() || null,
        linked_user_id: null,
      };

      if (editingId) {
        await updateContact(editingId, contactData);
      } else {
        await createContact(contactData);
      }

      setNombre('');
      setAliasBancario('');
      setCvu('');
      setEditingId(null);
      await fetchContacts();
    } catch {
      setFormError(editingId ? 'Error al actualizar el contacto' : 'Error al crear el contacto');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setNombre(contact.nombre);
    setAliasBancario(contact.alias_bancario || '');
    setCvu(contact.cvu || '');
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setNombre('');
    setAliasBancario('');
    setCvu('');
    setFormError(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await deleteContact(deleteTarget.id);
      setDeleteTarget(null);
      await fetchContacts();
    } catch {
      setDeleteError('No se pudo eliminar. Puede estar en uso en un grupo activo.');
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copiado: ${text}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 py-4 sm:py-8">
      <div className="max-w-4xl mx-auto px-3 sm:px-4">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Contactos</h1>
            <p className="text-slate-300 text-sm">Gestiona tus amigos y sus datos de pago</p>
          </div>
          <button
            onClick={() => navigate('/account')}
            className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-5 py-2 rounded-lg hover:bg-slate-800/60 transition-all duration-200 self-start"
          >
            Volver a Mi Cuenta
          </button>
        </div>

        {/* FORMULARIO */}
        <div className="bg-slate-800/40 rounded-2xl border border-slate-700/70 border-l-4 border-l-blue-500 p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4 text-white">
            {editingId ? 'Editar Contacto' : 'Nuevo Contacto'}
          </h2>

          {formError && (
            <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-4 text-sm">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-100 mb-1">
                Nombre *
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Juan Perez"
                className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-100 mb-1">
                  Alias bancario (opcional)
                </label>
                <input
                  type="text"
                  value={aliasBancario}
                  onChange={(e) => setAliasBancario(e.target.value)}
                  placeholder="Ej: juan.perez.mp"
                  className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-100 mb-1">
                  CVU (opcional)
                </label>
                <input
                  type="text"
                  value={cvu}
                  onChange={(e) => setCvu(e.target.value)}
                  placeholder="Ej: 0000003100000000000001"
                  className="w-full px-4 py-3 rounded-lg bg-slate-800/60 border border-slate-600 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={formLoading}
                className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 text-white font-semibold px-6 py-2 rounded-full shadow-[0_0_25px_rgba(59,130,246,0.6)] border border-blue-300/70 tracking-wide uppercase text-sm transition-all duration-200"
              >
                {formLoading ? 'Guardando...' : (editingId ? 'Actualizar' : 'Crear Contacto')}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-6 py-2 rounded-lg hover:bg-slate-800/60 transition-all duration-200"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        {/* LISTA DE CONTACTOS */}
        <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
          <h2 className="text-2xl font-bold mb-4 text-white">Mis Contactos</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-center text-slate-300">Cargando contactos...</p>
          ) : contacts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400 text-lg">No tienes contactos</p>
              <p className="text-slate-400 text-sm mt-1">Crea tu primer contacto con el formulario de arriba</p>
            </div>
          ) : (
            <>
              {/* Desktop: Tabla */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800/60">
                      <th className="text-left text-slate-300 text-sm font-semibold uppercase tracking-wider px-4 py-3 border-b border-slate-700/70">Nombre</th>
                      <th className="text-left text-slate-300 text-sm font-semibold uppercase tracking-wider px-4 py-3 border-b border-slate-700/70">Alias</th>
                      <th className="text-left text-slate-300 text-sm font-semibold uppercase tracking-wider px-4 py-3 border-b border-slate-700/70">CVU</th>
                      <th className="text-right text-slate-300 text-sm font-semibold uppercase tracking-wider px-4 py-3 border-b border-slate-700/70">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact) => (
                      <tr key={contact.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 text-slate-100 font-medium">{contact.nombre}</td>
                        <td className="px-4 py-3 text-slate-300">
                          {contact.alias_bancario ? (
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-sm">{contact.alias_bancario}</span>
                              <button
                                onClick={() => copyToClipboard(contact.alias_bancario!, 'Alias')}
                                className="text-blue-400 hover:text-blue-300 text-xs transition-colors"
                                title="Copiar alias"
                              >
                                Copiar
                              </button>
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {contact.cvu ? (
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-sm">{contact.cvu.slice(0, 10)}...</span>
                              <button
                                onClick={() => copyToClipboard(contact.cvu!, 'CVU')}
                                className="text-blue-400 hover:text-blue-300 text-xs transition-colors"
                                title="Copiar CVU"
                              >
                                Copiar
                              </button>
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleEdit(contact)}
                              className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => setDeleteTarget(contact)}
                              className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: Cards */}
              <div className="sm:hidden space-y-3">
                {contacts.map((contact) => (
                  <div key={contact.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-white font-semibold">{contact.nombre}</h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(contact)}
                          className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setDeleteTarget(contact)}
                          className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 px-3 py-1 rounded text-xs font-medium transition-all"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                    {contact.alias_bancario && (
                      <div className="flex items-center gap-2 text-sm mb-1">
                        <span className="text-slate-400">Alias:</span>
                        <span className="text-slate-200 font-mono">{contact.alias_bancario}</span>
                        <button
                          onClick={() => copyToClipboard(contact.alias_bancario!, 'Alias')}
                          className="text-blue-400 hover:text-blue-300 text-xs"
                        >
                          Copiar
                        </button>
                      </div>
                    )}
                    {contact.cvu && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-400">CVU:</span>
                        <span className="text-slate-200 font-mono text-xs">{contact.cvu}</span>
                        <button
                          onClick={() => copyToClipboard(contact.cvu!, 'CVU')}
                          className="text-blue-400 hover:text-blue-300 text-xs"
                        >
                          Copiar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* MODAL DE CONFIRMACION DE ELIMINACION */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 max-w-sm w-full">
              <h3 className="text-lg font-bold text-white mb-3">Eliminar contacto</h3>
              <p className="text-slate-300 text-sm mb-4">
                ¿Estas seguro de eliminar a <span className="text-white font-medium">{deleteTarget.nombre}</span>?
              </p>

              {deleteError && (
                <div className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-4 text-sm">
                  {deleteError}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
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

export default ContactsPage;

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FormEvent } from 'react';
import type { ApiCredential } from '../types';
import {
  getCredenciales,
  createCredencial,
  updateCredencial,
  activarCredencial,
  deleteCredencial,
} from '../services/api';

const PROVEEDOR = 'llamacloud';

const TIERS = [
  { value: 'turbo', label: 'Turbo — el más barato' },
  { value: 'cost_effective', label: 'Cost effective — balanceado' },
  { value: 'agentic', label: 'Agentic — alta precisión' },
  { value: 'agentic_plus', label: 'Agentic Plus — máxima precisión' },
];

const tierLabel = (tier: string | null): string =>
  TIERS.find((t) => t.value === tier)?.value ?? 'sin definir';

function Integraciones() {
  const navigate = useNavigate();

  const [credenciales, setCredenciales] = useState<ApiCredential[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState<string>('');
  const [clave, setClave] = useState<string>('');
  const [tier, setTier] = useState<string>('agentic_plus');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const data = await getCredenciales(PROVEEDOR);
      setCredenciales(data);
    } catch {
      setError('No se pudieron cargar las credenciales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resetForm = () => {
    setNombre('');
    setClave('');
    setTier('agentic_plus');
    setEditandoId(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !clave.trim()) {
      setError('Completá el nombre y la clave');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      if (editandoId !== null) {
        await updateCredencial(editandoId, { clave, tier });
      } else {
        await createCredencial({ proveedor: PROVEEDOR, nombre: nombre.trim(), clave, tier });
      }
      resetForm();
      await cargar();
    } catch {
      setError(editandoId !== null ? 'No se pudo actualizar la credencial' : 'No se pudo guardar la credencial');
    } finally {
      setSaving(false);
    }
  };

  const handleActivar = async (id: number) => {
    try {
      setError(null);
      await activarCredencial(id);
      await cargar();
    } catch {
      setError('No se pudo activar la credencial');
    }
  };

  const handleEliminar = async (id: number) => {
    try {
      setError(null);
      await deleteCredencial(id);
      setConfirmDeleteId(null);
      await cargar();
    } catch {
      setError('No se pudo eliminar la credencial');
    }
  };

  const handleEditarClave = (cred: ApiCredential) => {
    setEditandoId(cred.id);
    setNombre(cred.nombre);
    setClave('');
    setTier(cred.tier ?? 'agentic_plus');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 py-4 sm:py-8">
      <div className="max-w-4xl mx-auto px-3 sm:px-4">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Integraciones</h1>
            <span className="text-slate-300 text-sm sm:text-base">
              Claves de servicios externos que usa la app
            </span>
          </div>
          <button
            onClick={() => navigate('/account')}
            className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-3 py-1.5 sm:px-5 sm:py-2 text-sm sm:text-base rounded-lg hover:bg-slate-800/60 transition-all duration-200"
          >
            Volver a mi cuenta
          </button>
        </div>

        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-300/60 text-red-100 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {/* LECTOR DE TICKETS */}
        <section className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-1">Lector de tickets</h2>
          <p className="text-sm text-slate-400 mb-4">
            LlamaCloud lee la foto de un ticket y devuelve el total y el detalle de los productos.
            Podés cargar varias claves y activar otra cuando se te agoten los créditos.
          </p>

          {loading ? (
            <p className="text-sm text-slate-500">Cargando credenciales…</p>
          ) : credenciales.length === 0 ? (
            <p className="text-sm text-slate-400">
              Todavía no hay ninguna clave cargada. El lector queda apagado hasta que agregues una.
            </p>
          ) : (
            <ul className="space-y-3 mb-6">
              {credenciales.map((cred) => (
                <li
                  key={cred.id}
                  className={`rounded-xl border p-4 ${
                    cred.activa
                      ? 'border-blue-400/50 bg-blue-500/10'
                      : 'border-slate-600/60 bg-slate-800/40'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white truncate">{cred.nombre}</span>
                        {cred.activa && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">
                            Activa
                          </span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-300 border border-slate-400/30">
                          {tierLabel(cred.tier)}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{cred.clave_preview}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {!cred.activa && (
                        <button
                          onClick={() => handleActivar(cred.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Activar
                        </button>
                      )}
                      <button
                        onClick={() => handleEditarClave(cred)}
                        className="border border-slate-500/70 text-slate-300 hover:text-white hover:border-slate-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Cambiar clave
                      </button>
                      {confirmDeleteId === cred.id ? (
                        <>
                          <button
                            onClick={() => handleEliminar(cred.id)}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1.5 transition-colors"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(cred.id)}
                          aria-label={`Eliminar ${cred.nombre}`}
                          className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-400/30 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* FORMULARIO */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-slate-700/60">
            <h3 className="text-sm font-semibold text-slate-200">
              {editandoId !== null ? 'Cambiar la clave de la credencial' : 'Agregar una clave'}
            </h3>

            <div>
              <label htmlFor="cred-nombre" className="block text-xs font-medium text-slate-400 mb-1">
                Nombre
              </label>
              <input
                id="cred-nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: LlamaCloud principal"
                disabled={editandoId !== null}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-700/80 border border-slate-500/80 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm disabled:opacity-60"
              />
            </div>

            <div>
              <label htmlFor="cred-clave" className="block text-xs font-medium text-slate-400 mb-1">
                API key
              </label>
              <input
                id="cred-clave"
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder={editandoId !== null ? 'Nueva clave' : 'llx-…'}
                autoComplete="off"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-700/80 border border-slate-500/80 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">
                Se guarda cifrada y no se puede volver a ver: solo el preview.
              </p>
            </div>

            <div>
              <label htmlFor="cred-tier" className="block text-xs font-medium text-slate-400 mb-1">
                Nivel de servicio
              </label>
              <select
                id="cred-tier"
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-700/80 border border-slate-500/80 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
              >
                {TIERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors"
              >
                {saving ? 'Guardando…' : editandoId !== null ? 'Guardar clave' : 'Agregar clave'}
              </button>
              {editandoId !== null && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="border border-slate-500/70 text-slate-300 hover:text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        <p className="text-xs text-slate-500">
          Las claves se obtienen en{' '}
          <a
            href="https://www.llamaindex.ai/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            llamaindex.ai
          </a>
          . El plan gratuito incluye 10.000 créditos por mes.
        </p>
      </div>
    </div>
  );
}

export default Integraciones;

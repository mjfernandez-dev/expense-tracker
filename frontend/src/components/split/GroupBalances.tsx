import { useState } from 'react';
import type { GroupBalanceSummary } from '../../types';
import { createPaymentPreference } from '../../services/api';

interface GroupBalancesProps {
  balances: GroupBalanceSummary | null;
  loading: boolean;
}

function GroupBalances({ balances, loading }: GroupBalancesProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [payingIndex, setPayingIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePayWithMP = async (debt: GroupBalanceSummary['simplified_debts'][0], index: number) => {
    if (!balances) return;
    try {
      setPayingIndex(index);
      const response = await createPaymentPreference({
        group_id: balances.group_id,
        from_member_id: debt.from_member_id,
        to_member_id: debt.to_member_id,
        amount: debt.amount,
      });
      // Redirigir a Mercado Pago
      window.location.href = response.init_point;
    } catch {
      setPayingIndex(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
        <p className="text-center text-slate-300">Calculando balances...</p>
      </div>
    );
  }

  if (!balances) {
    return (
      <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
        <div className="text-center py-8">
          <p className="text-slate-400 text-lg">No hay gastos para calcular</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* RESUMEN GENERAL */}
      <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
        <h2 className="text-2xl font-bold mb-4 text-white">Resumen</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <p className="text-sm text-slate-400">Total del grupo</p>
            <p className="text-2xl font-bold text-white">
              ${balances.total_expenses.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <p className="text-sm text-slate-400">Gasto promedio por persona</p>
            <p className="text-2xl font-bold text-white">
              ${balances.balances.length > 0
                ? (balances.total_expenses / balances.balances.length).toLocaleString('es-AR', { minimumFractionDigits: 2 })
                : '0.00'
              }
            </p>
          </div>
        </div>
      </div>

      {/* BALANCES INDIVIDUALES */}
      <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
        <h2 className="text-2xl font-bold mb-4 text-white">Balance Individual</h2>
        <div className="space-y-3">
          {balances.balances.map(balance => (
            <div
              key={balance.member_id}
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div>
                <p className="text-white font-semibold">{balance.display_name}</p>
                <p className="text-xs text-slate-400">
                  Pago ${balance.total_paid.toLocaleString('es-AR', { minimumFractionDigits: 2 })} | Le corresponde ${balance.total_share.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="text-right">
                {balance.net_balance > 0.01 ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-500/20 text-green-300 border border-green-400/30">
                    Le deben ${balance.net_balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                ) : balance.net_balance < -0.01 ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-500/20 text-red-300 border border-red-400/30">
                    Debe ${(-balance.net_balance).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-slate-500/20 text-slate-300 border border-slate-400/30">
                    Saldado
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DEUDAS SIMPLIFICADAS */}
      <div className="bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/70 p-6">
        <h2 className="text-2xl font-bold mb-4 text-white">Transferencias Necesarias</h2>

        {balances.simplified_debts.length === 0 ? (
          <div className="bg-green-500/10 border border-green-300/60 text-green-100 px-4 py-3 rounded-lg text-sm">
            Todos los gastos estan saldados. No se necesitan transferencias.
          </div>
        ) : (
          <div className="space-y-4">
            {balances.simplified_debts.map((debt, index) => (
              <div
                key={index}
                className={`bg-slate-800/50 border rounded-xl p-4 ${
                  debt.payment_status === 'approved'
                    ? 'border-green-400/50'
                    : 'border-slate-700/50'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-white">
                      <span className="font-semibold text-red-300">{debt.from_display_name}</span>
                      {' '}debe pagar{' '}
                      <span className="font-bold text-white text-lg">
                        ${debt.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                      {' '}a{' '}
                      <span className="font-semibold text-green-300">{debt.to_display_name}</span>
                    </p>
                  </div>

                  {/* Estado de pago / Botón MP */}
                  <div className="flex-shrink-0">
                    {debt.payment_status === 'approved' ? (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-green-500/20 text-green-300 border border-green-400/30">
                        Pagado
                      </span>
                    ) : debt.payment_status === 'pending' ? (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-400/30">
                        Pago pendiente
                      </span>
                    ) : (
                      <button
                        onClick={() => handlePayWithMP(debt, index)}
                        disabled={payingIndex === index}
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold px-4 py-2 rounded-lg shadow-[0_0_15px_rgba(56,189,248,0.3)] border border-sky-300/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {payingIndex === index ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Creando pago...
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-1c-1.3-.1-2.5-.5-3.2-1l.6-1.5c.7.4 1.7.8 2.7.8 1 0 1.7-.4 1.7-1.1 0-.7-.6-1.1-1.9-1.5-1.8-.6-3-1.4-3-3 0-1.4 1-2.5 2.7-2.8V6.5h1.4v.9c1.1.1 2 .4 2.5.7l-.5 1.4c-.5-.3-1.3-.6-2.2-.6-.9 0-1.5.4-1.5 1 0 .6.6 1 2.1 1.5 1.9.7 2.8 1.5 2.8 3.1 0 1.5-1.1 2.6-2.8 2.9v1.1H11z"/>
                            </svg>
                            Pagar ${debt.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Datos de pago (alias/CVU) - solo si no está pagado */}
                {debt.payment_status !== 'approved' && (debt.to_alias_bancario || debt.to_cvu) && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50 flex flex-wrap gap-2">
                    {debt.to_alias_bancario && (
                      <button
                        onClick={() => copyToClipboard(debt.to_alias_bancario!, `alias-${index}`)}
                        className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/30 text-blue-200 px-3 py-1.5 rounded-lg text-sm hover:bg-blue-500/20 transition-all"
                      >
                        <span className="font-mono">{debt.to_alias_bancario}</span>
                        <span className="text-blue-400 font-medium">
                          {copiedId === `alias-${index}` ? 'Copiado!' : 'Copiar alias'}
                        </span>
                      </button>
                    )}
                    {debt.to_cvu && (
                      <button
                        onClick={() => copyToClipboard(debt.to_cvu!, `cvu-${index}`)}
                        className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/30 text-blue-200 px-3 py-1.5 rounded-lg text-sm hover:bg-blue-500/20 transition-all"
                      >
                        <span className="font-mono text-xs">{debt.to_cvu!.slice(0, 10)}...</span>
                        <span className="text-blue-400 font-medium">
                          {copiedId === `cvu-${index}` ? 'Copiado!' : 'Copiar CVU'}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default GroupBalances;

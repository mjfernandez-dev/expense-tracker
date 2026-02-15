import { useSearchParams, useNavigate } from 'react-router-dom';

function PaymentResultPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const status = searchParams.get('status') || searchParams.get('collection_status') || 'unknown';

  const statusConfig: Record<string, { title: string; message: string; color: string; borderColor: string; bgColor: string }> = {
    approved: {
      title: 'Pago exitoso',
      message: 'Tu pago fue procesado correctamente. La deuda se actualizara automaticamente.',
      color: 'text-green-300',
      borderColor: 'border-green-400/50',
      bgColor: 'bg-green-500/10',
    },
    pending: {
      title: 'Pago pendiente',
      message: 'Tu pago esta siendo procesado. Se actualizara automaticamente cuando se confirme.',
      color: 'text-yellow-300',
      borderColor: 'border-yellow-400/50',
      bgColor: 'bg-yellow-500/10',
    },
    rejected: {
      title: 'Pago rechazado',
      message: 'El pago no pudo ser procesado. Podes intentar nuevamente desde la pantalla de balances.',
      color: 'text-red-300',
      borderColor: 'border-red-400/50',
      bgColor: 'bg-red-500/10',
    },
    unknown: {
      title: 'Estado desconocido',
      message: 'No pudimos determinar el estado del pago. Revisa tus balances para verificar.',
      color: 'text-slate-300',
      borderColor: 'border-slate-400/50',
      bgColor: 'bg-slate-500/10',
    },
  };

  const config = statusConfig[status] || statusConfig.unknown;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 flex items-center justify-center py-4 px-3">
      <div className="max-w-md w-full">
        <div className={`bg-slate-900/80 backdrop-blur-2xl rounded-2xl shadow-2xl border ${config.borderColor} p-8 text-center`}>
          {/* Ícono */}
          <div className={`w-16 h-16 mx-auto mb-6 rounded-full ${config.bgColor} border ${config.borderColor} flex items-center justify-center`}>
            {status === 'approved' && (
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {status === 'pending' && (
              <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {(status === 'rejected' || status === 'unknown') && (
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>

          <h1 className={`text-2xl font-bold mb-3 ${config.color}`}>{config.title}</h1>
          <p className="text-slate-400 mb-8">{config.message}</p>

          <div className="space-y-3">
            <button
              onClick={() => navigate('/tools/split-groups')}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white font-semibold px-5 py-3 rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.4)] border border-blue-300/70 transition-all duration-200"
            >
              Volver a mis grupos
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full border border-slate-400/70 bg-slate-800/40 text-slate-300 font-medium px-5 py-3 rounded-lg hover:bg-slate-800/60 transition-all duration-200"
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PaymentResultPage;

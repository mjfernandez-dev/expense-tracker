import { useState, useEffect } from 'react';

interface SharedData {
  type: 'image' | 'text' | 'files';
  content: string | string[] | null;
}

interface SharedIntentModalProps {
  sharedData: SharedData | null;
  isProcessing: boolean;
  onClose: () => void;
  onDataProcessed: () => void;
}

export default function SharedIntentModal({ sharedData, isProcessing, onClose, onDataProcessed }: SharedIntentModalProps) {
  const [extractedAmount, setExtractedAmount] = useState<string>('');
  const [extractedDescription, setExtractedDescription] = useState<string>('');
  const [extractedDate, setExtractedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (sharedData) {
      // Simple text parsing for common patterns
      if (sharedData.type === 'text' && typeof sharedData.content === 'string') {
        const text = sharedData.content;
        
        // Try to extract amount (common patterns: $1500, 1500.00, etc.)
        const amountMatch = text.match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/);
        if (amountMatch) {
          const cleaned = amountMatch[0].replace(/[$,]/g, '');
          setExtractedAmount(cleaned);
        }
        
        // Try to extract date if present
        const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (dateMatch) {
          const day = dateMatch[1].padStart(2, '0');
          const month = dateMatch[2].padStart(2, '0');
          const year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
          setExtractedDate(`${year}-${month}-${day}`);
        }
        
        // Use first line as description
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          setExtractedDescription(lines[0].substring(0, 100));
        }
      }
    }
  }, [sharedData]);

  const handleConfirm = async () => {
    if (!extractedAmount) return;
    
    setIsCreating(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/movimientos/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          importe: parseFloat(extractedAmount),
          descripcion: extractedDescription || 'Gasto desde app externa',
          fecha: extractedDate,
          tipo: 'gasto',
        }),
      });

      if (response.ok) {
        onDataProcessed();
      } else {
        alert('Error al crear movimiento. Debes iniciar sesión.');
      }
    } catch (error) {
      console.error('Error creating movimiento:', error);
      alert('Error de conexión');
    } finally {
      setIsCreating(false);
    }
  };

  if (!sharedData) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md border border-slate-600 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Recibido desde otra app</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {isProcessing ? (
            <div className="text-center py-8 text-slate-300">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
              Procesando...
            </div>
          ) : (
            <>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-blue-300 text-sm">
                  Se recibieron datos desde otra app. Completa los detalles para registrar el gasto.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Form */}
        <div className="p-4 pt-0 space-y-3">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Importe *</label>
            <input
              type="number"
              step="0.01"
              value={extractedAmount}
              onChange={(e) => setExtractedAmount(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Descripción</label>
            <input
              type="text"
              value={extractedDescription}
              onChange={(e) => setExtractedDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Descripción del gasto"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Fecha</label>
            <input
              type="date"
              value={extractedDate}
              onChange={(e) => setExtractedDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!extractedAmount || isCreating}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Guardando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

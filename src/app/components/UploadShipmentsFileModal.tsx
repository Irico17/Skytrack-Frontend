import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp, Loader2, X } from 'lucide-react';

interface UploadShipmentsFileModalProps {
  onClose: () => void;
  onUpload: (file: File, originId?: string) => Promise<{ originId: string; registered: number; failed: number; errors?: string[] }>;
}

/**
 * Carga de archivo de envíos DURANTE una operación día a día activa (requisito del curso:
 * "Durante la ejecución, se realiza la carga del archivo de envíos"). Cada línea del archivo
 * se registra como un envío individual contra la simulación en curso — entran al ciclo
 * siguiente igual que un registro manual.
 */
export function UploadShipmentsFileModal({ onClose, onUpload }: UploadShipmentsFileModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [originId, setOriginId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ originId: string; registered: number; failed: number; errors?: string[] } | null>(null);

  const inputStyle = 'w-full bg-[#0A1628] border border-[#1E3058] rounded-lg px-3 py-2.5 text-sm text-[#C8D8F0] focus:outline-none focus:border-[#4DA6FF]/60 transition-colors';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!file) return setError('Selecciona el archivo de envíos');

    setSubmitting(true);
    try {
      const res = await onUpload(file, originId.trim() || undefined);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={submitting ? undefined : onClose} />

      <div className="relative bg-[#0D1526] border border-[#1E3058] rounded-2xl w-full max-w-md mx-4 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E3058]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/30 flex items-center justify-center">
              <FileUp className="w-4 h-4 text-[#4DA6FF]" />
            </div>
            <div>
              <div className="text-white text-sm" style={{ fontWeight: 700 }}>Cargar Archivo de Envíos</div>
              <div className="text-[#4A6080] text-[11px]">Operación día a día en curso</div>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} className="w-7 h-7 rounded-lg bg-[#1A2E4A] flex items-center justify-center hover:bg-[#1E3058] transition-colors disabled:opacity-50">
            <X className="w-3.5 h-3.5 text-[#A8C0E0]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>ARCHIVO</label>
            <input
              type="file"
              accept=".txt,text/plain"
              disabled={submitting}
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className={`${inputStyle} file:mr-3 file:rounded-md file:border-0 file:bg-[#1A2E4A] file:px-3 file:py-1.5 file:text-xs file:text-[#A8C0E0]`}
            />
            <div className="mt-1.5 text-[10px] text-[#6080A0]">
              Formato: id-aaaammdd-hh-mm-DEST-cant-cliente (una línea por envío)
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>ORIGEN (opcional)</label>
            <input
              value={originId}
              onChange={e => setOriginId(e.target.value)}
              disabled={submitting}
              placeholder="Se deduce de _envios_XXXX_.txt si se omite"
              className={inputStyle}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FF4D4D]/10 border border-[#FF4D4D]/30">
              <AlertCircle className="w-3.5 h-3.5 text-[#FF4D4D] flex-shrink-0" />
              <span className="text-[11px] text-[#FF4D4D]">{error}</span>
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-[#00FF9C]/10 border border-[#00FF9C]/30">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00FF9C] flex-shrink-0" />
                <span className="text-[11px] text-[#00FF9C]">
                  Origen {result.originId}: {result.registered} registrados, {result.failed} fallidos.
                </span>
              </div>
              {result.errors && result.errors.length > 0 && (
                <div className="text-[10px] text-[#FF9090] pl-5">{result.errors.join(' · ')}</div>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl border border-[#1E3058] text-[#A8C0E0] text-sm hover:border-[#2A3E60] transition-colors disabled:opacity-50"
              style={{ fontWeight: 500 }}
            >
              {result ? 'Cerrar' : 'Cancelar'}
            </button>
            <button
              type="submit"
              disabled={submitting || !!result}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 text-[#4DA6FF] text-sm hover:bg-[#4DA6FF]/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontWeight: 600 }}
            >
              {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</>) : (<><FileUp className="w-4 h-4" /> Cargar</>)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

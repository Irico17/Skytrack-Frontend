import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Database, FileText, Upload, X } from 'lucide-react';
import type { BackendStaticDataUploadResponse } from '../types/backend';

interface StaticDataUploadModalProps {
  onClose: () => void;
  onUpload: (airportsFile: File, flightsFile: File, shipmentFiles: File[]) => Promise<BackendStaticDataUploadResponse>;
}

export function StaticDataUploadModal({ onClose, onUpload }: StaticDataUploadModalProps) {
  const [airportsFile, setAirportsFile] = useState<File | null>(null);
  const [flightsFile, setFlightsFile] = useState<File | null>(null);
  const [shipmentFiles, setShipmentFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BackendStaticDataUploadResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!airportsFile) return setError('Selecciona el archivo de aeropuertos');
    if (!flightsFile) return setError('Selecciona el plan de vuelos');
    if (shipmentFiles.length === 0) return setError('Selecciona los archivos de envíos preliminares');

    setSubmitting(true);
    try {
      const uploadResult = await onUpload(airportsFile, flightsFile, shipmentFiles);
      setResult(uploadResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const fileLabel = (file: File | null, fallback: string) => file ? file.name : fallback;
  const InputStyle = "w-full bg-[#0A1628] border border-[#1E3058] rounded-lg px-3 py-2.5 text-sm text-[#C8D8F0] file:mr-3 file:rounded-md file:border-0 file:bg-[#1A2E4A] file:px-3 file:py-1.5 file:text-xs file:text-[#A8C0E0] focus:outline-none focus:border-[#4DA6FF]/60 transition-colors";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />

      <div className="relative bg-[#0D1526] border border-[#1E3058] rounded-2xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E3058]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#00FF9C]/15 border border-[#00FF9C]/30 flex items-center justify-center">
              <Database className="w-4 h-4 text-[#00FF9C]" />
            </div>
            <div>
              <div className="text-white text-sm" style={{ fontWeight: 700 }}>Cargar Datos Estáticos</div>
              <div className="text-[#4A6080] text-[11px]">5 días y colapso</div>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} className="w-7 h-7 rounded-lg bg-[#1A2E4A] flex items-center justify-center hover:bg-[#1E3058] transition-colors disabled:opacity-50">
            <X className="w-3.5 h-3.5 text-[#A8C0E0]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>AEROPUERTOS</label>
            <input
              type="file"
              accept=".txt,text/plain"
              disabled={submitting}
              onChange={e => setAirportsFile(e.target.files?.[0] ?? null)}
              className={InputStyle}
            />
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#6080A0]">
              <FileText className="w-3 h-3" />
              {fileLabel(airportsFile, 'Sin archivo')}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>PLAN DE VUELOS</label>
            <input
              type="file"
              accept=".txt,text/plain"
              disabled={submitting}
              onChange={e => setFlightsFile(e.target.files?.[0] ?? null)}
              className={InputStyle}
            />
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#6080A0]">
              <FileText className="w-3 h-3" />
              {fileLabel(flightsFile, 'Sin archivo')}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>ENVÍOS PRELIMINARES</label>
            <input
              type="file"
              accept=".txt,text/plain"
              multiple
              disabled={submitting}
              onChange={e => setShipmentFiles(Array.from(e.target.files ?? []))}
              className={InputStyle}
            />
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#6080A0]">
              <FileText className="w-3 h-3" />
              {shipmentFiles.length > 0 ? `${shipmentFiles.length} archivos seleccionados` : 'Sin archivos'}
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#FFC857]/8 border border-[#FFC857]/20">
            <AlertCircle className="w-4 h-4 text-[#FFC857] flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-[#7088A8] leading-relaxed">
              El backend valida el formato completo antes de reemplazar los datos activos.
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FF4D4D]/10 border border-[#FF4D4D]/30">
              <AlertCircle className="w-3.5 h-3.5 text-[#FF4D4D] flex-shrink-0" />
              <span className="text-[11px] text-[#FF4D4D]">{error}</span>
            </div>
          )}

          {result && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#00FF9C]/10 border border-[#00FF9C]/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00FF9C] flex-shrink-0 mt-0.5" />
              <span className="text-[11px] text-[#00FF9C]">
                {result.airportsLoaded} aeropuertos, {result.flightsLoaded} vuelos y {result.shipmentsLoaded} envíos cargados.
              </span>
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
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00FF9C]/15 border border-[#00FF9C]/40 text-[#00FF9C] text-sm hover:bg-[#00FF9C]/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontWeight: 600 }}
            >
              <Upload className="w-4 h-4" />
              {submitting ? 'Cargando...' : 'Reemplazar Datos'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
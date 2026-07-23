import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Database, FileText, Loader2, Upload, X } from 'lucide-react';
import type { BackendStaticDataUploadResponse, StaticDataUploadProgress } from '../types/backend';
import { SHIPMENT_BATCH_SIZE } from '../services/api';

interface StaticDataUploadModalProps {
  onClose: () => void;
  onUpload: (
    airportsFile: File,
    flightsFile: File,
    shipmentFiles: File[],
    onProgress?: (progress: StaticDataUploadProgress) => void
  ) => Promise<BackendStaticDataUploadResponse>;
  /** Carga PARCIAL: solo lo que se suba (aeropuertos y/o vuelos y/o envíos), sin exigir los 3. */
  onUploadPartial: (
    airportsFile: File | null,
    flightsFile: File | null,
    shipmentFiles?: File[],
    shipmentsMode?: 'append' | 'replace',
    onProgress?: (progress: StaticDataUploadProgress) => void
  ) => Promise<BackendStaticDataUploadResponse>;
}

function progressPercent(progress: StaticDataUploadProgress | null): number {
  if (!progress) return 0;
  if (progress.phase === 'starting') return 5;
  if (progress.phase === 'finalizing') return 95;
  if (progress.phase === 'done') return 100;
  if (progress.totalFiles === 0) return 10;
  const fileRatio = progress.filesUploaded / progress.totalFiles;
  const batchRatio = progress.currentBatch / progress.totalBatches;
  return Math.round(10 + Math.max(fileRatio, batchRatio) * 80);
}

function progressLabel(progress: StaticDataUploadProgress | null): string {
  if (!progress) return '';
  if (progress.message) return progress.message;
  switch (progress.phase) {
    case 'starting':
      return 'Preparando sesión de carga…';
    case 'shipments':
      return `Lote ${progress.currentBatch} de ${progress.totalBatches} (${progress.filesUploaded}/${progress.totalFiles} archivos)`;
    case 'finalizing':
      return 'Validando y aplicando cambios…';
    case 'done':
      return 'Carga completada';
    default:
      return 'Cargando…';
  }
}

export function StaticDataUploadModal({ onClose, onUpload, onUploadPartial }: StaticDataUploadModalProps) {
  // Modo "full" = comportamiento clásico (exige los 3, reemplazo total, con progreso por
  // lotes). Modo "partial" = sube solo lo que quieras (p.ej. SOLO el plan de vuelos ajustado
  // a la hora de la prueba, sin tocar aeropuertos ni borrar los envíos ya cargados).
  const [uploadMode, setUploadMode] = useState<'full' | 'partial'>('partial');
  const [airportsFile, setAirportsFile] = useState<File | null>(null);
  const [flightsFile, setFlightsFile] = useState<File | null>(null);
  const [shipmentFiles, setShipmentFiles] = useState<File[]>([]);
  const [shipmentsMode, setShipmentsMode] = useState<'append' | 'replace'>('append');
  const [error, setError] = useState('');
  const [result, setResult] = useState<BackendStaticDataUploadResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<StaticDataUploadProgress | null>(null);

  const totalBatches = Math.max(1, Math.ceil(shipmentFiles.length / SHIPMENT_BATCH_SIZE));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setProgress(null);

    if (uploadMode === 'full') {
      if (!airportsFile) return setError('Selecciona el archivo de aeropuertos');
      if (!flightsFile) return setError('Selecciona el plan de vuelos');
      if (shipmentFiles.length === 0) return setError('Selecciona los archivos de envíos preliminares');

      setSubmitting(true);
      try {
        const uploadResult = await onUpload(airportsFile, flightsFile, shipmentFiles, setProgress);
        setResult(uploadResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Parcial: al menos un archivo
    if (!airportsFile && !flightsFile && shipmentFiles.length === 0) {
      return setError('Selecciona al menos un archivo (aeropuertos, vuelos o envíos)');
    }
    setSubmitting(true);
    try {
      const uploadResult = await onUploadPartial(airportsFile, flightsFile, shipmentFiles, shipmentsMode, setProgress);
      setResult(uploadResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const fileLabel = (file: File | null, fallback: string) => file ? file.name : fallback;
  const InputStyle = "w-full bg-[#0A1628] border border-[#1E3058] rounded-lg px-3 py-2.5 text-sm text-[#C8D8F0] file:mr-3 file:rounded-md file:border-0 file:bg-[#1A2E4A] file:px-3 file:py-1.5 file:text-xs file:text-[#A8C0E0] focus:outline-none focus:border-[#4DA6FF]/60 transition-colors disabled:opacity-50";

  const pct = progressPercent(progress);

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
              <div className="text-[#4A6080] text-[11px]">5 días, colapso y planes de vuelo día a día</div>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} className="w-7 h-7 rounded-lg bg-[#1A2E4A] flex items-center justify-center hover:bg-[#1E3058] transition-colors disabled:opacity-50">
            <X className="w-3.5 h-3.5 text-[#A8C0E0]" />
          </button>
        </div>

        {/* Selector de modo: parcial (recomendado) vs reemplazo total */}
        <div className="px-6 pt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setUploadMode('partial')}
            disabled={submitting}
            className={`flex-1 py-2 rounded-lg text-xs transition-colors ${uploadMode === 'partial'
              ? 'bg-[#00FF9C]/15 border border-[#00FF9C]/40 text-[#00FF9C]'
              : 'bg-[#0A1628] border border-[#1E3058] text-[#6080A0]'}`}
            style={{ fontWeight: 600 }}
          >
            Actualización parcial
          </button>
          <button
            type="button"
            onClick={() => setUploadMode('full')}
            disabled={submitting}
            className={`flex-1 py-2 rounded-lg text-xs transition-colors ${uploadMode === 'full'
              ? 'bg-[#4DA6FF]/15 border border-[#4DA6FF]/40 text-[#4DA6FF]'
              : 'bg-[#0A1628] border border-[#1E3058] text-[#6080A0]'}`}
            style={{ fontWeight: 600 }}
          >
            Reemplazo total
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>
              AEROPUERTOS{uploadMode === 'partial' && ' (opcional)'}
            </label>
            <input
              type="file"
              accept=".txt,text/plain"
              disabled={submitting}
              onChange={e => setAirportsFile(e.target.files?.[0] ?? null)}
              className={InputStyle}
            />
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#6080A0]">
              <FileText className="w-3 h-3" />
              {fileLabel(airportsFile, 'Sin archivo — no se modifica')}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>
              PLAN DE VUELOS{uploadMode === 'partial' && ' (opcional)'}
            </label>
            <input
              type="file"
              accept=".txt,text/plain"
              disabled={submitting}
              onChange={e => setFlightsFile(e.target.files?.[0] ?? null)}
              className={InputStyle}
            />
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#6080A0]">
              <FileText className="w-3 h-3" />
              {fileLabel(flightsFile, 'Sin archivo — no se modifica')}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#4A6080] mb-1.5" style={{ letterSpacing: '0.1em' }}>
              ENVÍOS{uploadMode === 'partial' && ' (opcional)'}
            </label>
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
              {shipmentFiles.length > 0
                ? `${shipmentFiles.length} archivo(s) (${totalBatches} lote${totalBatches === 1 ? '' : 's'} de hasta ${SHIPMENT_BATCH_SIZE})`
                  + (uploadMode === 'partial' ? ' — no hace falta subir los 30' : '')
                : 'Sin archivos'}
            </div>
            {uploadMode === 'partial' && shipmentFiles.length > 0 && (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShipmentsMode('append')}
                  disabled={submitting}
                  className={`flex-1 py-1.5 rounded-md text-[10px] transition-colors ${shipmentsMode === 'append'
                    ? 'bg-[#00FF9C]/15 border border-[#00FF9C]/40 text-[#00FF9C]'
                    : 'bg-[#0A1628] border border-[#1E3058] text-[#6080A0]'}`}
                >
                  Agregar (no borra los demás)
                </button>
                <button
                  type="button"
                  onClick={() => setShipmentsMode('replace')}
                  disabled={submitting}
                  className={`flex-1 py-1.5 rounded-md text-[10px] transition-colors ${shipmentsMode === 'replace'
                    ? 'bg-[#FF4D4D]/15 border border-[#FF4D4D]/40 text-[#FF4D4D]'
                    : 'bg-[#0A1628] border border-[#1E3058] text-[#6080A0]'}`}
                >
                  Reemplazar todos
                </button>
              </div>
            )}
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-[#FFC857]/8 border border-[#FFC857]/20">
            <AlertCircle className="w-4 h-4 text-[#FFC857] flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-[#7088A8] leading-relaxed">
              {uploadMode === 'partial'
                ? 'Solo se actualiza lo que subas (p.ej. solo el plan de vuelos ajustado a la hora de la prueba). Los envíos se agregan sin borrar los demás archivos, salvo que elijas "Reemplazar todos".'
                : `Reemplaza aeropuertos, vuelos y TODOS los envíos existentes. Los envíos se suben en lotes de ${SHIPMENT_BATCH_SIZE}. El backend valida todo en staging antes de aplicar.`}
            </div>
          </div>

          {submitting && progress && (
            <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#1A2E4A]/40 border border-[#1E3058]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] text-[#A8C0E0]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4DA6FF]" />
                  {progressLabel(progress)}
                </div>
                <span className="text-[10px] text-[#6080A0] tabular-nums">{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#0A1628] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#4DA6FF] to-[#00FF9C] transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {progress.phase === 'shipments' && (
                <div className="text-[10px] text-[#6080A0]">
                  Lote {progress.currentBatch} / {progress.totalBatches} · Archivos {progress.filesUploaded} / {progress.totalFiles}
                </div>
              )}
            </div>
          )}

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
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cargando…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  {uploadMode === 'partial' ? 'Actualizar' : 'Reemplazar Datos'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

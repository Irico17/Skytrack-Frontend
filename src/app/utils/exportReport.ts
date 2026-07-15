/**
 * Descarga un archivo de texto en el navegador (reporte resumen .txt).
 * Sin dependencias: crea un Blob y dispara la descarga.
 */
export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Línea "clave: valor" alineada para el resumen en texto. */
export function reportLine(label: string, value: string | number): string {
  return `${label.padEnd(34, '.')} ${value}`;
}

/** Encabezado de sección del reporte en texto. */
export function reportSection(title: string): string {
  return `\n${'─'.repeat(52)}\n${title}\n${'─'.repeat(52)}`;
}

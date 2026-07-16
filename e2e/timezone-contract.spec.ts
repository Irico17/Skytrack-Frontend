import { expect, test } from '@playwright/test';
import { parseApiInstant, toApiInstant } from '../src/app/utils/simulationTime';

test.describe('Contrato de zona horaria de la simulación', () => {
  test('hora local de Perú viaja como el instante UTC equivalente', () => {
    const selectedInPeru = new Date('2026-07-22T10:00:00-05:00');

    expect(toApiInstant(selectedInPeru)).toBe('2026-07-22T15:00:00.000Z');
  });

  test('cada zona renderiza localmente el mismo instante', () => {
    const instant = new Date('2026-07-22T15:00:00.000Z');
    const hourAt = (timeZone: string) => new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(instant);

    expect(hourAt('America/Lima')).toBe('10');
    expect(hourAt('Europe/Madrid')).toBe('17');
  });

  test('helpers envían UTC y recuperan sesiones legacy sin zona', () => {
    const peruInstant = new Date('2026-07-22T10:00:00-05:00');

    expect(toApiInstant(peruInstant)).toBe('2026-07-22T15:00:00.000Z');
    expect(parseApiInstant('2026-07-22T10:00').toISOString())
      .toBe('2026-07-22T10:00:00.000Z');
  });
});

import qrcode from 'qrcode-generator';

export interface QrMatrix {
  /** Lato della matrice in moduli, quiet zone inclusa. */
  readonly size: number;
  /** Path SVG unico: un rettangolo verticale per ogni sequenza di moduli scuri. */
  readonly path: string;
}

/**
 * Genera la matrice di un QR code (versione automatica, correzione M) e la
 * serializza in un unico path SVG con rettangoli verticali consecutivi.
 *
 * `margin` è la quiet zone in moduli (4 per specifica) ed è inclusa in `size`.
 */
export function qrMatrix(value: string, margin = 4): QrMatrix {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const size = moduleCount + margin * 2;
  const segments: string[] = [];

  for (let col = 0; col < moduleCount; col += 1) {
    let row = 0;
    while (row < moduleCount) {
      if (!qr.isDark(row, col)) {
        row += 1;
        continue;
      }
      const start = row;
      while (row < moduleCount && qr.isDark(row, col)) {
        row += 1;
      }
      segments.push(`M${col + margin} ${start + margin}h1v${row - start}h-1Z`);
    }
  }

  return { size, path: segments.join('') };
}

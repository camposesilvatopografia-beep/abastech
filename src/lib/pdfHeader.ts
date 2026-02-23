import jsPDF from 'jspdf';
import { format } from 'date-fns';

export interface ObraSettingsPDF {
  nome?: string;
  cidade?: string;
  logo_url?: string | null;
}

/**
 * Fetch an image URL and return a base64 data URL.
 * Returns null if loading fails.
 */
export function fetchImageAsBase64(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Cache for logo base64 to avoid refetching
let cachedLogoUrl: string | null = null;
let cachedLogoBase64: string | null = null;

export async function getLogoBase64(logoUrl?: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  if (logoUrl === cachedLogoUrl && cachedLogoBase64) return cachedLogoBase64;
  const base64 = await fetchImageAsBase64(logoUrl);
  cachedLogoUrl = logoUrl;
  cachedLogoBase64 = base64;
  return base64;
}

/**
 * Renders a standardized PDF header with navy background, logo, obra info, report title, and date.
 *
 * Layout:
 * [Logo] | Obra Name          | Date
 *        | City                |
 *        | REPORT TITLE        |
 *
 * @returns The Y position after the header (content should start below this)
 */
export function renderStandardHeader(
  doc: jsPDF,
  options: {
    reportTitle: string;
    obraSettings?: ObraSettingsPDF | null;
    logoBase64?: string | null;
    date?: string; // formatted date string, defaults to today
    headerHeight?: number;
  }
): number {
  const {
    reportTitle,
    obraSettings,
    logoBase64,
    date = format(new Date(), 'dd/MM/yyyy'),
    headerHeight = 28,
  } = options;

  const pw = doc.internal.pageSize.getWidth();

  // Navy background
  doc.setFillColor(55, 71, 95);
  doc.rect(0, 0, pw, headerHeight, 'F');

  // Logo on left
  const logoX = 6;
  const logoMaxH = headerHeight - 6;
  let textStartX = 14;

  if (logoBase64) {
    try {
      const logoW = logoMaxH * 2.5; // approximate aspect ratio
      doc.addImage(logoBase64, 'PNG', logoX, 3, logoW, logoMaxH);
      textStartX = logoX + logoW + 6;
    } catch {
      // ignore logo errors
    }
  }

  // Obra name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  const obraName = obraSettings?.nome || '';
  if (obraName) {
    doc.text(obraName, textStartX, 10);
  }

  // City
  if (obraSettings?.cidade) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(obraSettings.cidade, textStartX, 16);
  }

  // Date on right
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(date, pw - 14, 10, { align: 'right' });

  // Report title BELOW the header bar - centered and evident
  const titleY = headerHeight + 8;
  doc.setTextColor(55, 71, 95);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(reportTitle.toUpperCase(), pw / 2, titleY, { align: 'center' });

  // Underline below title (centered)
  const titleWidth = doc.getTextWidth(reportTitle.toUpperCase());
  doc.setDrawColor(55, 71, 95);
  doc.setLineWidth(0.5);
  doc.line((pw - titleWidth) / 2, titleY + 1.5, (pw + titleWidth) / 2, titleY + 1.5);

  return titleY + 8;
}

/**
 * Convenience: async version that loads the logo first, then renders the header.
 */
export async function renderStandardHeaderAsync(
  doc: jsPDF,
  options: {
    reportTitle: string;
    obraSettings?: ObraSettingsPDF | null;
    date?: string;
    headerHeight?: number;
  }
): Promise<number> {
  const logoBase64 = await getLogoBase64(options.obraSettings?.logo_url);
  return renderStandardHeader(doc, { ...options, logoBase64 });
}

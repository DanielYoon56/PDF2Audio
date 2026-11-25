import { jsPDF } from 'jspdf';
import type { GeneratedScriptResult } from '../types/audiobook';
import { estimateReadingMinutes } from './fileHelpers';

function wrapTextToLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  let currentLine = '';

  // Iterate character-by-character so Korean and long English tokens wrap cleanly without overflow
  const tokens = text.split(/(\s+)/);

  for (const token of tokens) {
    if (!token) continue;
    const candidate = currentLine + token;
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine.trim().length > 0) {
      lines.push(currentLine.trimEnd());
      currentLine = '';
    }

    // If a single token is wider than maxWidth, split by character
    if (ctx.measureText(token.trimStart()).width > maxWidth) {
      let chunk = '';
      for (const ch of token.trimStart()) {
        if (ctx.measureText(chunk + ch).width > maxWidth && chunk.length > 0) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      currentLine = chunk;
    } else {
      currentLine = token.trimStart();
    }
  }

  if (currentLine.trim().length > 0) {
    lines.push(currentLine.trimEnd());
  }

  return lines;
}

export async function exportScriptToPdf(
  result: GeneratedScriptResult
): Promise<void> {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed with available system fonts
    }
  }

  // A4 logical dimensions in px at 96dpi (794 x 1123), rendered at 2x scale for crisp print quality
  const pageWidthPx = 794;
  const pageHeightPx = 1123;
  const scale = 2;
  const marginX = 64;
  const marginTop = 64;
  const marginBottom = 68;
  const contentWidth = pageWidthPx - marginX * 2;

  const fontFamily =
    '"Noto Sans KR", "Plus Jakarta Sans", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) {
    throw new Error('PDF 생성을 위한 캔버스 컨텍스트를 초기화할 수 없습니다.');
  }

  const cleanTitle = result.fileName.replace(/\.pdf$/i, '').trim() || 'PDF2Audio 대본';
  const modeLabel =
    result.mode === 'ko-summary'
      ? '핵심 요약 모드 (약 30%)'
      : result.mode === 'ko-translate'
      ? '한국어 번역 + 낭독 정제'
      : '원문 그대로 낭독 정제';
  const estimatedMinutes = estimateReadingMinutes(
    result.script,
    result.detectedLanguage === 'ko-KR'
  );
  const metaLine = `${modeLabel}  ·  ${result.paragraphs.length}개 문단  ·  약 ${estimatedMinutes}분  ·  ${result.script.length.toLocaleString('ko-KR')}자`;

  // Measure title lines
  measureCtx.font = `700 20px ${fontFamily}`;
  const titleLines = wrapTextToLines(measureCtx, cleanTitle, contentWidth);

  // Pre-wrap all paragraphs
  measureCtx.font = `400 13.5px ${fontFamily}`;
  const lineHeight = 24;
  const paragraphGap = 15;

  interface PageBlock {
    kind: 'header' | 'paragraph-line';
    text?: string;
    paragraphIndex?: number;
    isFirstLineOfParagraph?: boolean;
    y: number;
  }

  const pages: PageBlock[][] = [];
  let currentBlocks: PageBlock[] = [];
  let cursorY = marginTop;

  // Reserve header block on page 1
  const titleHeight = titleLines.length * 28;
  const headerBottomY = marginTop + 20 + titleHeight + 28 + 18;
  currentBlocks.push({ kind: 'header', y: marginTop });
  cursorY = headerBottomY;

  result.paragraphs.forEach((paragraph, pIdx) => {
    const wrappedLines = wrapTextToLines(measureCtx, paragraph, contentWidth - 28);

    wrappedLines.forEach((line, lineIdx) => {
      if (cursorY + lineHeight > pageHeightPx - marginBottom) {
        pages.push(currentBlocks);
        currentBlocks = [];
        cursorY = marginTop + 12;
      }

      currentBlocks.push({
        kind: 'paragraph-line',
        text: line,
        paragraphIndex: pIdx,
        isFirstLineOfParagraph: lineIdx === 0,
        y: cursorY,
      });
      cursorY += lineHeight;
    });

    cursorY += paragraphGap;
  });

  if (currentBlocks.length > 0) {
    pages.push(currentBlocks);
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const totalPages = pages.length;

  pages.forEach((blocks, pageIdx) => {
    const canvas = document.createElement('canvas');
    canvas.width = pageWidthPx * scale;
    canvas.height = pageHeightPx * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scale, scale);

    // Crisp white paper background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pageWidthPx, pageHeightPx);

    // Subtle running header on pages 2+
    if (pageIdx > 0) {
      ctx.font = `500 10.5px ${fontFamily}`;
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(`PDF2Audio  ·  ${cleanTitle.slice(0, 60)}`, marginX, 38);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(marginX, 48);
      ctx.lineTo(pageWidthPx - marginX, 48);
      ctx.stroke();
    }

    for (const block of blocks) {
      if (block.kind === 'header') {
        ctx.font = `600 11px ${fontFamily}`;
        ctx.fillStyle = '#2563EB';
        ctx.fillText('PDF2Audio 오디오북 낭독 대본', marginX, block.y);

        ctx.font = `700 20px ${fontFamily}`;
        ctx.fillStyle = '#0F172A';
        titleLines.forEach((tLine, idx) => {
          ctx.fillText(tLine, marginX, block.y + 28 + idx * 28);
        });

        const metaY = block.y + 28 + titleLines.length * 28 + 4;
        ctx.font = `400 11.5px ${fontFamily}`;
        ctx.fillStyle = '#64748B';
        ctx.fillText(metaLine, marginX, metaY);

        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(marginX, metaY + 14);
        ctx.lineTo(pageWidthPx - marginX, metaY + 14);
        ctx.stroke();
      } else if (block.kind === 'paragraph-line' && block.text) {
        if (block.isFirstLineOfParagraph && block.paragraphIndex !== undefined) {
          ctx.font = `500 10.5px "IBM Plex Mono", monospace`;
          ctx.fillStyle = '#94A3B8';
          const numStr = String(block.paragraphIndex + 1).padStart(2, '0');
          ctx.fillText(numStr, marginX, block.y);
        }

        ctx.font = `400 13.5px ${fontFamily}`;
        ctx.fillStyle = '#1E293B';
        ctx.fillText(block.text, marginX + 28, block.y);
      }
    }

    // Clean footer with page number
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginX, pageHeightPx - 44);
    ctx.lineTo(pageWidthPx - marginX, pageHeightPx - 44);
    ctx.stroke();

    ctx.font = `400 10.5px ${fontFamily}`;
    ctx.fillStyle = '#94A3B8';
    ctx.fillText('Generated by PDF2Audio', marginX, pageHeightPx - 26);

    const pageNumLabel = `${pageIdx + 1} / ${totalPages}`;
    const numWidth = ctx.measureText(pageNumLabel).width;
    ctx.fillText(pageNumLabel, pageWidthPx - marginX - numWidth, pageHeightPx - 26);

    if (pageIdx > 0) {
      pdf.addPage();
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.94);
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
  });

  const safeFileBase = cleanTitle.replace(/[\\/:*?"<>|]/g, '_');
  pdf.save(`${safeFileBase}_PDF2Audio.pdf`);
}

import { PDFDocument } from 'pdf-lib';
import type { PdfFileMetadata } from '../types/audiobook';
import { fileToBase64 } from './fileHelpers';

export const LARGE_PDF_THRESHOLD_BYTES = 2 * 1024 * 1024; // 2MB
export const SPLIT_CHUNK_PAGES = 15;

export interface PdfChunkExtraction {
  base64: string;
  startPage: number;
  endPage: number;
  totalPages: number | null;
  wasSplit: boolean;
  chunkBytes: number;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}

export async function inspectPdfMetadata(file: File): Promise<PdfFileMetadata> {
  const isLargeFile = file.size >= LARGE_PDF_THRESHOLD_BYTES;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, {
      ignoreEncryption: true,
    });
    const totalPages = pdfDoc.getPageCount();
    const willAutoSplit = isLargeFile && totalPages > SPLIT_CHUNK_PAGES;

    return {
      totalPages,
      isLargeFile,
      willAutoSplit,
      chunkSize: SPLIT_CHUNK_PAGES,
    };
  } catch {
    return {
      totalPages: null,
      isLargeFile,
      willAutoSplit: false,
      chunkSize: SPLIT_CHUNK_PAGES,
    };
  }
}

export async function extractPdfPageChunkBase64(
  file: File,
  startPage: number,
  endPage: number
): Promise<PdfChunkExtraction> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const sourceDoc = await PDFDocument.load(arrayBuffer, {
      ignoreEncryption: true,
    });
    const totalPages = sourceDoc.getPageCount();

    const safeStart = Math.max(1, Math.min(startPage, totalPages));
    const safeEnd = Math.max(safeStart, Math.min(endPage, totalPages));

    // No need to rebuild if the requested range covers the whole PDF
    if (safeStart === 1 && safeEnd >= totalPages) {
      const fullBase64 = await fileToBase64(file);
      return {
        base64: fullBase64,
        startPage: 1,
        endPage: totalPages,
        totalPages,
        wasSplit: false,
        chunkBytes: file.size,
      };
    }

    const chunkDoc = await PDFDocument.create();
    const pageIndices: number[] = [];
    for (let page = safeStart; page <= safeEnd; page += 1) {
      pageIndices.push(page - 1);
    }

    const copiedPages = await chunkDoc.copyPages(sourceDoc, pageIndices);
    for (const page of copiedPages) {
      chunkDoc.addPage(page);
    }

    const chunkBytes = await chunkDoc.save();
    return {
      base64: uint8ArrayToBase64(chunkBytes),
      startPage: safeStart,
      endPage: safeEnd,
      totalPages,
      wasSplit: true,
      chunkBytes: chunkBytes.byteLength,
    };
  } catch {
    // Graceful fallback: send original file if pdf-lib cannot parse/split it
    const fullBase64 = await fileToBase64(file);
    return {
      base64: fullBase64,
      startPage: 1,
      endPage: SPLIT_CHUNK_PAGES,
      totalPages: null,
      wasSplit: false,
      chunkBytes: file.size,
    };
  }
}

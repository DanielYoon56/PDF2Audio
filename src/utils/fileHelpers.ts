export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function isPdfFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return mime === 'application/pdf' || name.endsWith('.pdf');
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('파일을 읽는 데 실패했습니다.'));
        return;
      }
      const commaIndex = result.indexOf(',');
      const base64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
      resolve(base64);
    };
    reader.onerror = () => {
      reject(new Error('PDF 파일을 Base64로 인코딩하는 중 오류가 발생했습니다.'));
    };
    reader.readAsDataURL(file);
  });
}

export function estimateReadingMinutes(text: string, isKorean: boolean): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (isKorean) {
    // Average Korean audiobook narration is ~330 characters/min
    return Math.max(1, Math.round(trimmed.length / 330));
  }
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  // Average English audiobook narration is ~155 words/min
  return Math.max(1, Math.round(words / 155));
}

export function downloadTextFile(content: string, originalFileName: string): void {
  const baseName = originalFileName.replace(/\.pdf$/i, '').trim() || 'audiobook_script';
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName}_audiobook.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

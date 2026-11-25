import type { DetectedLanguage } from '../types/audiobook';

export interface AudioExportProgress {
  message: string;
  currentChunk?: number;
  totalChunks?: number;
}

export interface AudioExportResult {
  extension: string;
  mimeType: string;
  providerUsed: string;
}

interface CachedAudio {
  key: string;
  blob: Blob;
  extension: string;
  mimeType: string;
  providerUsed: string;
}

let cachedAudio: CachedAudio | null = null;

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binaryStr = atob(base64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportScriptToAudio(options: {
  script: string;
  fileName: string;
  language: DetectedLanguage;
  onProgress?: (progress: AudioExportProgress) => void;
}): Promise<AudioExportResult> {
  const { script, fileName, language, onProgress } = options;
  const baseName =
    fileName.replace(/\.pdf$/i, '').trim() || 'audiobook_script';
  const cacheKey = `${fileName}::${language}::${script.length}::${script.slice(0, 80)}::${script.slice(-80)}`;

  if (cachedAudio && cachedAudio.key === cacheKey) {
    triggerBlobDownload(
      cachedAudio.blob,
      `${baseName}_audiobook.${cachedAudio.extension}`
    );
    return {
      extension: cachedAudio.extension,
      mimeType: cachedAudio.mimeType,
      providerUsed: cachedAudio.providerUsed,
    };
  }

  onProgress?.({ message: '음성 파일 생성을 준비 중입니다...' });

  const response = await fetch('/api/generate-audio', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify({
      text: script,
      language,
      stream: true,
    }),
  });

  const contentType = response.headers.get('content-type') || '';

  let finalData: {
    audioBase64?: string;
    mimeType?: string;
    extension?: string;
    providerUsed?: string;
    error?: string;
  } | null = null;

  if (!response.ok || !contentType.includes('text/event-stream')) {
    let data: {
      audioBase64?: string;
      mimeType?: string;
      extension?: string;
      providerUsed?: string;
      error?: string;
    } = {};
    try {
      data = await response.json();
    } catch {
      // Ignore parse errors
    }
    if (!response.ok) {
      throw new Error(
        data.error ||
          `음성 파일 생성 중 서버 오류가 발생했습니다. (HTTP ${response.status})`
      );
    }
    finalData = data;
  } else {
    if (!response.body) {
      throw new Error('음성 생성 스트림을 읽을 수 없습니다.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const handleBlock = (block: string) => {
      const lines = block.split(/\r?\n/);
      let eventName = 'message';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (!line || line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) return;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
      } catch {
        return;
      }

      if (eventName === 'status' && typeof parsed.message === 'string') {
        onProgress?.({ message: parsed.message });
      } else if (eventName === 'progress') {
        const currentChunk = Number(parsed.currentChunk) || 0;
        const totalChunks = Number(parsed.totalChunks) || 0;
        const provider =
          typeof parsed.provider === 'string' ? parsed.provider : '';
        onProgress?.({
          message: provider
            ? `${provider} 음성 합성 중 (${currentChunk}/${totalChunks})`
            : `음성 합성 중 (${currentChunk}/${totalChunks})`,
          currentChunk,
          totalChunks,
        });
      } else if (eventName === 'error') {
        const msg =
          typeof parsed.error === 'string'
            ? parsed.error
            : '음성 파일 생성에 실패했습니다.';
        throw new Error(msg);
      } else if (eventName === 'done') {
        finalData = parsed as typeof finalData;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        if (block.trim()) {
          handleBlock(block);
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      handleBlock(buffer);
    }
  }

  if (!finalData?.audioBase64) {
    throw new Error(
      '음성 데이터를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    );
  }

  const mimeType = finalData.mimeType || 'audio/mpeg';
  const extension =
    finalData.extension || (mimeType.includes('wav') ? 'wav' : 'mp3');
  const providerUsed = finalData.providerUsed || 'AI TTS';

  const blob = base64ToBlob(finalData.audioBase64, mimeType);
  cachedAudio = {
    key: cacheKey,
    blob,
    extension,
    mimeType,
    providerUsed,
  };

  triggerBlobDownload(blob, `${baseName}_audiobook.${extension}`);

  return {
    extension,
    mimeType,
    providerUsed,
  };
}

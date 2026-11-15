export const MAX_BATCH_FILES = 10;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

export const SUPPORTED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif'
] as const;

export const SUPPORTED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.webm',
  '.m4v'
] as const;

export const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
]);

export const SUPPORTED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v'
]);

export const FILE_INPUT_ACCEPT = [
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_VIDEO_EXTENSIONS,
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v'
].join(',');

export interface SelectedUploadEntry {
  id: string;
  file: File;
  mediaType: 'image' | 'video' | 'unsupported';
  formatLabel: string;
  sizeBytes: number;
  isValid: boolean;
  validationError: string | null;
  uploadStatus: 'ready' | 'uploading' | 'uploaded' | 'failed';
  uploadError: string | null;
}

export interface BatchValidationReport {
  entries: SelectedUploadEntry[];
  validEntries: SelectedUploadEntry[];
  invalidEntries: SelectedUploadEntry[];
  batchErrors: string[];
  allErrors: string[];
  totalSizeBytes: number;
  hasErrors: boolean;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string): string {
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx < 0) return '';
  return name.slice(dotIdx).toLowerCase();
}

export function detectFileMediaInfo(file: File): {
  mediaType: 'image' | 'video' | 'unsupported';
  formatLabel: string;
} {
  const mime = (file.type || '').toLowerCase().trim();
  const ext = getFileExtension(file.name);

  if (SUPPORTED_IMAGE_MIMES.has(mime)) {
    const extLabel = ext ? ext.slice(1).toUpperCase() : mime.split('/')[1]?.toUpperCase() || 'IMAGE';
    return { mediaType: 'image', formatLabel: `Photo · ${extLabel === 'JPEG' ? 'JPEG' : extLabel}` };
  }

  if (SUPPORTED_VIDEO_MIMES.has(mime)) {
    const extLabel = ext ? ext.slice(1).toUpperCase() : mime === 'video/quicktime' ? 'MOV' : 'VIDEO';
    return { mediaType: 'video', formatLabel: `Video · ${extLabel}` };
  }

  // Fallback for browsers that report empty or application/octet-stream MIME on HEIC/HEIF/MOV/M4V
  if (!mime || mime === 'application/octet-stream') {
    if ((SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
      return { mediaType: 'image', formatLabel: `Photo · ${ext.slice(1).toUpperCase()}` };
    }
    if ((SUPPORTED_VIDEO_EXTENSIONS as readonly string[]).includes(ext)) {
      return { mediaType: 'video', formatLabel: `Video · ${ext.slice(1).toUpperCase()}` };
    }
  }

  const unknownLabel = ext ? ext.slice(1).toUpperCase() : mime || 'Unknown';
  return { mediaType: 'unsupported', formatLabel: `Unsupported (${unknownLabel})` };
}

export function createSelectedUploadEntry(
  file: File,
  limits?: { maxImageBytes?: number; maxVideoBytes?: number },
  existingId?: string
): SelectedUploadEntry {
  const maxImg = limits?.maxImageBytes || MAX_IMAGE_BYTES;
  const maxVid = limits?.maxVideoBytes || MAX_VIDEO_BYTES;
  const { mediaType, formatLabel } = detectFileMediaInfo(file);

  let validationError: string | null = null;

  if (file.size <= 0) {
    validationError = `${file.name} appears to be empty or corrupted (0 bytes). Please choose a valid photo or video.`;
  } else if (mediaType === 'unsupported') {
    validationError = `We couldn't upload ${file.name} because this file format is not supported. Please select an image or video in one of the supported formats.`;
  } else if (mediaType === 'image' && file.size > maxImg) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const maxImgMb = Math.round(maxImg / (1024 * 1024));
    validationError = `${file.name} is ${sizeMb} MB. The maximum photo size is ${maxImgMb} MB. Please compress this image or choose a smaller version.`;
  } else if (mediaType === 'video' && file.size > maxVid) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const maxVidMb = Math.round(maxVid / (1024 * 1024));
    validationError = `${file.name} is ${sizeMb} MB. The maximum video size is ${maxVidMb} MB. Please compress the video or select a smaller version.`;
  }

  return {
    id: existingId || `sel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    file,
    mediaType,
    formatLabel,
    sizeBytes: file.size,
    isValid: validationError === null,
    validationError,
    uploadStatus: 'ready',
    uploadError: null
  };
}

export function validateUploadEntries(
  entries: SelectedUploadEntry[],
  limits?: { maxBatchFiles?: number; maxImageBytes?: number; maxVideoBytes?: number }
): BatchValidationReport {
  const maxBatch = limits?.maxBatchFiles || MAX_BATCH_FILES;
  const rechecked = entries.map((entry) => {
    const fresh = createSelectedUploadEntry(entry.file, limits, entry.id);
    return {
      ...fresh,
      uploadStatus: entry.uploadStatus,
      uploadError: entry.uploadError
    };
  });

  const batchErrors: string[] = [];
  if (rechecked.length > maxBatch) {
    const overflow = rechecked.length - maxBatch;
    batchErrors.push(
      `You selected ${rechecked.length} files, but you can upload a maximum of ${maxBatch} files at a time. Please remove ${overflow} ${
        overflow === 1 ? 'file' : 'files'
      } or upload them in another batch.`
    );
  }

  const validEntries = rechecked.filter((e) => e.isValid);
  const invalidEntries = rechecked.filter((e) => !e.isValid);
  const perFileErrors = invalidEntries
    .map((e) => e.validationError)
    .filter((msg): msg is string => Boolean(msg));

  const allErrors = [...batchErrors, ...perFileErrors];
  const totalSizeBytes = rechecked.reduce((sum, e) => sum + e.sizeBytes, 0);

  return {
    entries: rechecked,
    validEntries,
    invalidEntries,
    batchErrors,
    allErrors,
    totalSizeBytes,
    hasErrors: allErrors.length > 0
  };
}

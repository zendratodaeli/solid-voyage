/**
 * File Processing Utilities for AI Copilot
 *
 * Client-side utilities for converting files to formats
 * compatible with the Vercel AI SDK v6 multimodal parts.
 */

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  category: FileCategory;
  dataUrl: string;       // base64 data URL for images
  textContent?: string;  // extracted text for documents
  preview?: string;      // thumbnail data URL for images
}

export type FileCategory = "image" | "pdf" | "document" | "spreadsheet" | "text";

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

export const MAX_FILE_SIZE = 10 * 1024 * 1024;       // 10MB per file
export const MAX_TOTAL_SIZE = 20 * 1024 * 1024;      // 20MB total per message
export const MAX_IMAGE_DIMENSION = 2048;              // Resize images larger than this
export const MAX_FILES_PER_MESSAGE = 5;

export const ACCEPTED_FILE_TYPES: Record<string, FileCategory> = {
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/pdf": "pdf",
  "text/plain": "text",
  "text/csv": "text",
  "text/markdown": "text",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "spreadsheet",
  "application/vnd.ms-excel": "spreadsheet",
};

export const ACCEPT_STRING = Object.keys(ACCEPTED_FILE_TYPES).join(",");

// ═══════════════════════════════════════════════════════════════════
// FILE VALIDATION
// ═══════════════════════════════════════════════════════════════════

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFile(file: File): ValidationResult {
  // Check file type
  const category = getFileCategory(file.type);
  if (!category) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type || file.name.split(".").pop()}. Supported: images, PDFs, text, Word, Excel.`,
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File "${file.name}" is too large (${sizeMb}MB). Maximum is 10MB.`,
    };
  }

  return { valid: true };
}

export function validateTotalSize(files: FileAttachment[]): ValidationResult {
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    return {
      valid: false,
      error: `Total file size exceeds 20MB limit. Please remove some files.`,
    };
  }
  if (files.length > MAX_FILES_PER_MESSAGE) {
    return {
      valid: false,
      error: `Maximum ${MAX_FILES_PER_MESSAGE} files per message.`,
    };
  }
  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════
// FILE CATEGORY DETECTION
// ═══════════════════════════════════════════════════════════════════

export function getFileCategory(mimeType: string): FileCategory | null {
  return ACCEPTED_FILE_TYPES[mimeType] || null;
}

export function isImageType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

// ═══════════════════════════════════════════════════════════════════
// FILE → BASE64 CONVERSION
// ═══════════════════════════════════════════════════════════════════

/**
 * Read a file as a base64 data URL.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Read a file as text content.
 */
export function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file);
  });
}

// ═══════════════════════════════════════════════════════════════════
// IMAGE COMPRESSION
// ═══════════════════════════════════════════════════════════════════

/**
 * Compress/resize an image file to reduce the base64 payload.
 * Returns a base64 data URL of the compressed image.
 */
export function compressImage(
  file: File,
  maxDimension: number = MAX_IMAGE_DIMENSION,
  quality: number = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Only resize if image exceeds max dimension
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Use webp for better compression, fall back to jpeg
      const outputType = "image/webp";
      const dataUrl = canvas.toDataURL(outputType, quality);
      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };

    img.src = url;
  });
}

// ═══════════════════════════════════════════════════════════════════
// PDF TEXT EXTRACTION (lightweight — no pdfjs-dist dependency)
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract text from a PDF file.
 * Uses pdfjs-dist if available, otherwise sends the PDF as a base64 file part.
 * Since pdfjs-dist is optional, this gracefully degrades.
 */
export async function extractPdfText(file: File): Promise<string | null> {
  try {
    // Dynamic import to keep pdfjs-dist optional
    const pdfjsLib = await import("pdfjs-dist");

    // Set the worker source
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const textParts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      if (pageText.trim()) {
        textParts.push(`--- Page ${i} ---\n${pageText}`);
      }
    }

    return textParts.length > 0 ? textParts.join("\n\n") : null;
  } catch {
    // pdfjs-dist not installed or extraction failed
    console.warn("[FileUtils] PDF text extraction unavailable, sending as base64");
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PROCESSING PIPELINE
// ═══════════════════════════════════════════════════════════════════

/**
 * Process a File into a FileAttachment ready for the AI copilot.
 */
export async function processFile(file: File): Promise<FileAttachment> {
  const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const category = getFileCategory(file.type) || "document";

  // Process based on category
  if (category === "image") {
    // Compress and convert to base64
    const dataUrl = file.size > 2 * 1024 * 1024
      ? await compressImage(file)
      : await fileToBase64(file);

    return {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      category,
      dataUrl,
      preview: dataUrl,
    };
  }

  if (category === "pdf") {
    // Try to extract text; if that fails, send as base64
    const textContent = await extractPdfText(file);
    const dataUrl = await fileToBase64(file);

    return {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      category,
      dataUrl,
      textContent: textContent || undefined,
    };
  }

  if (category === "text") {
    // Read as text
    const textContent = await fileToText(file);

    return {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      category,
      dataUrl: "",
      textContent,
    };
  }

  // Documents and spreadsheets — send as base64 data URL
  const dataUrl = await fileToBase64(file);
  return {
    id,
    name: file.name,
    size: file.size,
    type: file.type,
    category,
    dataUrl,
  };
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileIcon(category: FileCategory): string {
  switch (category) {
    case "image": return "🖼️";
    case "pdf": return "📄";
    case "document": return "📝";
    case "spreadsheet": return "📊";
    case "text": return "📃";
    default: return "📎";
  }
}

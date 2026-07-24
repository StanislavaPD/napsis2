import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

export type DocxTagData = Record<string, string | number>

/** Fills a .docx template (containing {tag} placeholders) with the given data and returns the resulting document as a Blob. */
export async function fillDocxTemplate(file: File, data: DocxTagData): Promise<Blob> {
  const buf = await file.arrayBuffer()
  const zip = new PizZip(buf)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  })
  doc.render(data)
  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }) as Blob
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(((reader.result as string) || '').split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Saves a Blob under the given filename. In the Electron app this writes the file directly to disk
 * via a native save dialog, so Word opens it normally — a browser-style download would tag it with
 * the "downloaded from the internet" mark and force Word's read-only Protected View. Falls back to
 * a normal browser download outside Electron (e.g. a plain browser preview).
 */
export async function downloadBlob(blob: Blob, filename: string) {
  if (typeof window !== 'undefined' && window.api) {
    const base64 = await blobToBase64(blob)
    await window.api.saveFile(filename, base64)
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

interface DocxTemplaterErrorDetail {
  properties?: { explanation?: string }
  message?: string
}

/** Extracts a human-readable Bulgarian error message from a docxtemplater render/parse error. */
export function docxFillErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'properties' in err) {
    const props = (err as { properties?: { errors?: DocxTemplaterErrorDetail[]; explanation?: string } }).properties
    if (props?.errors?.length) {
      return props.errors.map(e => e.properties?.explanation ?? e.message ?? 'непозната грешка').join('; ')
    }
    if (props?.explanation) return props.explanation
  }
  return err instanceof Error ? err.message : 'Неуспешно попълване на бланката. Проверете дали файлът е валиден .docx.'
}

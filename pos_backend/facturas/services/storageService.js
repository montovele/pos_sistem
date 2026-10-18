// ======================================================
// facturas/services/storageService.js
// ENTERPRISE STORAGE SERVICE v3
// CFDI SAFE STORAGE LAYER
// ======================================================

import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

import {
  executeWithResilience,
  isRetryableError,
} from './resiliencePolicyService.js'

// ======================================================
// PATHS
// ======================================================

const __filename =
  fileURLToPath(import.meta.url)

const __dirname =
  path.dirname(__filename)

const ROOT_STORAGE =
  path.resolve(
    __dirname,
    '../storage'
  )

// ======================================================

const SYSTEM =
  'storageService'

const STORAGE_PUBLIC_URL =
  process.env.STORAGE_PUBLIC_URL ||
  '/storage'

// ======================================================
// HELPERS
// ======================================================

function sanitize(input = '') {

  return String(input)
    .replace(/\.\./g, '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/g, '')
    .trim()

}

// ======================================================

function ensureExt(
  filename,
  ext
) {

  return filename.endsWith(ext)
    ? filename
    : `${filename}${ext}`

}

// ======================================================

function buildHash(buffer) {

  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex')

}

// ======================================================

function buildAbsolutePath(
  relativePath
) {

  return path.join(
    ROOT_STORAGE,
    sanitize(relativePath)
  )

}

// ======================================================

function buildPublicUrl(
  relativePath
) {

  return `${STORAGE_PUBLIC_URL}/${sanitize(relativePath)}`

}

// ======================================================

async function ensureDir(filepath) {

  await fs.mkdir(
    path.dirname(filepath),
    {
      recursive: true,
    }
  )

}

// ======================================================

async function withStorage(fn, operation) {

  return executeWithResilience({

    fn,

    service: SYSTEM,

    operation,

    retryDecider:
      isRetryableError,

    timeout: 15000,

    retries: 2,

  })

}

// ======================================================
// SAVE FILE
// ======================================================

export async function saveBufferFile({

  relativePath,

  buffer,

  mimeType = null,

}) {

  if (!relativePath) {

    throw new Error(
      'relativePath requerido'
    )

  }

  if (!buffer) {

    throw new Error(
      'buffer requerido'
    )

  }

  const absPath =
    buildAbsolutePath(
      relativePath
    )

  await withStorage(

    async () => {

      await ensureDir(absPath)

      // ==========================================
      // ATOMIC WRITE
      // ==========================================

      const tempPath =
        `${absPath}.tmp`

      await fs.writeFile(
        tempPath,
        buffer
      )

      await fs.rename(
        tempPath,
        absPath
      )

    },

    'saveBufferFile'

  )

  const stats =
    await fs.stat(absPath)

  return {

    success: true,

    relativePath,

    absolutePath:
      absPath,

    publicUrl:
      buildPublicUrl(
        relativePath
      ),

    mimeType,

    size:
      stats.size,

    hash:
      buildHash(buffer),

    createdAt:
      stats.birthtime,

  }

}

// ======================================================
// SAVE XML
// ======================================================

export async function saveXML(
  uuid,
  buffer
) {

  if (!uuid) {

    throw new Error(
      'uuid requerido'
    )

  }

  const year =
    new Date()
      .getFullYear()

  const relativePath =
    `xml/${year}/${ensureExt(uuid, '.xml')}`

  return saveBufferFile({

    relativePath,

    buffer,

    mimeType:
      'application/xml',

  })

}

// ======================================================
// SAVE PDF
// ======================================================

export async function savePDF(
  uuid,
  buffer
) {

  if (!uuid) {

    throw new Error(
      'uuid requerido'
    )

  }

  const year =
    new Date()
      .getFullYear()

  const relativePath =
    `pdf/${year}/${ensureExt(uuid, '.pdf')}`

  return saveBufferFile({

    relativePath,

    buffer,

    mimeType:
      'application/pdf',

  })

}

// ======================================================
// SAVE CFDI FILES
// ======================================================

export async function saveCFDIFiles({

  uuid,

  pdfBuffer = null,

  xmlBuffer = null,

}) {

  if (!uuid) {

    throw new Error(
      'uuid requerido'
    )

  }

  const [pdf, xml] =
    await Promise.all([

      pdfBuffer
        ? savePDF(
            uuid,
            pdfBuffer
          )
        : null,

      xmlBuffer
        ? saveXML(
            uuid,
            xmlBuffer
          )
        : null,

    ])

  return {

    success: true,

    uuid,

    pdf,

    xml,

  }

}

// ======================================================
// READ FILE
// ======================================================

export async function readFile(
  relativePath
) {

  const abs =
    buildAbsolutePath(
      relativePath
    )

  const buffer =
    await withStorage(

      () =>
        fs.readFile(abs),

      'readFile'

    )

  return {

    success: true,

    relativePath,

    absolutePath:
      abs,

    buffer,

    hash:
      buildHash(buffer),

  }

}

// ======================================================
// DELETE FILE
// ======================================================

export async function deleteFile(
  relativePath
) {

  const abs =
    buildAbsolutePath(
      relativePath
    )

  await withStorage(

    () => fs.unlink(abs),

    'deleteFile'

  )

  return {

    success: true,

    deleted: true,

  }

}

// ======================================================
// EXISTS
// ======================================================

export async function fileExists(
  relativePath
) {

  try {

    await fs.access(
      buildAbsolutePath(
        relativePath
      )
    )

    return true

  } catch {

    return false

  }

}

// ======================================================
// HEALTH CHECK
// ======================================================

export async function storageHealthCheck() {

  try {

    const testFile =
      await saveBufferFile({

        relativePath:
          `temp/${Date.now()}.txt`,

        buffer:
          Buffer.from('ok'),

      })

    const exists =
      await fileExists(
        testFile.relativePath
      )

    await deleteFile(
      testFile.relativePath
    )

    return {

      success: true,

      healthy: exists,

      storage:
        ROOT_STORAGE,

    }

  } catch (error) {

    return {

      success: false,

      healthy: false,

      error:
        error.message,

    }

  }

}

// ======================================================
// EXPORT
// ======================================================

export default {

  saveBufferFile,

  saveXML,

  savePDF,

  saveCFDIFiles,

  readFile,

  deleteFile,

  fileExists,

  storageHealthCheck,

}
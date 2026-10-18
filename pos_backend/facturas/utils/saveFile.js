// facturas/utils/saveFile.js
// VERSION EMPRESARIAL ROBUSTA
// STORAGE + SEGURIDAD + VALIDACIONES + STREAM SAFE

import fs from 'fs/promises'
import path from 'path'

const STORAGE_ROOT =
  process.env.STORAGE_ROOT ||
  'storage'

const BACK_URL =
  process.env.BACK_URL || ''

// ======================================================
// HELPERS
// ======================================================

function normalizeRelativePath(
  targetPath = ''
) {
  const normalized =
    path
      .normalize(targetPath)
      .replace(/^(\.\.(\/|\\|$))+/, '')

  return normalized
}

function resolveStoragePath(
  relativePath = ''
) {
  const cleanRelative =
    normalizeRelativePath(
      relativePath
    )

  return path.resolve(
    STORAGE_ROOT,
    cleanRelative
  )
}

function ensureBuffer(content) {
  if (Buffer.isBuffer(content)) {
    return content
  }

  if (typeof content === 'string') {
    return Buffer.from(content)
  }

  throw new Error(
    'Contenido inválido para archivo'
  )
}

async function safeStat(filePath) {
  try {
    return await fs.stat(filePath)
  } catch {
    return null
  }
}

// ======================================================
// ASEGURAR DIRECTORIO
// ======================================================

export async function ensureDirectory(
  directoryPath
) {
  try {
    if (!directoryPath) {
      throw new Error(
        'directoryPath requerido'
      )
    }

    await fs.mkdir(
      directoryPath,
      {
        recursive: true,
      }
    )

    return {
      success: true,
      directoryPath,
    }
  } catch (error) {
    console.error(
      'ensureDirectory error:',
      error
    )

    throw new Error(
      `No se pudo crear directorio: ${error.message}`
    )
  }
}

// ======================================================
// GUARDAR ARCHIVO
// ======================================================

export async function saveFile(
  folderPath,
  fileName,
  content
) {
  try {
    // ============================================
    // VALIDACIONES
    // ============================================

    if (!folderPath) {
      throw new Error(
        'folderPath requerido'
      )
    }

    if (!fileName) {
      throw new Error(
        'fileName requerido'
      )
    }

    if (
      content === null ||
      content === undefined
    ) {
      throw new Error(
        'content requerido'
      )
    }

    // ============================================
    // NORMALIZAR
    // ============================================

    const normalizedFolder =
      normalizeRelativePath(
        folderPath
      )

    const safeFileName =
      path.basename(fileName)

    const absoluteFolder =
      resolveStoragePath(
        normalizedFolder
      )

    // ============================================
    // CREAR DIRECTORIO
    // ============================================

    await ensureDirectory(
      absoluteFolder
    )

    // ============================================
    // PATH FINAL
    // ============================================

    const absoluteFilePath =
      path.join(
        absoluteFolder,
        safeFileName
      )

    const relativeFilePath =
      path.join(
        normalizedFolder,
        safeFileName
      )

    // ============================================
    // BUFFER
    // ============================================

    const buffer =
      ensureBuffer(content)

    // ============================================
    // WRITE
    // ============================================

    await fs.writeFile(
      absoluteFilePath,
      buffer
    )

    const stats =
      await safeStat(
        absoluteFilePath
      )

    // ============================================
    // RESPONSE
    // ============================================

    return {
      success: true,

      fileName:
        safeFileName,

      filePath:
        relativeFilePath,

      absolutePath:
        absoluteFilePath,

      size:
        stats?.size || 0,

      mimeType:
        getMimeType(
          safeFileName
        ),

      publicUrl:
        buildPublicUrl(
          relativeFilePath
        ),
    }
  } catch (error) {
    console.error(
      'saveFile error:',
      error
    )

    throw new Error(
      `Error guardando archivo: ${error.message}`
    )
  }
}

// ======================================================
// LEER ARCHIVO
// ======================================================

export async function readFile(
  filePath,
  options = {}
) {
  try {
    if (!filePath) {
      throw new Error(
        'filePath requerido'
      )
    }

    const absolutePath =
      resolveStoragePath(
        filePath
      )

    const exists =
      await fileExists(
        filePath
      )

    if (!exists) {
      throw new Error(
        'Archivo no encontrado'
      )
    }

    const buffer =
      await fs.readFile(
        absolutePath
      )

    const stats =
      await safeStat(
        absolutePath
      )

    return {
      success: true,

      buffer,

      size:
        stats?.size || 0,

      mimeType:
        getMimeType(
          absolutePath
        ),

      encoding:
        options.encoding ||
        null,

      absolutePath,
    }
  } catch (error) {
    console.error(
      'readFile error:',
      error
    )

    throw new Error(
      `Error leyendo archivo: ${error.message}`
    )
  }
}

// ======================================================
// ELIMINAR ARCHIVO
// ======================================================

export async function deleteFile(
  filePath
) {
  try {
    if (!filePath) {
      throw new Error(
        'filePath requerido'
      )
    }

    const absolutePath =
      resolveStoragePath(
        filePath
      )

    const exists =
      await fileExists(
        filePath
      )

    if (!exists) {
      return {
        success: true,
        deleted: false,
      }
    }

    await fs.unlink(
      absolutePath
    )

    return {
      success: true,
      deleted: true,
    }
  } catch (error) {
    console.error(
      'deleteFile error:',
      error
    )

    throw new Error(
      `Error eliminando archivo: ${error.message}`
    )
  }
}

// ======================================================
// EXISTE ARCHIVO
// ======================================================

export async function fileExists(
  filePath
) {
  try {
    const absolutePath =
      resolveStoragePath(
        filePath
      )

    await fs.access(
      absolutePath
    )

    return true
  } catch {
    return false
  }
}

// ======================================================
// COPIAR ARCHIVO
// ======================================================

export async function copyFile(
  sourcePath,
  destinationPath
) {
  try {
    if (!sourcePath) {
      throw new Error(
        'sourcePath requerido'
      )
    }

    if (!destinationPath) {
      throw new Error(
        'destinationPath requerido'
      )
    }

    const sourceAbsolute =
      resolveStoragePath(
        sourcePath
      )

    const destinationAbsolute =
      resolveStoragePath(
        destinationPath
      )

    await ensureDirectory(
      path.dirname(
        destinationAbsolute
      )
    )

    await fs.copyFile(
      sourceAbsolute,
      destinationAbsolute
    )

    return {
      success: true,
      sourcePath,
      destinationPath,
    }
  } catch (error) {
    console.error(
      'copyFile error:',
      error
    )

    throw new Error(
      `Error copiando archivo: ${error.message}`
    )
  }
}

// ======================================================
// MIME TYPE
// ======================================================

export function getMimeType(
  fileName = ''
) {
  const ext =
    path
      .extname(fileName)
      .toLowerCase()

  const mimeMap = {
    '.pdf':
      'application/pdf',

    '.xml':
      'application/xml',

    '.json':
      'application/json',

    '.txt':
      'text/plain',

    '.zip':
      'application/zip',

    '.csv':
      'text/csv',

    '.jpg':
      'image/jpeg',

    '.jpeg':
      'image/jpeg',

    '.png':
      'image/png',
  }

  return (
    mimeMap[ext] ||
    'application/octet-stream'
  )
}

// ======================================================
// URL PÚBLICA
// ======================================================

export function buildPublicUrl(
  filePath = ''
) {
  if (!filePath) {
    return null
  }

  const cleanBase =
    BACK_URL.replace(
      /\/$/,
      ''
    )

  const normalized =
    normalizeRelativePath(
      filePath
    ).replace(/\\/g, '/')

  if (!cleanBase) {
    return `/${normalized}`
  }

  return `${cleanBase}/${normalized}`
}

// ======================================================
// OBTENER INFO
// ======================================================

export async function getFileInfo(
  filePath
) {
  try {
    const absolutePath =
      resolveStoragePath(
        filePath
      )

    const stats =
      await fs.stat(
        absolutePath
      )

    return {
      success: true,

      exists: true,

      size:
        stats.size,

      createdAt:
        stats.birthtime,

      updatedAt:
        stats.mtime,

      mimeType:
        getMimeType(
          filePath
        ),

      publicUrl:
        buildPublicUrl(
          filePath
        ),
    }
  } catch {
    return {
      success: false,
      exists: false,
    }
  }
}
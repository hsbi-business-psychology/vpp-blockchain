import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Root of the backend package (the folder that holds `data/` and `public/`).
 * The Plesk launcher sets VPP_BACKEND_ROOT because the bundled server is a
 * single file whose location says nothing about where the data lives.
 */
export const BACKEND_ROOT =
  process.env.VPP_BACKEND_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export const DATA_DIR = resolve(BACKEND_ROOT, 'data')
export const PUBLIC_DIR = resolve(BACKEND_ROOT, 'public')

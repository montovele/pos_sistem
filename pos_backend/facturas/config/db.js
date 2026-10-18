// config/db.js
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'

// ======================================================
// __dirname ESM
// ======================================================

const __filename =
  fileURLToPath(import.meta.url)

const __dirname =
  path.dirname(__filename)

// ======================================================
// LOAD ENV
// ======================================================

dotenv.config({
  path: path.resolve(
    __dirname,
    '../../.env'
  ),
})

// ======================================================
// CREATE POOL
// ======================================================

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 10000,
})

// ======================================================
// QUERY WRAPPER
// ======================================================

export async function query(
  sql,
  params = []
) {

  try {

    const [rows] =
      await pool.execute(
        sql,
        params
      )

    return [rows]

  } catch (error) {

    console.error(
      'DB ERROR:',
      {
        sql,
        params,
        error: error.message,
      }
    )

    throw error

  }

}

// ======================================================
// GET CONNECTION
// ======================================================

export async function getConnection() {

  return pool.getConnection()

}

// ======================================================
// HEALTHCHECK
// ======================================================

export async function healthCheck() {

  try {

    const connection =
      await pool.getConnection()

    await connection.ping()

    connection.release()

    return {
      success: true,
      healthy: true,
    }

  } catch (error) {

    return {
      success: false,
      healthy: false,
      error: error.message,
    }

  }

}

// ======================================================
// EXPORT DEFAULT
// ======================================================

export default {
  query,
  getConnection,
  healthCheck,
  pool,
}
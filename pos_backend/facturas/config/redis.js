// config/redis.js
// REDIS ROBUSTO PARA BULLMQ

import { Redis } from 'ioredis'

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT || 6379,

  password: process.env.REDIS_PASSWORD || undefined,

  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000)
    return delay
  },
})

redis.on('connect', () => {
  console.log('🟢 Redis conectado')
})

redis.on('error', (err) => {
  console.error('🔴 Redis error:', err.message)
})

export default redis
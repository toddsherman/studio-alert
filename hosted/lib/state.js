import { Redis } from '@upstash/redis';

let _redis;
export function redis() {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return _redis;
}

// All monitor state lives in ONE Redis hash so a normal run costs 2 commands (HGETALL + HSET).
// Fields: alerted, alertClaimed, alertPending, fails, failAlerted, lastAt, lastResult, lastDetail, lastMs,
//         lastOk, total, retired, receipt, lastAlertSentAt, errNoticeAt, lastRehearsalAt, lastRehearsalOk
export class Store {
  constructor(prefix = 'sa:') {
    this.key = `${prefix}state`;
    this.hist = `${prefix}history`;
  }
  async load() {
    const s = (await redis().hgetall(this.key)) || {};
    s.fails = Number(s.fails || 0);
    s.total = Number(s.total || 0);
    return s;
  }
  save(fields) { return redis().hset(this.key, fields); }
  setnx(field, value) { return redis().hsetnx(this.key, field, value); } // 1 if set, 0 if existed
  del(...fields) { return redis().hdel(this.key, ...fields); }
  clear() { return redis().del(this.key, this.hist); }
  history(n = 20) { return redis().lrange(this.hist, 0, n - 1); }
  async event(text) {
    const line = `${new Date().toISOString()} ${text}`;
    console.log(line);
    await redis().lpush(this.hist, line);
    await redis().ltrim(this.hist, 0, 99);
  }
}

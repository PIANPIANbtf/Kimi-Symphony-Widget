const tcb = require('@cloudbase/node-sdk')

class CloudBaseState {
  constructor() {
    this.env = process.env.CLOUDBASE_ENV_ID || process.env.SCF_NAMESPACE
    this.app = tcb.init({ env: this.env })
    this.rdb = this.app.rdb()
    this.queue = Promise.resolve()
    const state = this
    this.storage = {
      get: key => state.get(key),
      put: (key, value) => state.put(key, value),
      delete: keys => state.remove(keys),
    }
  }

  async get(key) {
    try {
      const { data, error } = await this.rdb.from('kv').select('value').eq('key', key)
      if (error) throw error
      const record = Array.isArray(data) ? data[0] : data
      if (!record || !Object.hasOwn(record, 'value')) return undefined
      if (record.value && typeof record.value === 'object' && typeof record.value.__binary === 'string') {
        return new Uint8Array(Buffer.from(record.value.__binary, 'base64'))
      }
      return record.value
    } catch {
      return undefined
    }
  }

  async put(key, value) {
    if (typeof key === 'object') {
      for (const [entryKey, entryValue] of Object.entries(key)) await this.put(entryKey, entryValue)
      return
    }
    const stored = value instanceof Uint8Array || Buffer.isBuffer(value)
      ? { __binary: Buffer.from(value).toString('base64') }
      : value
    const { error } = await this.rdb.from('kv').upsert({ key, value: stored })
    if (error) throw error
  }

  async remove(keys) {
    const list = Array.isArray(keys) ? keys : [keys]
    for (const key of list) {
      try {
        await this.rdb.from('kv').delete().eq('key', key)
      } catch {}
    }
  }

  blockConcurrencyWhile(callback) {
    const result = this.queue.then(callback)
    this.queue = result.catch(() => {})
    return result
  }
}

module.exports = { CloudBaseState }

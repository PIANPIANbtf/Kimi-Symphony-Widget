import { EventEmitter } from 'node:events'

export class TaskStateMachine extends EventEmitter {
  constructor() {
    super()
    this.state = 'normal'
    this.activeCount = 0
  }

  snapshot() {
    return { state: this.state, activeCount: this.activeCount }
  }

  update(activeCount) {
    const count = Math.max(0, Number(activeCount) || 0)
    const previousCount = this.activeCount
    this.activeCount = count
    if (count > 0) this.state = 'working'
    else if (previousCount > 0) this.state = 'completed'
    else if (this.state === 'working') this.state = 'normal'
    this.emitChange()
  }

  acknowledge() {
    if (this.state !== 'completed') return
    this.state = 'normal'
    this.emitChange()
  }

  emitChange() {
    this.emit('change', this.snapshot())
  }
}

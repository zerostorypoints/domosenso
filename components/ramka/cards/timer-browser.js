import {TimerBrowserSound} from './timer-browser-sound.js';

const PREFIX = 'domosenso_frame/timer_browser_';
const POLL_MS = 5000;
export function remainingAt(sample, now) {
  if (!sample || !Number.isFinite(sample.remaining) || sample.remaining < 0) return null;
  return Math.max(0, Math.ceil(sample.remaining - (sample.state === 'active' ? Math.max(0, now - sample.at) / 1000 : 0)));
}
const instant = value => typeof value === 'string' && /(Z|\+00:00)$/.test(value) && Number.isFinite(Date.parse(value));
const identity = value => typeof value === 'string' && value.length > 0;
function validFact(timer) {
  return timer && identity(timer.subjectId) && identity(timer.stateRevision) &&
    ['active', 'paused', 'idle', 'unknown'].includes(timer.state) &&
    (timer.remainingSeconds === null || (Number.isFinite(timer.remainingSeconds) && timer.remainingSeconds >= 0)) &&
    (timer.runId === null || identity(timer.runId)) &&
    (timer.deadline === null || instant(timer.deadline)) &&
    (timer.alarmDeviceId === null || identity(timer.alarmDeviceId)) &&
    typeof timer.acknowledged === 'boolean' &&
    ['none', 'completed', 'cancelled', 'inferred_completed', 'unknown'].includes(timer.outcome);
}
function completed(timer) {
  return timer?.state === 'idle' && identity(timer.runId) && !timer.acknowledged &&
    ['completed', 'inferred_completed'].includes(timer.outcome);
}
function recent(timer, asOf) {
  if (!completed(timer) || timer.alarmDeviceId !== null || !instant(timer.deadline) || !instant(asOf)) return false;
  const age = Date.parse(asOf) - Date.parse(timer.deadline);
  return age >= 0 && age <= 60000;
}

// One controller per badge; the server owns durable claims across cards, tabs and reloads.
export class TimerBrowser {
  constructor(options = {}) {
    this.env = {
      now: () => performance.now(), window: globalThis.window, document: globalThis.document,
      setInterval, clearInterval, setTimeout, clearTimeout, ...options,
    };
    this.sound = options.sound ?? new TimerBrowserSound();
    this.onChange = options.onChange ?? (() => {});
    this.entities = [];
    this.samples = new Map();
    this.attempted = new Set();
    this.acks = [];
    this.epoch = 0;
    this.audioEpoch = 0;
    this.attached = false;
    this.online = false;
    this.available = false;
    this.enabled = false;
    this.managed = false;
    this.playing = null;
    this.busy = false;
    this.dirty = false;
    this.hostListener = event => {
      if (event.detail?.version === 1 && event.detail.managed === true) this._manageHost();
    };
    this.visibilityListener = () => {
      this.audioEpoch++;
      if (!this._foreground()) this._stop();
      this.refresh();
    };
    this.readyListener = () => this._connectionChanged(true);
    this.disconnectedListener = () => this._connectionChanged(false);
  }
  configure(entities) {
    if (!Array.isArray(entities) || entities.length > 16 || new Set(entities).size !== entities.length ||
        entities.some(entity => typeof entity !== 'string' || !/^timer\.[a-z0-9_]+$/.test(entity))) throw Error('Invalid timer mapping');
    if (JSON.stringify(this.entities) === JSON.stringify(entities)) return;
    this.entities = [...entities];
    this._invalidate(true);
    this.refresh();
  }
  connect() {
    if (this.attached) return;
    this.attached = true;
    this.env.window.addEventListener('domosenso-frame-timer-host', this.hostListener);
    this.env.document.addEventListener('visibilitychange', this.visibilityListener);
    this._checkHost();
    this._listenConnection();
    this.poll = this.env.setInterval(() => this.refresh(), POLL_MS);
    this._connectionChanged(this.hass?.connection?.connected !== false);
  }
  disconnect() {
    if (!this.attached) return;
    this.attached = false;
    this._invalidate(true);
    this.online = false;
    this.enabled = false;
    this.env.clearInterval(this.poll);
    this.poll = null;
    this._unlistenConnection();
    this.env.window.removeEventListener('domosenso-frame-timer-host', this.hostListener);
    this.env.document.removeEventListener('visibilitychange', this.visibilityListener);
    this.sound.close();
  }
  updateHass(hass) {
    const changedConnection = this.hass?.connection !== hass?.connection || this.hass?.user?.id !== hass?.user?.id;
    this.hass = hass;
    if (changedConnection) {
      this._invalidate(true);
      this._unlistenConnection();
      if (this.attached) this._listenConnection();
    }
    const revision = JSON.stringify(this.entities.map(entity => hass?.states?.[entity] ?? null));
    if (this.coreRevision !== revision) {
      this.coreRevision = revision;
      // Any in-flight claim was based on older core state. Reconcile before making sound.
      this._invalidate(false, {keepAcks: true});
      this.dirty = true;
    }
    const online = hass?.connection?.connected !== false;
    if (online !== this.online || changedConnection) this._connectionChanged(online);
    else if (this.dirty) this.refresh();
    this.onChange();
  }
  _listenConnection() {
    this.connection = this.hass?.connection;
    this.connection?.addEventListener?.('ready', this.readyListener);
    this.connection?.addEventListener?.('disconnected', this.disconnectedListener);
  }
  _unlistenConnection() {
    this.connection?.removeEventListener?.('ready', this.readyListener);
    this.connection?.removeEventListener?.('disconnected', this.disconnectedListener);
    this.connection = null;
  }
  _connectionChanged(online) {
    if (online !== this.online) this._invalidate(online);
    this.online = online;
    if (online) this.refresh();
    this.onChange();
  }
  _invalidate(clear, {keepAcks = false} = {}) {
    this.epoch++;
    this.audioEpoch++;
    // A core replacement must still acknowledge the clicked old run, never its successor.
    if (!keepAcks) this.acks = [];
    this._stop();
    if (clear) {
      this.samples.clear();
      this.available = false;
    }
  }
  _connected() { return this.online && this.hass?.connection?.connected !== false; }
  _foreground() { return this.env.document.visibilityState === 'visible'; }
  _checkHost() {
    const host = this.env.window.__domosensoFrameTimerHost;
    if (host?.version === 1 && host.managed === true) this._manageHost();
    return this.managed;
  }
  _manageHost() {
    if (this.managed) return;
    this.managed = true;
    this.enabled = false;
    this.audioEpoch++;
    this._stop();
    this.sound.close();
    this.onChange();
  }
  _canSound() {
    return !this._checkHost() && this.attached && this._connected() && this.available && this.enabled && this._foreground();
  }
  async enableSound() {
    if (this._checkHost() || !this.attached || !this._connected() || !this.available || !this._foreground()) return;
    const epoch = this.epoch, audioEpoch = this.audioEpoch;
    // Invoked only from the button's click handler, so browser gesture activation is retained.
    let unlocked = false;
    try { unlocked = await this.sound.unlockAudioContext(); } catch { /* unavailable audio stays off */ }
    if (epoch !== this.epoch || audioEpoch !== this.audioEpoch || this._checkHost() || !this.attached || !this._foreground()) return;
    this.enabled = unlocked === true;
    this.onChange();
    this.refresh();
  }
  disableSound() {
    this.enabled = false;
    this.audioEpoch++;
    this._stop();
    this.onChange();
  }
  refresh() {
    if (!this.attached || !this._connected() || !this.entities.length || typeof this.hass?.callWS !== 'function') return;
    this.dirty = true;
    void this._drain();
  }
  _valid(epoch) { return this.attached && this._connected() && epoch === this.epoch; }
  async _drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      // Coalesce invalidations. All snapshot, claim and acknowledgement calls are serialized.
      while (this.attached && this._connected() && (this.dirty || this.acks.length)) {
        if (!this.entities.length || typeof this.hass?.callWS !== 'function') break;
        const epoch = this.epoch;
        if (this.acks.length) {
          const {subjectId, runId} = this.acks.shift();
          try { await this.hass.callWS({type: PREFIX + 'acknowledge', version: 1, subjectId, runId}); }
          catch { /* no successful acknowledgement is asserted; the next snapshot is authoritative */ }
          this.dirty = true;
          continue;
        }
        this.dirty = false;
        try {
          const reply = await this.hass.callWS({type: PREFIX + 'snapshot', version: 1, entities: [...this.entities]});
          if (!this._valid(epoch)) continue;
          this._accept(reply);
          this.onChange();
          await this._claim(epoch);
        } catch {
          if (this._valid(epoch)) {
            this.samples.clear();
            this.available = false;
            this._stop();
            this.onChange();
          }
        }
      }
    } finally { this.busy = false; }
  }
  _accept(reply) {
    if (reply?.version !== 1 || !instant(reply.asOf) || !identity(reply.installationId) ||
        !Array.isArray(reply.timers) || reply.timers.length > 16) throw Error('Invalid timer snapshot');
    const samples = new Map(), subjects = new Set(), at = this.env.now();
    for (const item of reply.timers) {
      if (!this.entities.includes(item.entity) || samples.has(item.entity) || typeof item.label !== 'string' ||
          !validFact(item.timer) || subjects.has(item.timer.subjectId)) throw Error('Invalid timer snapshot');
      subjects.add(item.timer.subjectId);
      samples.set(item.entity, {timer: item.timer, label: item.label, state: item.timer.state,
        remaining: item.timer.state === 'active' && instant(item.timer.deadline) ?
          Math.max(0, (Date.parse(item.timer.deadline) - Date.parse(reply.asOf)) / 1000) : item.timer.remainingSeconds, at, asOf: reply.asOf});
    }
    if (this.installationId && this.installationId !== reply.installationId) this._stop();
    this.installationId = reply.installationId;
    this.samples = samples;
    this.available = true;
    const currentKeys = new Set([...samples.values()].map(sample => this._key(sample.timer)));
    this.attempted = new Set([...this.attempted].filter(key => currentKeys.has(key)));
    if (this.playing) {
      const current = [...samples.values()].find(sample => this._key(sample.timer) === this.playing.key)?.timer;
      if (!completed(current) || current.alarmDeviceId !== null) this._stop();
    }
  }
  _key(timer) { return JSON.stringify([this.installationId, timer.subjectId, timer.runId]); }
  async _claim(epoch) {
    if (!this._canSound() || this.playing || this.dirty) return;
    const sample = [...this.samples.values()].find(value => recent(value.timer, value.asOf) && !this.attempted.has(this._key(value.timer)));
    if (!sample) return;
    const {subjectId, runId} = sample.timer, key = this._key(sample.timer), audioEpoch = this.audioEpoch;
    this.attempted.add(key);
    let result;
    try { result = await this.hass.callWS({type: PREFIX + 'claim', version: 1, subjectId, runId}); }
    catch { return; }
    if (!this._valid(epoch) || audioEpoch !== this.audioEpoch || !this._canSound() || this.dirty ||
        result?.version !== 1 || result.claimed !== true || !validFact(result.timer) ||
        result.timer.subjectId !== subjectId || result.timer.runId !== runId || !recent(result.timer, result.asOf)) return;
    try {
      if (this.sound.play(30) !== true) return;
      this.playing = {subjectId, runId, key};
      this.stopTimer = this.env.setTimeout(() => { this._stop(); this.onChange(); }, 30000);
      this.onChange();
    } catch { this._stop(); }
  }
  dismiss(subjectId, runId) {
    if (!this.attached) return;
    // Capture the clicked run, never whichever run exists when the request completes.
    const sample = [...this.samples.values()].find(value => value.timer.subjectId === subjectId && value.timer.runId === runId);
    if (!sample) return;
    this.attempted.add(this._key(sample.timer));
    this.audioEpoch++;
    if (this.playing?.subjectId === subjectId && this.playing.runId === runId) this._stop();
    if (this._checkHost()) {
      this.env.window.dispatchEvent(new this.env.window.CustomEvent('domosenso-frame-timer-dismiss', {detail: {subjectId, runId}}));
    } else if (this._connected()) {
      this.acks.push({subjectId, runId});
      void this._drain();
    }
    this.onChange();
  }
  _stop() {
    this.env.clearTimeout(this.stopTimer);
    this.stopTimer = null;
    this.sound.stop();
    this.playing = null;
  }
}

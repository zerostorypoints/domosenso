// The first page belongs to Lovelace. Studio only draws the two HiFiSync pages.
const DWELL = 15_000;
const ROOM_IDLE = 30_000;
const PLAYER = 'playing';
const SYSTEM = 'system';
const ROOM = 'room';
const STUDIO_ASSET = '/domosenso_frame/ui/0.2.7/frame-ui.js';
const STUDIO_I18N = '/domosenso_frame/ui/0.2.7/renderer-i18n.js';
const LABEL_KEYS = {playing: 'media', system: 'hifisync-system', room: 'hifisync-room'};


export class MusicPlaylist {
  pages = [PLAYER];
  page = PLAYER;
  deadline = 0;

  update(snapshot, now) {
    this.pages = !snapshot ? [PLAYER] : snapshot.room ? [PLAYER, SYSTEM, ROOM] : [PLAYER, SYSTEM];
    const room = snapshot?.room?.id ?? snapshot?.room?.name;
    if (!this.pages.includes(this.page) || (this.page === ROOM && room !== this.room)) this.select(PLAYER, now);
    if (this.pages.length === 1) this.deadline = 0;
    else if (!this.deadline) this.deadline = now + DWELL;
    this.room = room;
  }

  select(page, now) {
    if (!this.pages.includes(page)) return false;
    this.page = page;
    this.deadline = this.pages.length > 1 ? now + DWELL : 0;
    return true;
  }

  step(direction, now) {
    if (this.pages.length < 2) return false;
    const next = (this.pages.indexOf(this.page) + direction + this.pages.length) % this.pages.length;
    return this.select(this.pages[next], now);
  }

  touch(now) {
    if (this.page === ROOM) this.deadline = now + ROOM_IDLE;
  }

  tick(now) {
    return this.deadline > 0 && now >= this.deadline ? this.step(1, now) : false;
  }
}

export function musicIsShowing(config, states) {
  return states[config.mode]?.state === 'ambient' && states[config.view]?.state === 'on'
    && states[config.player]?.state === 'playing';
}

export function musicSnapshot(hifisync, page, locale, timezone, visit, label = id => id) {
  const screen = (id, type, requires = []) => ({
    id, title: label(id), duration: 15, requires,
    widgets: [{ id: type, type, layout: {x: 0, y: 0, w: 12, h: 12} }],
  });
  const playing = screen(PLAYER, 'media');
  const screens = [playing, screen(SYSTEM, 'hifisync-system', ['hifisync-system'])];
  const capabilities = ['hifisync-system'];
  if (hifisync.snapshot.room) {
    screens.push(screen(ROOM, 'hifisync-room', ['hifisync-room']));
    capabilities.push('hifisync-room');
  }
  return {
    version: 2, hifisyncStudioVersion: 1, connected: true, fetchedAt: new Date().toISOString(),
    timezone, capabilities, mode: 'media', screen: page, data: {hifisync},
    ...(page === ROOM ? {roomVisitId: visit} : {}),
    config: {
      version: 2, name: 'HiFiSync', locale, theme: 'modern', modes: [
        {id: 'controls', screens: [playing]}, {id: 'ambient', screens: [playing]}, {id: 'media', screens},
      ],
    },
  };
}

export class RamkaHiFiMusic {
  queue = new MusicPlaylist();
  visit = 0;
  serial = 0;
  nextFetch = 0;

  sync(config, hass) {
    const active = config && hass?.connection?.connected && musicIsShowing(config, hass.states);
    if (!active) {
      if (this.hass) this.reset();
      return;
    }
    if (this.hass?.connection !== hass.connection) this.reset();
    this.hass = hass;
    this.config = config;
    if (!this.timer) this.timer = setInterval(() => this.poll(), 500);
    this.poll();
  }

  reset() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.hass = this.config = null;
    this.serial++;
    this.nextFetch = 0;
    this.pending = false;
    this.projection = null;
    this.queue.update(null, Date.now());
    this.overlay?.remove();
    this.tabs?.remove();
  }

  async poll() {
    const now = Date.now();
    if (this.projection && Date.parse(this.projection.validUntil) <= now) this.setProjection(null);
    if (this.queue.tick(now)) this.show();
    if (this.pending || now < this.nextFetch) return;
    this.pending = true;
    this.nextFetch = now + 4000;
    const serial = this.serial;
    try {
      const result = await this.hass.callWS({type: 'domosenso_frame/lovelace_music', entity: this.config.player});
      if (serial !== this.serial) return;
      if (result?.hifisync) {
        const [, i18n] = await (this.renderer ??= Promise.all([import(STUDIO_ASSET), import(STUDIO_I18N)]).catch(error => {
          this.renderer = null;
          throw error;
        }));
        this.translate = i18n.translate;
      }
      if (serial === this.serial) this.setProjection(result?.hifisync ?? null);
    } catch {
      if (serial === this.serial) this.setProjection(null);
    } finally {
      if (serial === this.serial) this.pending = false;
    }
  }

  setProjection(projection) {
    this.projection = projection && Date.parse(projection.validUntil) > Date.now() ? projection : null;
    this.queue.update(this.projection?.snapshot, Date.now());
    this.show();
  }

  step(direction) {
    if (!this.queue.step(direction, Date.now())) return false;
    this.show();
    return true;
  }

  show() {
    const {page, pages} = this.queue;
    if (!this.projection || pages.length < 2) {
      this.overlay?.remove();
      this.tabs?.remove();
      this.shownPage = PLAYER;
      return;
    }
    const language = String(this.hass.locale?.language ?? this.hass.language ?? 'en').split(/[-_]/)[0];
    const locale = ['pl', 'de', 'en'].includes(language) ? language : 'en';
    if (page !== this.shownPage) this.visit++;
    this.shownPage = page;
    if (page === PLAYER) this.overlay?.remove();
    else this.showFrame(page, locale);
    this.showTabs(locale);
  }

  showFrame(page, locale) {
    if (!this.overlay) {
      this.overlay = document.createElement('section');
      this.overlay.setAttribute('data-own-tap', '');
      this.overlay.setAttribute('data-ramka-hifisync', '');
      Object.assign(this.overlay.style, {position: 'fixed', inset: '0', zIndex: '9800', background: '#100e0c'});
      this.frame = document.createElement('domosenso-studio-frame');
      Object.assign(this.frame.style, {display: 'block', width: '100%', height: '100%'});
      this.frame.addEventListener('frame-action', event => {
        const {kind, action} = event.detail;
        if (kind === 'navigation' && action === 'next') this.step(1);
        if (kind === 'navigation' && action === 'previous') this.step(-1);
        if (kind === 'room_interaction') this.queue.touch(Date.now());
      });
      this.overlay.append(this.frame);
    }
    if (!this.overlay.isConnected) document.body.append(this.overlay);
    this.frame.snapshot = musicSnapshot(this.projection, page, locale, this.hass.config.time_zone, 'room-' + this.visit,
      id => this.translate(locale, LABEL_KEYS[id]));
  }

  showTabs(locale) {
    if (!this.tabs) {
      this.tabs = document.createElement('nav');
      this.tabs.setAttribute('data-own-tap', '');
      this.tabs.setAttribute('data-ramka-hifisync', '');
      Object.assign(this.tabs.style, {
        position: 'fixed', zIndex: '9801', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: '4px', padding: '3px', borderRadius: '20px',
        background: '#211b15', boxShadow: '0 1px 8px #0008',
      });
    }
    const signature = [locale, this.queue.page, ...this.queue.pages].join('/');
    if (this.tabSignature !== signature) {
      this.tabSignature = signature;
      this.tabs.setAttribute('aria-label', this.translate(locale, 'music'));
      this.tabs.replaceChildren(...this.queue.pages.map(page => {
        const button = document.createElement('button');
        const selected = page === this.queue.page;
        button.type = 'button';
        button.textContent = this.translate(locale, LABEL_KEYS[page]);
        button.setAttribute('aria-pressed', String(selected));
        Object.assign(button.style, {
          padding: '4px 11px', border: 'none', borderRadius: '14px', font: 'inherit',
          color: selected ? '#211b15' : '#fff6e6', background: selected ? '#eca54b' : 'transparent',
        });
        button.onclick = () => { this.queue.select(page, Date.now()); this.show(); };
        return button;
      }));
    }
    if (!this.tabs.isConnected) document.body.append(this.tabs);
  }
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { MusicPlaylist, musicIsShowing, musicSnapshot } from './hifisync-music.js';

test('uses the original Now Playing anchor and only valid HiFiSync pages', () => {
  const queue = new MusicPlaylist();
  assert.equal(queue.step(1, 0), false);
  queue.update({ room: null }, 0);
  queue.step(1, 0);
  assert.equal(queue.page, 'system');
  queue.step(1, 1);
  assert.equal(queue.page, 'playing');
  queue.update({ room: { id: 'room' } }, 2);
  queue.step(-1, 3);
  assert.equal(queue.page, 'room');
  queue.update({ room: null }, 4);
  assert.equal(queue.page, 'playing');
  queue.update(null, 5);
  assert.equal(queue.step(1, 5), false);
});

test('holds the Room during interaction and releases on manual navigation', () => {
  const queue = new MusicPlaylist();
  queue.update({ room: { id: 'room' } }, 0);
  queue.step(-1, 0);
  queue.touch(14_000);
  assert.equal(queue.tick(43_999), false);
  assert.equal(queue.tick(44_000), true);
  assert.equal(queue.page, 'playing');
  queue.step(-1, 45_000);
  queue.touch(46_000);
  queue.step(-1, 47_000);
  assert.equal(queue.tick(62_000), true);
  assert.equal(queue.page, 'room');
});

test('only runs on the original now-playing dashboard state', () => {
  const cfg = { player: 'media_player.amp', mode: 'input_select.frame', view: 'binary_sensor.music' };
  const states = { [cfg.player]: { state: 'playing' }, [cfg.mode]: { state: 'ambient' }, [cfg.view]: { state: 'on' } };
  assert.equal(musicIsShowing(cfg, states), true);
  states[cfg.mode].state = 'controls';
  assert.equal(musicIsShowing(cfg, states), false);
  states[cfg.mode].state = 'ambient';
  states[cfg.player].state = 'paused';
  assert.equal(musicIsShowing(cfg, states), false);
});

test('renderer receives only the HiFiSync projection and a local Room visit', () => {
  const hifisync = {snapshot:{room:{id:'room'}}};
  const snapshot = musicSnapshot(hifisync, 'room', 'pl', 'Europe/Zurich', 'room-4');
  assert.equal(snapshot.screen, 'room');
  assert.equal(snapshot.roomVisitId, 'room-4');
  assert.deepEqual(snapshot.data, {hifisync});
  assert.deepEqual(snapshot.config.modes.find(m => m.id === 'media').screens.map(x => x.id), ['playing','system','room']);
  assert.equal(musicSnapshot(hifisync, 'system', 'en', 'UTC').roomVisitId, undefined);
});

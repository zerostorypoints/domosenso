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

test('resumes the remaining Room time after a renewed inactivity hold', () => {
  const queue = new MusicPlaylist();
  queue.update({ room: { id: 'room' } }, 0);
  queue.step(-1, 0);
  queue.interact('touch', 12_000);
  queue.interact('touch', 25_000);
  assert.equal(queue.tick(54_999), false);
  assert.equal(queue.tick(55_000), false);
  assert.equal(queue.tick(57_999), false);
  assert.equal(queue.tick(58_000), true);
  assert.equal(queue.page, 'playing');
});

test('counts inactivity from the end of a long Room gesture', () => {
  const queue = new MusicPlaylist();
  queue.update({ room: { id: 'room' } }, 0);
  queue.step(-1, 0);
  queue.interact('begin', 14_000, 'drag');
  for (let now = 19_000; now <= 64_000; now += 5_000) {
    queue.interact('progress', now, 'drag');
    assert.equal(queue.tick(now), false);
  }
  queue.interact('end', 66_000, 'drag');
  assert.equal(queue.tick(96_999), false);
  assert.equal(queue.tick(97_000), true);
});

test('manual navigation and Room replacement clear a hold and discard a delayed end', () => {
  const queue = new MusicPlaylist();
  queue.update({ room: { id: 'room' } }, 0);
  queue.step(-1, 0);
  queue.interact('begin', 4_000, 'previous-visit');
  assert.equal(queue.select('room', 5_000), false);
  queue.step(1, 6_000);
  queue.step(-1, 7_000);
  queue.interact('end', 8_000, 'previous-visit');
  assert.equal(queue.tick(22_000), true);
  queue.step(-1, 23_000);
  queue.interact('touch', 24_000);
  queue.update({ room: { id: 'new-room' } }, 25_000);
  assert.equal(queue.page, 'playing');
  assert.equal(queue.tick(40_000), true);
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

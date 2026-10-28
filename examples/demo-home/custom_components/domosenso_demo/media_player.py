"""Synthetic speaker with registered playback, queue and volume services."""
from homeassistant.components.media_player import MediaPlayerEntity, MediaPlayerEntityFeature
from . import DemoEntity


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([DemoMedia(hass, 'media_player.living_room_speaker')])


class DemoMedia(DemoEntity, MediaPlayerEntity):
    _attr_supported_features = (MediaPlayerEntityFeature.PLAY | MediaPlayerEntityFeature.PAUSE |
        MediaPlayerEntityFeature.STOP | MediaPlayerEntityFeature.NEXT_TRACK | MediaPlayerEntityFeature.PREVIOUS_TRACK |
        MediaPlayerEntityFeature.VOLUME_SET | MediaPlayerEntityFeature.VOLUME_MUTE |
        MediaPlayerEntityFeature.TURN_ON | MediaPlayerEntityFeature.TURN_OFF)

    @property
    def state(self):
        return self.runtime['states'][self.entity_id]

    @property
    def media_title(self):
        return self.fixture_attributes.get('media_title')

    @property
    def media_artist(self):
        return self.fixture_attributes.get('media_artist')

    @property
    def media_album_name(self):
        return self.fixture_attributes.get('media_album_name')

    @property
    def media_duration(self):
        return self.fixture_attributes.get('media_duration')

    @property
    def media_position(self):
        return self.fixture_attributes.get('media_position', 0)

    @property
    def media_position_updated_at(self):
        from homeassistant.util import dt
        return dt.utcnow()

    @property
    def entity_picture(self):
        return '/local/' + self.fixture_attributes.get('entity_picture', 'media/cover-glass-hours.png')

    @property
    def volume_level(self):
        return self.fixture_attributes.get('volume_level', .25)

    @property
    def is_volume_muted(self):
        return self.fixture_attributes.get('is_volume_muted', False)

    async def async_media_play(self):
        self.change('media_play', 'playing')

    async def async_media_pause(self):
        self.change('media_pause', 'paused')

    async def async_media_stop(self):
        self.change('media_stop', 'idle')

    async def async_turn_on(self):
        self.change('turn_on', 'idle')

    async def async_turn_off(self):
        self.change('turn_off', 'off')

    async def async_set_volume_level(self, volume):
        self.change('volume_set', volume_level=volume)

    async def async_mute_volume(self, mute):
        self.change('volume_mute', is_volume_muted=mute)

    async def async_media_next_track(self):
        self.runtime['queue_index'] = (self.runtime['queue_index'] + 1) % len(self.runtime['baseline']['queue'])
        item = self.runtime['baseline']['queue'][self.runtime['queue_index']]
        self.change('media_next_track', media_title=item['title'], media_artist=item['artist'],
                    media_album_name=item['album'], media_duration=item['duration'], entity_picture=item['entity_picture'])

    async def async_media_previous_track(self):
        self.runtime['queue_index'] -= 2
        await self.async_media_next_track()

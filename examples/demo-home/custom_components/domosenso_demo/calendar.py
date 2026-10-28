"""Fictional calendar events for the unchanged agenda card."""
from datetime import datetime, timedelta
from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.util import dt
from . import DemoEntity


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    async_add_entities([DemoCalendar(hass, 'calendar.family')])


class DemoCalendar(DemoEntity, CalendarEntity):
    @property
    def event(self):
        return None

    async def async_get_events(self, hass, start_date, end_date):
        events = []
        for item in self.runtime['baseline']['calendar_events']:
            date = dt.now().date() + timedelta(days=item['day'])
            if item.get('all_day'):
                start, end = date, date + timedelta(days=1)
            else:
                start = dt.as_local(datetime.fromisoformat(f"{date}T{item['start']}").replace(tzinfo=dt.DEFAULT_TIME_ZONE))
                end = dt.as_local(datetime.fromisoformat(f"{date}T{item['end']}").replace(tzinfo=dt.DEFAULT_TIME_ZONE))
            event = CalendarEvent(start=start, end=end, summary=item['summary'])
            if event.end_datetime_local > start_date and event.start_datetime_local < end_date:
                events.append(event)
        return events

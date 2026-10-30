# calendar: field notes

- Two ways in, both Home Assistant config flows (Settings → Devices & services → Add integration),
  where a human enters the URL and any password:
  - **CalDAV** (`caldav`): the server's URL, a user and a password; refreshed every 15 minutes.
  - **An ICS link** (`remote_calendar`, "Remote calendar"): a calendar's public or secret `.ics`
    URL and a name; read-only, refreshed once a day, so a new event can take a day to show.
- Either gives a `calendar.*` entity: put it into the `calendar` input of the Ramka
  (`domosenso/ramka.inputs.yaml`), render and deploy. The Ramka settings page's Calendar page links
  to both flows.

- iCloud over CalDAV needs an app-specific password, created in the Apple account's security
  settings, not the account password.
- Apple's upgraded Reminders are not served over CalDAV, so to-do lists from iCloud do not reach
  Home Assistant this way; the Ramka's agenda shows calendar events only.

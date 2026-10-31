"""Pure normalization shared by component templates and assistant bindings."""

PLANT_DEFAULTS = {"min_moisture": 15, "max_moisture": 60, "min_conductivity": 350,
                  "max_conductivity": 2000, "min_brightness": 500}
PLANT_BANDS = ("min_moisture", "max_moisture", "min_conductivity", "max_conductivity",
               "min_temperature", "max_temperature", "min_brightness")


def _label(value):
    if not isinstance(value, dict):
        return value
    # The package's first translated value remains the existing friendly-name fallback.
    return {'en': next(iter(value.values())), **{k: v for k, v in value.items() if k in ('en', 'de', 'pl')}}


def air_policies(inputs, air_limits):
    policies = []
    for metric, entity in inputs.get("air", {}).items():
        if metric not in air_limits or not entity:
            continue
        first, second, lower, upper, _, _, _, unit = air_limits[metric]
        prefix = inputs["prefix"]
        policies.append({"owner": "ramka", "metric": metric, "entity": entity,
                         "unit": unit or ("/100" if metric == "score" else "index"),
                         "levels": [lower, upper], "higher_is_better": metric == "score",
                         "helpers": {first: f"input_number.{prefix}_air_{metric}_{first}",
                                     second: f"input_number.{prefix}_air_{metric}_{second}"}})
    return policies


def ramka_bindings(inputs, air_limits):
    prefix = inputs["prefix"]
    fields = {role: {"entity": entity} for role, entity in {
        "mode": f"input_select.{prefix}_mode", "page": f"input_select.{prefix}_ambient",
        "theme": f"input_select.{prefix}_theme_mode", "radar_wake": f"input_boolean.{prefix}_near_enabled",
    }.items()}
    fields["rotation"] = {"entity": f"sensor.{prefix}_ambient_pages", "attribute": "pages"}
    return {"subjects": [{"key": prefix, "kind": "frame", "label": _label(inputs.get("name", prefix)),
                          "fields": fields}], "policies": air_policies(inputs, air_limits)}


def plant_rows(inputs):
    defaults = inputs.get("plant_defaults", PLANT_DEFAULTS)
    rows = []
    for item in inputs["plants"]:
        plant_id = item["entity"].split(".", 1)[1]
        given = item.get("sensors", {})
        sensors = {role: given.get(role, f"sensor.{plant_id}_{suffix}") for role, suffix in (
            ("moisture", "moisture"), ("conductivity", "conductivity"),
            ("brightness", "illuminance"), ("temperature", "temperature"))}
        limits = {band: item[band] if band in item else defaults[band]
                  for band in PLANT_BANDS if band in item or band in defaults}
        name, label = item.get("name", item["label"]), item["label"]
        rows.append({"id": plant_id, "name": name if isinstance(name, str) else next(iter(name.values())),
                     "label": label if isinstance(label, str) else next(iter(label.values())),
                     "names": name if isinstance(name, dict) else None,
                     "rooms": label if isinstance(label, dict) else None,
                     "photo": item.get("photo"), "sensors": sensors, "limits": limits,
                     "check_days": item.get("check_days", defaults.get("check_days", 3))})
    return rows


def plant_bindings(inputs):
    subjects = []
    for item, row in zip(inputs["plants"], plant_rows(inputs)):
        fields = {role: {"entity": entity} for role, entity in row["sensors"].items()}
        fields.update({role: {"entity": entity} for role, entity in {
            "plant": item["entity"],
            "last_watered": f"sensor.{row['id']}_last_watered",
            "water_in_days": f"sensor.{row['id']}_water_in_days",
            "drying_rate": f"sensor.{row['id']}_moisture_change_48h",
            "brightness_peak": f"sensor.{row['id']}_illuminance_max_24h",
        }.items()})
        subject = {"key": item["entity"], "kind": "plant", "label": _label(row["names"] or row["name"]),
                   "fields": fields, "limits": {**row["limits"], "check_days": row["check_days"]}}
        if item.get("room"):
            subject["roomKey"] = item["room"]
        subjects.append(subject)
    return {"subjects": subjects, "policies": []}


def component_bindings(component, inputs, component_defaults=None):
    """Build a private mapping from declared inputs, never from guessed entity names."""
    if component == 'plants':
        return plant_bindings(inputs)
    component_defaults = component_defaults or {}
    subjects = []

    def add(key, kind, label, fields, **extra):
        fields = {k: {'entity': v} for k, v in fields.items() if v}
        if fields:
            subjects.append({'key': key, 'kind': kind, 'label': _label(label), 'fields': fields, **extra})

    if component == 'remote-access':
        pass
    elif component in ('calendar', 'weather'):
        value = inputs.get(component, [])
        for entity in value if isinstance(value, list) else [value]:
            if entity:
                add(entity, component, entity, {component: entity})
    elif component == 'backup':
        add('backup', 'backup', 'Backup', {'age': 'sensor.newest_backup_age', 'count': 'sensor.backup_count',
                                         'size': 'sensor.backup_folder_size'})
    elif component == 'media':
        entity = inputs.get('media_player')
        if entity:
            mains = inputs.get('mains') or {}
            add(entity, 'player', inputs.get('label', entity), {'player': entity,
                'quality': inputs.get('quality'), 'service': inputs.get('service'),
                'power': mains.get('power'), 'voltage': mains.get('voltage')})
    elif component == 'lights':
        seen = set()
        for item in inputs.get('rooms', []):
            group = item.get('group')
            if group:
                # The component creates this alias using the explicitly configured id or group object id.
                entity = 'light.room_' + item.get('id', group.split('.', 1)[1])
                add(entity, 'light', item['name'], {'light': entity})
                seen.add(group)
        for item in inputs.get('lights', []):
            entity = item.get('entity')
            if entity and entity not in seen:
                extra = {'roomKey': item['room']} if item.get('room') else {}
                add(entity, 'light', item.get('label', entity), {'light': entity}, **extra)
    elif component == 'climate-air':
        for item in inputs.get('climate', []):
            entity = item.get('temperature') or item.get('humidity')
            if entity:
                extra = {'indoor': item.get('indoor', True)}
                if item.get('room'): extra['roomKey'] = item['room']
                add(entity, 'room', item['label'], {'temperature': item.get('temperature'),
                    'humidity': item.get('humidity')}, **extra)
        for metric, entity in (inputs.get('air') or {}).items():
            if metric in ('score', 'co2', 'pm2_5', 'voc', 'nox') and entity:
                add(entity, 'room', metric, {metric: entity})
        outside = inputs.get('outside') or {}
        if outside:
            entity = outside.get('temperature') or outside.get('humidity')
            if entity: add(entity, 'room', 'Outside', {'temperature': outside.get('temperature'),
                                                       'humidity': outside.get('humidity')}, indoor=False)
        if inputs.get('outside_weather'):
            add('climate-outside', 'room', 'Outside', {'temperature': 'sensor.outside_temperature',
                'humidity': 'sensor.outside_humidity'}, indoor=False)
        status = {}
        if any(item.get('bathroom') for item in inputs.get('climate', [])):
            status['humidity_alert'] = 'binary_sensor.bathroom_humidity_high'
        if inputs.get('outside_weather') or outside.get('temperature'):
            status['difference'] = 'sensor.indoor_outdoor_difference'
        add('climate-status', 'room', 'Climate', status)
    elif component == 'awnings':
        for item in inputs.get('covers', []):
            # HA chooses the actual id when default_entity_id was not pinned.
            entity = item.get('entity_id')
            if entity:
                extra = {'roomKey': item['room']} if item.get('room') else {}
                add(entity, 'awning', item['name'], {'cover': entity}, **extra)
        wind = inputs.get('wind_sensor')
        if wind:
            heard = (inputs.get('wind_last_heard') or component_defaults['wind_last_heard'])['id']
            add(wind, 'awning', inputs.get('wind_name', 'Awnings wind'),
                {'wind': wind, 'last_heard': 'input_datetime.' + heard})
    elif component == 'bermuda-presence':
        for collection in ('phones', 'tablets'):
            for entity, label in (inputs.get(collection) or {}).items():
                add(entity, 'presence_source', label, {'presence': entity})
        for item in inputs.get('radar_sources', []):
            entity = item.get('entity')
            if entity:
                extra = {'roomKey': item['room']} if item.get('room') else {}
                add(entity, 'presence_source', item.get('label', entity),
                    {'presence': entity, 'distance': item.get('distance')}, **extra)
    elif component == 'audio-sensor':
        for item in inputs.get('sensors', []):
            level = (item.get('entities') or {}).get('level')
            if not level: continue
            prefix = component_defaults['audio_prefixes'][item['room']]
            add(level, 'audio_source', item.get('friendly_name', item['area']),
                {'level': level, 'offset': f'sensor.{prefix}_spl_offset',
                 'calibrated': f'input_boolean.{prefix}_spl_calibrated', 'online': item.get('online')},
                roomKey=item['room'])
    return {'subjects': subjects, 'policies': []}

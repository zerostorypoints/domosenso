import esphome.codegen as cg
from esphome.components import esp32, microphone, sensor, text_sensor
import esphome.config_validation as cv
from esphome.const import (
    CONF_ID,
    CONF_MICROPHONE,
    CONF_NAME,
    DEVICE_CLASS_SOUND_PRESSURE,
    ENTITY_CATEGORY_DIAGNOSTIC,
    PLATFORM_ESP32,
    STATE_CLASS_MEASUREMENT,
    UNIT_DECIBEL,
    UNIT_PERCENT,
)

DEPENDENCIES = ["microphone"]
AUTO_LOAD = ["sensor", "text_sensor", "ring_buffer"]

CONF_SPECTRUM = "spectrum"
CONF_OCTAVES = "octaves"
CONF_NAME_PREFIX = "name_prefix"
CONF_LOAD = "load"

# The band maths (spectrum_bands.h) assume this rate: the third-octave edges are fixed bins.
SAMPLE_RATE = 48000
# Newest esp-dsp 1.x on the ESP component registry, the same pin ESPHome's runtime_image uses.
ESP_DSP_VERSION = "1.8.2"

OCTAVE_LABELS = [
    "31.5 Hz",
    "63 Hz",
    "125 Hz",
    "250 Hz",
    "500 Hz",
    "1 kHz",
    "2 kHz",
    "4 kHz",
    "8 kHz",
    "16 kHz",
]

# Spelled out from the global namespace: spectrum_bands.h keeps its maths in a top-level
# audio_spectrum namespace (no ESPHome, for the host test), and main.cpp's `using namespace esphome`
# would make a bare audio_spectrum:: ambiguous.
audio_spectrum_ns = cg.global_ns.namespace("esphome").namespace("audio_spectrum")
AudioSpectrumComponent = audio_spectrum_ns.class_(
    "AudioSpectrumComponent", cg.Component
)

_octave_sensor_schema = sensor.sensor_schema(
    unit_of_measurement=UNIT_DECIBEL,
    accuracy_decimals=1,
    device_class=DEVICE_CLASS_SOUND_PRESSURE,
    state_class=STATE_CLASS_MEASUREMENT,
)


def _expand_octaves(config):
    # One prefix in the YAML instead of ten sensor blocks; each octave becomes a full sensor config.
    prefix = config[CONF_NAME_PREFIX]
    return [
        _octave_sensor_schema({CONF_NAME: f"{prefix} {label}"})
        for label in OCTAVE_LABELS
    ]


CONFIG_SCHEMA = cv.All(
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(AudioSpectrumComponent),
            cv.Optional(
                CONF_MICROPHONE, default={}
            ): microphone.microphone_source_schema(
                min_bits_per_sample=16,
                max_bits_per_sample=16,
            ),
            cv.Optional(CONF_SPECTRUM): text_sensor.text_sensor_schema(),
            cv.Optional(CONF_OCTAVES): cv.All(
                cv.Schema({cv.Required(CONF_NAME_PREFIX): cv.string}),
                _expand_octaves,
            ),
            cv.Optional(CONF_LOAD): sensor.sensor_schema(
                unit_of_measurement=UNIT_PERCENT,
                accuracy_decimals=1,
                state_class=STATE_CLASS_MEASUREMENT,
                entity_category=ENTITY_CATEGORY_DIAGNOSTIC,
            ),
        }
    ).extend(cv.COMPONENT_SCHEMA),
    cv.only_on([PLATFORM_ESP32]),
)

FINAL_VALIDATE_SCHEMA = cv.Schema(
    {
        cv.Required(
            CONF_MICROPHONE
        ): microphone.final_validate_microphone_source_schema(
            "audio_spectrum", sample_rate=SAMPLE_RATE
        ),
    },
    extra=cv.ALLOW_EXTRA,
)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)

    # Passive always: another meter keeps the microphone running, and stopping a source would stop
    # the shared microphone for everyone.
    mic_source = await microphone.microphone_source_to_code(
        config[CONF_MICROPHONE], passive=True
    )
    cg.add(var.set_microphone_source(mic_source))

    if spectrum_config := config.get(CONF_SPECTRUM):
        sens = await text_sensor.new_text_sensor(spectrum_config)
        cg.add(var.set_spectrum_sensor(sens))
    if octaves_config := config.get(CONF_OCTAVES):
        for i, octave_config in enumerate(octaves_config):
            sens = await sensor.new_sensor(octave_config)
            cg.add(var.set_octave_sensor(i, sens))
    if load_config := config.get(CONF_LOAD):
        sens = await sensor.new_sensor(load_config)
        cg.add(var.set_load_sensor(sens))

    esp32.add_idf_component(name="espressif/esp-dsp", ref=ESP_DSP_VERSION)

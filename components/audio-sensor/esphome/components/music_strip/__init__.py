import esphome.codegen as cg
from esphome.components import esp32, microphone, sensor
from esphome.components.light.effects import register_addressable_effect
from esphome.components.light.types import AddressableLightEffect
import esphome.config_validation as cv
from esphome.const import (
    CONF_ID,
    CONF_MICROPHONE,
    CONF_NAME,
    ENTITY_CATEGORY_DIAGNOSTIC,
    PLATFORM_ESP32,
    STATE_CLASS_MEASUREMENT,
)

DEPENDENCIES = ["microphone"]
AUTO_LOAD = ["sensor", "ring_buffer", "light"]

CONF_CURRENT = "current"
CONF_STRIP_ID = "strip_id"
CONF_STYLE = "style"

# The features' band edges and the beat's low end assume this rate.
SAMPLE_RATE = 48000
# The same esp-dsp pin as audio_spectrum: one copy of the library on the board.
ESP_DSP_VERSION = "1.8.2"
UNIT_MILLIAMPERE = "mA"

music_strip_ns = cg.global_ns.namespace("esphome").namespace("music_strip")
MusicStripComponent = music_strip_ns.class_("MusicStripComponent", cg.Component)
MusicStripEffect = music_strip_ns.class_("MusicStripEffect", AddressableLightEffect)
# Spelled out from the global namespace (a leading ::): the maths keeps its enums in a top-level
# music_strip namespace (no ESPHome, for the host tests), and main.cpp's `using namespace esphome`
# makes a bare music_strip:: ambiguous with esphome::music_strip.
STYLES = {
    name: cg.RawExpression(f"::music_strip::Style::{value}")
    for name, value in {
        "pulse": "PULSE",
        "glow": "GLOW",
        "bands": "BANDS",
        "centre_meter": "CENTRE_METER",
        "spectrum": "SPECTRUM",
        "ripple": "RIPPLE",
    }.items()
}

CONFIG_SCHEMA = cv.All(
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(MusicStripComponent),
            cv.Optional(
                CONF_MICROPHONE, default={}
            ): microphone.microphone_source_schema(
                min_bits_per_sample=16,
                max_bits_per_sample=16,
            ),
            cv.Optional(CONF_CURRENT): sensor.sensor_schema(
                unit_of_measurement=UNIT_MILLIAMPERE,
                accuracy_decimals=0,
                state_class=STATE_CLASS_MEASUREMENT,
                entity_category=ENTITY_CATEGORY_DIAGNOSTIC,
                icon="mdi:current-dc",
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
            "music_strip", sample_rate=SAMPLE_RATE
        ),
    },
    extra=cv.ALLOW_EXTRA,
)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    # Passive: the 1-second meter keeps the shared microphone running; stopping a source would stop
    # it for everyone.
    mic_source = await microphone.microphone_source_to_code(
        config[CONF_MICROPHONE], passive=True
    )
    cg.add(var.set_microphone_source(mic_source))
    if current_config := config.get(CONF_CURRENT):
        sens = await sensor.new_sensor(current_config)
        cg.add(var.set_current_sensor(sens))
    esp32.add_idf_component(name="espressif/esp-dsp", ref=ESP_DSP_VERSION)


@register_addressable_effect(
    "music_strip",
    MusicStripEffect,
    "Music",
    {
        cv.GenerateID(CONF_STRIP_ID): cv.use_id(MusicStripComponent),
        cv.Required(CONF_STYLE): cv.enum(STYLES, lower=True),
    },
)
async def music_strip_effect_to_code(config, effect_id):
    parent = await cg.get_variable(config[CONF_STRIP_ID])
    return cg.new_Pvariable(effect_id, config[CONF_NAME], parent, config[CONF_STYLE])

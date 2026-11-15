"""SPEC-050 board adapters: hardware isolation, shared measurements and device identity."""
from pathlib import Path
import subprocess
import yaml
import pytest
from catalog_check import _load_esphome
from domosenso_cli.hwscan import matches

REPO = Path(__file__).resolve().parents[1]
FW = REPO / 'components/audio-sensor/esphome'


def config(name):
    assert (FW / name).is_file(), f'missing firmware package {name}'
    return _load_esphome(FW / name)


def test_pdm_adapter_has_only_qualified_hardware():
    data = config('audio-sensor-pdm.yaml')
    assert data['esp32']['flash_size'] == '16MB'
    assert data['esp32']['framework']['type'] == 'esp-idf'
    assert data['psram'] == {'mode': 'octal', 'speed': '80MHz'}
    assert data['esphome']['project']['name'] == 'domosenso.audio-sensor-pdm'
    mic, = data['microphone']
    assert mic['id'] == 'mic' and mic['pdm'] is True
    assert mic['i2s_din_pin'] == 'GPIO5'
    assert (mic['channel'], mic['sample_rate'], mic['bits_per_sample']) == ('right', 48000, '16bit')
    assert mic['correct_dc_offset'] is True
    assert data['i2s_audio'] == [{'id': 'i2s_bus', 'i2s_lrclk_pin': 'GPIO4'}]
    assert not {'audio_dac', 'i2c', 'switch', 'output'} & data.keys()
    assert data['substitutions']['mic_gain_description'] == 'Fixed PDM (no programmable gain)'


def test_adapters_share_pipeline_and_atom_keeps_hardware():
    atom = config('audio-sensor.yaml')
    pdm = config('audio-sensor-pdm.yaml')
    assert atom['packages'] == pdm['packages'] == {'common': 'audio-sensor-common.yaml'}
    assert atom['esphome']['project']['name'] == 'domosenso.audio-sensor'
    assert atom['substitutions']['mic_gain'] == '24DB'
    assert atom['audio_dac'][0]['mic_gain'] == '${mic_gain}'
    assert atom['microphone'][0]['pdm'] is False
    assert atom['microphone'][0]['channel'] == 'left'
    assert atom['switch'] == [{'platform': 'gpio', 'id': 'amp_enable', 'pin': 'GPIO18',
                               'restore_mode': 'ALWAYS_OFF', 'internal': True}]
    common = config('audio-sensor-common.yaml')
    assert common['audio_spectrum']['microphone'] == 'mic'
    assert common['sensor'][0]['measurement_duration'] == '1000ms'
    assert common['sensor'][0]['peak']['name'] == 'Sound peak'
    assert common['sensor'][0]['peak']['id'] == 'sound_peak_dbfs'
    assert common['sensor'][1]['measurement_duration'] == '100ms'
    assert not {'i2c', 'audio_dac', 'i2s_audio', 'microphone', 'output'} & common.keys()
    assert all(s['platform'] != 'gpio' for s in common['switch'])


@pytest.mark.parametrize('model, expected', [('audio-sensor', 'm5stack-atom-echos3r'),
                                           ('audio-sensor-pdm', 'esp32-s3-im73d122')])
def test_project_models_match_only_their_assembly(model, expected):
    # Representative ESPHome project-derived device metadata, not observed HA registry evidence.
    dev = {'integrations': ['esphome'], 'manufacturer': 'domosenso', 'model': model, 'model_id': None,
           'entity_domains': {'sensor'}, 'device_classes': set(), 'entity_names': []}
    found = []
    for name in ('m5stack-atom-echos3r', 'esp32-s3-im73d122'):
        path = REPO / 'devices' / f'{name}.yaml'
        assert path.is_file(), f'missing device {name}'
        data = yaml.safe_load(path.read_text())
        if any(matches(rule, dev) for rule in data['match']):
            found.append(name)
    assert found == [expected]


def test_oled_peak_hold_and_bounded_drawing(tmp_path):
    data = config('audio-sensor-oled.yaml')
    assert data['i2c'] == [{'id': 'oled_i2c', 'sda': 'GPIO7', 'scl': 'GPIO6', 'frequency': '100kHz'}]
    display, = data['display']
    assert display['model'] == 'SSD1306 128x64' and display['address'] == 0x3C
    assert display['update_interval'] == '500ms'
    held, = data['globals']
    assert held['restore_value'] is False and held['initial_value'] == 'NAN'
    peak, = data['sensor']
    assert peak['id'] == 'sound_meter'  # !extend targets the windowed measurement
    on_value = peak['peak']['on_value'][0]['lambda']
    # Execute the actual firmware callbacks with finite, NaN/infinite and out-of-range measurements.
    source = r'''
#include <cassert>
#include <cmath>
#include <cstdio>
#include <cstdarg>
#include <string>
#define id(x) x
float oled_peak_hold = NAN;
struct { float state = NAN; } sound_level_dbfs;
int oled_font = 0;
struct Display {
  int width = -1;
  std::string text;
  void print(int, int, int, const char *s) { text += s; }
  void printf(int, int, int, const char *fmt, ...) {
    char b[100]; va_list a; va_start(a, fmt); vsnprintf(b, sizeof(b), fmt, a); va_end(a); text += b;
  }
  void rectangle(int, int, int w, int h) { assert(w <= 128 && h <= 64); }
  void filled_rectangle(int x, int y, int w, int h) {
    assert(x >= 0 && x+w <= 128 && y >= 0 && y+h <= 64); width = w;
  }
};
void update(float x) { ON_VALUE }
void draw(Display &it) { DRAW }
int main() {
  Display startup; draw(startup); assert(startup.text.find("--") != std::string::npos);
  update(NAN); update(INFINITY); update(-INFINITY); assert(std::isnan(oled_peak_hold));
  update(-70); update(-90); assert(oled_peak_hold == -70);
  update(-12); update(NAN); update(INFINITY); assert(oled_peak_hold == -12);
  for (float level : {-150.f, -60.f, 0.f, 10.f, NAN, INFINITY, -INFINITY}) {
    sound_level_dbfs.state = level; Display d; draw(d);
    assert(d.text.find("nan") == std::string::npos && d.text.find("inf") == std::string::npos);
    if (std::isfinite(level) && level >= 0) assert(d.width == 124);
    if (std::isfinite(level) && level <= -100) assert(d.width == 0);
  }
  puts("ok OLED finite peak hold and bounded bar");
}
'''.replace('ON_VALUE', on_value).replace('DRAW', display['lambda'])
    cpp = tmp_path / 'oled.cpp'; cpp.write_text(source)
    exe = tmp_path / 'oled'
    result = subprocess.run(['c++', '-std=c++17', str(cpp), '-o', str(exe)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    result = subprocess.run([str(exe)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr

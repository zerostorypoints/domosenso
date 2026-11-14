"""Manual Docker-backed SPEC-049 acceptance. Uses synthetic credentials and data."""
import argparse
import base64
import json
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from websockets.sync.client import connect
import yaml

IMAGE = 'homeassistant/home-assistant:2026.9.2'
SYSTEM = '731ba61b-a737-4b53-873e-a618711ee092'
REPLACEMENT = 'a4951c0b-cc52-4c0c-a898-9692c59a6667'
FIXTURE_TOKEN = 'hsha_' + 'a' * 43

FIXTURE = """
import asyncio
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import ssl
from aiohttp import web
SYSTEMS = '/api/integrations/home-assistant/v1/systems'

async def fixture_request(request):
    system_id = request.match_info.get('system_id')
    data = json.loads(await asyncio.to_thread(Path('/config/hifisync-fixture.json').read_text))
    if request.headers.get('Authorization') != 'Bearer ' + data['token']:
        return web.json_response({'error': 'invalid token'}, status=401)
    expiry = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    if system_id is None:
        return web.json_response({'expiresAt':expiry,'systems':[
            {'id': key,'name': value['system']['name'],'visibility': 'private','roomName':value['room']['name'] if value['room'] else None}
            for key,value in data['systems'].items()]})
    if system_id not in data['systems']:
        return web.json_response({'error': 'unavailable'}, status=404)
    return web.json_response({'expiresAt':expiry,'snapshot':data['systems'][system_id]})

async def async_setup(hass, config):
    app = web.Application()
    app.router.add_get(SYSTEMS, fixture_request)
    app.router.add_get(SYSTEMS + '/{system_id}', fixture_request)
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    await asyncio.to_thread(tls.load_cert_chain, '/config/fixture.pem', '/config/fixture.key')
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, '127.0.0.1', 9443, ssl_context=tls).start()
    return True
"""
PLAYER = """
from homeassistant.components.media_player import MediaPlayerEntity, MediaPlayerState

async def async_setup_platform(hass, config, add, discovery_info=None):
    add([FixturePlayer()])

class FixturePlayer(MediaPlayerEntity):
    _attr_name = 'Pilot Player'
    _attr_unique_id = 'fixture-pilot-player'
    _attr_state = MediaPlayerState.PLAYING
    _attr_media_title = 'Pilot Track'
    _attr_media_artist = 'Pilot Artist'
    _attr_should_poll = False
"""

class Socket:
    def __init__(self, url, token):
        self.connection = connect(url.replace('http://','ws://') + '/api/websocket', proxy=None)
        self.socket = self.connection.__enter__()
        self.serial = 0
        assert self.read()['type'] == 'auth_required'
        self.socket.send(json.dumps({'type':'auth', 'access_token': tokenize(token)}))
        assert self.read()['type'] == 'auth_ok'
    def read(self):
        return json.loads(self.socket.recv(timeout=15))
    def call(self, command, ok=True, **data):
        self.serial += 1
        self.socket.send(json.dumps({'id':self.serial,'type':command,**data}))
        while True:
            result = self.read()
            if result.get('id') == self.serial and result.get('type') == 'result': break
        assert result['success'] is ok, (command, result.get('error'))
        return result.get('result')
    def close(self):
        self.connection.__exit__(None,None,None)

def tokenize(token): return token['access_token']

def api(url, path, data=None, token=None):
    headers={'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+tokenize(token)
    request=Request(url+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
    with urlopen(request,timeout=12) as response: return json.load(response)

def auth(url, code):
    request=Request(url+'/auth/token',data=urlencode({'grant_type':'authorization_code','code':code,'client_id':url+'/'}).encode())
    with urlopen(request, timeout=12) as response: return json.load(response)

def poll(callback, timeout=45):
    deadline = time.monotonic()+timeout
    last = None
    while time.monotonic()<deadline:
        try:
            result=callback()
            if result: return result
        except (HTTPError,OSError,AssertionError) as error:
            last=error
        time.sleep(.7)
    raise RuntimeError(f'Fixture did not reach expected state: {last}')

def snapshot(system_id, system_name, room_name):
    return {'version':1,'revision':'fixture-'+system_id,'system':{
        'id':system_id,'name':system_name,'components':[{'id':'amp','role':'amplifier','quantity':1,'label':'Fixture amplifier','drawing':{'rackKind':'amp','widthCm':43,'heightCm':15}}],
        'rack':[['amp']]},'room':{'name':room_name,'widthM':4.2,'lengthM':5.8,'heightM':2.6,'placements':[
        {'role':'listening','xM':2.1,'yM':3.7,'rotationDeg':None}]}}

def docker(*args, **kwargs):
    return subprocess.run(['docker',*args], check=True, text=True, **kwargs)

def prepare(config, bridge, connector):
    components = config/'custom_components'
    components.mkdir()
    ignore = shutil.ignore_patterns('__pycache__', '*.pyc')
    shutil.copytree(bridge / 'custom_components' / 'domosenso_frame',components/'domosenso_frame',ignore=ignore)
    shutil.copytree(connector / 'custom_components' / 'hifisync',components/'hifisync',ignore=ignore)
    client=components/'hifisync'/'client.py'
    text=client.read_text()
    original='https://hifisync.com/api/integrations/home-assistant/v1'
    assert original in text
    client.write_text(text.replace(original,'https://127.0.0.1:9443/api/integrations/home-assistant/v1'))
    for integration, dependency in [('pilot_fixture','http'),('pilot_player','media_player')]:
        path=components/integration
        path.mkdir()
        (path/'manifest.json').write_text(json.dumps({'domain':integration,'name':integration,'version':'0.0.1','dependencies':[dependency] if integration=='pilot_fixture' else [],'requirements':[],'codeowners':[],'documentation':'https://example.test','iot_class':'local_push'}))
    (components/'pilot_fixture'/'__init__.py').write_text(FIXTURE)
    (components/'pilot_player'/'__init__.py').write_text('')
    (components/'pilot_player'/'media_player.py').write_text(PLAYER)
    (config/'configuration.yaml').write_text(yaml.safe_dump({
        'homeassistant':{'name':'Pilot Fixture','latitude':0,'longitude':0,'elevation':0,'unit_system':'metric','time_zone':'UTC'},
        'frontend':{}, 'mobile_app':{}, 'config':{},'person':{},'lovelace':{},
        'pilot_fixture':{},'media_player':[{'platform':'pilot_player'}],
        'input_boolean':{'pilot_music_rotation_paused':{'initial':False}},
        'domosenso_frame':{'endpoints':[{
            'id':'pilot','name':'Pilot','dashboard':'/lovelace','hifisync':True,
            'display':{'locale':'en'},'studio':{'media':{'entity':'media_player.pilot_player'},
                'runtime':{'paused':'input_boolean.pilot_music_rotation_paused'}}
        }]},
    }))
    subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-sha256','-days','1','-nodes',
        '-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-keyout',str(config/'fixture.key'),'-out',str(config/'fixture.pem')],
        check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    support_path=config/'hifisync-fixture.json'
    data={'token':FIXTURE_TOKEN,'systems':{
        SYSTEM:snapshot(SYSTEM,'Private System','Private Room'),
        REPLACEMENT:{**snapshot(REPLACEMENT,'Replacement System','Unused'),'room':None}}}
    support_path.write_text(json.dumps(data))
    return support_path, data

def run(config, container, args):
    support_path, data=prepare(config,args.bridge,args.connector)
    if args.accelerate_fixture:
        integration=config/'custom_components'/'hifisync'/'__init__.py'
        source=integration.read_text()
        assert 'timedelta(minutes=1)' in source and 'timedelta(minutes=retry_minutes)' in source
        integration.write_text(source.replace('timedelta(minutes=1)','timedelta(seconds=1)').replace('timedelta(minutes=retry_minutes)','timedelta(seconds=retry_minutes)'))
    docker('run','--detach','--name',container,'--label','org.domosenso.test=hifisync-studio-pilot','--publish','127.0.0.1::8123','--env','REQUESTS_CA_BUNDLE=/config/fixture.pem','--volume',f'{config}:/config',IMAGE,stdout=subprocess.DEVNULL)
    address=docker('port',container,'8123/tcp',capture_output=True).stdout.strip()
    url='http://'+address
    poll(lambda:api(url,'/api/onboarding'))
    login=api(url,'/api/onboarding/users',{'client_id':url+'/','name':'Pilot Owner','username':'pilot-owner','password':secrets.token_urlsafe(24),'language':'en'})
    token=auth(url,login['auth_code'])
    for step in api(url,'/api/onboarding'):
        if not step['done']:
            api(url,'/api/onboarding/'+step['step'],{'client_id':url+'/','redirect_uri':url+'/?auth_callback=1'} if step['step']=='integration' else {},token)
    poll(lambda:api(url,'/api/states/media_player.pilot_player',token=token))
    print('Fresh HA instance and registered playing entity', flush=True)
    flow=api(url,'/api/config/config_entries/flow',{'handler':'hifisync','show_advanced_options':False},token)
    assert flow['step_id']=='user',flow.get('step_id')
    step=api(url,'/api/config/config_entries/flow/'+flow['flow_id'],{'token':FIXTURE_TOKEN},token)
    assert step['step_id']=='select',step.get('errors')
    admin=Socket(url,token)
    frame=Socket(url,token)
    domain='domosenso_frame/'
    try:
        entries=admin.call('config/entity_registry/list')
        player=next(row['id'] for row in entries if row['entity_id']=='media_player.pilot_player')
        created=api(url,'/api/config/config_entries/flow/'+flow['flow_id'],{'system_id':SYSTEM,'player_registry_id':player},token)
        assert created['type']=='create_entry',created.get('errors')
        print('HiFiSync HA config flow selected the scoped private system', flush=True)
        frame.call(domain+'studio_display',ok=False,offset=0,hifisyncVersion=1)
        key=ec.generate_private_key(ec.SECP256R1())
        public=base64.b64encode(key.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)).decode()
        attempt=frame.call(domain+'begin',endpoint='pilot',name='Pilot Fixture',publicKey=public)
        signature=base64.b64encode(key.sign(attempt['challenge'].encode(),ec.ECDSA(hashes.SHA256()))).decode()
        pending=frame.call(domain+'finish',signature=signature)
        admin.call(domain+'approve',deviceId=pending['deviceId'],code=pending['code'])
        profile=frame.call(domain+'profile')
        assert profile['endpoints'][0]['hifisyncVersion']==1
        assert profile['endpoints'][0]['hifisyncDrawingsVersion']==1
        def detect():
            s=frame.call(domain+'studio_display',offset=0,hifisyncVersion=1,hifisyncDrawingsVersion=1)
            return s
        detect()
        lib=admin.call(domain+'studio_library')
        admin.call(domain+'studio_library_update',revision=lib['revision'],operation='apply',templateId='hifisync',endpoint='pilot',renderer=2)
        ready=poll(lambda:(value if (value:=detect())['data'].get('hifisync') else None))
        assert ready['screen']=='music', ready['screen']
        assert ready['data']['hifisync']['snapshot']['room']['name']=='Private Room'
        assert ready['data']['hifisync']['snapshot']['system']['components'][0]['drawing']['rackKind']=='amp'
        previous=frame.call(domain+'studio_display',offset=0,hifisyncVersion=1)
        assert 'drawing' not in previous['data']['hifisync']['snapshot']['system']['components'][0]
        legacy = frame.call(domain+'studio_display',offset=0)
        assert 'hifisync' not in legacy['data']
        assert all(not s['id'].startswith('hifisync') for m in legacy['config']['modes'] for s in m['screens'])
        for screen in ('hifisync-system','hifisync-room','music'):
            poll(lambda:detect()['screen']==screen,timeout=19)
        print('Paired HA WebSocket: all three pages rotate and wrap. Legacy projection retained.',flush=True)
        api(url,'/api/services/input_boolean/turn_on',{'entity_id':'input_boolean.pilot_music_rotation_paused'},token)
        assert detect()['screen']=='music'
        frame.call(domain+'studio_action',action={'kind':'navigation','action':'previous'})
        assert detect()['screen']=='hifisync-room'
        pause_until=time.monotonic()+16
        while time.monotonic()<pause_until:
            assert detect()['screen']=='hifisync-room'
            time.sleep(.7)
        frame.call(domain+'studio_action',action={'kind':'navigation','action':'next'})
        assert detect()['screen']=='music'
        frame.call(domain+'studio_action',action={'kind':'navigation','action':'previous'})
        assert detect()['screen']=='hifisync-room'
        print('Manual steps wrap in both directions and keep the mapped rotation pause.',flush=True)
        data['systems'].pop(SYSTEM)
        support_path.write_text(json.dumps(data))
        missing=poll(lambda:(value if not (value:=detect())['data'].get('hifisync') else None),timeout=35 if args.accelerate_fixture else 335)
        assert missing['screen']=='music', missing['screen']
        assert missing['data']['media']['title']=='Pilot Track'
        print('Deleted system: cached room removed, Now Playing and track retained.', flush=True)
        entries=api(url,'/api/config/config_entries/entry',token=token)
        linked=next(row for row in entries if row['domain']=='hifisync')
        flow=api(url,'/api/config/config_entries/flow',{'handler':'hifisync','entry_id':linked['entry_id'],'source':'reconfigure'},token)
        assert flow['step_id']=='select',flow.get('errors')
        replacement=api(url,'/api/config/config_entries/flow/'+flow['flow_id'],{'system_id':REPLACEMENT,'player_registry_id':player},token)
        assert replacement['type'] in ('abort','create_entry')
        selected=poll(lambda:(value if (value:=detect())['data'].get('hifisync') else None))
        assert selected['data']['hifisync']['snapshot']['system']['id']==REPLACEMENT
        assert selected['screen']=='music'
        assert 'hifisync-room' not in selected['capabilities']
        frame.call(domain+'studio_action',action={'kind':'navigation','action':'previous'})
        assert detect()['screen']=='hifisync-system'
        frame.call(domain+'studio_action',action={'kind':'navigation','action':'next'})
        assert detect()['screen']=='music'
        print('Replacement system selected with the same token. Room is skipped.',flush=True)
        admin.call(domain+'revoke',deviceId=pending['deviceId'])
        frame.call(domain+'studio_display',ok=False,offset=0,hifisyncVersion=1)
        print('Revoked paired client can no longer read Studio projections.', flush=True)
    finally:
        frame.close()
        admin.close()

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description="Verify the HiFiSync Studio flow in a disposable Home Assistant container.")
    parser.add_argument('--bridge',type=Path,required=True,help="DomoSenso Frame HA checkout")
    parser.add_argument('--connector',type=Path,required=True,help="HiFiSync Home Assistant checkout")
    parser.add_argument('--accelerate-fixture',action='store_true',help="Use seconds in the temporary copy of the connector's polling schedule")
    args=parser.parse_args()
    name='domosenso-hifisync-pilot-'+secrets.token_hex(4)
    try:
        with tempfile.TemporaryDirectory(prefix='domosenso-hifisync-pilot-') as directory:
            try: run(Path(directory),name,args)
            except Exception:
                subprocess.run(['docker','logs','--tail','65',name],check=False)
                raise
            finally:
                subprocess.run(['docker','container','rm','--force',name],check=False,capture_output=True)
    except KeyboardInterrupt:
        raise SystemExit(130)

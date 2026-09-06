"""Offline transport tests for the actual server and generated reader."""
import importlib.util, json, tempfile, subprocess
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.error import HTTPError
ROOT = Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('server',ROOT/'scripts/factory_server.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
requests=[]
class Response:
 def __enter__(self): return self
 def __exit__(self,*args): pass
 def read(self,*args): return json.dumps([[[requests[-1][1],None]]]).encode()
def transport(req,timeout):
 source=parse_qs(urlparse(req.full_url).query)['q'][0]
 requests.append((req.full_url,source))
 assert len(req.full_url)<4000
 return Response()
m.urlopen=transport
source=('这是一个测试段落。\n'*150)+' End.'
assert m.google_translate(source,'es')==source
assert len(requests)>1
assert ''.join(x[1] for x in requests)==source
assert m.translation_error_code(HTTPError('https://private/key',429,'secret',{},None))=='HTTP_429'
m.read_credentials=lambda:{'keys':{'groq':'private'},'models':{},'order':['groq']}
m.ai_repair=lambda *a: 'REPAIRED:'+a[-2]
m.ai_translate=lambda *a: (_ for _ in ()).throw(AssertionError('must use repair'))
assert m.translate_with_fallback('original','es','Español','current')[0]=='REPAIRED:current'
m.ai_repair=lambda *a: (_ for _ in ()).throw(HTTPError('private',401,'secret',{},None))
m.google_translate=lambda *a: (_ for _ in ()).throw(HTTPError('private',429,'secret',{},None))
try: m.translate_with_fallback('original','es','Español','current')
except RuntimeError as e: assert str(e)=='groq:HTTP_401 | google:HTTP_429'
else: raise AssertionError('failure swallowed')
with tempfile.TemporaryDirectory() as temp:
 m.WEBROOT=Path(temp)
 rel=m.write_child_reader_runtime({'host':'fixture.test'},'es')
 subprocess.run(['node',str(ROOT/'scripts/reader_retranslation_self_test.js'),str(m.WEBROOT/rel)],check=True)
 rel=m.write_child_reader_runtime({'host':'fixture.test'},'es',device_mode=True)
 subprocess.run(['node',str(ROOT/'scripts/reader_retranslation_self_test.js'),str(m.WEBROOT/rel),'device'],check=True)
print('PASS retradução: chunking, revisão, diagnóstico seguro e leitor gerado')

#!/usr/bin/env python3
import argparse
from urllib.parse import urlencode
p=argparse.ArgumentParser(description='Monta a URL local do Translator Hell Factory com BYOK corretamente escapado.')
p.add_argument('--port', type=int, default=8765)
p.add_argument('-P','--pollinations')
p.add_argument('-Z','--zai')
p.add_argument('-H','--heia-bigmodel')
p.add_argument('-G','--groq')
p.add_argument('--clear', action='store_true')
a=p.parse_args()
params={}
for key,value in [('P',a.pollinations),('Z',a.zai),('H',a.heia_bigmodel),('G',a.groq)]:
    if value is not None:
        params[key]=value
if a.clear:
    params['CLEAR']='1'
base=f'http://127.0.0.1:{a.port}/.dist/plugins.min.json'
print(base + (('?' + urlencode(params)) if params else ''))

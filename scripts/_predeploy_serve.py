"""배포 전 로컬 렌더 검사용 임시 서버. deploy.ps1 0b 단계가 쓴다.

운영 DB 를 절대 건드리지 않는다 — 임시 디렉터리로 cwd 를 옮긴 뒤 앱을 띄우므로
`daon.db` 는 그 안에 새로 만들어지고, 검사가 끝나면 버려진다.
(main.py 는 cwd 기준으로 daon.db 를 연다.)

사용: python scripts/_predeploy_serve.py 8611   (cwd = backend/)
"""
import os
import sys
import tempfile

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8611

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(BACKEND, 'backend')
sys.path.insert(0, BACKEND)

# 운영 DB 보호: 임시 폴더에서 돌린다
os.chdir(tempfile.mkdtemp(prefix='daon-predeploy-'))

import uvicorn          # noqa: E402
import main             # noqa: E402  (여기서 _init_db 가 임시 폴더에 DB 를 만든다)

uvicorn.run(main.app, host='127.0.0.1', port=PORT, log_level='error')

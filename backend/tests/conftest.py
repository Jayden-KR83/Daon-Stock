"""pytest 공통 설정 — main.py를 import해도 운영 daon.db를 건드리지 않도록 cwd 격리.

import 순서가 중요: conftest는 test 모듈보다 먼저 로드되므로,
sys.path 등록 + 임시 cwd 변경을 module-level에서 미리 처리해야
test 안의 `import main` 이 _init_db()를 안전한 tmp 디렉토리에 실행한다.
"""
import os
import sys
import tempfile

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PROJECT_DIR = os.path.dirname(_BACKEND_DIR)

# 1) tmp 작업 디렉토리 생성 후 cwd 이동 (main.py의 _init_db가 daon.db를 거기 생성)
_TMP_ROOT = tempfile.mkdtemp(prefix='daon-test-')
os.chdir(_TMP_ROOT)

# 2) backend/ 를 sys.path 앞에 두어 `import main` 가능
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

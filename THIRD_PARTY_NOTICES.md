# 자료와 사용 조건

- 드론 기체·교육용 부품·아이콘과 대체용 Q-TRAIN 형상은 이 프로젝트에서 직접 작성했습니다. DJI 설명서의 사진·도면·CAD 파일을 앱에 복제해 넣지 않았습니다.
- 사족보행 로봇 외형은 [Unitree Robotics의 unitree_ros Go2 모델](https://github.com/unitreerobotics/unitree_ros/tree/725b59b6de39a26c425632120c89f23c49a36f1e/robots/go2_description)을 사용합니다. BSD-3-Clause 원문·저작권 표시는 `assets/models/go2/LICENSE`에 보관하며 원본 커밋·각 파일 출처와 SHA-256은 같은 폴더의 `source.json`에 기록합니다. URDF 및 DAE 메시를 GLB로 변환하고 좌표 변환·호환용 경량화·교육용 관절 부분 분리를 적용했습니다. 고장·탈착 부품·커넥터·비상 정지·배터리·정비 순서·보행 연출은 이 앱의 가상 교육 구성입니다. Unitree의 공식 정비법·인증·제휴를 의미하지 않습니다.
- GLB 표시는 같은 Three.js 공식 npm 배포본의 GLTFLoader·BufferGeometryUtils를 사용합니다. 배포본 무결성을 검증하고 import 경로를 로컬로 변경했습니다. 적용 라이선스는 `src/vendor/three/LICENSE`입니다.
- DJI 및 DJI Mini 2 SE는 해당 권리자의 표장입니다. 기종은 교육 절차의 참조이며 DJI 공식 제품·인증·제휴를 의미하지 않습니다.
- 사용자 설명서는 콘텐츠 검토 근거로 연결하며 앱 실행 시 내려받지 않습니다.
- 3D 표현에는 Three.js 0.181.2(MIT)를 사용합니다. 공식 npm 배포본을 로컬에 포함하고 패키지 무결성을 확인했습니다. src/vendor/three/LICENSE와 source.json에 사용 조건·원본 주소를 보관합니다. OrbitControls·SVGRenderer·Projector의 import 경로를 로컬 파일로 바꿨으며, SVGRenderer는 앱의 보안 설정과 호환되도록 인라인 스타일 대신 SVG 표시 속성으로 색상·선 모양을 적용합니다. 경로 재사용 시 이전 표시 속성도 초기화합니다.
- 실행 시 외부 CDN·외부 글꼴·원격 이미지에 접속하지 않습니다. 표시 글꼴은 각 운영체제의 설치 글꼴을 사용합니다.
- Python 표준 라이브러리는 설치된 Python 배포본의 라이선스를 따릅니다.
- 개발 검사에 선택적으로 사용하는 Playwright는 Apache-2.0이며, 검사 브라우저는 각 배포본의 라이선스를 따릅니다. 검사 도구·브라우저는 앱 배포 폴더에 포함하지 않습니다.

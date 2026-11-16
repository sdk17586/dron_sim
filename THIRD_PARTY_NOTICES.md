# 자료와 사용 조건

- 로봇팔 외형은 [Franka Robotics의 Panda ROS 모델](https://github.com/frankarobotics/franka_ros/tree/ddd2fffd9de44b02ad15b4bbb2bfa2cec4d60d98/franka_description)을 사용합니다. Copyright 2023 Franka Robotics GmbH, Apache-2.0. 원문 `LICENSE`·`NOTICE`, 관절 설명 Xacro·한계값, 고정 커밋·출처·SHA-256은 `assets/models/panda/`에 보관합니다. DAE를 GLB로 변환하며 재질을 단순화하고 상세/호환 메시를 경량화했습니다. 그리퍼 정비용 파손 모델(gripper-impact.glb)은 같은 메시에서 손가락 굽힘, 패드 파손, 하우징 균열을 가공했습니다. 원본 관절 연결과 집게 구조를 유지하고 브라우저에서 좌표를 변환합니다. 집기·운반 경로와 교육 단계·정지·배치 판정은 이 프로젝트의 가상 작업대 구성입니다. [Isaac Lab의 Franka 설정](https://github.com/isaac-sim/IsaacLab/blob/main/source/isaaclab_assets/isaaclab_assets/robots/franka.py)으로 지원 로봇임을 확인했으며, Isaac Lab의 USD나 물리 엔진을 앱에 복제하지 않았습니다.
- 교육용 부품·아이콘·2D 도식은 이 프로젝트에서 직접 작성했습니다. 예전의 자체 제작 3D 드론·로봇 대체 형상은 제거했으며, 현재 외형은 아래 X500·Go2 모델을 사용합니다. DJI 설명서의 사진·도면·CAD 파일을 앱에 복제해 넣지 않았습니다.
- 드론 외형은 [PX4-gazebo-models의 X500 모델](https://github.com/PX4/PX4-gazebo-models/tree/e5997f455e33ec071c7c677fc59a65781de496a4/models/x500_base)을 사용합니다. 모델의 Rudis Laboratories BSD-3-Clause 저작권·원문은 `assets/models/x500/LICENSE`, 저장소 원문은 `PX4-LICENSE`, 출처·파일별 SHA-256·고정 커밋은 같은 폴더의 `source.json`에 보관합니다. SDF의 외형과 DAE/STL을 GLB로 변환하고 카본 텍스처를 포함했습니다. 호환용 경량화·교육용 날개 분리/손상·색상·배터리·전원·나사 어댑터를 적용했습니다. 실제 X500 제조사 정비 절차·물리 제어·인증·제휴를 의미하지 않습니다.
- 사족보행 로봇 외형은 [Unitree Robotics의 unitree_ros Go2 모델](https://github.com/unitreerobotics/unitree_ros/tree/725b59b6de39a26c425632120c89f23c49a36f1e/robots/go2_description)을 사용합니다. BSD-3-Clause 원문·저작권 표시는 `assets/models/go2/LICENSE`에 보관하며 원본 커밋·각 파일 출처와 SHA-256은 같은 폴더의 `source.json`에 기록합니다. URDF 및 DAE 메시를 GLB로 변환하고 좌표 변환·호환용 경량화·교육용 관절 부분 분리를 적용했습니다. 고장·탈착 부품·커넥터·비상 정지·배터리·정비 순서·보행 연출은 이 앱의 가상 교육 구성입니다. Unitree의 공식 정비법·인증·제휴를 의미하지 않습니다.
- GLB 표시는 같은 Three.js 공식 npm 배포본의 GLTFLoader·BufferGeometryUtils를 사용합니다. 배포본 무결성을 검증하고 import 경로를 로컬로 변경했습니다. 적용 라이선스는 `src/vendor/three/LICENSE`입니다.
- DJI 및 DJI Mini 2 SE는 해당 권리자의 표장입니다. 기종은 교육 절차의 참조이며 DJI 공식 제품·인증·제휴를 의미하지 않습니다.
- 사용자 설명서는 콘텐츠 검토 근거로 연결하며 앱 실행 시 내려받지 않습니다.
- 3D 표현에는 Three.js 0.181.2(MIT)를 사용합니다. 공식 npm 배포본을 로컬에 포함하고 패키지 무결성을 확인했습니다. src/vendor/three/LICENSE와 source.json에 사용 조건·원본 주소를 보관합니다. OrbitControls·SVGRenderer·Projector의 import 경로를 로컬 파일로 바꿨으며, SVGRenderer는 앱의 보안 설정과 호환되도록 인라인 스타일 대신 SVG 표시 속성으로 색상·선 모양을 적용합니다. 경로 재사용 시 이전 표시 속성도 초기화합니다.
- 실행 시 외부 CDN·외부 글꼴·원격 이미지에 접속하지 않습니다. 표시 글꼴은 각 운영체제의 설치 글꼴을 사용합니다.
- Python 표준 라이브러리는 설치된 Python 배포본의 라이선스를 따릅니다.
- 개발 검사에 선택적으로 사용하는 Playwright는 Apache-2.0이며, 검사 브라우저는 각 배포본의 라이선스를 따릅니다. 검사 도구·브라우저는 앱 배포 폴더에 포함하지 않습니다.

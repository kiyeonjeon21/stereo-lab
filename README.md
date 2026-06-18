# stereo-lab

3D 모션 프레임워크를 만들기 위한 핵심 개념들을 **직접 코드로 만져서** 체득하는 실습장.
단일 Vite 앱 안에서 URL hash로 station을 전환한다.

## 1순위 체인 (현재 작동)

> **절차적 생성 → 포맷/IO → 렌더**
> manifold-3d (box·boolean·extrude) → gltf-transform (.glb export) → three.js (load·render)

같은 "건물 한 채"를 세 가지 방식으로 만지는 게 핵심:

| station | 무엇을 click 시키나 |
| --- | --- |
| `#00-render-loop` | 렌더 루프가 어떻게 도는가 — 회전 큐브 |
| `#01-manifold` | 코드=모델: WASM 커널이 vertex/index 배열을 뱉고, 렌더러는 그걸 받을 뿐 |
| `#02-gltf` | I/O 레이어: 같은 건물을 .glb로 굽고 다시 로드. 콘솔에 glTF JSON 트리 출력 |
| `#03-sdf` | 수학을 눈으로: 메시 0개, 프래그먼트 셰이더가 SDF 레이마칭으로 씬 생성. 드래그로 궤도 회전 |
| `#04-motion` | 모션: Theatre.js 시트/오브젝트를 three.js 메시에 연결. Studio 패널에서 키프레임·스크럽 (북극성) |
| `#05-physics` | 물리: Rapier(Rust→WASM). fixed-timestep으로 물리 스텝과 렌더 스텝 분리. 클릭으로 박스 떨어뜨리기 |

`src/lib/building.ts`의 `buildBuilding()`이 브라우저 station과 Node 생성기 양쪽에서
**같은 geometry 로직**을 공유한다.

> 각 station의 코드를 한 줄씩 근거로 풀어주는 학습 문서는 **[WALKTHROUGH.md](./WALKTHROUGH.md)** 참고.

## 실행

```bash
npm install
npm run gen:glb     # manifold → gltf-transform → public/models/building.glb 생성
npm run dev         # http://localhost:5173 — 상단 네비로 station 전환
```

`#02-gltf`는 먼저 `npm run gen:glb`를 돌려야 모델이 보인다.

```bash
npm run build       # tsc 타입체크 + vite 프로덕션 빌드
npx gltf-transform inspect public/models/building.glb   # (보너스) 생성물 메타 확인
```

## 구조

```
scripts/build-glb.ts   # [station 02 생성기] Node에서 manifold → .glb
src/
  main.ts              # hash 라우터 (station 동적 import + cleanup)
  lib/
    viewer.ts          # 공통 three.js 부트스트랩 (scene/camera/renderer/controls/loop)
    manifold.ts        # WASM 초기화 + manifold → BufferGeometry 변환
    building.ts        # 공유 절차적 geometry 로직
  stations/*.ts        # 각 모듈은 mount(container) => cleanup 규약
```

## 메모

- `manifold-3d`는 WASM이라 Vite `optimizeDeps.exclude` + `manifold.wasm?url` + `locateFile` 패턴으로 로드 (`src/lib/manifold.ts`, `vite.config.ts` 참고). Node에선 locateFile 불필요.

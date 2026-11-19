# Cosmos Ball (nysc_game1)

수박게임 방식의 우주 테마 머지 게임입니다. 달 → 수성 → 화성 → 금성 → 지구 → 해왕성 → 천왕성 → 토성 → 목성 → 태양 → 블랙홀 순서로 합쳐집니다.
관리 페이지에서 단체명을 입력하고 **운영 시작 / 운영 종료**를 누르면, 참가자용 게임 페이지가 열리거나 흰 화면으로 덮입니다.

## 운영과 기록

- **단체명**은 운영 시작 때 입력하며(필수, 20자 이내) 게임 화면 맨 위에 표시됩니다.
- **최고 점수**는 이번 운영 동안 모든 참가자가 함께 쓰는 값입니다. 운영 시작 때 0이 되고, 운영 종료 때 사라집니다.
- **역대 최고기록**(상위 10)에는 운영마다 한 줄씩 `단체명 + 그 운영의 최고 점수`가 쌓입니다. 점수가 오르면 바로 반영되며, 운영을 끝내도 남습니다. 같은 단체가 다시 운영하면 별도 기록이 됩니다.
- 게임 화면의 **역대 기록** 버튼으로 누구나 볼 수 있고, 관리 페이지의 **역대기록 지우기**(확인 팝업)로 전체를 지웁니다.

## 주소

| 주소 | 용도 | 공유 대상 |
|---|---|---|
| `/` | 관리 페이지 (운영 시작/종료) | 나만 |
| `/play` | 게임 페이지 (운영 중에만 "게임으로 이동" 표시) | 참가자 |
| `/game` | 실제 게임. 운영 중이 아니면 서버가 게임 코드를 보내지 않음 (403 + 흰 화면) | - |

## 구조

```
public/index.html     관리 페이지
public/play.html      참가자용 페이지
api/status.js         GET/POST 운영 상태 (단체명, 이번 최고 점수)
api/score.js          POST 점수 기록
api/hall.js           GET 역대 기록 / POST 전체 삭제
api/game.js           운영 중일 때만 game/game.html 응답
lib/store.js          저장 (Turso, 로컬은 파일)
lib/auth.js           관리 번호 확인 + 5회 오입력 시 1분 잠금 (api/auth.js 가 번호 입력 화면에 응답)
game/game.html        빌드된 게임 (Matter.js 포함 단일 파일, 커밋되어 있음)
src/                  게임 템플릿과 클라이언트 스크립트
tools/build.js        game/game.html 빌드
dev/server.js         로컬 개발 서버
vercel.json           /game -> /api/game, game/** 를 함수에 포함
```

## 배포 순서 (GitHub + Vercel)

1. 이 폴더 전체를 `ggaerok/nysc_game1` 에 올립니다. (`game/game.html` 포함)
2. Vercel 에서 **Add New → Project** 로 저장소를 가져옵니다. 설정은 기본값 그대로 두면 됩니다.
3. [Turso](https://turso.tech) 에서 도쿄(`aws-ap-northeast-1`) DB 를 만들고, Vercel 프로젝트의 **Settings → Environment Variables** 에 `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`(Sensitive) 을 넣습니다.
   테이블은 처음 접속할 때 자동으로 만들어지며 이름이 `cosmos_` 로 시작하므로 Solar System(`solar_`)과 한 DB 를 같이 써도 됩니다.
   함수 지역은 `vercel.json` 의 `regions: ["hnd1"]`(도쿄)로 DB 와 맞춰 둡니다.
4. **Settings → Environment Variables** 에 `ADMIN_KEY` (예: 4자리 관리 번호)를 넣고 다시 배포하면, 관리 페이지에 들어갈 때 번호를 입력해야 설정을 바꿀 수 있습니다. 연속 5번 틀리면 1분간 입력이 잠깁니다. 번호는 코드에 적지 않고 이 환경변수에만 둡니다. (넣지 않으면 번호 없이 누구나 설정을 바꿀 수 있습니다.)
5. **Redeploy** 합니다. 이후 `https://<프로젝트>.vercel.app/` 이 관리 페이지, `/play` 가 참가자용입니다.

저장소가 연결되지 않으면 관리 페이지에 안내가 뜨고, 게임 페이지는 항상 흰 화면(닫힘)으로 동작합니다.

## 로컬 실행

```
npm install
npm run dev          # http://localhost:3000  (상태는 .dev-status.json 에 저장)
```

게임 코드를 고쳤다면 `src/game.template.html` 을 수정한 뒤 `npm run build:game` 으로 `game/game.html` 을 다시 만들어 커밋합니다.

## 동작과 한계

- 닫힘 상태에서는 `/game` 이 게임 코드를 아예 보내지 않습니다.
- 이미 게임을 연 사용자는 3초마다 상태를 확인해 닫힘이 되면 흰 화면으로 덮이고 게임이 멈춥니다. 최대 약 3초 지연됩니다.
- 열려 있는 동안 게임을 받아 간 사람이 브라우저에서 스크립트를 조작하면 덮개를 피할 수 있습니다. 내부용 전제라 완전 차단은 하지 않았습니다.
- `/` 주소를 아는 사람은 누구나 운영을 바꾸고 역대 기록을 지울 수 있습니다. `ADMIN_KEY` 를 설정해 관리 번호를 꼭 걸어 두세요.
- 점수는 게임 화면이 서버로 보내는 값이라 개발자 도구로 조작할 수 있습니다. 내부용 전제이며 터무니없이 큰 값(50만 초과)만 거부합니다.
- 모바일 Chrome 과 Samsung Internet 을 기준으로 만들었지만, 실제 삼성 기기에서의 확인은 아직 하지 못했습니다.

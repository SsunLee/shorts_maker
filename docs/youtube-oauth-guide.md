# YouTube OAuth 키 발급 가이드 (Shorts Maker)

이 문서는 현재 프로젝트에서 YouTube 업로드를 위해 필요한 OAuth 키를 발급하고 설정하는 방법을 정리한 가이드입니다.

## 1) 준비물

- Google 계정(YouTube 채널이 연결된 계정)
- Google Cloud 프로젝트
- 이 프로젝트의 Settings 페이지 접근 권한

---

## 2) Google Cloud 설정

### 2-1. 프로젝트 생성

1. Google Cloud Console 접속
2. 새 프로젝트 생성

### 2-2. YouTube Data API v3 활성화

1. `API 및 서비스 > 라이브러리`
2. `YouTube Data API v3` 검색
3. `사용` 클릭

---

## 3) OAuth 동의 화면 설정

1. `API 및 서비스 > OAuth 동의 화면`
2. 앱 유형 선택(`외부` 또는 `내부`)
3. 앱 이름/지원 이메일 등 기본 정보 입력
4. 테스트 중이라면 `테스트 사용자`에 본인 Google 계정 추가

권장 Scope:

- `https://www.googleapis.com/auth/youtube.upload`

참고: 이 프로젝트의 업로드 코드는 `videos.insert`를 사용하므로 위 scope만으로 충분합니다.

---

## 4) OAuth Client ID 생성

1. `API 및 서비스 > 사용자 인증 정보`
2. `사용자 인증 정보 만들기 > OAuth 클라이언트 ID`
3. 애플리케이션 유형: `웹 애플리케이션`
4. Authorized redirect URI 추가

로컬 개발 기본값:

- `http://localhost:3000/oauth2callback`

OAuth Playground를 사용할 경우 추가:

- `https://developers.google.com/oauthplayground`

생성 후 아래 값 확보:

- Client ID
- Client Secret

---

## 5) Refresh Token 발급 (OAuth Playground 방식)

1. https://developers.google.com/oauthplayground 접속
2. 우측 상단 톱니바퀴 클릭
3. `Use your own OAuth credentials` 체크
4. 방금 만든 `Client ID`, `Client Secret` 입력
5. Scope 입력:
   - `https://www.googleapis.com/auth/youtube.upload`
6. `Authorize APIs` 클릭 후 계정 로그인/동의
7. `Exchange authorization code for tokens` 클릭
8. 응답에서 `refresh_token` 복사

---

## 6) 프로젝트에 값 입력

Settings 페이지(`Settings > YouTube API OAuth`)에 아래를 입력:

- `youtubeClientId`
- `youtubeClientSecret`
- `youtubeRedirectUri`
- `youtubeRefreshToken`

또는 `.env`로 설정:

```bash
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REDIRECT_URI=http://localhost:3000/oauth2callback
YOUTUBE_REFRESH_TOKEN=...
```

현재 코드 기준 참고:

- `web/lib/youtube-service.ts`
- 누락 시 `youtubeClientId / youtubeClientSecret / youtubeRefreshToken` 오류가 발생합니다.

---

## 7) 동작 확인

1. 대시보드에서 업로드 가능한 영상 선택
2. `Upload` 실행
3. 성공 시 `youtubeUrl`이 저장되고 카드에서 `Open YouTube` 확인 가능

---

## 8) 자주 발생하는 오류와 해결

### `redirect_uri_mismatch`

- OAuth 클라이언트에 등록된 Redirect URI와 실제 사용 URI가 다름
- Google Cloud의 Authorized redirect URI를 정확히 맞춰야 함

### `unauthorized_client`

- Refresh Token을 발급한 OAuth Client와 현재 Client ID/Secret 쌍이 다름
- 같은 OAuth Client로 Refresh Token 재발급 필요

### `YouTube OAuth credentials are missing`

- Settings 또는 `.env` 중 하나라도 비어 있음
- 필수: Client ID / Client Secret / Refresh Token

### 업로드 권한 관련 오류(401/403)

- 테스트 사용자 미등록
- 동의 화면/Scope 설정 불일치
- Refresh Token 만료/폐기(재발급 필요)

---

## 9) 배포 시 주의사항

- 배포 도메인이 바뀌면 Redirect URI도 함께 관리해야 합니다.
- OAuth Client를 새로 만들면 기존 Refresh Token은 재사용되지 않는 경우가 많습니다.
- 가장 안전한 운영 방식:
  - 개발/운영 OAuth Client 분리
  - 운영용 Refresh Token 별도 발급
  - 비밀값은 반드시 서버 환경변수로 관리


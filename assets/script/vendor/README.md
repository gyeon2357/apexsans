# vendor/ — 외부 라이브러리 사본

CDN을 거치지 않고 같은 도메인에서 내보내려고 여기에 둔다.
바깥 도메인을 하나 더 붙으면 첫 로드에 DNS 조회와 TLS 악수가 추가되고,
그 CDN이 멈추면 우리 사이트도 같이 멈춘다.

| 파일 | 출처 | 버전 |
| --- | --- | --- |
| `gsap.min.js` | npm `gsap` | 3.12.5 |
| `ScrollToPlugin.min.js` | npm `gsap` | 3.12.5 |
| `ScrollTrigger.min.js` | npm `gsap` | 3.12.5 |
| `lenis.min.js` | npm `lenis` | 1.3.26 |

받는 방법 — `npm pack <이름>@<버전>` 으로 받은 꾸러미의 `dist/`에서 그대로 복사한다. 파일을 손대지 않는다. 버전을 올릴 때는 위 표도 함께 고친다.

**ScrollTrigger는 시안 하나(main4)에서만 싣는다.** 43KB짜리 스크롤 연출
플러그인인데, 다른 페이지의 스크롤 연출은 전부 직접 만든 스케줄러가 맡고 있어서
필요가 없다. `script.js`의 `initHorizontalType`도 `window.ScrollTrigger`가 없으면
조용히 물러난다. gsap 본체와 **같은 버전**을 유지한다 — 플러그인은 코어의
내부 규약에 기대고 있어서 버전이 어긋나면 조용히 어긋난 채로 돈다.

라이선스: GSAP 표준 "No Charge" 라이선스. 상용 사이트에 그대로 쓸 수 있지만,
사용료를 받는 제품에 넣으려면 Club GSAP 가입이 필요하다.
자세한 조건은 https://gsap.com/licensing/ 를 확인한다.

Lenis는 함께 배포되는 `lenis.css`도 필요한데, 파일을 하나 더 받게 하지 않으려고
그 내용을 `style.css` 맨 아래에 옮겨 두었다. **버전을 올리면 그 블록도 함께 바꾼다.**

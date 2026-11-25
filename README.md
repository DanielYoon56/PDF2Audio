# 🎧 PDF2Audio — 영문 논문·리포트 한국어 오디오북 변환기

> **요약 없이 원문 그대로, 산책하며 귀로 완독하는 영문 PDF 한국어 오디오북 웹앱**

출퇴근길이나 산책 중 영문 논문(arXiv)이나 해외 리포트를 눈으로 읽기 어려울 때, PDF 파일을 올리기만 하면 **원문의 논리와 수치를 누락 없이 자연스러운 한국어 낭독 대본으로 변환**하고 즉시 들을 수 있는 React 웹 애플리케이션입니다.

👉 **[GitHub 저장소 (DanielYoon56/PDF2Audio)](https://github.com/DanielYoon56/PDF2Audio)** *(로컬에서 본인 API 키로 안전하게 실행)*
---

## 💡 왜 만들었나요?

기존 AI 요약 팟캐스트 도구(예: NotebookLM)는 핵심을 빠르게 훑기에는 좋지만, 대학원생·연구원·리서처에게 꼭 필요한 **세부 논리, 실험 조건, 수치**가 생략되는 한계가 있습니다.

**PDF2Audio**는 요약 대신 **원문 전체 완독**에 초점을 맞추어, 듣기 흐름을 방해하는 머리글·페이지 번호·인용 표기(`[1]`, `(Smith et al., 2020)`)·참고문헌(`References`)만 깔끔하게 제거하고 귀로 듣기 편한 한국어 오디오북으로 변환합니다.

---

## ✨ 주요 기능 (v1.0)

* **2단 논문 레이아웃 자동 인식 & AI 엔진 자동 전환**: PDF 파일을 `gemini-2.5-flash` 모델로 우선 변환하며, 요청 한도 초과나 지연 시 **OpenRouter (Claude)**로 자동 전환합니다.
* **대용량 PDF 자동 분할 (2MB 이상 → 첫 15페이지 우선 변환)**: 2MB를 초과하는 긴 문서는 브라우저에서 첫 15페이지를 먼저 분할 변환해 즉시 청취를 시작하고, 재생 중에도 다음 구간을 이어서 변환할 수 있습니다.
* **3가지 변환 모드**: 원문 보존형 한국어 번역 정제, 논리·수치를 유지한 **핵심 요약 모드(약 30% 분량)**, 원문 언어 그대로 낭독용 정제를 지원합니다.
* **싱크형 대본 뷰어 & 오디오 플레이어**:
  * Web Speech API 기반 속도(`0.5x`~`2.0x`)·음높이·볼륨 슬라이더, 시스템 음성 선택, 단축키(`Space`, `←/→`, `Esc`) 및 스크롤 플로팅 미니 플레이어
  * 현재 낭독 문단 자동 하이라이트, 실시간 검색 자동 스크롤, 형광펜·메모, `.txt` 및 **PDF 깔끔한 내보내기(jsPDF)**
  * Recharts 기반 **사용량 대시보드** (변환 논문 수, 총 청취 시간, 카테고리 분포)
* **테스트용 샘플 논문 제공**: 당장 올릴 PDF가 없어도 바로 테스트할 수 있도록 유명 AI 논문 링크를 제공합니다.
  * [Attention Is All You Need (15p)](https://arxiv.org/pdf/1706.03762.pdf)
  * [Deep Residual Learning / ResNet 2단 논문 (12p)](https://arxiv.org/pdf/1512.03385.pdf)

---

## 🛠️ 기술 스택

* **Frontend**: React, Tailwind CSS, `lucide-react`, `recharts`, `pdf-lib`, `jspdf`
* **Backend & AI Engine**: Express (`server.ts`), Google `@google/genai` SDK (`gemini-2.5-flash`), OpenRouter API (`anthropic/claude-sonnet-4.5` 자동 폴백)
* **Audio**: Browser Web Speech API (`window.speechSynthesis`)

---

## 🚀 로컬 실행 방법 (Quick Start)

Google AI Studio에서 빌드된 React(Vite) 프로젝트 기준으로 로컬에서 실행하는 방법입니다.

### 1. 저장소 클론 및 패키지 설치
```bash
git clone https://github.com/DanielYoon56/PDF2Audio.git
cd PDF2Audio
npm install
```

### 2. 본인 API 키 설정 (`.env`)
이 저장소에는 API 키가 포함되어 있지 않습니다. `.env.example`을 복사해 `.env` 파일을 만들고, **본인의 API 키**를 입력해 주세요.
```bash
cp .env.example .env
```
```env
GEMINI_API_KEY="본인의_GEMINI_API_KEY"
# 선택: Gemini 한도 초과 시 자동 전환할 OpenRouter API 키
OPENROUTER_API_KEY="본인의_OPENROUTER_API_KEY"
OPENROUTER_MODEL="anthropic/claude-sonnet-4.5"
```

### 3. 개발 서버 실행
```bash
npm run dev
```
실행 후 브라우저에서 `http://localhost:3000`으로 접속하세요.

---

## ⚠️ 사용 안내 및 데이터 보안 (FAQ)

* **권장 PDF 스펙**: 현재 1단계 데모 버전은 **5~15페이지 내외의 텍스트 기반 PDF**에서 가장 빠르고 안정적으로 작동합니다. (텍스트 선택이 불가능한 이미지 스캔본 PDF는 인식이 제한될 수 있습니다.)
* **음성 품질 안내**: 데모에서는 회원가입과 과금 없이 누구나 체험할 수 있도록 브라우저 기본 음성을 사용합니다.
* **개인정보 및 보안**: 업로드하신 PDF 파일은 별도 서버나 데이터베이스에 영구 저장되지 않으며, 낭독용 대본 변환에만 일회성으로 사용된 뒤 페이지를 새로고침하면 즉시 사라집니다.

---

## 🗺️ 정식 버전 (SaaS) 로드맵

현재 무료 웹 데모를 바탕으로, 산책과 출퇴근길에 가장 편하게 논문을 들을 수 있는 정식 서비스를 준비하고 있습니다.

- [x] 2단 논문 인식 및 Gemini 기반 한국어 낭독 대본 정제
- [x] 무료 웹 데모 공개 (브라우저 기본 음성 & 싱크 대본 뷰어)
- [ ] **고품질 상용 AI 성우 음성** (Google Cloud Neural2 / OpenAI TTS 기반 MP3 다운로드)
- [ ] **프라이빗 팟캐스트 RSS 자동 연동** (PDF 업로드 시 내 애플 팟캐스트·스포티파이 앱에 자동 추가)
- [ ] **50페이지 이상 대용량 논문·서적 일괄 변환**
- [ ] **원문 + 한국어 번역 병렬 싱크 뷰어 및 형광펜 메모**

---

## 📩 정식 버전 사전 신청 (얼리버드) 및 문의

* 데모를 체험해 보신 뒤 정식 버전 출시 소식과 **얼리버드 50% 할인 혜택**을 받고 싶으시다면, 웹 데모 상단의 **[정식 버전 사전 신청]** 버튼을 통해 이메일과 의견을 남겨주세요.
* 버그 제보나 기능 제안은 [GitHub Issues](https://github.com/DanielYoon56/PDF2Audio/issues)에 편하게 남겨주시면 감사하겠습니다.
* 이 프로젝트는 **MIT License**를 따릅니다.
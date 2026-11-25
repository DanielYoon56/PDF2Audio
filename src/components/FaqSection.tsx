import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FaqSectionProps {
  onOpenWaitlist: () => void;
}

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  hasWaitlistLink?: boolean;
}

const FAQ_ITEMS: readonly FaqItem[] = [
  {
    id: 'pdf-compatibility',
    question: '어떤 PDF 파일이 가장 잘 변환되나요?',
    answer:
      '현재 1단계 데모 버전에서는 5~15페이지 내외의 텍스트 기반 PDF(영문 논문, 해외 리포트 등)에서 가장 빠르고 안정적으로 작동합니다. 텍스트가 선택되지 않는 이미지 스캔본 PDF는 인식이 제한될 수 있습니다.',
  },
  {
    id: 'privacy-storage',
    question: '업로드한 PDF 파일은 서버에 저장되나요?',
    answer:
      '아니요. 업로드하신 파일은 별도 데이터베이스나 서버에 저장되지 않으며, 낭독용 대본을 생성하는 용도로만 일회성 처리됩니다. 페이지를 새로고침하면 모든 내용이 즉시 사라집니다.',
  },
  {
    id: 'difference-from-summary',
    question: 'NotebookLM 같은 요약 서비스와 무엇이 다른가요?',
    answer:
      '요약 팟캐스트는 핵심만 빠르게 훑기 좋지만 논문의 세부 논리와 수치가 빠집니다. 이 도구는 요약이나 생략 없이 원문 전체를 귀로 듣기 편한 한국어 낭독체로 완독하는 데 초점을 맞췄습니다.',
  },
  {
    id: 'voice-quality',
    question: '목소리가 조금 기계음처럼 들립니다.',
    answer:
      '데모 버전에서는 회원가입과 결제 없이 누구나 바로 체험하실 수 있도록 브라우저 기본 음성(Web Speech API)을 사용하고 있습니다. 정식 버전에서는 자연스러운 AI 성우 MP3 파일 다운로드와 애플/스포티파이 팟캐스트 자동 연동(RSS)이 지원될 예정입니다.',
  },
  {
    id: 'early-bird',
    question: '정식 버전 출시 소식과 얼리버드 혜택은 어떻게 받나요?',
    answer:
      '화면 상단의 [정식 버전 사전 신청] 버튼을 눌러 이메일을 남겨주시면, 출시 시점에 50% 얼리버드 할인 코드와 함께 가장 먼저 안내해 드립니다.',
    hasWaitlistLink: true,
  },
];

export function FaqSection({ onOpenWaitlist }: FaqSectionProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggleItem = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      aria-labelledby="faq-section-heading"
      className="mt-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-colors duration-300"
    >
      <div className="px-5 sm:px-6 py-5 border-b border-slate-100 dark:border-slate-800">
        <h2
          id="faq-section-heading"
          className="text-base font-bold text-slate-900 dark:text-slate-100"
        >
          사용 가이드 및 자주 묻는 질문 (FAQ)
        </h2>
        <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          PDF2Audio 데모 이용 중 궁금한 점을 확인해 보세요.
        </p>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {FAQ_ITEMS.map((item) => {
          const isOpen = openId === item.id;
          return (
            <div key={item.id}>
              <button
                type="button"
                onClick={() => toggleItem(item.id)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${item.id}`}
                className="w-full px-5 sm:px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
              >
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                  {item.question}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              <div
                id={`faq-panel-${item.id}`}
                className={`grid transition-all duration-200 ease-out ${
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-5 sm:px-6 pb-4 pt-0.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    <p>{item.answer}</p>
                    {item.hasWaitlistLink && (
                      <button
                        type="button"
                        onClick={onOpenWaitlist}
                        className="mt-2.5 inline-flex items-center text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition-colors"
                      >
                        사전 신청 열기 →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

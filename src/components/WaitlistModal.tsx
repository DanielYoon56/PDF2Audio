import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import {
  EXPECTED_FEATURE_OPTIONS,
  PRICING_TIER_OPTIONS,
} from '../types/audiobook';
import type { WaitlistFormValues } from '../types/audiobook';

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: WaitlistFormValues) => Promise<void>;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function WaitlistModal({ isOpen, onClose, onSubmit }: WaitlistModalProps) {
  const [email, setEmail] = useState('');
  const [expectedFeatures, setExpectedFeatures] = useState<string[]>([
    EXPECTED_FEATURE_OPTIONS[0],
  ]);
  const [pricingTier, setPricingTier] = useState<string>(PRICING_TIER_OPTIONS[1]);
  const [comment, setComment] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const emailInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (!isCompleted) {
      window.setTimeout(() => emailInputRef.current?.focus(), 40);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, isCompleted, onClose]);

  if (!isOpen) return null;

  const toggleFeature = (feature: string) => {
    setExpectedFeatures((prev) =>
      prev.includes(feature)
        ? prev.filter((item) => item !== feature)
        : [...prev, feature]
    );
  };

  const handleCloseAndReset = () => {
    onClose();
    if (isCompleted) {
      window.setTimeout(() => {
        setEmail('');
        setExpectedFeatures([EXPECTED_FEATURE_OPTIONS[0]]);
        setPricingTier(PRICING_TIER_OPTIONS[1]);
        setComment('');
        setEmailError(null);
        setIsCompleted(false);
      }, 150);
    }
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setEmailError('이메일 주소를 입력해 주세요.');
      emailInputRef.current?.focus();
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setEmailError('올바른 이메일 주소 형식을 입력해 주세요. (예: name@example.com)');
      emailInputRef.current?.focus();
      return;
    }

    setEmailError(null);
    setIsSubmitting(true);

    try {
      await onSubmit({
        email: trimmedEmail,
        expectedFeatures,
        pricingTier,
        comment: comment.trim(),
      });
      setIsCompleted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="waitlist-modal-title"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 dark:bg-black/70 backdrop-blur-[2px] transition-opacity"
        onClick={handleCloseAndReset}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl transition-colors duration-300">
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-6 py-4 flex items-center justify-between gap-4 transition-colors duration-300">
          <h2
            id="waitlist-modal-title"
            className="text-base font-bold text-slate-900 dark:text-slate-100"
          >
            정식 버전 사전 신청 (얼리버드 50% 할인)
          </h2>
          <button
            type="button"
            onClick={handleCloseAndReset}
            aria-label="모달 닫기"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {isCompleted ? (
          <div className="px-6 py-10 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">
              사전 신청이 완료되었습니다
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm">
              사전 신청이 완료되었습니다! 출시 시 얼리버드 할인 코드를 이메일로 보내드릴게요.
            </p>
            <button
              type="button"
              onClick={handleCloseAndReset}
              className="mt-7 w-full sm:w-auto min-w-[140px] px-6 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
            >
              닫기
            </button>
          </div>
        ) : (
          <form onSubmit={handleFormSubmit} noValidate className="p-6 space-y-6">
            <div>
              <label
                htmlFor="waitlist-email"
                className="block text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                이메일 주소 <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input
                ref={emailInputRef}
                id="waitlist-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                placeholder="name@example.com"
                aria-invalid={emailError ? 'true' : 'false'}
                className={`mt-2 w-full rounded-lg border px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                  emailError
                    ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-100 dark:focus:ring-red-900/40'
                    : 'border-slate-300 dark:border-slate-700 focus:border-blue-600 dark:focus:border-blue-500 focus:ring-blue-100 dark:focus:ring-blue-900/40'
                }`}
              />
              {emailError && (
                <p
                  role="alert"
                  className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{emailError}</span>
                </p>
              )}
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                가장 기대되는 정식 기능
              </legend>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                원하는 기능을 모두 선택해 주세요.
              </p>
              <div className="mt-2.5 space-y-2">
                {EXPECTED_FEATURE_OPTIONS.map((feature) => {
                  const checked = expectedFeatures.includes(feature);
                  return (
                    <label
                      key={feature}
                      className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 min-h-11 cursor-pointer transition-colors ${
                        checked
                          ? 'border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/35 text-slate-900 dark:text-slate-100'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFeature(feature)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 shrink-0"
                      />
                      <span className="text-sm leading-snug">{feature}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                월 구독 의향 가격
              </legend>
              <div className="mt-2.5 space-y-2">
                {PRICING_TIER_OPTIONS.map((tier) => {
                  const selected = pricingTier === tier;
                  return (
                    <label
                      key={tier}
                      className={`flex items-center gap-3 rounded-lg border px-3.5 py-2.5 min-h-11 cursor-pointer transition-colors ${
                        selected
                          ? 'border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/35 text-slate-900 dark:text-slate-100'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="pricingTier"
                        value={tier}
                        checked={selected}
                        onChange={() => setPricingTier(tier)}
                        className="w-4 h-4 border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 shrink-0"
                      />
                      <span className="text-sm leading-snug">{tier}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label
                htmlFor="waitlist-comment"
                className="block text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                한 줄 의견{' '}
                <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                  (선택)
                </span>
              </label>
              <input
                id="waitlist-comment"
                name="comment"
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="주로 어떤 PDF를 듣고 싶으신가요?"
                maxLength={300}
                className="mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-600 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-colors"
              />
            </div>

            <div className="pt-1 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCloseAndReset}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 sm:flex-none min-w-[160px] px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 active:bg-slate-950 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-slate-400 dark:disabled:bg-slate-700 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900 dark:focus-visible:ring-blue-500 dark:focus-visible:ring-offset-slate-900"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>신청 처리 중...</span>
                  </>
                ) : (
                  <span>사전 신청 완료</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// CounterPoint guided review mode — one question per screen.
// Preserves all existing data flow: same state variables, same createCaseFn call.
// The Fast Entry toggle switches to the original dense form layout.

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";

export type ReviewAnswers = {
  ageStr: string;
  sex: string;
  pregnancy: string;
  breastfeeding: string;
  allergies: string;
  history: string;
  medsText: string;
  supplements: string;
  symptoms: string;
  goal: string;
  pathology: string;
};

type Question = {
  key: keyof ReviewAnswers;
  label: string;
  helper?: string;
  optional?: boolean;
  type: "text" | "textarea" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  mono?: boolean;
  rows?: number;
};

const QUESTIONS: Question[] = [
  {
    key: "ageStr",
    label: "How old is the patient?",
    helper: "Enter age in years. Leave blank if unknown.",
    optional: true,
    type: "text",
    placeholder: "e.g. 67",
  },
  {
    key: "sex",
    label: "Sex",
    helper: "Recorded for dosing and safety calculations.",
    optional: true,
    type: "select",
    options: [
      { value: "", label: "—" },
      { value: "female", label: "Female" },
      { value: "male", label: "Male" },
      { value: "other", label: "Other / unspecified" },
    ],
  },
  {
    key: "pregnancy",
    label: "Pregnancy status",
    type: "select",
    options: [
      { value: "not_applicable", label: "Not applicable" },
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
      { value: "unsure", label: "Unsure" },
    ],
  },
  {
    key: "breastfeeding",
    label: "Breastfeeding status",
    type: "select",
    options: [
      { value: "not_applicable", label: "Not applicable" },
      { value: "no", label: "No" },
      { value: "yes", label: "Yes" },
      { value: "unsure", label: "Unsure" },
    ],
  },
  {
    key: "allergies",
    label: "Allergies or adverse reactions",
    helper: "Enter NKDA if none known.",
    optional: true,
    type: "text",
    placeholder: "NKDA",
  },
  {
    key: "history",
    label: "Medical history",
    helper: "Conditions relevant to supplement safety.",
    optional: true,
    type: "textarea",
    placeholder: "e.g. T2DM, hypertension, mild CKD",
    rows: 3,
  },
  {
    key: "medsText",
    label: "Current medications",
    helper: "One per line or comma-separated. Brand names are recognised automatically.",
    type: "textarea",
    placeholder: "Metformin 1g BD\nPantoprazole 40mg daily\nCoversyl Plus 5/1.25",
    mono: true,
    rows: 5,
  },
  {
    key: "supplements",
    label: "Existing supplements or OTC products",
    helper: "What is the patient already taking?",
    optional: true,
    type: "text",
    placeholder: "e.g. Vitamin D 1000IU, Magnesium",
  },
  {
    key: "symptoms",
    label: "Symptoms or today's presentation",
    helper: "What brings the patient to the counter?",
    optional: true,
    type: "textarea",
    placeholder: "e.g. occasional heartburn after spicy meals",
    rows: 2,
  },
  {
    key: "goal",
    label: "Counselling goal",
    helper: "Optional — what the patient is asking about.",
    optional: true,
    type: "text",
    placeholder: "e.g. looking for something for joint support",
  },
  {
    key: "pathology",
    label: "Relevant pathology notes",
    helper: "Optional — recent results that may affect safety.",
    optional: true,
    type: "textarea",
    placeholder: "e.g. eGFR 55, HbA1c 7.2%",
    rows: 2,
  },
];

type GuidedReviewProps = {
  answers: ReviewAnswers;
  onAnswersChange: (answers: ReviewAnswers) => void;
  onComplete: () => void;
  onBack: () => void;
};

export function GuidedReview({ answers, onAnswersChange, onComplete, onBack }: GuidedReviewProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);
  const total = QUESTIONS.length;
  const question = QUESTIONS[currentIdx];

  useEffect(() => {
    // Autofocus the active input
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [currentIdx]);

  const setAnswer = useCallback((key: keyof ReviewAnswers, value: string) => {
    onAnswersChange({ ...answers, [key]: value });
  }, [answers, onAnswersChange]);

  function next() {
    if (currentIdx < total - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      onComplete();
    }
  }

  function prev() {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    } else {
      onBack();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && question.type !== "textarea") {
      e.preventDefault();
      next();
    }
    if (e.key === "Enter" && e.shiftKey && question.type === "textarea") {
      // Allow default newline behavior
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      prev();
    }
  }

  // Progress indicator
  const progress = ((currentIdx + 1) / total) * 100;

  // Completed answers for the review rail
  const completedList = QUESTIONS.filter((q, i) => i < currentIdx && answers[q.key]);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="cp-progress-track">
          <div className="cp-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {currentIdx + 1} of {total}
        </p>
      </div>

      {/* Question */}
      <div
        key={currentIdx}
        className="cp-question-enter"
        style={{ animation: "cpQuestionEnter 420ms cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
      >
        <Label htmlFor={`q-${question.key}`} className="font-display text-[clamp(24px,4vw,40px)] leading-tight text-foreground block mb-3">
          {question.label}
        </Label>
        {question.helper && (
          <p className="text-sm text-muted-foreground mb-6">{question.helper}</p>
        )}

        <div className="space-y-3" onKeyDown={handleKeyDown}>
          {question.type === "text" && (
            <Input
              id={`q-${question.key}`}
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={question.key === "ageStr" ? "number" : "text"}
              value={answers[question.key]}
              onChange={(e) => setAnswer(question.key, e.target.value)}
              placeholder={question.placeholder}
              className={question.mono ? "font-mono" : ""}
              style={{ fontSize: "clamp(18px, 3vw, 24px)" }}
            />
          )}
          {question.type === "textarea" && (
            <Textarea
              id={`q-${question.key}`}
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={answers[question.key]}
              onChange={(e) => setAnswer(question.key, e.target.value)}
              placeholder={question.placeholder}
              rows={question.rows ?? 3}
              className={question.mono ? "font-mono" : ""}
              style={{ fontSize: "clamp(16px, 2.5vw, 20px)" }}
            />
          )}
          {question.type === "select" && (
            <select
              id={`q-${question.key}`}
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={answers[question.key]}
              onChange={(e) => setAnswer(question.key, e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-card px-3 text-sm"
              style={{ fontSize: "clamp(16px, 2.5vw, 20px)" }}
            >
              {question.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="outline" onClick={prev} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          {question.optional && (
            <Button variant="ghost" onClick={next} className="text-muted-foreground gap-1">
              <ChevronRight className="h-3.5 w-3.5" />
              Skip
            </Button>
          )}
          <Button onClick={next} className="gap-1.5" style={{ backgroundColor: "#ECBA82", color: "#2E2E2E" }}>
            {currentIdx === total - 1 ? "Continue" : "Next"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Review rail (desktop) */}
      {completedList.length > 0 && (
        <div className="mt-10 pt-6 border-t border-hairline hidden md:block">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Entered so far</p>
          <div className="space-y-1.5">
            {completedList.map((q) => (
              <button
                key={q.key}
                onClick={() => setCurrentIdx(QUESTIONS.indexOf(q))}
                className="flex items-start gap-2 text-left text-sm hover:bg-secondary/40 px-2 py-1 rounded w-full"
              >
                <span className="text-muted-foreground text-xs uppercase tracking-wider shrink-0 w-28">{q.label}</span>
                <span className="text-foreground truncate">{answers[q.key]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
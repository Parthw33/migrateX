import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface TypewriterTextProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({ text, speed = 15, onComplete }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, speed);

      return () => clearTimeout(timeout);
    } else if (!isComplete) {
      setIsComplete(true);
      onComplete?.();
    }

    return undefined;
  }, [currentIndex, text, speed, onComplete, isComplete]);

  // reset when text changes
  useEffect(() => {
    setDisplayedText('');
    setCurrentIndex(0);
    setIsComplete(false);
  }, [text]);

  return (
    <span>
      {displayedText}
      {!isComplete && <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse" />}
    </span>
  );
};

export type BoldSegment = { bold: boolean; text: string };

/** Splits `**bold**` runs from plain text (multiline-safe inside bold). */
export function parseBoldSegments(text: string): BoldSegment[] {
  const segments: BoldSegment[] = [];
  const re = /\*\*([\s\S]+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ bold: false, text: text.slice(last, m.index) });
    }

    segments.push({ bold: true, text: m[1] });
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    segments.push({ bold: false, text: text.slice(last) });
  }

  if (segments.length === 0) {
    segments.push({ bold: false, text });
  }

  return segments.filter((s) => s.text.length > 0);
}

/**
 * Types assistant copy character-by-character while applying **bold** styling
 * (no raw asterisks shown).
 */
export function AssistantMarkdownTypewriter({
  text,
  speed = 12,
  onComplete,
}: {
  text: string;
  speed?: number;
  onComplete?: () => void;
}) {
  const segments = useMemo(() => parseBoldSegments(text), [text]);
  const [segIdx, setSegIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [done, setDone] = useState(false);
  const finishedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  onCompleteRef.current = onComplete;

  const fireComplete = useCallback(() => {
    if (finishedRef.current) {
      return;
    }

    finishedRef.current = true;
    setDone(true);
    onCompleteRef.current?.();
  }, []);

  useEffect(() => {
    finishedRef.current = false;
    setDone(false);
    setSegIdx(0);
    setCharIdx(0);
  }, [text]);

  useEffect(() => {
    if (segments.length === 0) {
      fireComplete();

      return undefined;
    }

    const seg = segments[segIdx];

    if (!seg) {
      fireComplete();

      return undefined;
    }

    if (charIdx < seg.text.length) {
      const id = window.setTimeout(() => {
        setCharIdx((c) => c + 1);
      }, speed);

      return () => window.clearTimeout(id);
    }

    if (segIdx < segments.length - 1) {
      const id = window.setTimeout(() => {
        setSegIdx((s) => s + 1);
        setCharIdx(0);
      }, 0);

      return () => window.clearTimeout(id);
    }

    fireComplete();

    return undefined;
  }, [segments, segIdx, charIdx, speed, fireComplete]);

  const seg = segments[segIdx];

  return (
    <div className="whitespace-pre-wrap">
      {segments.slice(0, segIdx).map((s, i) =>
        s.bold ? (
          <strong key={`done-${i}`} className="font-semibold text-violet-900">
            {s.text}
          </strong>
        ) : (
          <span key={`done-${i}`}>{s.text}</span>
        ),
      )}
      {seg ? (
        seg.bold ? (
          <strong className="font-semibold text-violet-900">{seg.text.slice(0, charIdx)}</strong>
        ) : (
          <span>{seg.text.slice(0, charIdx)}</span>
        )
      ) : null}
      {!done ? (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-violet-600/80 align-middle" aria-hidden />
      ) : null}
    </div>
  );
}

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { classNames } from '~/utils/classNames';
import { formatTime } from '~/components/chat/utils';
import { AssistantMarkdownTypewriter } from './TypewriterText';
import { ContentstackBotIcon } from './ContentstackBotIcon';

const assistantMdComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <span className="block leading-relaxed [&:not(:last-child)]:mb-1.5">{children}</span>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-violet-900">{children}</strong>
  ),
};

interface ChatMessageProps {
  role: 'assistant' | 'user';
  content: string;
  isTyping?: boolean;
  timestamp?: Date;
  animate?: boolean;
  onAnimationComplete?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  role,
  content,
  isTyping,
  timestamp,
  animate = false,
  onAnimationComplete,
}) => {
  return (
    <div
      className={classNames('flex gap-3 w-full', {
        'justify-start': role === 'assistant',
        'justify-end': role === 'user',
      })}
    >
      {role === 'assistant' && (
        <div className="shrink-0 self-start">
          <ContentstackBotIcon className="w-8 h-8" />
        </div>
      )}
      <div className="flex flex-col max-w-[75%]">
        <div
          className={classNames('px-4 py-3 rounded-2xl', {
            'border border-slate-200/90 bg-white text-slate-800 shadow-md ring-1 ring-slate-900/[0.06]':
              role === 'assistant',
            'bg-accent-500 text-white': role === 'user',
          })}
        >
          {isTyping ? (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : role === 'assistant' ? (
            <div className="text-sm leading-relaxed">
              {animate ? (
                <AssistantMarkdownTypewriter text={content} speed={12} onComplete={onAnimationComplete} />
              ) : (
                <ReactMarkdown components={assistantMdComponents}>{content}</ReactMarkdown>
              )}
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
          )}
        </div>
        {timestamp && (
          <span
            className={classNames('text-xs text-migratex-elements-textTertiary mt-1', {
              'self-start': role === 'assistant',
              'self-end': role === 'user',
            })}
          >
            {formatTime(timestamp)}
          </span>
        )}
      </div>
      {role === 'user' && (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent-500 text-white shrink-0 self-start">
          <div className="i-ph:user text-lg" />
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { classNames } from '~/utils/classNames';

interface StepActionButtonsProps {
  onReRun: () => void;
  onNext: () => void;
  onPrevious?: () => void;
  reRunLabel?: string;
  nextLabel?: string;
  previousLabel?: string;
  variant?: 'header' | 'footer';
  show: boolean;
  showReRun?: boolean;
}

export const StepActionButtons: React.FC<StepActionButtonsProps> = ({
  onReRun,
  onNext,
  onPrevious,
  reRunLabel = 'Re-Run',
  nextLabel = 'Next',
  previousLabel = 'Previous',
  variant = 'header',
  show,
  showReRun,
}) => {
  const reRunVisible = showReRun ?? show;

  if (!show && !reRunVisible) {
    return null;
  }

  const isFooter = variant === 'footer';

  return (
    <div className={classNames('flex items-center', isFooter ? 'gap-4' : 'gap-3')}>
      {show && onPrevious && (
        <button
          onClick={onPrevious}
          className={classNames(
            'flex items-center justify-center font-medium transition-all duration-200 border',
            'rounded-lg text-gray-600 bg-white border-gray-300',
            'hover:bg-gray-100 hover:border-gray-400 hover:text-gray-800',
            'active:scale-[0.97]',
            isFooter ? 'gap-2.5 px-6 py-3 text-sm shadow-sm' : 'gap-2 px-4 py-2 text-sm shadow-sm',
          )}
        >
          <div className={classNames('i-ph:arrow-left', isFooter ? 'text-lg' : 'text-base')} />
          {previousLabel}
        </button>
      )}
      {reRunVisible && (
        <button
          onClick={onReRun}
          className={classNames(
            'flex items-center justify-center font-medium transition-all duration-200 border',
            'rounded-lg text-gray-700 bg-white border-gray-300',
            'hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700',
            'active:scale-[0.97]',
            isFooter ? 'gap-2.5 px-6 py-3 text-sm shadow-sm' : 'gap-2 px-4 py-2 text-sm shadow-sm',
          )}
        >
          <div className={classNames('i-ph:arrow-clockwise', isFooter ? 'text-lg' : 'text-base')} />
          {reRunLabel}
        </button>
      )}
      {show && (
        <button
          onClick={onNext}
          className={classNames(
            'flex items-center justify-center font-medium transition-all duration-200',
            'rounded-lg text-white bg-gradient-to-r from-purple-600 to-purple-700 border border-purple-700',
            'hover:from-purple-700 hover:to-purple-800 hover:shadow-lg hover:shadow-purple-200',
            'active:scale-[0.97]',
            isFooter ? 'gap-2.5 px-6 py-3 text-sm shadow-md' : 'gap-2 px-4 py-2 text-sm shadow-sm',
          )}
        >
          {nextLabel}
          <div className={classNames('i-ph:arrow-right', isFooter ? 'text-lg' : 'text-base')} />
        </button>
      )}
    </div>
  );
};

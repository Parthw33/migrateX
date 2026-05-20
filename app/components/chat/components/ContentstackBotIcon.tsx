import React from 'react';

interface ContentstackBotIconProps {
  className?: string;
}

export const ContentstackBotIcon: React.FC<ContentstackBotIconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.715 9.945v4.107l-9.878 1.37L0 14.052V9.945l9.837-1.37 9.878 1.37z" fill="#AC75FF" />
    <path d="M0 19.529v-4.107l5.75 3.08 13.965-3.08v4.107L5.75 23.979 0 19.53z" fill="#AC75FF" />
    <path d="M19.715 4.47v4.107l-5.75-3.08L0 8.577V4.47L13.965.02l5.75 4.45z" fill="#AC75FF" />
  </svg>
);

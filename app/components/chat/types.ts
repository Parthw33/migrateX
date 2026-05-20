import type { Message } from 'ai';
import type { RefCallback } from 'react';

// step types for the migration flow
export type MigrationStep =
  | 'URL_INPUT'
  | 'STACK_SETUP'
  | 'SCRAPING'
  | 'ANALYSIS'
  | 'CREATE_CONTENT_TYPES'
  | 'IMPORT_STACK'
  | 'STACK_UID_INPUT'
  | 'MIGRATING'
  | 'CREATE_WEBSITE'
  | 'WORKBENCH';

export type LogType = 'info' | 'success' | 'error' | 'warning' | 'section' | 'streaming';

export interface ScrapingLog {
  id: string;
  message: string;
  type: LogType;
  timestamp: Date;
}

export interface CrawlProgress {
  current: number;
  total: number;
  url: string;
  status: 'scraping' | 'completed';
}

export interface ChatMessageData {
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
  animate?: boolean;
}

/** Values from the URL step before stack setup / scrape. */
export interface UrlSubmitPayload {
  url: string;
  maxPages: number;
  /** Non-empty only when the user chose “specific URLs” crawl scope. */
  selectUrls: string[];
}

export interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  messages?: Message[];
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  onUrlSubmit?: (
    url: string,
    options?: { maxPages: number; selectUrls?: string[] },
  ) => void;
  scrapingLogs?: ScrapingLog[];
  isScrapingComplete?: boolean;
  onScrapingComplete?: () => void;
}

export interface ContentTypeLog {
  id: string;
  message: string;
  type: LogType;
  timestamp: Date;
}

export type ContentTypeSubStep = 'ANALYSIS' | 'DOWNLOAD_ASSETS' | 'CREATE_ENTRIES';

export interface MigrationLog {
  id: string;
  message: string;
  type: LogType;
  timestamp: Date;
}

export interface PersistedMigrationState {
  currentStep: MigrationStep;
  websiteUrl: string;
  selectUrls?: string[];
  crawlMaxPages?: number;
  isScrapingComplete: boolean;
  stackUid?: string;
  csOrganizationUid?: string;
  stackSelectedBeforeScrape?: boolean;
}

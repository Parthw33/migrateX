import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import type { ChatMessageData } from '~/components/chat/types';
import { authStore } from '~/lib/stores/auth';
import { migrationStore } from '~/lib/stores/migration';
import {
  lambdaCreateStack,
  lambdaListOrganizations,
  lambdaListStacks,
  type LambdaOrg,
  type LambdaStack,
} from '~/lib/lambdaApi';
import { ChatMessage } from './ChatMessage';
import { Select, selectAlignedInputClassName, type SelectOption } from '~/components/ui/Select';
import { LocaleSelect } from '~/components/ui/LocaleSelect';
import { StackConfigCard } from './StackConfigCard';
import { useLocales } from '~/lib/hooks/useLocales';

const SELECTED_ORG_KEY = 'contentstack_organization_uid';

export interface StackSetupStepProps {
  websiteUrl: string;
  onBack: () => void;
  onContinue: (payload: {
    stackApiKey: string;
    organizationUid: string;
    contentstackStackUid?: string;
  }) => void;
}

export const StackSetupStep: React.FC<StackSetupStepProps> = ({ websiteUrl, onBack, onContinue }) => {
  const { appToken, region: authRegion, isAuthenticated } = useStore(authStore);
  const projectName = useStore(migrationStore).projectName;

  const projectIntro = projectName?.trim()
    ? `Project **${projectName.trim()}** — migrating **${websiteUrl}**.`
    : `You’re migrating **${websiteUrl}**.`;

  const [messages, setMessages] = useState<ChatMessageData[]>([
    {
      role: 'assistant',
      content: `${projectIntro}\n\nChoose a **Contentstack organization** and **stack** (or create a new stack), then use **Start scraping** to run the crawl (**POST /scrape**).`,
      timestamp: new Date(),
      animate: true,
    },
  ]);

  const [organizations, setOrganizations] = useState<LambdaOrg[]>([]);
  const [selectedOrgUid, setSelectedOrgUid] = useState('');
  const [manualOrgUid, setManualOrgUid] = useState('');
  const [stacks, setStacks] = useState<LambdaStack[]>([]);
  const [selectedStackApiKey, setSelectedStackApiKey] = useState('');
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [stacksLoading, setStacksLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newStackName, setNewStackName] = useState('');
  const [newStackDescription, setNewStackDescription] = useState('');
  const [newStackMasterLocale, setNewStackMasterLocale] = useState('en-us');
  const [creatingStack, setCreatingStack] = useState(false);

  // Locale loading — begins as soon as the user has an app token
  const localesResult = useLocales(appToken);

  const [showStackCard, setShowStackCard] = useState(false);
  const [submittedStackApiKey, setSubmittedStackApiKey] = useState('');
  const [submittedOrgUid, setSubmittedOrgUid] = useState('');
  const [isProcessingContinue, setIsProcessingContinue] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const effectiveOrgUid = manualOrgUid.trim() || selectedOrgUid;

  const loadOrganizations = useCallback(async () => {
    if (!appToken) {
      setOrganizations([]);
      return;
    }

    setOrgsLoading(true);
    setMetaError(null);

    try {
      const list = await lambdaListOrganizations(appToken);
      setOrganizations(list);

      const savedOrg =
        typeof globalThis.window !== 'undefined' ? globalThis.sessionStorage.getItem(SELECTED_ORG_KEY) : null;

      if (savedOrg && list.some((o) => o.uid === savedOrg)) {
        setSelectedOrgUid(savedOrg);
      } else if (list.length === 1) {
        setSelectedOrgUid(list[0].uid);
      }
    } catch {
      setOrganizations([]);
    } finally {
      setOrgsLoading(false);
    }
  }, [appToken]);

  useEffect(() => {
    if (!isAuthenticated || !appToken) {
      return;
    }

    void loadOrganizations();
  }, [isAuthenticated, appToken, loadOrganizations]);

  useEffect(() => {
    let cancelled = false;

    if (!effectiveOrgUid || !appToken) {
      setStacks([]);
      setSelectedStackApiKey('');
    } else {
      void (async () => {
        setStacksLoading(true);
        setMetaError(null);
        setStacks([]);
        setSelectedStackApiKey('');

        try {
          const list = await lambdaListStacks(appToken, effectiveOrgUid);

          if (cancelled) {
            return;
          }

          setStacks(list);

          if (typeof globalThis.window !== 'undefined') {
            globalThis.sessionStorage.setItem(SELECTED_ORG_KEY, effectiveOrgUid);
          }
        } catch (e) {
          if (!cancelled) {
            setMetaError(e instanceof Error ? e.message : 'Failed to load stacks');
          }
        } finally {
          if (!cancelled) {
            setStacksLoading(false);
          }
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [effectiveOrgUid, appToken]);

  const handleAnimationComplete = (index: number) => {
    setMessages((prev) => prev.map((msg, i) => (i === index ? { ...msg, animate: false } : msg)));
  };

  const handleCreateStack = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!appToken || !effectiveOrgUid || !newStackName.trim()) {
      return;
    }

    setCreatingStack(true);
    setMetaError(null);

    try {
      const data = await lambdaCreateStack(appToken, effectiveOrgUid, {
        name: newStackName.trim(),
        description: newStackDescription.trim() || 'Created from Migrate X',
        master_locale: newStackMasterLocale.trim() || 'en-us',
      });
      const apiKey = data.api_key ?? data.stack?.api_key;

      if (!apiKey) {
        throw new Error('Create stack succeeded but no API key was returned');
      }

      const newUid = data.uid ?? data.stack?.uid;
      setStacks((prev) => [...prev, { api_key: apiKey, name: newStackName.trim(), uid: newUid }]);
      setSelectedStackApiKey(apiKey);
      setCreateModalOpen(false);
      setNewStackName('');
      setNewStackDescription('');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `New stack **${newStackName.trim()}** was created. Confirm below, then **Start scraping**.`,
          timestamp: new Date(),
          animate: true,
        },
      ]);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Create stack failed');
    } finally {
      setCreatingStack(false);
    }
  };

  const handleConfirmStack = (e: React.FormEvent) => {
    e.preventDefault();

    const apiKey = selectedStackApiKey.trim();

    if (!apiKey || !effectiveOrgUid) {
      return;
    }

    setSubmittedStackApiKey(apiKey);
    setSubmittedOrgUid(effectiveOrgUid);
    setShowStackCard(true);
    setIsEditing(false);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: `Stack API key: ${apiKey}\nOrganization: ${effectiveOrgUid}`, timestamp: new Date() },
      {
        role: 'assistant',
        content:
          'Stack saved. Use **Start scraping** on the card to run the crawl (Migrate-X **POST /scrape** with your session).',
        timestamp: new Date(),
        animate: true,
      },
    ]);
  };

  const handleEdit = () => {
    setIsEditing(true);
    setShowStackCard(false);
  };

  const handleStartScraping = () => {
    setIsProcessingContinue(true);
    setTimeout(() => {
      const stack = stacks.find((s) => s.api_key === submittedStackApiKey);
      const contentstackStackUid = stack?.uid?.trim() || '';

      if (contentstackStackUid && typeof globalThis.window !== 'undefined') {
        globalThis.sessionStorage.setItem('contentstack_stack_uid', contentstackStackUid);
      }

      onContinue({
        stackApiKey: submittedStackApiKey,
        organizationUid: submittedOrgUid,
        contentstackStackUid,
      });
      setIsProcessingContinue(false);
    }, 400);
  };

  let stackPlaceholder = 'Select stack';

  if (stacksLoading) {
    stackPlaceholder = 'Loading stacks…';
  } else if (!effectiveOrgUid) {
    stackPlaceholder = 'Enter or select an organization first';
  } else if (stacks.length === 0) {
    stackPlaceholder = 'No stacks — create one with the button below';
  }

  const canSubmitStack = Boolean(effectiveOrgUid && selectedStackApiKey && !creatingStack);

  const organizationSelectOptions = useMemo((): SelectOption[] => {
    return [
      {
        value: '',
        label: orgsLoading
          ? 'Loading organizations…'
          : organizations.length
            ? 'Select organization'
            : 'No organizations from API',
      },
      ...organizations.map((o) => ({ value: o.uid, label: o.name })),
    ];
  }, [orgsLoading, organizations]);

  const stackSelectOptions = useMemo((): SelectOption[] => {
    return [
      { value: '', label: stackPlaceholder },
      ...stacks.map((s) => ({ value: s.api_key, label: s.name || s.api_key })),
    ];
  }, [stackPlaceholder, stacks]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col md:flex-row">
      <aside className="flex min-h-[200px] flex-col border-slate-200/80 bg-[#e8ecf2] md:min-h-0 md:flex-[0_0_40%] md:max-w-none md:shrink-0 md:border-r">
        <div className="flex-shrink-0 border-b border-slate-200/70 bg-[#e0e5ee]/80 px-4 py-3 md:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Assistant</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5 md:py-5">
          <div className="space-y-5">
            {messages.map((msg, index) => (
              <ChatMessage
                key={`msg-${msg.role}-${index}`}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                animate={msg.animate && msg.role === 'assistant'}
                onAnimationComplete={() => handleAnimationComplete(index)}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f0f2f6] md:flex-[0_0_60%]">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-6">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-migratex-elements-borderColor bg-white shadow-sm">
            <div className="flex flex-shrink-0 items-center gap-3 border-b border-migratex-elements-borderColor/60 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:underline"
              >
                <span className="i-ph:arrow-left text-base" aria-hidden />
                Back to URL
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 md:p-6">
              <div className="mx-auto max-w-2xl space-y-4">
                {!isAuthenticated && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Sign in first. Your session token is required to list stacks and run the crawler.
                  </p>
                )}

                {metaError ? <p className="text-sm text-red-600">{metaError}</p> : null}

                <div className="space-y-3">
                  <label className="block text-xs font-medium text-migratex-elements-textSecondary uppercase tracking-wide">
                    Organization
                  </label>
                  <Select
                    value={selectedOrgUid}
                    onChange={(e) => {
                      setSelectedOrgUid(e.target.value);
                      setManualOrgUid('');
                    }}
                    disabled={!isAuthenticated || orgsLoading || organizations.length === 0}
                    options={organizationSelectOptions}
                  />

                  <label className="block text-xs font-medium text-migratex-elements-textSecondary uppercase tracking-wide">
                    Organization UID (manual)
                  </label>
                  <input
                    type="text"
                    value={manualOrgUid}
                    onChange={(e) => setManualOrgUid(e.target.value)}
                    placeholder="Override or enter org UID if the list is empty"
                    className={selectAlignedInputClassName}
                    disabled={!isAuthenticated}
                  />

                  <div className="flex items-center justify-between gap-2">
                    <span className="block text-xs font-medium text-migratex-elements-textSecondary uppercase tracking-wide">
                      Stack
                    </span>
                    <button
                      type="button"
                      onClick={() => setCreateModalOpen(true)}
                      disabled={!effectiveOrgUid || !appToken}
                      className="text-xs font-medium text-purple-600 hover:underline disabled:opacity-40 disabled:no-underline"
                    >
                      Create new stack
                    </button>
                  </div>

                  <Select
                    value={selectedStackApiKey}
                    onChange={(e) => setSelectedStackApiKey(e.target.value)}
                    disabled={!effectiveOrgUid || stacksLoading || stacks.length === 0}
                    options={stackSelectOptions}
                  />

                  <Dialog.Root open={createModalOpen} onOpenChange={setCreateModalOpen}>
                    <Dialog.Portal>
                      <Dialog.Overlay className="fixed inset-0 z-[250] bg-black/50 data-[state=open]:animate-in fade-in-0" />
                      <Dialog.Content
                        // Don't dismiss the dialog when the user clicks inside
                        // the LocaleSelect dropdown (rendered via a separate
                        // portal). Without this, clicking a locale option fires
                        // onPointerDownOutside → Dialog closes → the dropdown
                        // unmounts before its onClick can run, so nothing
                        // appears to happen.
                        onPointerDownOutside={(event) => {
                          const target = event.target as HTMLElement | null;
                          if (target?.closest('[data-locale-dropdown]')) {
                            event.preventDefault();
                          }
                        }}
                        onInteractOutside={(event) => {
                          const target = event.target as HTMLElement | null;
                          if (target?.closest('[data-locale-dropdown]')) {
                            event.preventDefault();
                          }
                        }}
                        className="fixed left-1/2 top-1/2 z-[251] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 p-6 shadow-xl focus:outline-none data-[state=open]:animate-in fade-in-0 zoom-in-95"
                      >
                        <Dialog.Title className="text-lg font-semibold text-migratex-elements-textPrimary">
                          Create new stack
                        </Dialog.Title>
                        <Dialog.Description className="text-sm text-migratex-elements-textSecondary mt-1">
                          Name, description, and master locale. The stack is created in the selected organization.
                        </Dialog.Description>
                        <form onSubmit={handleCreateStack} className="mt-4 space-y-3">
                          <input
                            className={selectAlignedInputClassName}
                            value={newStackName}
                            onChange={(e) => setNewStackName(e.target.value)}
                            placeholder="Stack name *"
                            required
                          />
                          <input
                            className={selectAlignedInputClassName}
                            value={newStackDescription}
                            onChange={(e) => setNewStackDescription(e.target.value)}
                            placeholder="Description"
                          />

                          <div className="space-y-1">
                            <label className="block text-xs font-medium text-migratex-elements-textSecondary uppercase tracking-wide">
                              Master locale
                            </label>
                            <LocaleSelect
                              value={newStackMasterLocale}
                              onChange={setNewStackMasterLocale}
                              localesResult={localesResult}
                              disabled={creatingStack}
                            />
                            {localesResult.status === 'ready' && (
                              <p className="text-[11px] text-migratex-elements-textTertiary">
                                Cannot be changed after the stack is created.
                              </p>
                            )}
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <Dialog.Close asChild>
                              <button
                                type="button"
                                className="px-4 py-2 text-sm rounded-lg border border-migratex-elements-borderColor text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-2"
                              >
                                Cancel
                              </button>
                            </Dialog.Close>
                            <button
                              type="submit"
                              disabled={!effectiveOrgUid || creatingStack || !appToken}
                              className="px-4 py-2 text-sm rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50"
                            >
                              {creatingStack ? 'Creating…' : 'Create stack'}
                            </button>
                          </div>
                        </form>
                      </Dialog.Content>
                    </Dialog.Portal>
                  </Dialog.Root>

                  <p className="text-xs text-migratex-elements-textTertiary">
                    Region for scraping: <strong>{authRegion || 'NA'}</strong> (from your login). Sign out and sign in
                    again to change it.
                  </p>
                </div>

                {!showStackCard || isEditing ? (
                  <form
                    onSubmit={handleConfirmStack}
                    className="flex justify-end border-t border-migratex-elements-borderColor/50 pt-4"
                  >
                    <button
                      type="submit"
                      disabled={!canSubmitStack}
                      className={classNames(
                        'rounded-full px-5 py-2.5 text-sm font-medium transition-all',
                        canSubmitStack
                          ? 'bg-accent-500 text-white hover:bg-accent-600'
                          : 'cursor-not-allowed bg-gray-200 text-gray-400',
                      )}
                    >
                      Continue with stack
                    </button>
                  </form>
                ) : null}

                {showStackCard && !isEditing ? (
                  <div className="border-t border-migratex-elements-borderColor/60 pt-6">
                    <StackConfigCard
                      stackUid={submittedStackApiKey}
                      onEdit={handleEdit}
                      isProcessing={isProcessingContinue}
                      onMigrate={handleStartScraping}
                      primaryActionLabel="Start scraping"
                      requireContentstackSetup={false}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

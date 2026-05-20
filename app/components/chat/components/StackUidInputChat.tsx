import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import type { ChatMessageData } from '~/components/chat/types';
import { Select, type SelectOption } from '~/components/ui/Select';
import { ChatMessage } from './ChatMessage';
import { StackConfigCard } from './StackConfigCard';
import { authStore } from '~/lib/stores/auth';
import { lambdaListOrganizations, lambdaListStacks } from '~/lib/lambdaApi';

const ORG_STORAGE_KEY = 'migratex_cs_organizations';
const SELECTED_ORG_KEY = 'contentstack_organization_uid';

interface StackSetupData {
  environment?: { name: string; uid: string };
  deliveryToken?: { name: string; token: string; uid: string };
  environmentAlreadyExists?: boolean;
}

interface OrgItem {
  uid: string;
  name: string;
}

interface StackItem {
  uid: string;
  name: string;
  api_key: string;
}

interface StackUidInputChatProps {
  onSubmit: (stackUid: string) => void;
  websiteUrl: string;
}

export const StackUidInputChat: React.FC<StackUidInputChatProps> = ({ onSubmit, websiteUrl }) => {
  const { appToken, isAuthenticated } = useStore(authStore);

  const [messages, setMessages] = useState<ChatMessageData[]>([
    {
      role: 'assistant',
      content: `Great! I've analyzed the content from ${websiteUrl} and created the Content Types and Entries structure.\n\nSelect your **organization** and **stack** below (you must be signed in), or enter your Stack API key manually. Then we'll set up the environment and delivery token.`,
      timestamp: new Date(),
      animate: true,
    },
  ]);
  const [stackUidInput, setStackUidInput] = useState('');
  const [showStackCard, setShowStackCard] = useState(false);
  const [submittedStackUid, setSubmittedStackUid] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupData, setSetupData] = useState<StackSetupData | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [organizations, setOrganizations] = useState<OrgItem[]>([]);
  const [selectedOrgUid, setSelectedOrgUid] = useState('');
  const [stacks, setStacks] = useState<StackItem[]>([]);
  const [selectedStackApiKey, setSelectedStackApiKey] = useState('');
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [stacksLoading, setStacksLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [useManualKey, setUseManualKey] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadOrganizations = useCallback(async () => {
    if (!appToken) {
      setOrganizations([]);
      return;
    }

    setOrgsLoading(true);
    setMetaError(null);

    try {
      let list = await lambdaListOrganizations(appToken);

      if (list.length === 0) {
        const res = await fetch('/contentstack/organizations', {
          headers: { Authorization: `Bearer ${appToken}` },
        });
        const data = (await res.json()) as {
          success?: boolean;
          organizations?: OrgItem[];
          message?: string;
        };

        if (res.ok && data.success && data.organizations?.length) {
          list = data.organizations;
        }
      }

      setOrganizations(list);

      if (typeof globalThis.window !== 'undefined' && list.length) {
        try {
          globalThis.localStorage.setItem(ORG_STORAGE_KEY, JSON.stringify(list));
        } catch {
          /* ignore */
        }
      }

      const savedOrg =
        typeof globalThis.window !== 'undefined' ? globalThis.sessionStorage.getItem(SELECTED_ORG_KEY) : null;

      if (savedOrg && list.some((o) => o.uid === savedOrg)) {
        setSelectedOrgUid(savedOrg);
      } else if (list.length === 1) {
        setSelectedOrgUid(list[0].uid);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load organizations';
      setMetaError(msg);

      if (typeof globalThis.window !== 'undefined') {
        try {
          const raw = globalThis.localStorage.getItem(ORG_STORAGE_KEY);

          if (raw) {
            const parsed = JSON.parse(raw) as OrgItem[];

            if (Array.isArray(parsed) && parsed.length) {
              setOrganizations(parsed);
            }
          }
        } catch {
          /* ignore */
        }
      }
    } finally {
      setOrgsLoading(false);
    }
  }, [appToken]);

  useEffect(() => {
    if (!isAuthenticated || !appToken) {
      return undefined;
    }

    void loadOrganizations();

    return undefined;
  }, [isAuthenticated, appToken, loadOrganizations]);

  useEffect(() => {
    if (!selectedOrgUid || !appToken) {
      setStacks([]);
      setSelectedStackApiKey('');

      return undefined;
    }

    let cancelled = false;

    (async () => {
      setStacksLoading(true);
      setMetaError(null);
      setStacks([]);
      setSelectedStackApiKey('');

      try {
        if (cancelled) {
          return;
        }

        let loaded: StackItem[] = [];

        try {
          const fromLambda = await lambdaListStacks(appToken, selectedOrgUid);
          loaded = fromLambda.map((s) => ({
            uid: s.uid || s.api_key,
            name: s.name || s.api_key,
            api_key: s.api_key,
          }));
        } catch {
          loaded = [];
        }

        if (loaded.length === 0) {
          const q = new URLSearchParams({ organization_uid: selectedOrgUid });
          const res = await fetch(`/contentstack/stacks?${q.toString()}`, {
            headers: { Authorization: `Bearer ${appToken}` },
          });
          const data = (await res.json()) as {
            success?: boolean;
            stacks?: StackItem[];
            message?: string;
          };

          if (cancelled) {
            return;
          }

          if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to load stacks (${res.status})`);
          }

          loaded = data.stacks || [];
        }

        if (cancelled) {
          return;
        }

        setStacks(loaded);

        if (typeof globalThis.window !== 'undefined') {
          globalThis.sessionStorage.setItem(SELECTED_ORG_KEY, selectedOrgUid);
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

    return () => {
      cancelled = true;
    };
  }, [selectedOrgUid, appToken]);

  const handleAnimationComplete = (index: number) => {
    setMessages((prev) => prev.map((msg, i) => (i === index ? { ...msg, animate: false } : msg)));
  };

  const setupContentstack = async (stackApiKey: string) => {
    setIsSettingUp(true);
    setSetupError(null);
    setSetupData(null);

    try {
      const response = await fetch('/api/contentstack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stackApiKey,
          action: 'setup',
        }),
      });

      const result = (await response.json()) as {
        success: boolean;
        environment?: { name: string; uid: string };
        deliveryToken?: { name: string; token: string; uid: string };
        environmentAlreadyExists?: boolean;
        error?: string;
      };

      if (result.success) {
        setSetupData({
          environment: result.environment,
          deliveryToken: result.deliveryToken,
          environmentAlreadyExists: result.environmentAlreadyExists,
        });

        if (typeof globalThis.window !== 'undefined') {
          globalThis.sessionStorage.setItem('contentstack_api_key', stackApiKey);

          if (result.deliveryToken?.token) {
            globalThis.sessionStorage.setItem('contentstack_delivery_token', result.deliveryToken.token);
          }

          if (result.environment?.name) {
            globalThis.sessionStorage.setItem('contentstack_environment', result.environment.name);
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `I've successfully set up your Contentstack stack:\n\n✓ Environment: **${result.environment?.name || 'dev'}**${result.environmentAlreadyExists ? ' (already existed)' : ''}\n✓ Delivery Token: **${result.deliveryToken?.name || 'Created'}**\n\nYou can see the details in the preview card. Click "Migrate" when you're ready to proceed.`,
            timestamp: new Date(),
            animate: true,
          },
        ]);
      } else {
        setSetupError(result.error || 'Failed to set up stack');
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `There was an issue setting up your stack: ${result.error || 'Unknown error'}\n\nPlease check your Stack API Key and try again.`,
            timestamp: new Date(),
            animate: true,
          },
        ]);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to server';
      setSetupError(errorMessage);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Failed to set up your stack: ${errorMessage}\n\nPlease try again.`,
          timestamp: new Date(),
          animate: true,
        },
      ]);
    } finally {
      setIsSettingUp(false);
    }
  };

  const resolveApiKeyForSubmit = () => {
    if (useManualKey) {
      return stackUidInput.trim();
    }

    if (selectedStackApiKey) {
      return selectedStackApiKey;
    }

    return stackUidInput.trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const uid = resolveApiKeyForSubmit();

    if (!uid) {
      return;
    }

    setSubmittedStackUid(uid);
    setMessages((prev) => [...prev, { role: 'user', content: uid, timestamp: new Date() }]);
    setStackUidInput('');
    setShowStackCard(true);
    setIsEditing(false);

    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `I've received your Stack API Key. Now setting up the environment and creating a delivery token...`,
        timestamp: new Date(),
        animate: true,
      },
    ]);

    await setupContentstack(uid);
  };

  const handleEdit = () => {
    setIsEditing(true);
    setStackUidInput(submittedStackUid);
    setShowStackCard(false);
    setSetupData(null);
    setSetupError(null);
    setUseManualKey(true);
  };

  const handleMigrate = () => {
    setIsProcessing(true);

    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: 'Starting migration of Content Types and Entries to your stack. This may take a moment...',
        timestamp: new Date(),
        animate: true,
      },
    ]);

    setTimeout(() => {
      onSubmit(submittedStackUid);
    }, 1000);
  };

  const canSubmitFromPicker = !useManualKey && selectedStackApiKey && !isSettingUp;
  const canSubmitManual = useManualKey && stackUidInput.trim() && !isSettingUp;
  const submitDisabled = !(canSubmitFromPicker || canSubmitManual);

  let stackPlaceholder = 'Select stack';

  if (stacksLoading) {
    stackPlaceholder = 'Loading stacks…';
  } else if (!selectedOrgUid) {
    stackPlaceholder = 'Select an organization first';
  } else if (stacks.length === 0) {
    stackPlaceholder = 'No stacks in this organization';
  }

  const organizationSelectOptions = useMemo((): SelectOption[] => {
    return [
      {
        value: '',
        label: orgsLoading
          ? 'Loading organizations…'
          : organizations.length
            ? 'Select organization'
            : 'No organizations',
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
    <div className="flex flex-col h-full w-full">
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 max-w-3xl mx-auto w-full py-4">
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
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

          <div className="bg-migratex-elements-background-depth-1 p-4 pb-6 space-y-4">
            {!isAuthenticated && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-3xl mx-auto">
                Sign in to load your Contentstack organizations and stacks. You can still paste a Stack API key using
                &quot;Enter API key manually&quot; below.
              </p>
            )}

            {metaError && <p className="text-sm text-red-600 max-w-3xl mx-auto">{metaError}</p>}

            <div className="max-w-3xl mx-auto space-y-3">
              <label
                htmlFor="cs-org-select"
                className="block text-xs font-medium text-migratex-elements-textSecondary uppercase tracking-wide"
              >
                Organization
              </label>
              <Select
                id="cs-org-select"
                value={selectedOrgUid}
                onChange={(e) => {
                  setSelectedOrgUid(e.target.value);
                  setSelectedStackApiKey('');
                }}
                disabled={!isAuthenticated || orgsLoading || organizations.length === 0}
                options={organizationSelectOptions}
              />

              <label
                htmlFor="cs-stack-select"
                className="block text-xs font-medium text-migratex-elements-textSecondary uppercase tracking-wide"
              >
                Stack
              </label>
              <Select
                id="cs-stack-select"
                value={selectedStackApiKey}
                onChange={(e) => setSelectedStackApiKey(e.target.value)}
                disabled={!selectedOrgUid || stacksLoading || stacks.length === 0}
                options={stackSelectOptions}
              />

              <button
                type="button"
                onClick={() => setUseManualKey((v) => !v)}
                className="text-sm text-purple-600 hover:underline"
              >
                {useManualKey ? 'Use organization & stack picker' : 'Enter Stack API key manually'}
              </button>

              {useManualKey && (
                <p className="text-xs text-gray-500">
                  Find your Stack API Key in Contentstack → Settings → Tokens → Stack API Key
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
              {useManualKey && (
                <div className="relative mb-3">
                  <div className="flex items-center gap-2 bg-white border-2 border-migratex-elements-borderColor rounded-full px-4 py-3 focus-within:border-accent-500 transition-colors shadow-sm">
                    <div className="i-ph:stack text-gray-400" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={stackUidInput}
                      onChange={(e) => setStackUidInput(e.target.value)}
                      placeholder={
                        isEditing ? 'Edit your Stack API Key...' : 'Enter your Contentstack Stack API Key...'
                      }
                      className="flex-1 bg-transparent outline-none text-migratex-elements-textPrimary placeholder-migratex-elements-textTertiary text-sm"
                      disabled={isSettingUp}
                      autoFocus
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitDisabled}
                  className={classNames(
                    'px-5 py-2.5 rounded-full text-sm font-medium transition-all',
                    !submitDisabled
                      ? 'bg-accent-500 text-white hover:bg-accent-600'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed',
                  )}
                >
                  {isSettingUp ? 'Setting up…' : 'Continue with stack'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {showStackCard && (
          <div className="flex items-start justify-center py-8 pr-8">
            <StackConfigCard
              stackUid={submittedStackUid}
              onEdit={handleEdit}
              isProcessing={isProcessing}
              onMigrate={handleMigrate}
              isSettingUp={isSettingUp}
              setupData={setupData}
              setupError={setupError}
            />
          </div>
        )}
      </div>
    </div>
  );
};

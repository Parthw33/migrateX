import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { Dialog, DialogRoot } from '~/components/ui/Dialog';
import { workbenchStore } from '~/lib/stores/workbench';
import { launchAPI, type LaunchProject } from '~/lib/launch/launch-api';
import { classNames } from '~/utils/classNames';
import { WORK_DIR } from '~/utils/constants';

interface LaunchStatusModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

interface ProjectWithDetails extends LaunchProject {
  projectType?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function LaunchStatusModal({ isOpen, onClose }: LaunchStatusModalProps) {
  const files = useStore(workbenchStore.files);

  const [step, setStep] = useState<'loading' | 'auth' | 'projects'>('loading');
  const [projects, setProjects] = useState<ProjectWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRedeploying, setIsRedeploying] = useState<string | null>(null);
  const [isSyncingEnv, setIsSyncingEnv] = useState<string | null>(null);

  // auth state
  const [authToken, setAuthToken] = useState('');
  const [organizationUid, setOrganizationUid] = useState('');

  useEffect(() => {
    if (isOpen) {
      checkCredentialsAndLoad();
    }
  }, [isOpen]);

  const checkCredentialsAndLoad = async () => {
    setStep('loading');
    setIsLoading(true);

    try {
      const status = await launchAPI.checkCredentials();

      if (status.configured) {
        await loadProjects();
        setStep('projects');
      } else {
        setStep('auth');
      }
    } catch (error) {
      console.error('Failed to check credentials:', error);
      setStep('auth');
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const projectList = await launchAPI.getProjects();
      setProjects(projectList);
    } catch (error) {
      console.error('Failed to load projects:', error);
      toast.error('Failed to load Launch projects');
    }
  };

  const handleSaveCredentials = async () => {
    if (!authToken.trim() || !organizationUid.trim()) {
      toast.error('Please enter both Auth Token and Organization UID');
      return;
    }

    setIsLoading(true);

    try {
      const result = await launchAPI.saveCredentials(authToken.trim(), organizationUid.trim());

      if (result.success) {
        setAuthToken('');
        setOrganizationUid('');
        await loadProjects();
        setStep('projects');
        toast.success('Connected to Contentstack Launch!');
      } else {
        toast.error(result.error || 'Failed to save credentials');
      }
    } catch (error) {
      console.error('Failed to save credentials:', error);
      toast.error('Failed to save credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRedeploy = async (project: ProjectWithDetails) => {
    if (!project.environments || project.environments.length === 0) {
      toast.error('No environment found for this project');
      return;
    }

    const environment = project.environments[0];
    setIsRedeploying(project.uid);

    try {
      const result = await launchAPI.triggerDeployment(project.uid, environment.uid);

      if (result.success) {
        toast.success(`Deployment triggered for ${project.name}!`);
      } else {
        toast.error(result.error || 'Failed to trigger deployment');
      }
    } catch (error) {
      console.error('Failed to trigger deployment:', error);
      toast.error('Failed to trigger deployment');
    } finally {
      setIsRedeploying(null);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);

    try {
      await launchAPI.clearCredentials();
      setProjects([]);
      setStep('auth');
      toast.success('Disconnected from Contentstack Launch');
    } catch (error) {
      console.error('Failed to disconnect:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // get .env.local content from workbench files
  const getEnvLocalContent = (): string | null => {
    const envLocalPath = `${WORK_DIR}/.env.local`;

    for (const [filePath, dirent] of Object.entries(files)) {
      if (filePath === envLocalPath && dirent?.type === 'file' && dirent.content) {
        return dirent.content;
      }
    }

    return null;
  };

  // sync .env.local variables to Launch environment
  const handleSyncEnvVariables = async (project: ProjectWithDetails) => {
    if (!project.environments || project.environments.length === 0) {
      toast.error('No environment found for this project');
      return;
    }

    const envContent = getEnvLocalContent();

    if (!envContent) {
      toast.error('No .env.local file found in the project');
      return;
    }

    const environment = project.environments[0];
    setIsSyncingEnv(project.uid);

    try {
      const result = await launchAPI.updateEnvironment(project.uid, environment.uid, {
        envFileContent: envContent,
      });

      if (result.success) {
        toast.success(`Environment variables synced for ${project.name}!`);
      } else {
        toast.error(result.error || 'Failed to sync environment variables');
      }
    } catch (error) {
      console.error('Failed to sync environment variables:', error);
      toast.error('Failed to sync environment variables');
    } finally {
      setIsSyncingEnv(null);
    }
  };

  // check if .env.local file exists in workbench
  const hasEnvLocalFile = (): boolean => {
    return getEnvLocalContent() !== null;
  };

  const handleClose = () => {
    if (!isLoading && !isRedeploying) {
      onClose();
    }
  };

  const getLaunchDashboardUrl = (project: ProjectWithDetails) => {
    return `https://app.contentstack.com/#!/launch/projects/${project.uid}`;
  };

  return (
    <DialogRoot open={isOpen}>
      <Dialog onClose={handleClose} onBackdrop={handleClose} className="max-w-lg">
        <div className="relative">
          {/* Header */}
          <div className="flex items-center gap-3 p-5 pr-12 border-b border-migratex-elements-borderColor">
            <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center flex-shrink-0">
              <div className="i-ph:rocket-launch text-white text-lg" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-migratex-elements-textPrimary">
                Contentstack Launch
              </h2>
              <p className="text-xs text-migratex-elements-textTertiary">Manage deployments</p>
            </div>
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Loading State */}
            {step === 'loading' && (
              <div className="py-12 text-center">
                <div className="i-svg-spinners:90-ring-with-bg text-3xl mx-auto mb-3 text-purple-500" />
                <div className="text-sm text-migratex-elements-textSecondary">Loading projects...</div>
              </div>
            )}

            {/* Auth Step */}
            {step === 'auth' && (
              <div className="space-y-5">
                <div className="text-center pb-2">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <div className="i-ph:key text-2xl text-purple-500" />
                  </div>
                  <h3 className="font-medium text-migratex-elements-textPrimary">Connect to Launch</h3>
                  <p className="text-xs text-migratex-elements-textTertiary mt-1">
                    Enter your Contentstack credentials
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-migratex-elements-textSecondary mb-1.5">
                      Auth Token
                    </label>
                    <input
                      type="password"
                      value={authToken}
                      onChange={(e) => setAuthToken(e.target.value)}
                      placeholder="Enter auth token"
                      className="w-full px-3 py-2.5 text-sm bg-migratex-elements-background-depth-3 border border-migratex-elements-borderColor rounded-lg text-migratex-elements-textPrimary placeholder-migratex-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-migratex-elements-textSecondary mb-1.5">
                      Organization UID
                    </label>
                    <input
                      type="text"
                      value={organizationUid}
                      onChange={(e) => setOrganizationUid(e.target.value)}
                      placeholder="Enter organization UID"
                      className="w-full px-3 py-2.5 text-sm bg-migratex-elements-background-depth-3 border border-migratex-elements-borderColor rounded-lg text-migratex-elements-textPrimary placeholder-migratex-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2.5 px-4 text-sm font-medium rounded-lg border border-migratex-elements-borderColor text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-3 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCredentials}
                    disabled={isLoading || !authToken.trim() || !organizationUid.trim()}
                    className={classNames(
                      'flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2',
                      'bg-purple-600 text-white hover:bg-purple-700',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {isLoading ? (
                      <div className="i-svg-spinners:90-ring-with-bg" />
                    ) : (
                      <div className="i-ph:plug-bold text-sm" />
                    )}
                    <span>Connect</span>
                  </button>
                </div>
              </div>
            )}

            {/* Projects List */}
            {step === 'projects' && (
              <div className="space-y-4">
                {/* Status Bar */}
                <div className="flex items-center justify-between py-2 px-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs font-medium text-green-600">Connected</span>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="text-xs text-migratex-elements-textTertiary hover:text-red-500 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>

                {projects.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-migratex-elements-background-depth-3 flex items-center justify-center">
                      <div className="i-ph:folder-open text-2xl text-migratex-elements-textTertiary" />
                    </div>
                    <div className="text-sm font-medium text-migratex-elements-textPrimary mb-1">
                      No Projects
                    </div>
                    <p className="text-xs text-migratex-elements-textTertiary mb-4">
                      Deploy a project to see it here
                    </p>
                    <a
                      href="https://app.contentstack.com/#!/launch"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-500 hover:text-purple-400"
                    >
                      <span>Open Dashboard</span>
                      <div className="i-ph:arrow-square-out text-xs" />
                    </a>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-migratex-elements-textTertiary">
                      {projects.length} project{projects.length !== 1 ? 's' : ''}
                    </div>

                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {projects.map((project) => (
                        <div
                          key={project.uid}
                          className="p-4 rounded-lg border border-migratex-elements-borderColor bg-migratex-elements-background-depth-2 hover:border-migratex-elements-borderColor/80 transition-colors"
                        >
                          {/* Project Info */}
                          <div className="flex items-start gap-3 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                              <div className="i-ph:rocket-launch text-purple-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-migratex-elements-textPrimary truncate">
                                {project.name}
                              </h4>
                              {project.environments && project.environments.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                  <span className="text-xs text-migratex-elements-textTertiary">
                                    {project.environments[0].name}
                                  </span>
                                </div>
                              )}
                            </div>
                            <a
                              href={getLaunchDashboardUrl(project)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-md text-migratex-elements-textTertiary hover:text-migratex-elements-textPrimary hover:bg-migratex-elements-background-depth-3 transition-colors"
                              title="Open in Dashboard"
                            >
                              <div className="i-ph:arrow-square-out text-sm" />
                            </a>
                          </div>

                          {/* URL Preview */}
                          {project.environments?.[0]?.url && (
                            <a
                              href={project.environments[0].url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-2.5 py-1.5 mb-3 bg-migratex-elements-background-depth-3 rounded-md text-xs text-migratex-elements-textSecondary hover:text-purple-400 transition-colors group"
                            >
                              <div className="i-ph:globe text-sm text-migratex-elements-textTertiary group-hover:text-purple-400" />
                              <span className="truncate">
                                {project.environments[0].url.replace(/^https?:\/\//, '')}
                              </span>
                            </a>
                          )}

                          {/* Actions */}
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleRedeploy(project)}
                                disabled={isRedeploying === project.uid || !project.environments?.length}
                                className={classNames(
                                  'flex-1 py-2.5 px-3 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2',
                                  'bg-purple-600 text-white hover:bg-purple-700',
                                  'disabled:opacity-50 disabled:cursor-not-allowed',
                                )}
                              >
                                {isRedeploying === project.uid ? (
                                  <>
                                    <div className="i-svg-spinners:90-ring-with-bg text-sm" />
                                    <span>Deploying...</span>
                                  </>
                                ) : (
                                  <>
                                    <div className="i-ph:arrow-clockwise-bold text-sm" />
                                    <span>Redeploy</span>
                                  </>
                                )}
                              </button>

                              {project.environments?.[0]?.url && (
                                <a
                                  href={project.environments[0].url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="py-2.5 px-3 text-sm font-medium rounded-lg border border-green-500/30 text-green-500 hover:bg-green-500/10 transition-colors flex items-center gap-2"
                                >
                                  <div className="i-ph:globe-bold text-sm" />
                                  <span>Live</span>
                                </a>
                              )}
                            </div>

                            {/* Sync .env.local button */}
                            {hasEnvLocalFile() && (project.environments?.length ?? 0) > 0 && (
                              <button
                                onClick={() => handleSyncEnvVariables(project)}
                                disabled={isSyncingEnv === project.uid}
                                className={classNames(
                                  'w-full py-2 px-3 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-2',
                                  'border border-amber-500/30 text-amber-500 hover:bg-amber-500/10',
                                  'disabled:opacity-50 disabled:cursor-not-allowed',
                                )}
                                title="Push .env.local variables to this environment"
                              >
                                {isSyncingEnv === project.uid ? (
                                  <>
                                    <div className="i-svg-spinners:90-ring-with-bg text-xs" />
                                    <span>Syncing...</span>
                                  </>
                                ) : (
                                  <>
                                    <div className="i-ph:file-dotted text-sm" />
                                    <span>Sync .env.local</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Footer */}
                    <a
                      href="https://app.contentstack.com/#!/launch"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-medium text-migratex-elements-textSecondary hover:text-migratex-elements-textPrimary transition-colors"
                    >
                      <div className="i-ph:arrow-square-out text-sm" />
                      <span>Open Launch Dashboard</span>
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}

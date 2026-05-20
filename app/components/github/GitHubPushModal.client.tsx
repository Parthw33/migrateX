import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { Dialog, DialogRoot } from '~/components/ui/Dialog';
import { Select, type SelectOption } from '~/components/ui/Select';
import { workbenchStore } from '~/lib/stores/workbench';
import { githubAPI, type GitHubUser, type GitHubRepo } from '~/lib/github/github-api';
import { launchAPI, type LaunchProject } from '~/lib/launch/launch-api';
import { WORK_DIR } from '~/utils/constants';
import { classNames } from '~/utils/classNames';

interface GitHubPushModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

type Step =
  | 'checking'
  | 'auth'
  | 'repo'
  | 'pushing'
  | 'success'
  | 'launch_auth'
  | 'launch_config'
  | 'deploying'
  | 'deployed';

const LAUNCH_FRAMEWORK_OPTIONS: SelectOption[] = [
  { value: 'NEXT', label: 'Next.js' },
  { value: 'REACT', label: 'React' },
  { value: 'VUE', label: 'Vue' },
  { value: 'NUXT', label: 'Nuxt' },
  { value: 'GATSBY', label: 'Gatsby' },
  { value: 'ANGULAR', label: 'Angular' },
  { value: 'OTHER', label: 'Other' },
];

export function GitHubPushModal({ isOpen, onClose }: GitHubPushModalProps) {
  const files = useStore(workbenchStore.files);

  const [step, setStep] = useState<Step>('checking');
  const [token, setToken] = useState('');
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [newRepoName, setNewRepoName] = useState('migratex-project');
  const [isPrivate, setIsPrivate] = useState(false);
  const [createNew, setCreateNew] = useState(true);
  const [commitMessage, setCommitMessage] = useState('Initial commit from MigrateX');
  const [isLoading, setIsLoading] = useState(false);
  const [pushResult, setPushResult] = useState<{ repoUrl: string; commitSha: string } | null>(null);

  // launch deployment state
  const [authToken, setAuthToken] = useState('');
  const [organizationUid, setOrganizationUid] = useState('');
  const [buildCommand, setBuildCommand] = useState('npm run build');
  const [outputDirectory, setOutputDirectory] = useState('.next');
  const [frameworkPreset, setFrameworkPreset] = useState('NEXT');
  const [launchProject, setLaunchProject] = useState<LaunchProject | null>(null);
  const [deploymentUrl, setDeploymentUrl] = useState<string | null>(null);

  const repoSelectOptions = useMemo((): SelectOption[] => {
    return [
      { value: '', label: 'Select a repository...' },
      ...repos.map((r) => ({
        value: String(r.id),
        label: `${r.full_name}${r.private ? ' 🔒' : ''}`,
      })),
    ];
  }, [repos]);

  useEffect(() => {
    if (isOpen) {
      checkServerAuth();
    }
  }, [isOpen]);

  const checkServerAuth = async () => {
    setStep('checking');
    setIsLoading(true);

    try {
      const authStatus = await githubAPI.checkServerAuth();

      if (authStatus.authenticated && authStatus.user) {
        setUser(authStatus.user);
        await loadRepos();
        setStep('repo');
      } else {
        setStep('auth');
      }
    } catch (error) {
      console.error('Failed to check server auth:', error);
      setStep('auth');
    } finally {
      setIsLoading(false);
    }
  };

  const loadRepos = async () => {
    try {
      const repoList = await githubAPI.listRepos();
      setRepos(repoList);
    } catch (error) {
      console.error('Failed to load repos:', error);
      toast.error('Failed to load repositories');
    }
  };

  const handleSaveToken = async () => {
    if (!token.trim()) {
      toast.error('Please enter your GitHub Personal Access Token');
      return;
    }

    setIsLoading(true);

    try {
      const result = await githubAPI.saveToken(token.trim());

      if (result.success && result.user) {
        setUser({
          login: result.user.login,
          avatar_url: result.user.avatar_url,
          id: 0,
          name: null,
          email: null,
        });
        await loadRepos();
        setStep('repo');
        setToken('');
        toast.success('Connected to GitHub!');
      } else {
        toast.error(result.error || 'Failed to save token');
      }
    } catch (error) {
      console.error('Failed to save token:', error);
      toast.error('Failed to save token');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);

    try {
      await githubAPI.clearStoredToken();
      setUser(null);
      setRepos([]);
      setStep('auth');
      toast.success('Disconnected from GitHub');
    } catch (error) {
      console.error('Failed to logout:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePush = async () => {
    setIsLoading(true);
    setStep('pushing');

    try {
      let targetRepo: GitHubRepo;

      if (createNew) {
        if (!newRepoName.trim()) {
          toast.error('Please enter a repository name');
          setStep('repo');
          setIsLoading(false);

          return;
        }

        targetRepo = await githubAPI.createRepo({
          name: newRepoName.trim(),
          description: 'Created with MigrateX',
          private: isPrivate,
          auto_init: false,
        });
        toast.success(`Created repository: ${targetRepo.full_name}`);
      } else {
        if (!selectedRepo) {
          toast.error('Please select a repository');
          setStep('repo');
          setIsLoading(false);

          return;
        }

        targetRepo = selectedRepo;
      }

      const escapedWorkDir = WORK_DIR.replaceAll('/', String.raw`\/`);
      const workDirRegex = new RegExp('^' + escapedWorkDir + '/');

      // folders to exclude from GitHub push
      const excludedFolders = ['.next', 'node_modules', '.git', '.cache', 'dist', 'build', '.turbo'];

      const filesToCommit = Object.entries(files)
        .filter(([_, dirent]) => dirent?.type === 'file' && !dirent.isBinary)
        .map(([filePath, dirent]) => ({
          path: filePath.replace(workDirRegex, ''),
          content: (dirent as { content: string }).content || '',
        }))
        .filter((f) => f.path)
        .filter((f) => {
          // exclude files from excluded folders
          const pathParts = f.path.split('/');
          return !excludedFolders.some((folder) => pathParts.includes(folder));
        });

      if (filesToCommit.length === 0) {
        toast.error('No files to push');
        setStep('repo');
        setIsLoading(false);

        return;
      }

      if (createNew) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      const result = await githubAPI.pushFiles(
        user!.login,
        targetRepo.name,
        filesToCommit,
        commitMessage || 'Initial commit from MigrateX',
        targetRepo.default_branch || 'main',
      );

      if (result.success) {
        setPushResult({
          repoUrl: result.repoUrl!,
          commitSha: result.commitSha!,
        });
        setStep('success');
        toast.success('Successfully pushed to GitHub!');
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('Push failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to push to GitHub');
      setStep('repo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeployToLaunch = async () => {
    const launchStatus = await launchAPI.checkCredentials();

    if (launchStatus.configured) {
      setStep('launch_config');
    } else {
      setStep('launch_auth');
    }
  };

  const handleSaveLaunchCredentials = async () => {
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
        setStep('launch_config');
        toast.success('Connected to Contentstack Launch!');
      } else {
        toast.error(result.error || 'Failed to save credentials');
      }
    } catch (error) {
      console.error('Failed to save Launch credentials:', error);
      toast.error('Failed to save credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateLaunchProject = async () => {
    if (!pushResult) {
      return;
    }

    setIsLoading(true);
    setStep('deploying');

    try {
      const projectName = newRepoName.trim() || 'migratex-project';

      const result = await launchAPI.createProject({
        name: projectName,
        repoUrl: pushResult.repoUrl,
        branch: 'main',
        buildCommand,
        outputDirectory,
        frameworkPreset,
      });

      if (result.success && result.project) {
        setLaunchProject(result.project);

        const envUrl = result.project.environments?.[0]?.url;
        setDeploymentUrl(envUrl || null);
        setStep('deployed');
        toast.success('Deployed to Contentstack Launch!');
      } else {
        throw new Error(result.error || 'Failed to create project');
      }
    } catch (error) {
      console.error('Launch deployment failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to deploy');
      setStep('success');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (step !== 'pushing' && step !== 'deploying') {
      onClose();
      setTimeout(() => {
        setStep('checking');
        setPushResult(null);
        setToken('');
        setAuthToken('');
        setOrganizationUid('');
        setLaunchProject(null);
        setDeploymentUrl(null);
      }, 200);
    }
  };

  const fileCount = Object.values(files).filter((d) => d?.type === 'file').length;
  const isLaunchStep = step.startsWith('launch') || step === 'deploying' || step === 'deployed';

  return (
    <DialogRoot open={isOpen}>
      <Dialog onClose={handleClose} onBackdrop={handleClose} className="max-w-md">
        <div className="relative">
          {/* Header */}
          <div className="flex items-center gap-3 p-5 pr-12 border-b border-migratex-elements-borderColor">
            <div
              className={classNames(
                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                isLaunchStep ? 'bg-purple-600' : 'bg-gray-700',
              )}
            >
              <div
                className={classNames('text-white text-lg', isLaunchStep ? 'i-ph:rocket-launch' : 'i-ph:github-logo')}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-migratex-elements-textPrimary">
                {isLaunchStep ? 'Deploy to Launch' : 'Push to GitHub'}
              </h2>
              <p className="text-xs text-migratex-elements-textTertiary">
                {isLaunchStep ? 'Contentstack hosting' : 'Version control'}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Checking Auth */}
            {step === 'checking' && (
              <div className="py-10 text-center">
                <div className="i-svg-spinners:90-ring-with-bg text-3xl mx-auto mb-3 text-migratex-elements-loader-progress" />
                <div className="text-sm text-migratex-elements-textSecondary">Checking authentication...</div>
              </div>
            )}

            {/* Auth Step */}
            {step === 'auth' && (
              <div className="space-y-4">
                <div className="text-center pb-2">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gray-700/50 flex items-center justify-center">
                    <div className="i-ph:key text-2xl text-gray-400" />
                  </div>
                  <h3 className="font-medium text-migratex-elements-textPrimary">Connect GitHub</h3>
                  <p className="text-xs text-migratex-elements-textTertiary mt-1">Enter your personal access token</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-migratex-elements-textSecondary mb-1.5">
                    Personal Access Token
                  </label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxx"
                    className="w-full px-3 py-2.5 text-sm bg-migratex-elements-background-depth-3 border border-migratex-elements-borderColor rounded-lg text-migratex-elements-textPrimary placeholder-migratex-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-migratex-elements-item-contentAccent/50 focus:border-migratex-elements-item-contentAccent transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && token.trim() && handleSaveToken()}
                  />
                </div>

                <div className="p-3 bg-migratex-elements-background-depth-3 rounded-lg text-xs">
                  <div className="font-medium text-migratex-elements-textPrimary mb-1.5">How to get a token:</div>
                  <ol className="list-decimal list-inside space-y-0.5 text-migratex-elements-textSecondary">
                    <li>GitHub → Settings → Developer Settings</li>
                    <li>Personal access tokens → Tokens (classic)</li>
                    <li>
                      Generate with <code className="px-1 bg-migratex-elements-background-depth-1 rounded">repo</code>{' '}
                      scope
                    </li>
                  </ol>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=MigrateX"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-migratex-elements-item-contentAccent hover:underline"
                  >
                    Create token <div className="i-ph:arrow-square-out text-xs" />
                  </a>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2.5 px-4 text-sm font-medium rounded-lg border border-migratex-elements-borderColor text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-3 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveToken}
                    disabled={isLoading || !token.trim()}
                    className={classNames(
                      'flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2',
                      'bg-migratex-elements-button-primary-background text-migratex-elements-button-primary-text',
                      'hover:bg-migratex-elements-button-primary-backgroundHover',
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

            {/* Repo Step */}
            {step === 'repo' && user && (
              <div className="space-y-4">
                {/* User Info */}
                <div className="flex items-center justify-between py-2 px-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <img src={user.avatar_url} alt={user.login} className="w-5 h-5 rounded-full" />
                    <span className="text-sm text-migratex-elements-textPrimary font-medium">{user.login}</span>
                    <span className="px-1.5 py-0.5 text-[10px] bg-green-500/20 text-green-500 rounded font-medium">
                      Connected
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-xs text-migratex-elements-textTertiary hover:text-red-400 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>

                {/* Toggle */}
                <div className="flex p-1 bg-migratex-elements-background-depth-3 rounded-lg">
                  <button
                    onClick={() => setCreateNew(true)}
                    className={classNames(
                      'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all',
                      createNew
                        ? 'bg-migratex-elements-button-primary-background text-migratex-elements-button-primary-text shadow-sm'
                        : 'text-migratex-elements-textSecondary hover:text-migratex-elements-textPrimary',
                    )}
                  >
                    Create New Repo
                  </button>
                  <button
                    onClick={() => setCreateNew(false)}
                    className={classNames(
                      'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all',
                      !createNew
                        ? 'bg-migratex-elements-button-primary-background text-migratex-elements-button-primary-text shadow-sm'
                        : 'text-migratex-elements-textSecondary hover:text-migratex-elements-textPrimary',
                    )}
                  >
                    Select Existing
                  </button>
                </div>

                {createNew ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-migratex-elements-textSecondary mb-1.5">
                        Repository Name
                      </label>
                      <input
                        type="text"
                        value={newRepoName}
                        onChange={(e) => setNewRepoName(e.target.value)}
                        placeholder="my-project"
                        className="w-full px-3 py-2.5 text-sm bg-migratex-elements-background-depth-3 border border-migratex-elements-borderColor rounded-lg text-migratex-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-migratex-elements-item-contentAccent/50 transition-all"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPrivate}
                        onChange={(e) => setIsPrivate(e.target.checked)}
                        className="w-4 h-4 rounded border-migratex-elements-borderColor accent-migratex-elements-item-contentAccent"
                      />
                      <span className="text-sm text-migratex-elements-textSecondary">Private repository</span>
                    </label>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-migratex-elements-textSecondary mb-1.5">
                      Select Repository
                    </label>
                    <Select
                      variant="panel"
                      value={selectedRepo?.id ? String(selectedRepo.id) : ''}
                      onChange={(e) => {
                        const repo = repos.find((r) => r.id === Number(e.target.value));
                        setSelectedRepo(repo || null);
                      }}
                      options={repoSelectOptions}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-migratex-elements-textSecondary mb-1.5">
                    Commit Message
                  </label>
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Initial commit"
                    className="w-full px-3 py-2.5 text-sm bg-migratex-elements-background-depth-3 border border-migratex-elements-borderColor rounded-lg text-migratex-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-migratex-elements-item-contentAccent/50 transition-all"
                  />
                </div>

                <div className="flex items-center gap-2 py-2 px-3 bg-migratex-elements-background-depth-3 rounded-lg text-sm text-migratex-elements-textSecondary">
                  <div className="i-ph:files text-base" />
                  <span>{fileCount} files will be pushed</span>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2.5 px-4 text-sm font-medium rounded-lg border border-migratex-elements-borderColor text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-3 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePush}
                    disabled={isLoading || fileCount === 0}
                    className={classNames(
                      'flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2',
                      'bg-migratex-elements-button-primary-background text-migratex-elements-button-primary-text',
                      'hover:bg-migratex-elements-button-primary-backgroundHover',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    <div className="i-ph:git-branch-bold text-sm" />
                    <span>Push to GitHub</span>
                  </button>
                </div>
              </div>
            )}

            {/* Pushing */}
            {step === 'pushing' && (
              <div className="py-10 text-center">
                <div className="i-svg-spinners:90-ring-with-bg text-3xl mx-auto mb-3 text-migratex-elements-loader-progress" />
                <div className="text-sm font-medium text-migratex-elements-textPrimary">Pushing to GitHub...</div>
                <div className="text-xs text-migratex-elements-textTertiary mt-1">This may take a moment</div>
              </div>
            )}

            {/* Success */}
            {step === 'success' && pushResult && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-500/10 flex items-center justify-center">
                    <div className="i-ph:check-bold text-2xl text-green-500" />
                  </div>
                  <h3 className="font-semibold text-migratex-elements-textPrimary">Push Successful!</h3>
                  <p className="text-xs text-migratex-elements-textTertiary mt-1">
                    Commit: {pushResult.commitSha.slice(0, 7)}
                  </p>
                </div>

                <a
                  href={pushResult.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-migratex-elements-background-depth-3 rounded-lg text-sm font-medium text-migratex-elements-textPrimary hover:bg-migratex-elements-background-depth-2 transition-colors"
                >
                  <div className="i-ph:github-logo" />
                  <span>View on GitHub</span>
                  <div className="i-ph:arrow-square-out text-xs" />
                </a>

                <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="i-ph:rocket-launch text-purple-400" />
                    <span className="text-sm font-medium text-purple-400">Deploy to Launch</span>
                  </div>
                  <p className="text-xs text-migratex-elements-textTertiary mb-3">
                    Host your project on Contentstack Launch
                  </p>
                  <button
                    onClick={handleDeployToLaunch}
                    className="w-full py-2.5 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <div className="i-ph:rocket-launch" />
                    <span>Deploy Now</span>
                  </button>
                </div>

                <button
                  onClick={handleClose}
                  className="w-full py-2.5 text-sm text-migratex-elements-textSecondary hover:text-migratex-elements-textPrimary transition-colors"
                >
                  Close
                </button>
              </div>
            )}

            {/* Launch Auth */}
            {step === 'launch_auth' && (
              <div className="space-y-4">
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
                      className="w-full px-3 py-2.5 text-sm bg-migratex-elements-background-depth-3 border border-migratex-elements-borderColor rounded-lg text-migratex-elements-textPrimary placeholder-migratex-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
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
                      className="w-full px-3 py-2.5 text-sm bg-migratex-elements-background-depth-3 border border-migratex-elements-borderColor rounded-lg text-migratex-elements-textPrimary placeholder-migratex-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setStep('success')}
                    className="flex-1 py-2.5 px-4 text-sm font-medium rounded-lg border border-migratex-elements-borderColor text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-3 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSaveLaunchCredentials}
                    disabled={isLoading || !authToken.trim() || !organizationUid.trim()}
                    className={classNames(
                      'flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2',
                      'bg-purple-600 text-white hover:bg-purple-700',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {isLoading && <div className="i-svg-spinners:90-ring-with-bg" />}
                    <span>Continue</span>
                  </button>
                </div>
              </div>
            )}

            {/* Launch Config */}
            {step === 'launch_config' && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-migratex-elements-textSecondary mb-1.5">
                      Framework
                    </label>
                    <Select
                      variant="panel"
                      value={frameworkPreset}
                      onChange={(e) => setFrameworkPreset(e.target.value)}
                      options={LAUNCH_FRAMEWORK_OPTIONS}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-migratex-elements-textSecondary mb-1.5">
                      Build Command
                    </label>
                    <input
                      type="text"
                      value={buildCommand}
                      onChange={(e) => setBuildCommand(e.target.value)}
                      placeholder="npm run build"
                      className="w-full px-3 py-2.5 text-sm bg-migratex-elements-background-depth-3 border border-migratex-elements-borderColor rounded-lg text-migratex-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-migratex-elements-textSecondary mb-1.5">
                      Output Directory
                    </label>
                    <input
                      type="text"
                      value={outputDirectory}
                      onChange={(e) => setOutputDirectory(e.target.value)}
                      placeholder=".next"
                      className="w-full px-3 py-2.5 text-sm bg-migratex-elements-background-depth-3 border border-migratex-elements-borderColor rounded-lg text-migratex-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 py-2 px-3 bg-purple-500/5 border border-purple-500/20 rounded-lg text-xs text-migratex-elements-textSecondary">
                  <div className="i-ph:git-branch text-purple-400" />
                  <span className="truncate">{pushResult?.repoUrl.replace('https://github.com/', '')}</span>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setStep('success')}
                    className="flex-1 py-2.5 px-4 text-sm font-medium rounded-lg border border-migratex-elements-borderColor text-migratex-elements-textSecondary hover:bg-migratex-elements-background-depth-3 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreateLaunchProject}
                    disabled={isLoading}
                    className={classNames(
                      'flex-1 py-2.5 px-4 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2',
                      'bg-purple-600 text-white hover:bg-purple-700',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {isLoading ? (
                      <div className="i-svg-spinners:90-ring-with-bg" />
                    ) : (
                      <div className="i-ph:rocket-launch" />
                    )}
                    <span>Deploy</span>
                  </button>
                </div>
              </div>
            )}

            {/* Deploying */}
            {step === 'deploying' && (
              <div className="py-10 text-center">
                <div className="i-svg-spinners:90-ring-with-bg text-3xl mx-auto mb-3 text-purple-500" />
                <div className="text-sm font-medium text-migratex-elements-textPrimary">Deploying to Launch...</div>
                <div className="text-xs text-migratex-elements-textTertiary mt-1">Creating project</div>
              </div>
            )}

            {/* Deployed */}
            {step === 'deployed' && launchProject && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <div className="i-ph:rocket-launch text-2xl text-purple-500" />
                  </div>
                  <h3 className="font-semibold text-migratex-elements-textPrimary">Deployed!</h3>
                  <p className="text-xs text-migratex-elements-textTertiary mt-1">{launchProject.name}</p>
                </div>

                <div className="space-y-2">
                  {pushResult && (
                    <a
                      href={pushResult.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-migratex-elements-background-depth-3 rounded-lg text-sm font-medium text-migratex-elements-textPrimary hover:bg-migratex-elements-background-depth-2 transition-colors"
                    >
                      <div className="i-ph:github-logo" />
                      <span>View on GitHub</span>
                    </a>
                  )}
                  {deploymentUrl && (
                    <a
                      href={deploymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-purple-600 rounded-lg text-sm font-medium text-white hover:bg-purple-700 transition-colors"
                    >
                      <div className="i-ph:globe" />
                      <span>View Live Site</span>
                    </a>
                  )}
                  <a
                    href="https://app.contentstack.com/#!/launch"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 w-full py-2 text-xs text-migratex-elements-textTertiary hover:text-purple-400 transition-colors"
                  >
                    Open Launch Dashboard <div className="i-ph:arrow-square-out text-xs" />
                  </a>
                </div>

                <button
                  onClick={handleClose}
                  className="w-full py-2.5 text-sm text-migratex-elements-textSecondary hover:text-migratex-elements-textPrimary transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}

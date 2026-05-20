import { useStore } from '@nanostores/react';
import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { downloadProjectAsZip, getFileStats, formatBytes } from '~/utils/downloadProject';
import { GitHubPushModal } from '~/components/github/GitHubPushModal.client';
import { LaunchStatusModal } from '~/components/launch/LaunchStatusModal.client';

export function HeaderActionButtons() {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const { showChat } = useStore(chatStore);
  const files = useStore(workbenchStore.files);
  const [isExporting, setIsExporting] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [showLaunchModal, setShowLaunchModal] = useState(false);

  const canHideChat = showWorkbench || !showChat;

  const handleExport = async () => {
    const stats = getFileStats(files);
    
    if (stats.fileCount === 0) {
      toast.warning('No files to export. Generate some code first!');
      return;
    }

    setIsExporting(true);
    
    try {
      const result = await downloadProjectAsZip(files, 'migratex-project');
      
      toast.success(
        <div>
          <strong>✅ Export successful!</strong>
          <div className="text-sm mt-1">
            <div>📁 {result.fileCount} files ({formatBytes(result.totalSize)})</div>
            <div>📦 {result.filename}</div>
          </div>
        </div>,
        { autoClose: 5000 }
      );
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export project. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleGitHubPush = () => {
    const stats = getFileStats(files);
    
    if (stats.fileCount === 0) {
      toast.warning('No files to push. Generate some code first!');
      return;
    }

    setShowGitHubModal(true);
  };

  const stats = getFileStats(files);
  const hasFiles = stats.fileCount > 0;

  return (
    <>
      <div className="flex gap-2">
        {/* GitHub Push Button */}
        <div className="flex border border-migratex-elements-borderColor rounded-md overflow-hidden">
          <Button
            active={false}
            disabled={!hasFiles}
            onClick={handleGitHubPush}
            title={hasFiles ? `Push ${stats.fileCount} files to GitHub` : 'No files to push'}
          >
            <div className="i-ph:github-logo text-sm" />
            <span className="ml-1.5 text-xs hidden sm:inline">Push to GitHub</span>
          </Button>
        </div>

        {/* Launch Status Button */}
        <div className="flex border border-purple-500/50 rounded-md overflow-hidden">
          <Button
            active={false}
            disabled={false}
            onClick={() => setShowLaunchModal(true)}
            title="View Launch deployment status"
          >
            <div className="i-ph:rocket-launch text-sm text-purple-400" />
            <span className="ml-1.5 text-xs hidden sm:inline text-purple-400">Launch Status</span>
          </Button>
        </div>

        {/* Export/Download Button */}
        <div className="flex border border-migratex-elements-borderColor rounded-md overflow-hidden">
          <Button
            active={false}
            disabled={!hasFiles || isExporting}
            onClick={handleExport}
            title={hasFiles ? `Export ${stats.fileCount} files (${formatBytes(stats.totalSize)})` : 'No files to export'}
          >
            {isExporting ? (
              <div className="i-svg-spinners:90-ring-with-bg text-sm" />
            ) : (
              <div className="i-ph:download-simple-bold text-sm" />
            )}
            <span className="ml-1.5 text-xs hidden sm:inline">
              {isExporting ? 'Exporting...' : 'Export ZIP'}
            </span>
          </Button>
        </div>

        {/* Chat/Code Toggle Buttons */}
        <div className="flex border border-migratex-elements-borderColor rounded-md overflow-hidden">
          <Button
            active={showChat}
            disabled={!canHideChat}
            onClick={() => {
              if (canHideChat) {
                chatStore.setKey('showChat', !showChat);
              }
            }}
          >
            <div className="i-migratex:chat text-sm" />
          </Button>
          <div className="w-[1px] bg-migratex-elements-borderColor" />
          <Button
            active={showWorkbench}
            onClick={() => {
              if (showWorkbench && !showChat) {
                chatStore.setKey('showChat', true);
              }

              workbenchStore.showWorkbench.set(!showWorkbench);
            }}
          >
            <div className="i-ph:code-bold" />
          </Button>
        </div>
      </div>

      {/* GitHub Push Modal */}
      <GitHubPushModal
        isOpen={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
      />

      {/* Launch Status Modal */}
      <LaunchStatusModal
        isOpen={showLaunchModal}
        onClose={() => setShowLaunchModal(false)}
      />
    </>
  );
}

interface ButtonProps {
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly children?: React.ReactNode;
  readonly onClick?: VoidFunction;
  readonly title?: string;
}

function Button({ active = false, disabled = false, children, onClick, title }: ButtonProps) {
  return (
    <button
      className={classNames('flex items-center p-1.5 px-2 transition-colors', {
        'bg-migratex-elements-item-backgroundDefault hover:bg-migratex-elements-item-backgroundActive text-migratex-elements-textTertiary hover:text-migratex-elements-textPrimary':
          !active && !disabled,
        'bg-migratex-elements-item-backgroundAccent text-migratex-elements-item-contentAccent': active && !disabled,
        'bg-migratex-elements-item-backgroundDefault text-alpha-gray-20 dark:text-alpha-white-20 cursor-not-allowed':
          disabled,
      })}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

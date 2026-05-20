import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { ContentstackBotIcon } from './ContentstackBotIcon';

interface CreateWebsiteStepProps {
  websiteUrl: string;
  onCreateWebsite: () => void | Promise<void>;
}

export const CreateWebsiteStep: React.FC<CreateWebsiteStepProps> = ({ websiteUrl, onCreateWebsite }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCreateWebsite = async () => {
    setIsProcessing(true);
    try {
      await onCreateWebsite();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start website generation');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-50">
      {/* Header */}
      <div className="px-6 pt-6">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-200">
                <ContentstackBotIcon className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-semibold text-gray-900">Content Types Created!</h1>
                <p className="text-sm text-gray-500 truncate mt-0.5">{websiteUrl}</p>
              </div>
            </div>

            {/* Step indicator */}
            <div className="mt-6 pt-5 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                    <div className="i-ph:check-bold text-white text-sm" />
                  </div>
                  <span className="text-sm font-medium text-green-600">Content Types</span>
                </div>
                <div className="flex-1 h-0.5 bg-purple-500" />
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                    2
                  </div>
                  <span className="text-sm font-medium text-purple-600">Website</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <div className="i-ph:globe-bold text-purple-600 text-3xl" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Create Your Website</h2>
            <p className="text-gray-500 text-sm mb-6">
              Now let's generate a complete website using the Content Types and scraped data. This will create pages,
              components, and styling.
            </p>

            <button
              onClick={handleCreateWebsite}
              disabled={isProcessing}
              className={classNames(
                'w-full py-3 px-6 rounded-lg font-medium text-white transition-all',
                isProcessing
                  ? 'bg-purple-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 shadow-sm hover:shadow-md',
              )}
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="i-svg-spinners:90-ring-with-bg text-lg" />
                  Starting Website Generation...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <div className="i-ph:rocket-launch text-lg" />
                  Generate Website
                </span>
              )}
            </button>

            <p className="text-xs text-gray-400 mt-4">
              This will open the code editor where you can preview and customize your website
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

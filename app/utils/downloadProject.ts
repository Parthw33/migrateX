import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { FileMap } from '~/lib/stores/files';
import { WORK_DIR } from './constants';

export interface DownloadResult {
  success: boolean;
  filename: string;
  fileCount: number;
  totalSize: number;
}

// folders to exclude from ZIP export
const EXCLUDED_FOLDERS = ['.next', 'node_modules', '.git', '.cache', 'dist', 'build', '.turbo'];

/**
 * Check if a file path should be excluded from export
 */
function shouldExcludeFile(relativePath: string): boolean {
  const pathParts = relativePath.split('/');

  for (const folder of EXCLUDED_FOLDERS) {
    if (pathParts.includes(folder)) {
      return true;
    }
  }

  return false;
}

/**
 * Downloads all project files as a ZIP archive
 * @param files - The FileMap from the workbench store
 * @param projectName - Optional custom name for the ZIP file
 * @returns DownloadResult with details about the download
 */
export async function downloadProjectAsZip(
  files: FileMap,
  projectName: string = 'project'
): Promise<DownloadResult> {
  const zip = new JSZip();
  let fileCount = 0;
  let totalSize = 0;

  // create a regex to strip the WORK_DIR prefix
  const workDirRegex = new RegExp(`^${WORK_DIR.replace(/\//g, '\\/')}/`);

  for (const [filePath, dirent] of Object.entries(files)) {
    if (!dirent) continue;

    // get relative path by removing WORK_DIR prefix
    const relativePath = filePath.replace(workDirRegex, '');
    
    if (!relativePath) continue;

    // skip excluded folders (.next, node_modules, etc.)
    if (shouldExcludeFile(relativePath)) {
      continue;
    }

    if (dirent.type === 'file') {
      // skip binary files that have no content
      if (dirent.isBinary && !dirent.content) {
        continue;
      }

      zip.file(relativePath, dirent.content || '');
      fileCount++;
      totalSize += (dirent.content || '').length;
    }
    // folders are created automatically when adding files with paths
  }

  // Generate the ZIP file
  const content = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  // Create filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${projectName}_${timestamp}.zip`;

  // Trigger download
  saveAs(content, filename);

  return {
    success: true,
    filename,
    fileCount,
    totalSize
  };
}

/**
 * Get file statistics from the FileMap (excludes build folders)
 */
export function getFileStats(files: FileMap): { 
  fileCount: number; 
  folderCount: number;
  totalSize: number;
  fileTypes: Record<string, number>;
} {
  let fileCount = 0;
  let folderCount = 0;
  let totalSize = 0;
  const fileTypes: Record<string, number> = {};

  // create a regex to strip the WORK_DIR prefix for checking exclusions
  const workDirRegex = new RegExp(`^${WORK_DIR.replace(/\//g, '\\/')}/`);

  for (const [filePath, dirent] of Object.entries(files)) {
    if (!dirent) continue;

    // get relative path and check if it should be excluded
    const relativePath = filePath.replace(workDirRegex, '');

    if (shouldExcludeFile(relativePath)) {
      continue;
    }

    if (dirent.type === 'file') {
      fileCount++;
      totalSize += (dirent.content || '').length;
      
      // extract file extension
      const ext = filePath.split('.').pop()?.toLowerCase() || 'unknown';
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    } else if (dirent.type === 'folder') {
      folderCount++;
    }
  }

  return { fileCount, folderCount, totalSize, fileTypes };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

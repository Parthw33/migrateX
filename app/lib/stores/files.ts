import type { PathWatcherEvent, WebContainer } from '@webcontainer/api';
import { map, type MapStore } from 'nanostores';
import { bufferWatchEvents } from '~/utils/buffer';
import { WORK_DIR } from '~/utils/constants';
import { isBinaryBuffer } from '~/utils/isBinaryBuffer';
import { posixDirname, posixRelative } from '~/utils/posixPath';
import { computeFileModifications } from '~/utils/diff';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';

const logger = createScopedLogger('FilesStore');

const utf8TextDecoder = new TextDecoder('utf8', { fatal: true });

export interface File {
  type: 'file';
  content: string;
  isBinary: boolean;
}

export interface Folder {
  type: 'folder';
}

type Dirent = File | Folder;

export type FileMap = Record<string, Dirent | undefined>;

export class FilesStore {
  #webcontainer: Promise<WebContainer>;

  /**
   * Tracks the number of files without folders.
   */
  #size = 0;

  /**
   * @note Keeps track all modified files with their original content since the last user message.
   * Needs to be reset when the user sends another message and all changes have to be submitted
   * for the model to be aware of the changes.
   */
  #modifiedFiles: Map<string, string> = import.meta.hot?.data.modifiedFiles ?? new Map();

  /**
   * Map of files that matches the state of WebContainer.
   */
  files: MapStore<FileMap> = import.meta.hot?.data.files ?? map({});

  get filesCount() {
    return this.#size;
  }

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.files = this.files;
      import.meta.hot.data.modifiedFiles = this.#modifiedFiles;
    }

    this.#init();
  }

  getFile(filePath: string) {
    const dirent = this.files.get()[filePath];

    if (dirent?.type !== 'file') {
      return undefined;
    }

    return dirent;
  }

  getFileModifications() {
    return computeFileModifications(this.files.get(), this.#modifiedFiles);
  }

  resetFileModifications() {
    this.#modifiedFiles.clear();
  }

  /** Clear in-memory file tree (e.g. before loading a new generated website). WebContainer disk may still hold prior files until overwritten. */
  resetInMemoryFileMap(): void {
    this.files.set({});
    this.#size = 0;
  }

  /**
   * Fills the file map when there are no files yet (e.g. workbench demo before WebContainer sync).
   * Also writes the files to the WebContainer filesystem.
   */
  async seedIfEmpty(fileMap: FileMap) {
    if (this.#size > 0) {
      return;
    }

    const webcontainer = await this.#webcontainer;

    for (const [path, dirent] of Object.entries(fileMap)) {
      if (!dirent) {
        continue;
      }

      if (dirent.type === 'folder') {
        this.files.setKey(path, dirent);
        // Create the directory in WebContainer
        try {
          const relativePath = posixRelative(webcontainer.workdir, path);
          if (relativePath && !relativePath.startsWith('../')) {
            await webcontainer.fs.mkdir(relativePath, { recursive: true });
          }
        } catch (error) {
          // Directory might already exist, continue
          console.warn('Failed to create directory:', path, error);
        }
      } else {
        this.#size++;
        this.files.setKey(path, dirent);
        // Write the file to WebContainer
        try {
          const relativePath = posixRelative(webcontainer.workdir, path);
          if (relativePath && !relativePath.startsWith('../')) {
            // Ensure parent directory exists
            const parentDir = posixDirname(relativePath);
            if (parentDir && parentDir !== '.') {
              await webcontainer.fs.mkdir(parentDir, { recursive: true });
            }
            await webcontainer.fs.writeFile(relativePath, dirent.content);
          }
        } catch (error) {
          console.error('Failed to write file to WebContainer:', path, error);
        }
      }
    }
  }

  /**
   * Merge or replace files from an external source (e.g. website generator poll).
   * Writes through to WebContainer and updates the reactive file map with a single
   * batched notification to avoid cascading re-renders for each individual file.
   */
  async ingestFileMap(fileMap: FileMap) {
    const webcontainer = await this.#webcontainer;
    const workdir = webcontainer.workdir;

    // Snapshot current map so we can do one bulk set at the end
    const updated: FileMap = { ...this.files.get() };

    for (const [path, dirent] of Object.entries(fileMap)) {
      if (!dirent) {
        continue;
      }

      if (dirent.type === 'folder') {
        updated[path] = dirent;

        try {
          const relativePath = posixRelative(workdir, path);
          if (relativePath && !relativePath.startsWith('../')) {
            await webcontainer.fs.mkdir(relativePath, { recursive: true });
          }
        } catch (error) {
          console.warn('ingestFileMap mkdir:', path, error);
        }

        continue;
      }

      const previous = updated[path];
      if (previous?.type !== 'file') {
        this.#size++;
      }

      updated[path] = dirent;

      try {
        const relativePath = posixRelative(workdir, path);
        if (relativePath && !relativePath.startsWith('../')) {
          const parentDir = posixDirname(relativePath);
          if (parentDir && parentDir !== '.') {
            await webcontainer.fs.mkdir(parentDir, { recursive: true });
          }
          await webcontainer.fs.writeFile(relativePath, dirent.content);
        }
      } catch (error) {
        console.error('ingestFileMap writeFile:', path, error);
      }
    }

    // Single notification fires instead of one per file
    this.files.set(updated);
  }

  async saveFile(filePath: string, content: string) {
    const webcontainer = await this.#webcontainer;

    try {
      const relativePath = posixRelative(webcontainer.workdir, filePath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid file path, write '${relativePath}'`);
      }

      const oldContent = this.getFile(filePath)?.content;

      if (!oldContent) {
        unreachable('Expected content to be defined');
      }

      await webcontainer.fs.writeFile(relativePath, content);

      if (!this.#modifiedFiles.has(filePath)) {
        this.#modifiedFiles.set(filePath, oldContent);
      }

      // we immediately update the file and don't rely on the `change` event coming from the watcher
      this.files.setKey(filePath, { type: 'file', content, isBinary: false });

      logger.info('File updated');
    } catch (error) {
      logger.error('Failed to update file content\n\n', error);

      throw error;
    }
  }

  async #init() {
    const webcontainer = await this.#webcontainer;

    webcontainer.internal.watchPaths(
      { include: [`${WORK_DIR}/**`], exclude: ['**/node_modules', '.git'], includeContent: true },
      bufferWatchEvents(100, this.#processEventBuffer.bind(this)),
    );
  }

  #processEventBuffer(events: Array<[events: PathWatcherEvent[]]>) {
    const watchEvents = events.flat(2);

    for (const { type, path, buffer } of watchEvents) {
      // remove any trailing slashes
      const sanitizedPath = path.replace(/\/+$/g, '');

      switch (type) {
        case 'add_dir': {
          // we intentionally add a trailing slash so we can distinguish files from folders in the file tree
          this.files.setKey(sanitizedPath, { type: 'folder' });
          break;
        }
        case 'remove_dir': {
          this.files.setKey(sanitizedPath, undefined);

          for (const [direntPath] of Object.entries(this.files)) {
            if (direntPath.startsWith(sanitizedPath)) {
              this.files.setKey(direntPath, undefined);
            }
          }

          break;
        }
        case 'add_file':
        case 'change': {
          if (type === 'add_file') {
            const previous = this.files.get()[sanitizedPath];
            if (previous?.type !== 'file') {
              this.#size++;
            }
          }

          let content = '';

          /**
           * @note This check is purely for the editor. The way we detect this is not
           * bullet-proof and it's a best guess so there might be false-positives.
           * The reason we do this is because we don't want to display binary files
           * in the editor nor allow to edit them.
           */
          const isBinary = isBinaryBuffer(buffer);

          if (!isBinary) {
            content = this.#decodeFileContent(buffer);
          }

          this.files.setKey(sanitizedPath, { type: 'file', content, isBinary });

          break;
        }
        case 'remove_file': {
          const removed = this.files.get()[sanitizedPath];
          if (removed?.type === 'file') {
            this.#size--;
          }
          this.files.setKey(sanitizedPath, undefined);
          break;
        }
        case 'update_directory': {
          // we don't care about these events
          break;
        }
      }
    }
  }

  #decodeFileContent(buffer?: Uint8Array) {
    if (!buffer || buffer.byteLength === 0) {
      return '';
    }

    try {
      return utf8TextDecoder.decode(buffer);
    } catch (error) {
      console.log(error);
      return '';
    }
  }
}

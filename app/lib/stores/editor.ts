import { atom, computed, map, type MapStore, type WritableAtom } from 'nanostores';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import type { FileMap, FilesStore } from './files';

export type EditorDocuments = Record<string, EditorDocument>;

type SelectedFile = WritableAtom<string | undefined>;

export class EditorStore {
  #filesStore: FilesStore;

  selectedFile: SelectedFile = import.meta.hot?.data.selectedFile ?? atom<string | undefined>();
  documents: MapStore<EditorDocuments> = import.meta.hot?.data.documents ?? map({});

  currentDocument = computed([this.documents, this.selectedFile], (documents, selectedFile) => {
    if (!selectedFile) {
      return undefined;
    }

    return documents[selectedFile];
  });

  constructor(filesStore: FilesStore) {
    this.#filesStore = filesStore;

    if (import.meta.hot) {
      import.meta.hot.data.documents = this.documents;
      import.meta.hot.data.selectedFile = this.selectedFile;
    }
  }

  setDocuments(files: FileMap) {
    const previousDocuments = this.documents.value;

    // Incremental update: only touch entries that are actually new or whose
    // content changed, and only drop entries whose backing file was removed.
    // Re-cloning the entire map on every per-file ingest during a sync turns
    // a sequence of N file additions into O(N²) work and triggers a full
    // editor re-render per file.
    const next: EditorDocuments = { ...previousDocuments };
    let mutated = false;

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent === undefined || dirent.type === 'folder') {
        if (filePath in next) {
          delete next[filePath];
          mutated = true;
        }
        continue;
      }

      const previous = previousDocuments?.[filePath];
      if (previous && previous.value === dirent.content) {
        continue;
      }

      next[filePath] = {
        value: dirent.content,
        filePath,
        scroll: previous?.scroll,
      };
      mutated = true;
    }

    // Drop documents whose file is no longer present in the file map.
    for (const filePath of Object.keys(next)) {
      if (!(filePath in files)) {
        delete next[filePath];
        mutated = true;
      }
    }

    if (mutated) {
      this.documents.set(next);
    }
  }

  setSelectedFile(filePath: string | undefined) {
    this.selectedFile.set(filePath);
  }

  updateScrollPosition(filePath: string, position: ScrollPosition) {
    const documents = this.documents.get();
    const documentState = documents[filePath];

    if (!documentState) {
      return;
    }

    this.documents.setKey(filePath, {
      ...documentState,
      scroll: position,
    });
  }

  updateFile(filePath: string, newContent: string) {
    const documents = this.documents.get();
    const documentState = documents[filePath];

    if (!documentState) {
      return;
    }

    const currentContent = documentState.value;
    const contentChanged = currentContent !== newContent;

    if (contentChanged) {
      this.documents.setKey(filePath, {
        ...documentState,
        value: newContent,
      });
    }
  }
}

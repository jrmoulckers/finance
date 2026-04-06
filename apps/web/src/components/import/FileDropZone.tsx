// SPDX-License-Identifier: BUSL-1.1

/**
 * Reusable file drop zone component.
 *
 * Accepts files via drag-and-drop or a native file picker. Provides visual
 * feedback during drag-over and keyboard activation (Enter/Space).
 *
 * Accessibility:
 *   - Hidden file input with descriptive aria-label
 *   - Keyboard-accessible: Enter/Space triggers file picker
 *   - Focus ring via :focus-within on the container
 */

import React, { useCallback, useId, useRef, useState } from 'react';

export interface FileDropZoneProps {
  /** Accepted file extensions, e.g. ".csv" */
  accept?: string;
  /** Called when a file is selected via drop or picker. */
  onFile: (file: File) => void;
  /** Accessible label for the hidden file input. */
  inputLabel?: string;
  /** Icon to display in the drop zone. */
  icon?: string;
  /** Primary instruction text (React node). */
  message?: React.ReactNode;
  /** Hint text below the message. */
  hint?: string;
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  accept = '.csv',
  onFile,
  inputLabel = 'Choose file to import',
  icon = '\uD83D\uDCC1',
  message,
  hint,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputId = useId();

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        onFile(file);
      }
    },
    [onFile],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

      const file = event.dataTransfer.files[0];
      if (file) {
        onFile(file);
      }
    },
    [onFile],
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleBrowseClick();
      }
    },
    [handleBrowseClick],
  );

  const defaultMessage = (
    <>
      Drag and drop your CSV file here, or{' '}
      <span className="import-upload-zone__browse">browse</span>
    </>
  );

  return (
    <div
      className={`import-upload-zone${isDragOver ? ' import-upload-zone--drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      onClick={handleBrowseClick}
    >
      <span className="import-upload-zone__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="import-upload-zone__text">{message ?? defaultMessage}</p>
      {hint && <p className="import-upload-zone__hint">{hint}</p>}
      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        accept={accept}
        className="import-upload-zone__input"
        onChange={handleFileChange}
        aria-label={inputLabel}
        tabIndex={-1}
      />
    </div>
  );
};

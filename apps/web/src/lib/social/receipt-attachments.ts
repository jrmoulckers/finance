// SPDX-License-Identifier: BUSL-1.1

import type { AttachmentStorage, NoteStorage } from './storage-model';
import type { AttachmentFileType, AttachmentMetadata, TransactionNote } from './types';

/** Input for storing a receipt image against a transaction. */
export interface StoreReceiptAttachmentInput {
  readonly transactionId: string;
  readonly authorId: string;
  readonly fileName: string;
  readonly fileType: AttachmentFileType;
  readonly data: ArrayBuffer;
  readonly noteText?: string;
}

/** Stored receipt note and attachment metadata. */
export interface StoredReceiptAttachment {
  readonly note: TransactionNote;
  readonly attachment: AttachmentMetadata;
}

/**
 * Stores a receipt image through the existing social note/attachment model.
 *
 * The image bytes stay in the configured attachment storage and the created
 * note is tagged `receipt` so transaction detail surfaces can find it.
 */
export async function storeReceiptAttachment(
  noteStorage: NoteStorage,
  attachmentStorage: AttachmentStorage,
  input: StoreReceiptAttachmentInput,
): Promise<StoredReceiptAttachment> {
  const note = await noteStorage.create({
    transactionId: input.transactionId,
    authorId: input.authorId,
    text: input.noteText ?? 'Receipt attached',
    tags: ['receipt'],
  });
  const attachment = await attachmentStorage.upload(note.id, {
    fileName: input.fileName,
    fileType: input.fileType,
    sizeBytes: input.data.byteLength,
    data: input.data,
  });
  return { note, attachment };
}

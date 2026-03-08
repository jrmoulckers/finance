// SPDX-License-Identifier: BUSL-1.1

declare module 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js' {
  export class OriginPrivateFileSystemVFS {
    static create(name: string, module: unknown): Promise<OriginPrivateFileSystemVFS>;
  }
}

declare module 'wa-sqlite' {
  interface SQLiteModule {
    vfs_register(vfs: unknown, makeDefault: boolean): void;
    open_v2(name: string): Promise<number>;
    close(db: number): void;
    exec(db: number, sql: string): void;
    prepare(db: number, sql: string): number;
    step(stmt: number): number;
    column_count(stmt: number): number;
    column_name(stmt: number, index: number): string;
    column(stmt: number, index: number): unknown;
    bind(stmt: number, params: unknown[]): void;
    finalize(stmt: number): void;
  }

  function SQLiteESMFactory(): Promise<SQLiteModule>;
  export default SQLiteESMFactory;
}

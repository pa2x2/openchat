class MemoryMMKV {
  private map = new Map<string, string>();

  getString(key: string): string | undefined {
    return this.map.get(key);
  }

  set(key: string, value: string): void {
    this.map.set(key, value);
  }

  remove(key: string): boolean {
    return this.map.delete(key);
  }

  contains(key: string): boolean {
    return this.map.has(key);
  }

  clearAll(): void {
    this.map.clear();
  }
}

export const createMMKV = () => new MemoryMMKV();
export type MMKV = MemoryMMKV;

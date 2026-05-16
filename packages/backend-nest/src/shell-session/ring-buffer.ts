const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Append-only chunk ring keyed by cumulative byte offset. Total kept bytes ≤
// `capacityBytes`; oldest chunks get dropped when the cap is hit. Readers pass
// a `sinceOffset`; anything older than `oldestOffset()` has been evicted (caller
// sees `truncated: true`).
export class RingBuffer {
  private chunks: Array<{ bytes: Uint8Array; offset: number }> = [];
  private total = 0;
  private writeOffset = 0;

  constructor(private readonly capacityBytes: number) {}

  append(data: string): void {
    if (!data) return;
    const bytes = encoder.encode(data);
    this.chunks.push({ bytes, offset: this.writeOffset });
    this.writeOffset += bytes.length;
    this.total += bytes.length;
    this.evict();
  }

  private evict(): void {
    while (this.total > this.capacityBytes && this.chunks.length > 1) {
      const dropped = this.chunks.shift()!;
      this.total -= dropped.bytes.length;
    }
  }

  oldestOffset(): number {
    return this.chunks[0]?.offset ?? this.writeOffset;
  }

  endOffset(): number {
    return this.writeOffset;
  }

  readFrom(
    sinceOffset: number,
    maxBytes: number,
  ): { data: string; nextOffset: number; truncated: boolean } {
    const oldest = this.oldestOffset();
    let start = sinceOffset;
    let truncated = false;
    if (start < oldest) {
      start = oldest;
      truncated = true;
    }
    if (start >= this.writeOffset) {
      return { data: "", nextOffset: this.writeOffset, truncated };
    }

    let remaining = maxBytes;
    const parts: Uint8Array[] = [];
    let cursor = start;

    for (const chunk of this.chunks) {
      const chunkEnd = chunk.offset + chunk.bytes.length;
      if (chunkEnd <= cursor) continue;
      const localStart = Math.max(0, cursor - chunk.offset);
      const slice = chunk.bytes.subarray(localStart);
      if (slice.length <= remaining) {
        parts.push(slice);
        remaining -= slice.length;
        cursor = chunkEnd;
      } else {
        parts.push(slice.subarray(0, remaining));
        cursor += remaining;
        remaining = 0;
      }
      if (remaining === 0) break;
    }

    const total = parts.reduce((n, p) => n + p.length, 0);
    const combined = new Uint8Array(total);
    let i = 0;
    for (const p of parts) {
      combined.set(p, i);
      i += p.length;
    }

    return { data: decoder.decode(combined), nextOffset: cursor, truncated };
  }

  readTail(maxBytes: number): { data: string; startOffset: number; endOffset: number } {
    const startOffset = Math.max(this.oldestOffset(), this.writeOffset - maxBytes);
    const result = this.readFrom(startOffset, maxBytes);
    return { data: result.data, startOffset, endOffset: result.nextOffset };
  }
}

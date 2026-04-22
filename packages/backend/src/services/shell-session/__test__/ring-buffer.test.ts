import { describe, it, expect } from "vitest";
import { RingBuffer } from "../ring-buffer";

describe("RingBuffer", () => {
  it("reports offsets and returns all data for a small buffer", () => {
    const buf = new RingBuffer(1024);
    buf.append("hello ");
    buf.append("world");
    expect(buf.oldestOffset()).toBe(0);
    expect(buf.endOffset()).toBe(11);

    const { data, nextOffset, truncated } = buf.readFrom(0, 1024);
    expect(data).toBe("hello world");
    expect(nextOffset).toBe(11);
    expect(truncated).toBe(false);
  });

  it("resumes from a provided sinceOffset", () => {
    const buf = new RingBuffer(1024);
    buf.append("abc");
    buf.append("def");
    buf.append("ghi");
    const first = buf.readFrom(0, 1024);
    expect(first.data).toBe("abcdefghi");

    buf.append("jkl");
    const second = buf.readFrom(first.nextOffset, 1024);
    expect(second.data).toBe("jkl");
    expect(second.nextOffset).toBe(12);
    expect(second.truncated).toBe(false);
  });

  it("drops oldest chunks when capacity is exceeded and marks truncated", () => {
    const buf = new RingBuffer(8);
    buf.append("AAAA"); // offset 0..4
    buf.append("BBBB"); // offset 4..8 (capacity exactly full)
    buf.append("CCCC"); // evicts AAAA — buffer now holds BBBB + CCCC (= 8)

    expect(buf.endOffset()).toBe(12);
    expect(buf.oldestOffset()).toBe(4);

    const staleRead = buf.readFrom(0, 1024);
    expect(staleRead.truncated).toBe(true);
    expect(staleRead.data).toBe("BBBBCCCC");
    expect(staleRead.nextOffset).toBe(12);

    const freshRead = buf.readFrom(4, 1024);
    expect(freshRead.truncated).toBe(false);
    expect(freshRead.data).toBe("BBBBCCCC");
  });

  it("limits read size by maxBytes", () => {
    const buf = new RingBuffer(1024);
    buf.append("0123456789");
    const read = buf.readFrom(0, 4);
    expect(read.data).toBe("0123");
    expect(read.nextOffset).toBe(4);
    expect(read.truncated).toBe(false);
  });

  it("returns empty when sinceOffset is at or past endOffset", () => {
    const buf = new RingBuffer(1024);
    buf.append("abc");
    const read = buf.readFrom(3, 1024);
    expect(read.data).toBe("");
    expect(read.nextOffset).toBe(3);
    expect(read.truncated).toBe(false);
  });

  it("readTail returns just the last maxBytes", () => {
    const buf = new RingBuffer(1024);
    buf.append("0123456789");
    const tail = buf.readTail(3);
    expect(tail.data).toBe("789");
    expect(tail.startOffset).toBe(7);
    expect(tail.endOffset).toBe(10);
  });

  it("preserves multi-byte UTF-8 characters across chunks", () => {
    const buf = new RingBuffer(1024);
    buf.append("你好");
    buf.append("世界");
    const read = buf.readFrom(0, 1024);
    expect(read.data).toBe("你好世界");
  });
});

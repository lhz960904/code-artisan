import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readSkillFrontMatter } from "../skill-reader";
import { join } from "node:path";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "skill-reader-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true });
});

describe("readSkillFrontMatter", () => {
  it("should parse name and description from frontmatter", async () => {
    const skillPath = join(tempDir, "valid-skill", "SKILL.md");
    await mkdir(join(tempDir, "valid-skill"), { recursive: true });
    await Bun.write(
      skillPath,
      `---\nname: test-skill\ndescription: A test skill\n---\n\n# Test Skill\n\nSome body content.\n`,
    );

    const result = await readSkillFrontMatter(skillPath);

    expect(result).toEqual({
      name: "test-skill",
      description: "A test skill",
      path: skillPath,
    });
  });

  it("should always set path to the file path argument", async () => {
    const skillPath = join(tempDir, "path-check", "SKILL.md");
    await mkdir(join(tempDir, "path-check"), { recursive: true });
    await Bun.write(skillPath, `---\nname: another\ndescription: desc\n---\n`);

    const result = await readSkillFrontMatter(skillPath);

    expect(result.path).toBe(skillPath);
  });

  it("should throw when file does not exist", async () => {
    const fakePath = join(tempDir, "nonexistent", "SKILL.md");

    await expect(readSkillFrontMatter(fakePath)).rejects.toThrow("does not exist");
  });

  it("should handle frontmatter with extra fields gracefully", async () => {
    const skillPath = join(tempDir, "extra-fields", "SKILL.md");
    await mkdir(join(tempDir, "extra-fields"), { recursive: true });
    await Bun.write(
      skillPath,
      `---\nname: extra\ndescription: with extras\nauthor: someone\nversion: 1.0\n---\nBody\n`,
    );

    const result = await readSkillFrontMatter(skillPath);

    expect(result.name).toBe("extra");
    expect(result.description).toBe("with extras");
    expect(result.path).toBe(skillPath);
  });

  it("should handle empty frontmatter", async () => {
    const skillPath = join(tempDir, "empty-fm", "SKILL.md");
    await mkdir(join(tempDir, "empty-fm"), { recursive: true });
    await Bun.write(skillPath, `---\n---\nJust body\n`);

    const result = await readSkillFrontMatter(skillPath);

    expect(result.name).toBeUndefined();
    expect(result.description).toBeUndefined();
    expect(result.path).toBe(skillPath);
  });
});

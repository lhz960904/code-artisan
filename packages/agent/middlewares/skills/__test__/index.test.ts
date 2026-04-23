import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createSkillsMiddleware } from "../index";
import { join } from "node:path";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { LocalSandbox } from "../../../sandbox/local";
import type { AgentContext, ModelContext } from "../../../types/agent";
import type { LLMProvider } from "../../../types/provider";
import type { Sandbox } from "../../../sandbox/types";

const noopModel = {
  invoke: async () => ({ role: "assistant" as const, content: [{ type: "text" as const, text: "" }] }),
  stream: async function* () {},
} as unknown as LLMProvider;

const sandbox: Sandbox = new LocalSandbox();

function buildContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    prompt: "",
    messages: [],
    model: noopModel,
    sandbox,
    ...overrides,
  };
}

let tempDir: string;

function writeSkill(dir: string, name: string, description: string) {
  const skillDir = join(dir, name);
  const skillPath = join(skillDir, "SKILL.md");
  return mkdir(skillDir, { recursive: true }).then(() =>
    Bun.write(skillPath, `---\nname: ${name}\ndescription: ${description}\n---\nBody\n`),
  );
}

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "skills-mw-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true });
});

describe("createSkillsMiddleware", () => {
  describe("beforeAgentRun", () => {
    it("should load skills from a single directory", async () => {
      const skillsDir = join(tempDir, "single");
      await mkdir(skillsDir, { recursive: true });
      await writeSkill(skillsDir, "skill-a", "Skill A desc");
      await writeSkill(skillsDir, "skill-b", "Skill B desc");

      const mw = createSkillsMiddleware([skillsDir]);
      const result = await mw.beforeAgentRun!({ agentContext: buildContext() });

      expect(result?.skills).toHaveLength(2);
      expect(result?.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "skill-a", description: "Skill A desc" }),
          expect.objectContaining({ name: "skill-b", description: "Skill B desc" }),
        ]),
      );
    });

    it("should load skills from multiple directories", async () => {
      const dir1 = join(tempDir, "multi-1");
      const dir2 = join(tempDir, "multi-2");
      await writeSkill(dir1, "from-dir1", "From dir 1");
      await writeSkill(dir2, "from-dir2", "From dir 2");

      const mw = createSkillsMiddleware([dir1, dir2]);
      const result = await mw.beforeAgentRun!({ agentContext: buildContext() });

      expect(result?.skills).toHaveLength(2);
      expect(result?.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "from-dir1" }),
          expect.objectContaining({ name: "from-dir2" }),
        ]),
      );
    });

    it("should skip non-existent directories", async () => {
      const validDir = join(tempDir, "valid-dir");
      await writeSkill(validDir, "real-skill", "Real");

      const mw = createSkillsMiddleware([join(tempDir, "does-not-exist"), validDir]);
      const result = await mw.beforeAgentRun!({ agentContext: buildContext() });

      expect(result?.skills).toHaveLength(1);
      expect(result?.skills?.[0]?.name).toBe("real-skill");
    });

    it("should skip non-directory entries in skills folder", async () => {
      const skillsDir = join(tempDir, "mixed-entries");
      await mkdir(skillsDir, { recursive: true });
      await writeSkill(skillsDir, "dir-skill", "Directory skill");
      await Bun.write(join(skillsDir, "stray-file.txt"), "not a skill");

      const mw = createSkillsMiddleware([skillsDir]);
      const result = await mw.beforeAgentRun!({ agentContext: buildContext() });

      expect(result?.skills).toHaveLength(1);
      expect(result?.skills?.[0]?.name).toBe("dir-skill");
    });

    it("should skip directories without SKILL.md", async () => {
      const skillsDir = join(tempDir, "no-skill-md");
      await mkdir(join(skillsDir, "empty-folder"), { recursive: true });
      await writeSkill(skillsDir, "has-skill", "Has it");

      const mw = createSkillsMiddleware([skillsDir]);
      const result = await mw.beforeAgentRun!({ agentContext: buildContext() });

      expect(result?.skills).toHaveLength(1);
      expect(result?.skills?.[0]?.name).toBe("has-skill");
    });

    it("should deduplicate skills across overlapping directories", async () => {
      const skillsDir = join(tempDir, "dedup");
      await writeSkill(skillsDir, "shared-skill", "Shared");

      const mw = createSkillsMiddleware([skillsDir, skillsDir]);
      const result = await mw.beforeAgentRun!({ agentContext: buildContext() });

      expect(result?.skills).toHaveLength(1);
    });

    it("should return empty array when no directories provided", async () => {
      const mw = createSkillsMiddleware([]);
      const result = await mw.beforeAgentRun!({ agentContext: buildContext() });

      expect(result?.skills).toEqual([]);
    });

    it("should set path to the absolute SKILL.md location", async () => {
      const skillsDir = join(tempDir, "absolute-path");
      await writeSkill(skillsDir, "my-skill", "desc");

      const mw = createSkillsMiddleware([skillsDir]);
      const result = await mw.beforeAgentRun!({ agentContext: buildContext() });

      expect(result?.skills?.[0]?.path).toBe(join(skillsDir, "my-skill", "SKILL.md"));
    });
  });

  describe("beforeModel", () => {
    it("should append skill_system prompt when skills are present", async () => {
      const skills = [{ name: "test-skill", description: "Test", path: "/fake/path" }];
      const agentContext = buildContext({ skills });
      const modelContext: ModelContext = {
        prompt: agentContext.prompt,
        messages: [],
      };

      const mw = createSkillsMiddleware([]);
      const result = await mw.beforeModel!({ agentContext, modelContext });

      expect(result?.prompt).toContain("<skill_system>");
      expect(result?.prompt).toContain("test-skill");
      expect(result?.prompt).toContain("</skill_system>");
    });

    it("should not modify prompt when skills array is empty", async () => {
      const agentContext = buildContext({ skills: [] });
      const modelContext: ModelContext = {
        prompt: agentContext.prompt,
        messages: [],
      };

      const mw = createSkillsMiddleware([]);
      const result = await mw.beforeModel!({ agentContext, modelContext });

      expect(result).toBeUndefined();
    });

    it("should not modify prompt when skills is undefined", async () => {
      const agentContext = buildContext();
      const modelContext: ModelContext = {
        prompt: agentContext.prompt,
        messages: [],
      };

      const mw = createSkillsMiddleware([]);
      const result = await mw.beforeModel!({ agentContext, modelContext });

      expect(result).toBeUndefined();
    });
  });
});

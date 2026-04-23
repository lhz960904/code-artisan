import matter from "gray-matter";
import type { AgentMiddleware } from "../../types/middleware";
import type { SkillFrontmatter } from "./skill-reader";

/**
 * Loads skills from one or more `skillsDirs` inside the agent's sandbox.
 * Each entry must be an absolute path in the sandbox file system. Each
 * first-level subdirectory containing a `SKILL.md` is treated as a skill.
 */
export function createSkillsMiddleware(skillsDirs: string[]): AgentMiddleware {
  return {
    beforeAgentRun: async ({ agentContext }) => {
      const { sandbox } = agentContext;
      const skills: SkillFrontmatter[] = [];
      const seen = new Set<string>();

      for (const skillsDir of skillsDirs) {
        const entries = await sandbox.listDir(skillsDir).catch(() => []);
        if (entries.length === 0) continue;

        const topDirs = entries.filter(
          (e) => e.is_dir && !e.path.includes("/"),
        );

        for (const dir of topDirs) {
          const skillRelativePath = `${dir.path}/SKILL.md`;
          const hasSkillFile = entries.some(
            (e) => !e.is_dir && e.path === skillRelativePath,
          );
          if (!hasSkillFile) continue;

          const skillFullPath = `${skillsDir}/${skillRelativePath}`;
          if (seen.has(skillFullPath)) continue;
          seen.add(skillFullPath);

          try {
            const content = await sandbox.readFile(skillFullPath);
            const parsed = matter(content);
            skills.push({
              ...(parsed.data as Omit<SkillFrontmatter, "path">),
              path: skillFullPath,
            });
          } catch {
            continue;
          }
        }
      }

      return { skills };
    },

    beforeModel: async ({ agentContext, modelContext }) => {
      if (agentContext.skills && agentContext.skills.length > 0) {
        return {
          prompt:
            modelContext.prompt +
            `\n
<skill_system>
You have access to skills that provide optimized workflows for specific tasks. Each skill contains best practices, frameworks, and references to additional resources.

**Progressive Loading Pattern:**
1. When a user query matches a skill's use case, immediately call \`read_file\` on the skill's main file using the path attribute provided in the skill tag below
2. Read and understand the skill's workflow and instructions
3. The skill file contains references to external resources under the same folder
4. Load referenced resources only when needed during execution
5. Follow the skill's instructions precisely

<skills>
${JSON.stringify(agentContext.skills, null, 2)}
</skills>
</skill_system>`,
        };
      }
    },
  };
}

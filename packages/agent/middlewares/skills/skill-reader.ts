import matter from "gray-matter";

export interface SkillFrontmatter {
  name: string;
  description: string;
  path: string;
}

export async function readSkillFrontMatter(path: string): Promise<SkillFrontmatter> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`File ${path} does not exist`);
  }
  const content = await file.text();
  const parsedFile = matter(content);
  return { ...parsedFile.data, path } as SkillFrontmatter;
}

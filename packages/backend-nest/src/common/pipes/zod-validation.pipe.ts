import { BadRequestException } from "@nestjs/common";
import { createZodValidationPipe } from "nestjs-zod";
import { ZodError } from "zod";

// Match backend's validator: first issue flattened to "path: message".
export const ZodValidationPipe = createZodValidationPipe({
  createValidationException: (error: unknown) => {
    if (!(error instanceof ZodError)) return new BadRequestException("Validation failed");
    const first = error.issues[0];
    if (!first) return new BadRequestException("Validation failed");
    const path = first.path.map(String).join(".");
    return new BadRequestException(path ? `${path}: ${first.message}` : first.message);
  },
});

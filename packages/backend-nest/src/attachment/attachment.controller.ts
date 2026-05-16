import { BadRequestException, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { StorageService } from "../storage/storage.service.js";

@Controller("attachment")
export class AttachmentController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upload(@Req() req: FastifyRequest) {
    if (!req.isMultipart()) throw new BadRequestException("Expected multipart/form-data");
    const file = await req.file();
    if (!file) throw new BadRequestException("No file provided");
    const buffer = await file.toBuffer();
    return this.storage.uploadFile({
      filename: file.filename,
      mimeType: file.mimetype,
      buffer,
      size: buffer.length,
    });
  }
}

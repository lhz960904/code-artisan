import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module.js";
import { AttachmentController } from "./attachment.controller.js";

@Module({
  imports: [StorageModule],
  controllers: [AttachmentController],
})
export class AttachmentModule {}

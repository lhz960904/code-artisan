import { Module } from "@nestjs/common";
import { ModelsController } from "./models.controller.js";

@Module({
  controllers: [ModelsController],
})
export class ModelsModule {}

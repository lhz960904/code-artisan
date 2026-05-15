import { Controller, Get } from "@nestjs/common";
import { SUPPORTED_MODELS } from "@code-artisan/shared";

@Controller("models")
export class ModelsController {
  @Get()
  list() {
    return SUPPORTED_MODELS;
  }
}

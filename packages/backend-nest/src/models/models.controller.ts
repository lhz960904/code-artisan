import { Controller, Get } from "@nestjs/common";
import { SUPPORTED_MODELS } from "@code-artisan/shared";
import { Public } from "../auth/public.decorator.js";

@Controller("models")
@Public()
export class ModelsController {
  @Get()
  list() {
    return SUPPORTED_MODELS;
  }
}

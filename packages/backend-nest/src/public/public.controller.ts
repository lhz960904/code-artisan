import { Controller, Get, Param } from "@nestjs/common";
import { Public } from "../auth/public.decorator.js";
import { SlugParamDto } from "./dto/slug.dto.js";
import { PublicService } from "./public.service.js";

@Controller("public")
@Public()
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get("conversations/:slug")
  getShare(@Param() param: SlugParamDto) {
    return this.publicService.getShare(param.slug);
  }
}

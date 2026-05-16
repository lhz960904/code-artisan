import { Module } from "@nestjs/common";
import { MessageRepository } from "./message.repository.js";

// Scaffold-only module: repo lives here so cross-module consumers (e.g. public)
// can read the messages table now; controller/service land when the /message
// route migrates.
@Module({
  providers: [MessageRepository],
  exports: [MessageRepository],
})
export class MessageModule {}

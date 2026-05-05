import { config } from "dotenv";
config({ path: "../../.env" });

if (!process.env.INTEGRATION_SECRET_KEY) {
  process.env.INTEGRATION_SECRET_KEY = Buffer.alloc(32, 1).toString("base64");
}

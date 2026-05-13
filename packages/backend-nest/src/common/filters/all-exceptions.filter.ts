import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

interface ErrorBody {
  statusCode: number;
  message: string;
  code?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = { statusCode: status, message: "Internal server error" };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      const payload = typeof res === "string" ? { message: res } : (res as Record<string, unknown>);
      body = {
        statusCode: status,
        message: String(payload.message ?? exception.message),
        code: typeof payload.code === "string" ? payload.code : undefined,
      };
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled error on ${req.method} ${req.url}: ${exception.message}`, exception.stack);
    } else {
      this.logger.error(`Unhandled non-error thrown on ${req.method} ${req.url}: ${String(exception)}`);
    }

    void reply.status(status).send(body);
  }
}

import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { map, type Observable } from "rxjs";

interface SuccessEnvelope<T> {
  statusCode: number;
  data: T;
}

// Wraps controller return values into the shared envelope.
// `code` and `message` only show up on errors (or business-coded responses) — see AllExceptionsFilter.
@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<T, SuccessEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessEnvelope<T>> {
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    return next.handle().pipe(
      map((data) => ({
        statusCode: reply.statusCode,
        data,
      })),
    );
  }
}

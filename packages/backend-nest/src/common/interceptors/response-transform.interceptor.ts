import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { map, type Observable } from "rxjs";

interface SuccessEnvelope<T> {
  statusCode: number;
  code: string;
  message: string;
  data: T;
}

// Wraps every controller return value into the shared { statusCode, code, message, data } envelope.
// Errors are handled by AllExceptionsFilter; the two together guarantee one stable shape on the wire.
@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<T, SuccessEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessEnvelope<T>> {
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    return next.handle().pipe(
      map((data) => ({
        statusCode: reply.statusCode,
        code: "OK",
        message: "OK",
        data,
      })),
    );
  }
}

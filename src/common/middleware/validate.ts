import { Request, Response, NextFunction } from "express";
import { ZodTypeAny, ZodError } from "zod";
import { ValidationError } from "../errors/app-error.js";

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: ValidationSchemas) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = (await schemas.query.parseAsync(req.query)) as typeof req.query;
      }
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as typeof req.params;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        }));
        next(new ValidationError("Request validation failed", details));
        return;
      }
      next(error);
    }
  };
}

export function validateBody(schema: ZodTypeAny) {
  return validate({ body: schema });
}

export function validateQuery(schema: ZodTypeAny) {
  return validate({ query: schema });
}

export function validateParams(schema: ZodTypeAny) {
  return validate({ params: schema });
}

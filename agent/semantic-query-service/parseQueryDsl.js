import { SemanticQueryValidationError } from "./errors.js";

export function parseQueryDsl(input) {
  if (input == null) {
    throw new SemanticQueryValidationError("El query DSL no puede ser nulo.");
  }

  if (typeof input === "object" && !Array.isArray(input)) {
    return input;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new SemanticQueryValidationError("El query DSL no puede ser vacio.");
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
        throw new SemanticQueryValidationError("El query DSL JSON debe ser un objeto.");
      }
      return parsed;
    } catch (error) {
      if (error instanceof SemanticQueryValidationError) throw error;
      throw new SemanticQueryValidationError("El query DSL no es JSON valido.", {
        cause: String(error?.message || error),
      });
    }
  }

  throw new SemanticQueryValidationError("Formato de query DSL no soportado.");
}


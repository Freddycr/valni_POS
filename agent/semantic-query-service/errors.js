export class SemanticQueryError extends Error {
  constructor(message, code = "SEMANTIC_QUERY_ERROR", details = null) {
    super(message);
    this.name = "SemanticQueryError";
    this.code = code;
    this.details = details;
  }
}

export class SemanticQueryValidationError extends SemanticQueryError {
  constructor(message, details = null) {
    super(message, "SEMANTIC_QUERY_VALIDATION_ERROR", details);
    this.name = "SemanticQueryValidationError";
  }
}

export class SemanticQueryExecutionError extends SemanticQueryError {
  constructor(message, details = null) {
    super(message, "SEMANTIC_QUERY_EXECUTION_ERROR", details);
    this.name = "SemanticQueryExecutionError";
  }
}


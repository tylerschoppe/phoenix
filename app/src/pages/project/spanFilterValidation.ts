/**
 * Client-side span filter validation based on the SpanFilter DSL syntax.
 * This prevents invalid queries from being sent to the backend while typing.
 */

export interface FilterValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Valid field names that can be used in span filters
 */
const VALID_FIELDS = new Set([
  // String fields
  'span_id', 'trace_id', 'context.span_id', 'context.trace_id', 
  'parent_id', 'span_kind', 'name', 'status_code', 'status_message',
  
  // Numeric fields  
  'latency_ms', 'cumulative_llm_token_count_completion', 
  'cumulative_llm_token_count_prompt', 'cumulative_llm_token_count_total',
  
  // Legacy compatibility
  'cumulative_token_count.completion', 'cumulative_token_count.prompt', 
  'cumulative_token_count.total',
  
  // Time fields
  'start_time', 'end_time',
  
  // Special fields
  'attributes', 'metadata', 'annotations', 'evals', 'events'
]);

/**
 * Valid operators for comparisons
 */
const COMPARISON_OPERATORS = ['==', '!=', '>=', '<=', '>', '<'];
const LOGICAL_OPERATORS = ['and', 'or', 'not'];
const MEMBERSHIP_OPERATORS = ['in', 'not in'];

/**
 * Validates basic syntax of a span filter condition
 */
export function validateSpanFilter(filter: string): FilterValidationResult {
  // Empty filter is always valid
  const trimmed = filter.trim();
  if (!trimmed) {
    return { isValid: true };
  }

  try {
    // Check for balanced parentheses
    const parenthesesCheck = checkBalancedParentheses(trimmed);
    if (!parenthesesCheck.isValid) {
      return parenthesesCheck;
    }

    // Check for balanced quotes
    const quotesCheck = checkBalancedQuotes(trimmed);
    if (!quotesCheck.isValid) {
      return quotesCheck;
    }

    // Check for incomplete expressions at the end
    const incompleteCheck = checkIncompleteExpression(trimmed);
    if (!incompleteCheck.isValid) {
      return incompleteCheck;
    }

    // Check for basic structure (must have operators or known patterns)
    const structureCheck = checkBasicStructure(trimmed);
    if (!structureCheck.isValid) {
      return structureCheck;
    }

    // Check for common syntax errors
    const syntaxCheck = checkCommonSyntaxErrors(trimmed);
    if (!syntaxCheck.isValid) {
      return syntaxCheck;
    }

    return { isValid: true };
  } catch (error) {
    return { 
      isValid: false, 
      errorMessage: 'Invalid syntax' 
    };
  }
}

/**
 * Check if parentheses are balanced
 */
function checkBalancedParentheses(filter: string): FilterValidationResult {
  let count = 0;
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < filter.length; i++) {
    const char = filter[i];
    const prevChar = i > 0 ? filter[i - 1] : '';
    
    // Handle quotes
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      }
    }
    
    // Only count parentheses outside quotes
    if (!inQuotes) {
      if (char === '(') count++;
      if (char === ')') count--;
      if (count < 0) {
        return { 
          isValid: false, 
          errorMessage: 'Unexpected closing parenthesis' 
        };
      }
    }
  }

  if (count > 0) {
    return { 
      isValid: false, 
      errorMessage: 'Unclosed parenthesis' 
    };
  }

  return { isValid: true };
}

/**
 * Check if quotes are balanced
 */
function checkBalancedQuotes(filter: string): FilterValidationResult {
  let singleQuoteCount = 0;
  let doubleQuoteCount = 0;

  for (let i = 0; i < filter.length; i++) {
    const char = filter[i];
    const prevChar = i > 0 ? filter[i - 1] : '';
    
    if (char === "'" && prevChar !== '\\') singleQuoteCount++;
    if (char === '"' && prevChar !== '\\') doubleQuoteCount++;
  }

  if (singleQuoteCount % 2 !== 0) {
    return { 
      isValid: false, 
      errorMessage: 'Unclosed single quote' 
    };
  }

  if (doubleQuoteCount % 2 !== 0) {
    return { 
      isValid: false, 
      errorMessage: 'Unclosed double quote' 
    };
  }

  return { isValid: true };
}

/**
 * Check for incomplete expressions (ending with operators)
 */
function checkIncompleteExpression(filter: string): FilterValidationResult {
  // Remove trailing whitespace for this check
  const trimmed = filter.replace(/\s+$/, '');
  
  // Check if ends with comparison operators  
  for (const op of COMPARISON_OPERATORS) {
    const escapedOp = op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\s*${escapedOp}\\s*$`);
    if (pattern.test(trimmed)) {
      return { 
        isValid: false, 
        errorMessage: `Incomplete comparison - ends with '${op}'` 
      };
    }
  }

  // Check if ends with logical operators
  if (/\s+(and|or)\s*$/i.test(trimmed)) {
    return { 
      isValid: false, 
      errorMessage: 'Incomplete logical expression' 
    };
  }

  // Check if ends with 'not' by itself
  if (/\s+not\s*$/i.test(trimmed)) {
    return { 
      isValid: false, 
      errorMessage: 'Incomplete negation expression' 
    };
  }

  // Check if ends with 'in' or 'not in'
  if (/\s+(not\s+)?in\s*$/i.test(trimmed)) {
    return { 
      isValid: false, 
      errorMessage: 'Incomplete membership expression' 
    };
  }

  return { isValid: true };
}

/**
 * Check for basic structure - must contain operators or known patterns
 */
function checkBasicStructure(filter: string): FilterValidationResult {
  // Single character filters are always incomplete
  if (filter.length <= 2) {
    return { 
      isValid: false, 
      errorMessage: 'Expression too short' 
    };
  }

  // Must contain some form of operator or known patterns
  const hasComparisonOperator = COMPARISON_OPERATORS.some(op => filter.includes(op));
  const hasLogicalOperator = LOGICAL_OPERATORS.some(op => 
    new RegExp(`\\b${op}\\b`, 'i').test(filter)
  );
  const hasMembershipOperator = /\bin\b/i.test(filter);
  const hasAttributeAccess = /attributes\s*\[|metadata\s*\[/.test(filter);
  const hasAnnotationAccess = /(annotations|evals)\s*\[/.test(filter);
  
  // Special case: single words that might be field names are probably incomplete
  if (/^\w+$/.test(filter.trim())) {
    return { 
      isValid: false, 
      errorMessage: 'Incomplete expression - missing comparison' 
    };
  }
  
  if (!hasComparisonOperator && !hasLogicalOperator && !hasMembershipOperator && 
      !hasAttributeAccess && !hasAnnotationAccess) {
    return { 
      isValid: false, 
      errorMessage: 'Missing operators or field access' 
    };
  }

  return { isValid: true };
}

/**
 * Check for common syntax errors
 */
function checkCommonSyntaxErrors(filter: string): FilterValidationResult {
  // Check for invalid operators (JavaScript style operators not supported)
  if (/===|!==|\|\||&&/.test(filter)) {
    return { 
      isValid: false, 
      errorMessage: 'Invalid operator - use ==, !=, and, or instead' 
    };
  }

  // Check for malformed attribute/metadata access
  if (/(attributes|metadata)\s*\[\s*\]/.test(filter)) {
    return { 
      isValid: false, 
      errorMessage: 'Empty brackets in field access' 
    };
  }

  // Check for malformed annotation access
  if (/(annotations|evals)\s*\[\s*\]/.test(filter)) {
    return { 
      isValid: false, 
      errorMessage: 'Empty brackets in annotation access' 
    };
  }

  // Check for multiple consecutive operators
  if (/==\s*==|!=\s*!=|>=\s*>=|<=\s*<=|>\s*>|<\s*</.test(filter)) {
    return { 
      isValid: false, 
      errorMessage: 'Duplicate operators' 
    };
  }

  // Check for mixed quote types in the same string
  const stringLiterals = filter.match(/(["'][^"']*["'])/g) || [];
  for (const literal of stringLiterals) {
    if ((literal.startsWith('"') && literal.endsWith("'")) ||
        (literal.startsWith("'") && literal.endsWith('"'))) {
      return { 
        isValid: false, 
        errorMessage: 'Mixed quote types in string literal' 
      };
    }
  }

  return { isValid: true };
}

/**
 * Checks if a filter is likely complete enough to execute
 * More lenient than full validation - allows some incomplete but non-error states
 */
export function isFilterExecutable(filter: string): boolean {
  const trimmed = filter.trim();
  if (!trimmed) return true; // Empty is executable
  
  const validation = validateSpanFilter(trimmed);
  return validation.isValid;
}
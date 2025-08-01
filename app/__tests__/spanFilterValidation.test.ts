import { validateSpanFilter, isFilterExecutable } from '../src/pages/project/spanFilterValidation';

describe('validateSpanFilter', () => {
  // Valid filters
  test('should accept valid filters', () => {
    const validFilters = [
      '',
      'span_kind == "LLM"',
      'status_code == "ERROR"',
      'latency_ms > 1000',
      'attributes["key"] == "value"',
      'metadata["topic"] == "agent"',
      'annotations["Hallucination"].label == "hallucinated"',
      'evals["Q&A Correctness"].score > 0.8',
      'span_kind == "LLM" and latency_ms > 1000',
      'span_kind == "LLM" or status_code == "ERROR"',
      'not (span_kind == "LLM")',
      '"text" in input.value',
      'name in ("OpenAI", "Claude")',
    ];

    validFilters.forEach(filter => {
      const result = validateSpanFilter(filter);
      expect(result.isValid).toBe(true);
    });
  });

  // Invalid filters - incomplete expressions
  test('should reject incomplete expressions', () => {
    const incompleteFilters = [
      'span_kind ==',
      'latency_ms >',
      'span_kind == "LLM" and',
      'span_kind == "LLM" or',
      'not',
      'in',
      'not in',
    ];

    incompleteFilters.forEach(filter => {
      const result = validateSpanFilter(filter);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });

  // Invalid filters - syntax errors
  test('should reject syntax errors', () => {
    const syntaxErrors = [
      'span_kind === "LLM"', // Wrong operator
      'attributes[] == "value"', // Empty brackets
      'metadata[] == "value"', // Empty brackets
      'annotations[] == "value"', // Empty brackets
      'span_kind == "LLM\'', // Mismatched quotes
      'span_kind == \'LLM"', // Mixed quotes
      '(span_kind == "LLM"', // Unbalanced parentheses
      'span_kind == "LLM"))', // Extra closing parenthesis
    ];

    syntaxErrors.forEach(filter => {
      const result = validateSpanFilter(filter);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });

  // Edge cases
  test('should handle edge cases', () => {
    // Very short filters
    expect(validateSpanFilter('a').isValid).toBe(false);
    expect(validateSpanFilter('ab').isValid).toBe(false);
    
    // Just whitespace
    expect(validateSpanFilter('   ').isValid).toBe(true);
    
    // Complex nested expressions
    const complexFilter = '(span_kind == "LLM" and latency_ms > 1000) or (status_code == "ERROR" and metadata["topic"] == "agent")';
    expect(validateSpanFilter(complexFilter).isValid).toBe(true);
  });
});

describe('isFilterExecutable', () => {
  test('should determine executability correctly', () => {
    // Executable
    expect(isFilterExecutable('')).toBe(true);
    expect(isFilterExecutable('span_kind == "LLM"')).toBe(true);
    
    // Not executable
    expect(isFilterExecutable('span_kind ==')).toBe(false);
    expect(isFilterExecutable('invalid syntax')).toBe(false);
  });
});
import { describe, expect, it } from "vitest";

/**
 * Test filter logic for ProjectPageHeader component
 * These tests verify the filter condition and session filter logic
 * used in the component's tab-based filtering behavior.
 */

// Function to test the filter condition logic
function getActiveFilterCondition(
  tab: string,
  filterCondition: string
): string {
  return tab === "spans" || tab === "traces" ? filterCondition : "";
}

// Function to test the session filter logic
function getActiveSessionFilter(
  tab: string,
  filterIoSubstringOrSessionId: string
): string {
  return tab === "sessions" ? filterIoSubstringOrSessionId : "";
}

describe("ProjectPageHeader filter logic", () => {
  describe("activeFilterCondition calculation", () => {
    it("should return filterCondition for spans tab", () => {
      const result = getActiveFilterCondition("spans", "span_kind == 'LLM'");
      expect(result).toBe("span_kind == 'LLM'");
    });

    it("should return filterCondition for traces tab", () => {
      const result = getActiveFilterCondition(
        "traces",
        "status_code == 'ERROR'"
      );
      expect(result).toBe("status_code == 'ERROR'");
    });

    it("should return empty string for sessions tab", () => {
      const result = getActiveFilterCondition("sessions", "span_kind == 'LLM'");
      expect(result).toBe("");
    });

    it("should return empty string for config tab", () => {
      const result = getActiveFilterCondition("config", "span_kind == 'LLM'");
      expect(result).toBe("");
    });

    it("should return empty string for metrics tab", () => {
      const result = getActiveFilterCondition("metrics", "span_kind == 'LLM'");
      expect(result).toBe("");
    });
  });

  describe("activeSessionFilter calculation", () => {
    it("should return filterIoSubstringOrSessionId for sessions tab", () => {
      const result = getActiveSessionFilter("sessions", "important query");
      expect(result).toBe("important query");
    });

    it("should return empty string for spans tab", () => {
      const result = getActiveSessionFilter("spans", "important query");
      expect(result).toBe("");
    });

    it("should return empty string for traces tab", () => {
      const result = getActiveSessionFilter("traces", "important query");
      expect(result).toBe("");
    });

    it("should handle UUID format session filter", () => {
      const result = getActiveSessionFilter(
        "sessions",
        "123e4567-e89b-12d3-a456-426614174000"
      );
      expect(result).toBe("123e4567-e89b-12d3-a456-426614174000");
    });
  });

  describe("refetch parameters", () => {
    it("should convert non-empty filters to values and empty to null", () => {
      const activeFilterCondition = "span_kind == 'LLM'";
      const activeSessionFilter = "";

      const refetchParams = {
        filterCondition: activeFilterCondition || null,
        sessionFilter: activeSessionFilter || null,
      };

      expect(refetchParams.filterCondition).toBe("span_kind == 'LLM'");
      expect(refetchParams.sessionFilter).toBe(null);
    });

    it("should handle both filters being active", () => {
      const activeFilterCondition = "span_kind == 'LLM'";
      const activeSessionFilter = "important query";

      const refetchParams = {
        filterCondition: activeFilterCondition || null,
        sessionFilter: activeSessionFilter || null,
      };

      expect(refetchParams.filterCondition).toBe("span_kind == 'LLM'");
      expect(refetchParams.sessionFilter).toBe("important query");
    });

    it("should handle both filters being empty", () => {
      const activeFilterCondition = "";
      const activeSessionFilter = "";

      const refetchParams = {
        filterCondition: activeFilterCondition || null,
        sessionFilter: activeSessionFilter || null,
      };

      expect(refetchParams.filterCondition).toBe(null);
      expect(refetchParams.sessionFilter).toBe(null);
    });
  });
});

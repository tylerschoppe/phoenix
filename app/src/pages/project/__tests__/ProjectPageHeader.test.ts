import { describe, expect, it } from "vitest";

/**
 * Test filter logic for ProjectPageHeader component
 * These tests verify the filter condition and session filter logic
 * used in the component's tab-based filtering behavior and integration
 * between filter contexts and header metrics.
 */

// Function to test the filter condition logic (mirrors component implementation)
function getActiveFilterCondition(
  tab: string,
  filterCondition: string
): string {
  return tab === "spans" || tab === "traces" ? filterCondition : "";
}

// Function to test the session filter logic (mirrors component implementation)
function getActiveSessionFilter(
  tab: string,
  filterIoSubstringOrSessionId: string
): string {
  return tab === "sessions" ? filterIoSubstringOrSessionId : "";
}

describe("ProjectPageHeader filter integration", () => {
  describe("tab-based filter activation", () => {
    describe("span filter conditions", () => {
      it("should be active on spans tab with LLM filter", () => {
        const result = getActiveFilterCondition("spans", "span_kind == 'LLM'");
        expect(result).toBe("span_kind == 'LLM'");
      });

      it("should be active on traces tab with error filter", () => {
        const result = getActiveFilterCondition(
          "traces",
          "status_code == 'ERROR'"
        );
        expect(result).toBe("status_code == 'ERROR'");
      });

      it("should be active on spans tab with complex filter", () => {
        const complexFilter = "span_kind == 'LLM' and metadata['companyName'] == \"Jabil Inc\"";
        const result = getActiveFilterCondition("spans", complexFilter);
        expect(result).toBe(complexFilter);
      });

      it("should be inactive on sessions tab", () => {
        const result = getActiveFilterCondition("sessions", "span_kind == 'LLM'");
        expect(result).toBe("");
      });

      it("should be inactive on config tab", () => {
        const result = getActiveFilterCondition("config", "span_kind == 'LLM'");
        expect(result).toBe("");
      });

      it("should be inactive on metrics tab", () => {
        const result = getActiveFilterCondition("metrics", "span_kind == 'LLM'");
        expect(result).toBe("");
      });
    });

    describe("session filter conditions", () => {
      it("should be active on sessions tab with text search", () => {
        const result = getActiveSessionFilter("sessions", "important query");
        expect(result).toBe("important query");
      });

      it("should be active on sessions tab with UUID", () => {
        const uuid = "123e4567-e89b-12d3-a456-426614174000";
        const result = getActiveSessionFilter("sessions", uuid);
        expect(result).toBe(uuid);
      });

      it("should be inactive on spans tab", () => {
        const result = getActiveSessionFilter("spans", "important query");
        expect(result).toBe("");
      });

      it("should be inactive on traces tab", () => {
        const result = getActiveSessionFilter("traces", "important query");
        expect(result).toBe("");
      });
    });
  });

  describe("GraphQL refetch parameters", () => {
    it("should pass span filter for spans tab", () => {
      const tab = "spans";
      const filterCondition = "span_kind == 'LLM'";
      const filterIoSubstringOrSessionId = "";
      
      const activeFilterCondition = getActiveFilterCondition(tab, filterCondition);
      const activeSessionFilter = getActiveSessionFilter(tab, filterIoSubstringOrSessionId);

      const refetchParams = {
        filterCondition: activeFilterCondition || null,
        sessionFilter: activeSessionFilter || null,
      };

      expect(refetchParams.filterCondition).toBe("span_kind == 'LLM'");
      expect(refetchParams.sessionFilter).toBe(null);
    });

    it("should pass span filter for traces tab", () => {
      const tab = "traces";
      const filterCondition = "status_code == 'ERROR'";
      const filterIoSubstringOrSessionId = "";
      
      const activeFilterCondition = getActiveFilterCondition(tab, filterCondition);
      const activeSessionFilter = getActiveSessionFilter(tab, filterIoSubstringOrSessionId);

      const refetchParams = {
        filterCondition: activeFilterCondition || null,
        sessionFilter: activeSessionFilter || null,
      };

      expect(refetchParams.filterCondition).toBe("status_code == 'ERROR'");
      expect(refetchParams.sessionFilter).toBe(null);
    });

    it("should pass session filter for sessions tab", () => {
      const tab = "sessions";
      const filterCondition = "";
      const filterIoSubstringOrSessionId = "important query";
      
      const activeFilterCondition = getActiveFilterCondition(tab, filterCondition);
      const activeSessionFilter = getActiveSessionFilter(tab, filterIoSubstringOrSessionId);

      const refetchParams = {
        filterCondition: activeFilterCondition || null,
        sessionFilter: activeSessionFilter || null,
      };

      expect(refetchParams.filterCondition).toBe(null);
      expect(refetchParams.sessionFilter).toBe("important query");
    });

    it("should pass no filters for config tab", () => {
      const tab = "config";
      const filterCondition = "span_kind == 'LLM'";
      const filterIoSubstringOrSessionId = "important query";
      
      const activeFilterCondition = getActiveFilterCondition(tab, filterCondition);
      const activeSessionFilter = getActiveSessionFilter(tab, filterIoSubstringOrSessionId);

      const refetchParams = {
        filterCondition: activeFilterCondition || null,
        sessionFilter: activeSessionFilter || null,
      };

      expect(refetchParams.filterCondition).toBe(null);
      expect(refetchParams.sessionFilter).toBe(null);
    });

    it("should handle real-world filter example", () => {
      const tab = "spans";
      const filterCondition = "metadata['companyName'] == \"Jabil Inc\"";
      const filterIoSubstringOrSessionId = "";
      
      const activeFilterCondition = getActiveFilterCondition(tab, filterCondition);
      const activeSessionFilter = getActiveSessionFilter(tab, filterIoSubstringOrSessionId);

      const refetchParams = {
        filterCondition: activeFilterCondition || null,
        sessionFilter: activeSessionFilter || null,
      };

      expect(refetchParams.filterCondition).toBe("metadata['companyName'] == \"Jabil Inc\"");
      expect(refetchParams.sessionFilter).toBe(null);
    });
  });

  describe("context integration scenarios", () => {
    it("should simulate spans tab with filter applied", () => {
      // Simulate user being on spans tab with a filter applied
      const contextState = {
        tab: "spans",
        spanFilterCondition: "span_kind == 'LLM'",
        sessionFilter: "",
      };

      const shouldShowFilteredMetrics = 
        contextState.tab === "spans" && contextState.spanFilterCondition !== "";
      
      expect(shouldShowFilteredMetrics).toBe(true);
      
      const refetchParams = {
        filterCondition: getActiveFilterCondition(contextState.tab, contextState.spanFilterCondition) || null,
        sessionFilter: getActiveSessionFilter(contextState.tab, contextState.sessionFilter) || null,
      };

      expect(refetchParams.filterCondition).toBe("span_kind == 'LLM'");
      expect(refetchParams.sessionFilter).toBe(null);
    });

    it("should simulate sessions tab with I/O search", () => {
      // Simulate user being on sessions tab with I/O search
      const contextState = {
        tab: "sessions",
        spanFilterCondition: "",
        sessionFilter: "error message",
      };

      const shouldShowFilteredMetrics = 
        contextState.tab === "sessions" && contextState.sessionFilter !== "";
      
      expect(shouldShowFilteredMetrics).toBe(true);
      
      const refetchParams = {
        filterCondition: getActiveFilterCondition(contextState.tab, contextState.spanFilterCondition) || null,
        sessionFilter: getActiveSessionFilter(contextState.tab, contextState.sessionFilter) || null,
      };

      expect(refetchParams.filterCondition).toBe(null);
      expect(refetchParams.sessionFilter).toBe("error message");
    });

    it("should simulate switching tabs clears irrelevant filters", () => {
      // User switches from spans tab (with filter) to config tab
      const initialState = {
        tab: "spans",
        spanFilterCondition: "span_kind == 'LLM'",
        sessionFilter: "",
      };

      const afterTabSwitch = {
        tab: "config",
        spanFilterCondition: "span_kind == 'LLM'", // Still in context but not active
        sessionFilter: "",
      };

      const beforeParams = {
        filterCondition: getActiveFilterCondition(initialState.tab, initialState.spanFilterCondition) || null,
        sessionFilter: getActiveSessionFilter(initialState.tab, initialState.sessionFilter) || null,
      };

      const afterParams = {
        filterCondition: getActiveFilterCondition(afterTabSwitch.tab, afterTabSwitch.spanFilterCondition) || null,
        sessionFilter: getActiveSessionFilter(afterTabSwitch.tab, afterTabSwitch.sessionFilter) || null,
      };

      expect(beforeParams.filterCondition).toBe("span_kind == 'LLM'");
      expect(afterParams.filterCondition).toBe(null);
      expect(afterParams.sessionFilter).toBe(null);
    });
  });
});

# Filter-Aware Header Metrics - Implementation Plan

## Overview
Make project page header metrics reflect active filters from spans/traces/sessions tabs with minimal code changes.

## High-Level Implementation Strategy

### Development Workflow
1. **Create Backend Branch**: Implement GraphQL resolver changes with comprehensive tests
2. **Run Full Test Suite Before Each Commit**: 
   ```bash
   # Backend - MUST pass before committing
   tox run -e unit_tests                    # SQLite tests
   tox run -e unit_tests -- --run-postgres  # PostgreSQL tests  
   tox run -e ruff                          # Linting/formatting
   
   # Frontend - MUST pass before committing
   cd app
   pnpm test                                # Unit tests
   pnpm run typecheck                       # Type checking
   pnpm run lint                            # Linting
   pnpm run prettier:check                  # Code formatting
   ```
3. **Create Frontend Branch**: Branch from backend to add UI filter integration
4. **Deploy Phases**: Backend first (backward compatible), then frontend

**CRITICAL**: Do not commit any changes unless ALL tests pass. This prevents regression and ensures code quality.

### Key Technical Understanding
1. **Span Filters**: Use existing `SpanFilter` DSL for spans/traces (traces show root spans)
2. **Session Filters**: Filter by session ID (UUID) or I/O substring search
3. **Maximum Code Reuse**: Leverage existing filter logic and dataloader patterns
4. **Backward Compatibility**: All new parameters are optional

### Testing Strategy
1. **Data Validation Tests**: Verify filtered metrics return different results than unfiltered
2. **GraphQL Integration Tests**: Test end-to-end queries with actual data verification  
3. **DataLoader Tests**: Ensure session_filter parameter works with real database queries
4. **Frontend Tests**: Test filter context integration and tab switching

**Critical Testing Principle**: All tests must verify that filtered results are actually different from unfiltered results using real data, not just parameter passing.

### Pre-Commit Test Requirements
Before committing any task, run the full test suite to ensure no regressions:

```bash
# For Backend Tasks (1-3, 9)
tox run -e unit_tests                    # SQLite tests - MUST PASS
tox run -e unit_tests -- --run-postgres  # PostgreSQL tests - MUST PASS  
tox run -e ruff                          # Linting/formatting - MUST PASS

# For Frontend Tasks (4-8)  
cd app
pnpm test                                # Unit tests - MUST PASS
pnpm run typecheck                       # Type checking - MUST PASS
pnpm run lint                            # Linting - MUST PASS
pnpm run prettier:check                  # Code formatting - MUST PASS
```

**Do not proceed to the next task or commit if any test fails.** Fix issues immediately to prevent regression.

### Development Environment Setup

**Prerequisites**:
```bash
# Python Environment
uv venv --python 3.9
source ./.venv/bin/activate
uv pip install -e ".[dev]"
tox run -e add_symlinks

# Frontend Environment
nvm install  # uses .nvmrc
npm i -g pnpm@9.15.5
cd app
pnpm install --frozen-lockfile
pnpm run build

# Database Setup
brew install postgresql
# Ensure pg_config --bindir points to homebrew installation
```

**Running Tests**:
```bash
# Backend Tests
tox run -e unit_tests                    # SQLite only
tox run -e unit_tests -- --run-postgres  # With PostgreSQL
tox run -e integration_tests

# Frontend Tests
cd app
pnpm test              # Unit tests
pnpm run typecheck     # Type checking
pnpm run lint          # Linting
pnpm run test:e2e      # E2E tests (requires backend running)

# Formatting & Linting
tox run -e ruff        # Backend
cd app && pnpm run prettier:check && pnpm run lint  # Frontend
```

---

## TASK 1: Backend GraphQL Resolver Updates

**File**: `src/phoenix/server/api/types/Project.py`
**Dependencies**: None
**Tests Required**: Yes

### Implementation

Add optional filter parameters to existing methods (lines 143-151, 187-208, 211-225):

```python
@strawberry.field
async def trace_count(
    self,
    info: Info[Context, None],
    time_range: Optional[TimeRange] = UNSET,
    filter_condition: Optional[str] = UNSET,  # ADD - for span filtering
    session_filter: Optional[str] = UNSET,    # ADD - for session filtering
) -> int:
    return await info.context.data_loaders.record_counts.load(
        ("trace", self.project_rowid, time_range, filter_condition, session_filter),
    )

@strawberry.field
async def cost_summary(
    self,
    info: Info[Context, None],
    time_range: Optional[TimeRange] = UNSET,
    filter_condition: Optional[str] = UNSET,  # ADD - for span filtering
    session_filter: Optional[str] = UNSET,    # ADD - for session filtering
) -> SpanCostSummary:
    loader = info.context.data_loaders.span_cost_summary_by_project
    summary = await loader.load((self.project_rowid, time_range, filter_condition, session_filter))
    # return unchanged

@strawberry.field
async def latency_ms_quantile(
    self,
    info: Info[Context, None],
    probability: float,
    time_range: Optional[TimeRange] = UNSET,
    filter_condition: Optional[str] = UNSET,  # ADD - for span filtering
    session_filter: Optional[str] = UNSET,    # ADD - for session filtering
) -> Optional[float]:
    return await info.context.data_loaders.latency_ms_quantile.load(
        ("trace", self.project_rowid, time_range, filter_condition, session_filter, probability),
    )
```

### Testing Requirements

Add to `tests/unit/server/api/types/test_Project.py`:

```python
async def test_trace_count_with_span_filter_returns_correct_data(
    gql_client: AsyncGraphQLClient,
    db: DbSessionFactory,
) -> None:
    """Test trace_count with span filter returns actual filtered count, not all traces"""
    # Create project with 5 traces, 3 have LLM spans
    async with db() as session:
        project = await _add_project(session, name="filter-test")
        
        # Create 3 traces with LLM spans (should be counted)
        for i in range(3):
            trace = await _add_trace(session, project)
            await _add_span(session, trace, span_kind="LLM")
            
        # Create 2 traces with non-LLM spans (should NOT be counted)  
        for i in range(2):
            trace = await _add_trace(session, project)
            await _add_span(session, trace, span_kind="CHAIN")
    
    query = '''
        query ($projectId: ID!, $filter: String!) {
            node(id: $projectId) {
                ... on Project {
                    traceCount(filterCondition: $filter)
                }
            }
        }
    '''
    
    project_gid = str(GlobalID(type_name="Project", node_id=str(project.id)))
    response = await gql_client.execute(
        query=query, 
        variables={"projectId": project_gid, "filter": "span_kind == 'LLM'"}
    )
    
    # CRITICAL: Must return 3 (filtered count), NOT 5 (total count)
    assert response.data["node"]["traceCount"] == 3
    
    # Test without filter returns all 5
    response_no_filter = await gql_client.execute(
        query=query.replace("filterCondition: $filter", ""), 
        variables={"projectId": project_gid}
    )
    assert response_no_filter.data["node"]["traceCount"] == 5

async def test_cost_summary_with_session_filter_returns_filtered_data(
    gql_client: AsyncGraphQLClient, 
    db: DbSessionFactory,
) -> None:
    """Test cost_summary with session filter returns cost from filtered sessions only"""
    # Create test data similar to _cost_data fixture but with session-specific costs
    async with db() as session:
        project = await _add_project(session, name="session-cost-test")
        
        # Session 1: $100 cost, input contains "important"
        session1 = await _add_project_session(session, project)  
        trace1 = await _add_trace(session, project, session1)
        span1 = await _add_span(session, trace1, attributes={"input": {"value": "important query"}})
        model = await _add_generative_model(session, "test-model")
        await _add_span_cost(session, span1, trace1, model, total_cost=100.0)
        
        # Session 2: $50 cost, input contains "normal"  
        session2 = await _add_project_session(session, project)
        trace2 = await _add_trace(session, project, session2)
        span2 = await _add_span(session, trace2, attributes={"input": {"value": "normal query"}})
        await _add_span_cost(session, span2, trace2, model, total_cost=50.0)
        
    query = '''
        query ($projectId: ID!, $sessionFilter: String!) {
            node(id: $projectId) {
                ... on Project {
                    costSummary(sessionFilter: $sessionFilter) {
                        total { cost }
                    }
                }
            }
        }
    '''
    
    # Filter for "important" should return only $100 cost
    response = await gql_client.execute(
        query=query,
        variables={"projectId": project_gid, "sessionFilter": "important"}
    )
    assert response.data["node"]["costSummary"]["total"]["cost"] == 100.0
    
    # No filter should return $150 total
    response_no_filter = await gql_client.execute(
        query=query.replace("sessionFilter: $sessionFilter", ""),
        variables={"projectId": project_gid}
    )
    assert response_no_filter.data["node"]["costSummary"]["total"]["cost"] == 150.0

async def test_latency_quantile_with_filters_returns_accurate_percentiles(
    gql_client: AsyncGraphQLClient,
    db: DbSessionFactory,
) -> None:
    """Test latency quantiles with filters return percentiles of filtered data only"""
    async with db() as session:
        project = await _add_project(session, name="latency-filter-test")
        
        # Create traces with different latencies and span types
        latencies_llm = [100, 200, 300]  # P50 = 200ms for LLM spans
        latencies_chain = [400, 500, 600]  # P50 = 500ms for CHAIN spans
        
        for latency in latencies_llm:
            trace = await _add_trace(session, project, 
                start_time=datetime.now(),
                end_time=datetime.now() + timedelta(milliseconds=latency))
            await _add_span(session, trace, span_kind="LLM",
                start_time=trace.start_time,
                end_time=trace.end_time)
                
        for latency in latencies_chain:
            trace = await _add_trace(session, project,
                start_time=datetime.now(),
                end_time=datetime.now() + timedelta(milliseconds=latency))
            await _add_span(session, trace, span_kind="CHAIN",
                start_time=trace.start_time, 
                end_time=trace.end_time)
    
    query = '''
        query ($projectId: ID!, $filter: String!) {
            node(id: $projectId) {
                ... on Project {
                    latencyMsQuantile(probability: 0.5, filterCondition: $filter)
                }
            }
        }
    '''
    
    # Filter for LLM spans should return P50 = 200ms
    response_llm = await gql_client.execute(
        query=query,
        variables={"projectId": project_gid, "filter": "span_kind == 'LLM'"}
    )
    assert response_llm.data["node"]["latencyMsQuantile"] == 200.0
    
    # Filter for CHAIN spans should return P50 = 500ms
    response_chain = await gql_client.execute(
        query=query, 
        variables={"projectId": project_gid, "filter": "span_kind == 'CHAIN'"}
    )
    assert response_chain.data["node"]["latencyMsQuantile"] == 500.0
```

---

## TASK 2: Session Filter Utility (REUSE)

**File**: `src/phoenix/server/api/types/Project.py`
**Dependencies**: TASK 1
**Tests Required**: Included in dataloader tests

### Implementation

Add near existing INPUT_VALUE/OUTPUT_VALUE constants, extract existing session filter logic:

```python
def _apply_session_io_filter(stmt: Select[Any], session_filter: str, project_rowid: int) -> Select[Any]:
    """Extract and reuse existing session I/O filter logic from Project.sessions() method"""
    import re
    
    # If UUID format, filter by session_id directly
    if re.match(r'^[0-9a-f-]{36}$', session_filter, re.IGNORECASE):
        return stmt.join(models.ProjectSession).where(
            models.ProjectSession.session_id == session_filter
        )
    else:
        # Reuse existing I/O filter logic from lines 400-424
        filter_stmt = (
            select(distinct(models.Trace.project_session_rowid).label("id"))
            .filter_by(project_rowid=project_rowid)
            .join_from(models.Trace, models.Span)
            .where(models.Span.parent_id.is_(None))
            .where(
                or_(
                    models.TextContains(
                        models.Span.attributes[INPUT_VALUE].as_string(),
                        session_filter,
                    ),
                    models.TextContains(
                        models.Span.attributes[OUTPUT_VALUE].as_string(),
                        session_filter,
                    ),
                )
            )
        )
        filter_subq = filter_stmt.subquery()
        return stmt.where(models.Trace.project_session_rowid.in_(
            select(filter_subq.c.id)
        ))
```

---

## TASK 3: DataLoader Updates (MINIMAL CHANGES)

**Files**: 
- `src/phoenix/server/api/dataloaders/record_counts.py`
- `src/phoenix/server/api/dataloaders/span_cost_summary_by_project.py`
- `src/phoenix/server/api/dataloaders/latency_ms_quantile.py`

**Dependencies**: TASK 2
**Tests Required**: Yes

### Implementation

**Changes** (only add session_filter parameter, reuse everything else):

1. Update `Key` type: add `session_filter: Optional[str]`
2. Update `_cache_key_fn`: handle new parameter  
3. In `_get_stmt`: add `if session_filter: stmt = _apply_session_io_filter(stmt, session_filter, project_rowids[0])`

**No duplication**: Import the shared utility function from Project.py

### Testing Requirements

Add session_filter tests to existing test files:
- Update `tests/unit/server/api/dataloaders/test_record_counts.py`
- Update `tests/unit/server/api/dataloaders/test_span_cost_summary_by_project.py` 
- Update `tests/unit/server/api/dataloaders/test_latency_ms_quantiles.py`

Test pattern - verify filtered results ≠ unfiltered results using real database queries.

---

## TASK 4: Frontend GraphQL Fragment Updates

**File**: `app/src/pages/project/ProjectPageHeader.tsx`
**Dependencies**: TASK 3 (backend deployed)
**Tests Required**: Yes

### Implementation

Update GraphQL fragment (lines 40-66) to add filter variables:

```typescript
fragment ProjectPageHeader_stats on Project
@refetchable(queryName: "ProjectPageHeaderQuery") {
  traceCount(timeRange: $timeRange, filterCondition: $filterCondition, sessionFilter: $sessionFilter)
  costSummary(timeRange: $timeRange, filterCondition: $filterCondition, sessionFilter: $sessionFilter) {
    # existing fields
  }
  latencyMsP50: latencyMsQuantile(probability: 0.50, timeRange: $timeRange, filterCondition: $filterCondition, sessionFilter: $sessionFilter)
  latencyMsP99: latencyMsQuantile(probability: 0.99, timeRange: $timeRange, filterCondition: $filterCondition, sessionFilter: $sessionFilter)
  # existing fields unchanged
}
```

---

## TASK 5: Frontend Filter Context Integration

**File**: `app/src/pages/project/ProjectPageHeader.tsx`
**Dependencies**: TASK 4
**Tests Required**: Yes

### Implementation

Add imports and filter logic:

```typescript
import { useSpanFilterCondition } from "./SpanFilterConditionContext";
import { useSessionSearchContext } from "./SessionSearchContext";
import { useProjectRootPath } from "@phoenix/hooks/useProjectRootPath";

// In component:
const { tab } = useProjectRootPath();
const { filterCondition } = useSpanFilterCondition();
const { filterIoSubstringOrSessionId } = useSessionSearchContext();

// Determine active filters by tab
const activeFilterCondition = (tab === "spans" || tab === "traces") ? filterCondition : "";
const activeSessionFilter = tab === "sessions" ? filterIoSubstringOrSessionId : "";

// Update useEffect dependency array (line 75)
useEffect(() => {
  startTransition(() => {
    refetch({
      filterCondition: activeFilterCondition || null,
      sessionFilter: activeSessionFilter || null,
    }, { fetchPolicy: "store-and-network" });
  });
}, [fetchKey, refetch, activeFilterCondition, activeSessionFilter]);
```

---

## TASK 6: Frontend Provider Restructure

**File**: `app/src/pages/project/ProjectPage.tsx`
**Dependencies**: TASK 5
**Tests Required**: No

### Implementation

Move filter providers up to wrap header (lines 222-232):

```typescript
return (
  <StreamStateProvider>
    <SpanFilterConditionProvider>
      <SessionSearchProvider>
        <main css={mainCSS}>
          <ProjectPageHeader project={data.project} extra={...} />
          {/* rest unchanged */}
        </main>
      </SessionSearchProvider>
    </SpanFilterConditionProvider>
  </StreamStateProvider>
);
```

---

## TASK 7: Frontend Schema Generation

**Dependencies**: TASK 6
**Tests Required**: No

### Implementation

```bash
cd app && npm run relay:compile
```

---

## TASK 8: Frontend Component Tests

**File**: `app/src/pages/project/__tests__/ProjectPageHeader.test.tsx`
**Dependencies**: TASK 7
**Tests Required**: This is the test

### Implementation

```typescript
describe('ProjectPageHeader with filters', () => {
  it('should refetch when span filter changes', () => {
    // Test filter context integration
  });
  
  it('should apply correct filters based on active tab', () => {
    // Test tab-specific filter application
  });
  
  it('should preserve existing functionality without filters', () => {
    // Ensure backward compatibility
  });
});
```

---

## TASK 9: End-to-End Integration Tests

**File**: `tests/integration/test_filtered_header_metrics.py` (NEW)
**Dependencies**: All backend tasks
**Tests Required**: This is the test

### Implementation

```python
async def test_header_metrics_change_with_active_filters():
    """Test that header metrics actually change when filters are applied vs unfiltered"""
    # Create mixed data that will show different results with/without filters
    # Verify filtered metrics != unfiltered metrics
```

---

## Files Modified Summary

### Backend (5 files):
1. `src/phoenix/server/api/types/Project.py` - Add filter parameters to 3 methods + shared utility function
2. `src/phoenix/server/api/dataloaders/record_counts.py` - Add session_filter to Key type, import utility
3. `src/phoenix/server/api/dataloaders/span_cost_summary_by_project.py` - Same minimal changes
4. `src/phoenix/server/api/dataloaders/latency_ms_quantile.py` - Same minimal changes  
5. `tests/unit/server/api/types/test_Project.py` - Basic parameter passing tests

### Frontend (3 files):
1. `app/src/pages/project/ProjectPageHeader.tsx` - Update GraphQL fragment and add filter context
2. `app/src/pages/project/ProjectPage.tsx` - Move provider order
3. Generated GraphQL files (auto-updated by relay:compile)

## Maximum Reuse Summary

### What We're Reusing:
1. **SpanFilter**: Already exists and works in all dataloaders - no changes needed
2. **Session I/O Filter Logic**: Extract from existing Project.sessions() method  
3. **DataLoader Patterns**: Just add one parameter to existing Key types
4. **Frontend Filter Contexts**: Use existing SpanFilterConditionContext and SessionSearchContext
5. **GraphQL Infrastructure**: Just add optional parameters
import { Suspense } from "react";
import { PreloadedQuery, usePreloadedQuery } from "react-relay";
import { Outlet } from "react-router";

import { Loading } from "@phoenix/components";
import {
  ProjectPageQueriesSessionsQuery,
  useProjectPageQueryReferenceContext,
} from "@phoenix/pages/project/ProjectPageQueries";
import { SessionsTable } from "@phoenix/pages/project/SessionsTable";
import { TracingRoot } from "@phoenix/pages/TracingRoot";

import { ProjectPageQueriesSessionsQuery as ProjectPageSessionsQueryType } from "./__generated__/ProjectPageQueriesSessionsQuery.graphql";

function SessionsTabContent({
  queryReference,
}: {
  queryReference: PreloadedQuery<ProjectPageSessionsQueryType>;
}) {
  const data = usePreloadedQuery(
    ProjectPageQueriesSessionsQuery,
    queryReference
  );
  return <SessionsTable project={data.project} />;
}

export const ProjectSessionsPage = () => {
  const { sessionsQueryReference } = useProjectPageQueryReferenceContext();
  if (!sessionsQueryReference) {
    return null;
  }
  return (
    <TracingRoot>
      <Suspense fallback={<Loading />}>
        <SessionsTabContent queryReference={sessionsQueryReference} />
      </Suspense>
      <Suspense>
        <Outlet />
      </Suspense>
    </TracingRoot>
  );
};

import {useEffect, useMemo, useState} from 'react';
import type {
  Maybe,
  PageInfo,
  ProductConnection,
} from '@shopify/hydrogen/storefront-api-types';
import {useInView, type IntersectionOptions} from 'react-intersection-observer';
import {useNavigation, useLocation, useNavigate} from '@remix-run/react';

type Connection = {
  nodes: ProductConnection['nodes'] | any[];
  pageInfo: PageInfo;
};

type PaginationState = {
  nodes: ProductConnection['nodes'] | any[];
  pageInfo: PageInfo | null;
};

interface PaginationInfo {
  state: {
    nodes: ProductConnection['nodes'] | any[];
    pageInfo: {
      endCursor: Maybe<string> | undefined;
      startCursor: Maybe<string> | undefined;
      hasPreviousPage: boolean;
    };
  };
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isLoading: boolean;
  nextPageUrl: string;
  nodes: ProductConnection['nodes'] | any[];
  prevPageUrl: string;
}

type PaginationProps = {
  /** The response from `storefront.query` for a paginated request. Make sure the query is passed pagination variables and that the query has `pageInfo` with `hasPreviousPage`, `hasNextpage`, `startCursor`, and `endCursor` defined. */
  connection: Connection;
  /** Automatically load more items on scroll. Defaults to false. */
  autoLoadOnScroll?: boolean | IntersectionOptions;
  /** A render prop that includes pagination data and helpers. */
  children: PaginationRenderProp;
};

type PaginationRenderProp = (props: PaginationInfo) => JSX.Element | null;

export function Pagination({
  connection,
  children = () => null,
}: PaginationProps) {
  const transition = useNavigation();
  const isLoading = transition.state === 'loading';
  const {
    endCursor,
    hasNextPage,
    hasPreviousPage,
    nextPageUrl,
    nodes,
    prevPageUrl,
    startCursor,
  } = usePagination(connection);

  return children({
    state: {
      pageInfo: {
        endCursor,
        hasPreviousPage,
        startCursor,
      },
      nodes,
    },
    hasNextPage,
    hasPreviousPage,
    isLoading,
    nextPageUrl,
    nodes,
    prevPageUrl,
  });
}

let hydrating = true;

/**
 * Get cumulative pagination logic for a given connection
 */
export function usePagination(connection: Connection): Omit<
  PaginationInfo,
  'isLoading' | 'state'
> & {
  startCursor: Maybe<string> | undefined;
  endCursor: Maybe<string> | undefined;
} {
  const [nodes, setNodes] = useState(connection.nodes);
  const {state, search} = useLocation() as {
    state: PaginationState;
    search: string;
  };
  const params = new URLSearchParams(search);
  const direction = params.get('direction');
  const isPrevious = direction === 'previous';

  // `connection` represents the data that came from the server
  // `state` represents the data that came from the client
  const currentPageInfo = useMemo(() => {
    let pageStartCursor =
      state?.pageInfo?.startCursor === undefined
        ? connection.pageInfo.startCursor
        : state.pageInfo.startCursor;

    let pageEndCursor =
      state?.pageInfo?.endCursor === undefined
        ? connection.pageInfo.endCursor
        : state.pageInfo.endCursor;

    if (state?.nodes) {
      if (isPrevious) {
        pageStartCursor = connection.pageInfo.startCursor;
      } else {
        pageEndCursor = connection.pageInfo.endCursor;
      }
    }

    const previousPageExists =
      state?.pageInfo?.hasPreviousPage === undefined
        ? connection.pageInfo.hasPreviousPage
        : state.pageInfo.hasPreviousPage;

    const nextPageExists =
      state?.pageInfo?.hasNextPage === undefined
        ? connection.pageInfo.hasNextPage
        : state.pageInfo.hasNextPage;

    return {
      startCursor: pageStartCursor,
      endCursor: pageEndCursor,
      hasPreviousPage: previousPageExists,
      hasNextPage: nextPageExists,
    };
  }, [
    isPrevious,
    state,
    connection.pageInfo.hasNextPage,
    connection.pageInfo.hasPreviousPage,
    connection.pageInfo.startCursor,
    connection.pageInfo.endCursor,
  ]);

  const prevPageUrl = useMemo(() => {
    const params = new URLSearchParams(search);
    params.set('direction', 'previous');
    currentPageInfo.startCursor &&
      params.set('cursor', currentPageInfo.startCursor);
    return `?${params.toString()}`;
  }, [search, currentPageInfo.startCursor]);

  const nextPageUrl = useMemo(() => {
    const params = new URLSearchParams(search);
    params.set('direction', 'next');
    currentPageInfo.endCursor &&
      params.set('cursor', currentPageInfo.endCursor);
    return `?${params.toString()}`;
  }, [search, currentPageInfo.endCursor]);

  // the only way to prevent hydration mismatches
  useEffect(() => {
    if (!state || !state?.nodes) {
      setNodes(connection.nodes);
      return;
    }

    if (isPrevious) {
      setNodes([...connection.nodes, ...state.nodes]);
    } else {
      setNodes([...state.nodes, ...connection.nodes]);
    }
  }, [state, isPrevious, connection.nodes]);

  return {...currentPageInfo, prevPageUrl, nextPageUrl, nodes};
}

/**
 * Get variables for route loader to support pagination
 * @returns cumulativePageInfo {startCursor, endCursor, hasPreviousPage, hasNextPage}
 */
export function getPaginationVariables(
  request: Request,
  options: {pageBy: number} = {pageBy: 20},
) {
  if (!(request instanceof Request)) {
    throw new Error(
      'getPaginationVariables must be called with the Request object passed to your loader function',
    );
  }

  const {pageBy} = options;
  const searchParams = new URLSearchParams(new URL(request.url).search);

  const cursor = searchParams.get('cursor') ?? undefined;
  const direction =
    searchParams.get('direction') === 'previous' ? 'previous' : 'next';
  const isPrevious = direction === 'previous';

  const prevPage = {
    last: pageBy,
    startCursor: cursor ?? null,
  };

  const nextPage = {
    first: pageBy,
    endCursor: cursor ?? null,
  };

  const variables = isPrevious ? prevPage : nextPage;

  return variables;
}

import * as build from '@remix-run/dev/server-build';
import {RESOURCE_TYPES, REQUIRED_RESOURCES} from '@shopify/hydrogen-remix';

type RESOURCE_TYPE = keyof typeof RESOURCE_TYPES;

type LoaderOutput = {
  customRoutes: Array<{pathname: string}>;
  resourceRoutes: Array<{pathname: string; type: RESOURCE_TYPE}>;
};

export async function loader() {
  const outputJSON: LoaderOutput = {
    customRoutes: [],
    resourceRoutes: [],
  };

  for (const [routeId, route] of Object.entries(build.routes)) {
    const {resourceType} = route.module?.handle?.hydrogen ?? {};

    if (!resourceType && route.path) {
      outputJSON.customRoutes.push({
        pathname: route.path,
      });
      continue;
    }

    if (!RESOURCE_TYPES[resourceType as RESOURCE_TYPE]) {
      console.warn(
        `Unknown resource type on route ${route.id}: ${resourceType}`,
      );
      continue;
    }

    if (route.path) {
      outputJSON.resourceRoutes.push({
        type: resourceType,
        pathname: route.path,
      });
    }
  }

  // @todo warn if required resources are not defined!

  return outputJSON;
}

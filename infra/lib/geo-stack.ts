import { Stack, type StackProps } from 'aws-cdk-lib';
import {
  CfnAPIKey,
  CfnMap,
  CfnPlaceIndex,
  CfnRouteCalculator,
} from 'aws-cdk-lib/aws-location';
import type { Construct } from 'constructs';
import { GEO_NAMES, type AwsConfig } from '../../config/load';

/** Map, place index, route calculator and a browser API key restricted to them. */
export class GeoStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { config: AwsConfig },
  ) {
    super(scope, id, props);
    const { geo } = props.config;

    const map = new CfnMap(this, 'Map', {
      mapName: GEO_NAMES.map,
      configuration: {
        style: geo.mapStyle,
        ...(geo.politicalView ? { politicalView: geo.politicalView } : {}),
      },
    });
    const places = new CfnPlaceIndex(this, 'Places', {
      indexName: GEO_NAMES.placeIndex,
      dataSource: geo.dataSource,
      dataSourceConfiguration: { intendedUse: 'SingleUse' },
    });
    const routes = new CfnRouteCalculator(this, 'Routes', {
      calculatorName: GEO_NAMES.routeCalculator,
      dataSource: geo.dataSource,
    });

    new CfnAPIKey(this, 'WebKey', {
      keyName: GEO_NAMES.apiKey,
      noExpiry: true,
      restrictions: {
        allowActions: [
          'geo:GetMap*',
          'geo:SearchPlaceIndexForText',
          'geo:SearchPlaceIndexForPosition',
          'geo:CalculateRoute',
        ],
        allowResources: [map.attrArn, places.attrArn, routes.attrArn],
        allowReferers: geo.allowedReferrers,
      },
    });
  }
}

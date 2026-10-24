# Farm Watch: imagery, forecasts and health reports

## What is connected

- The opt-in area map loads NASA GIBS MODIS Terra corrected-reflectance true-color raster tiles, or OpenStreetMap road tiles.
- Satellite imagery requests an explicit UTC day from the previous seven days. Yesterday is a default, not a claim that it is the newest available image.
- The selected forecast area is marked approximately. Moving the map does not change the forecast location.
- Existing OpenWeather five-day, three-hour forecasts and sourced plant/livestock health reports remain separate from the map. Forecasts require `OPENWEATHER_API_KEY`. Missing configuration and source failures are shown, not replaced with sample data.
- In-page notifications are not background push, SMS, or continuous farm monitoring.

## Limits and privacy

True-color imagery provides regional context, not a field inspection or a disease diagnosis. The visualization has approximately 250 m resolution, with relevant sensor bands at 250–500 m. Clouds, gaps and processing latency can obscure the ground. A successful tile request does not establish cloud-free coverage or prove the acquisition date of every pixel. Enlarging beyond native zoom 9 does not add detail.

There is no NDVI, yield prediction, soil-moisture estimation or individual crop/animal disease detection from this imagery. Those require separate suitable observations, methods and validation.

No map tiles or automatic browser geolocation are requested until the relevant user action. Loading maps discloses the viewed area and IP address to the chosen tile provider. Unloading removes the map and its listeners. The forecast coordinates are rounded to 0.1 degree by the existing Farm Watch location flow. They are not published to nearby farmers or saved as a farm boundary.

## Implementation

- `app/components/FarmSatelliteMap.vue`: consent, dated view controls, accessibility and lifecycle.
- `app/utils/satellite-map.js`: fixed provider allowlist, date validation, stale-event protection, map adapter.
- `app/components/FarmWatch.vue`: location, forecast, health sources, notifications and imagery composition.
- `app/tests/satellite-map.test.mjs`: dates, allowlists, tile failures, point updates, actual component mount/unmount and import cancellation.

The NASA layer and matrix are fixed. No arbitrary URL, credential or user-supplied provider host is accepted. Imagery uses `MODIS_Terra_CorrectedReflectance_TrueColor` and `GoogleMapsCompatible_Level9` in EPSG:3857.

## Primary references

- NASA GIBS map libraries: https://nasa-gibs.github.io/gibs-api-docs/map-library-usage/
- Dated WMTS requests: https://nasa-gibs.github.io/gibs-api-docs/access-basics/
- Projection and matrix compatibility: https://nasa-gibs.github.io/gibs-api-docs/access-advanced-topics/
- Layer metadata: https://github.com/nasa-gibs/worldview/blob/main/config/default/common/config/metadata/layers/modis/terra/MODIS_Terra_CorrectedReflectance_TrueColor.md

## Acceptance evidence

On October 24, 2026 a real NASA request for October 23, 2026 returned HTTP 200, `image/jpeg`, 10,351 bytes, decoded as a 256×256 JPEG. This verifies an actual tile endpoint response, not cloud-free field coverage. Focused component tests passed. Full build and browser acceptance are recorded separately after integration.

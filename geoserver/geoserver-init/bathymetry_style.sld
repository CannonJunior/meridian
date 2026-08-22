<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>bathymetry_contours</Name>
    <UserStyle>
      <Title>Bathymetry Contours</Title>
      <FeatureTypeStyle>
        <Rule>
          <Name>shallow</Name>
          <ogc:Filter><ogc:PropertyIsLessThan><ogc:PropertyName>depth_m</ogc:PropertyName><ogc:Literal>200</ogc:Literal></ogc:PropertyIsLessThan></ogc:Filter>
          <LineSymbolizer>
            <Stroke><CssParameter name="stroke">#2e6fa8</CssParameter><CssParameter name="stroke-width">0.5</CssParameter><CssParameter name="stroke-opacity">0.5</CssParameter></Stroke>
          </LineSymbolizer>
        </Rule>
        <Rule>
          <Name>mid</Name>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo><ogc:PropertyName>depth_m</ogc:PropertyName><ogc:Literal>200</ogc:Literal></ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan><ogc:PropertyName>depth_m</ogc:PropertyName><ogc:Literal>1000</ogc:Literal></ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <LineSymbolizer>
            <Stroke><CssParameter name="stroke">#2467a0</CssParameter><CssParameter name="stroke-width">0.7</CssParameter><CssParameter name="stroke-opacity">0.65</CssParameter></Stroke>
          </LineSymbolizer>
        </Rule>
        <Rule>
          <Name>deep</Name>
          <ogc:Filter><ogc:PropertyIsGreaterThanOrEqualTo><ogc:PropertyName>depth_m</ogc:PropertyName><ogc:Literal>1000</ogc:Literal></ogc:PropertyIsGreaterThanOrEqualTo></ogc:Filter>
          <LineSymbolizer>
            <Stroke><CssParameter name="stroke">#173f66</CssParameter><CssParameter name="stroke-width">0.9</CssParameter><CssParameter name="stroke-opacity">0.8</CssParameter></Stroke>
          </LineSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>

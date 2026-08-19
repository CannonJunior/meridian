<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>shipping_lanes</Name>
    <UserStyle>
      <Title>Shipping Lanes</Title>
      <FeatureTypeStyle>
        <Rule>
          <Name>major</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>lane_type</ogc:PropertyName><ogc:Literal>major</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <LineSymbolizer>
            <Stroke><CssParameter name="stroke">#c77dff</CssParameter><CssParameter name="stroke-width">1.4</CssParameter><CssParameter name="stroke-opacity">0.75</CssParameter></Stroke>
          </LineSymbolizer>
        </Rule>
        <Rule>
          <Name>middle</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>lane_type</ogc:PropertyName><ogc:Literal>middle</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <LineSymbolizer>
            <Stroke><CssParameter name="stroke">#9d4edd</CssParameter><CssParameter name="stroke-width">0.9</CssParameter><CssParameter name="stroke-opacity">0.6</CssParameter></Stroke>
          </LineSymbolizer>
        </Rule>
        <Rule>
          <Name>minor</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>lane_type</ogc:PropertyName><ogc:Literal>minor</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <LineSymbolizer>
            <Stroke><CssParameter name="stroke">#7b2cbf</CssParameter><CssParameter name="stroke-width">0.5</CssParameter><CssParameter name="stroke-opacity">0.4</CssParameter></Stroke>
          </LineSymbolizer>
        </Rule>
        <Rule>
          <Name>chokepoint</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>lane_type</ogc:PropertyName><ogc:Literal>chokepoint</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <LineSymbolizer>
            <Stroke><CssParameter name="stroke">#ffd60a</CssParameter><CssParameter name="stroke-width">2.2</CssParameter><CssParameter name="stroke-opacity">0.9</CssParameter></Stroke>
          </LineSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>

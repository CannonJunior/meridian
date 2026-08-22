<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>submarine_cables</Name>
    <UserStyle>
      <Title>Submarine Cables</Title>
      <FeatureTypeStyle>
        <Rule>
          <Name>operational</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>status</ogc:PropertyName><ogc:Literal>operational</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <LineSymbolizer>
            <Stroke><CssParameter name="stroke">#5b9dff</CssParameter><CssParameter name="stroke-width">1.1</CssParameter><CssParameter name="stroke-opacity">0.8</CssParameter></Stroke>
          </LineSymbolizer>
        </Rule>
        <Rule>
          <Name>abandoned</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>status</ogc:PropertyName><ogc:Literal>abandoned</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <LineSymbolizer>
            <Stroke><CssParameter name="stroke">#5b9dff</CssParameter><CssParameter name="stroke-width">0.7</CssParameter><CssParameter name="stroke-opacity">0.35</CssParameter><CssParameter name="stroke-dasharray">3 3</CssParameter></Stroke>
          </LineSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>

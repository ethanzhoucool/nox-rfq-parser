/** Plain constants shared by the zod schema and the browser. Keep this module free of imports. */

export const PRODUCT_TYPES = ["Plate", "Bar", "Tube"] as const;
export const SHAPES = ["Plate", "Round", "Square", "Rectangle"] as const;
export const COMPLIANCE = ["none", "dfars", "domestic"] as const;
export const CERT_FAMILIES = ["AMS", "QQ", "ASME", "ASTM"] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];
export type Shape = (typeof SHAPES)[number];
export type Compliance = (typeof COMPLIANCE)[number];
export type CertFamily = (typeof CERT_FAMILIES)[number];

export const DIMENSION_FIELDS = [
  "thickness_in",
  "width_in",
  "length_in",
  "height_in",
  "diameter_in",
  "outer_diameter_in",
  "outer_dimension_in",
  "wall_thickness_in",
] as const;
export type DimensionField = (typeof DIMENSION_FIELDS)[number];

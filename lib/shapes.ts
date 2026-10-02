import type { DimensionField, ExtractedLine, ProductType, Shape } from "./schema";

const REQUIRED: Record<ProductType, Partial<Record<Shape, DimensionField[]>>> = {
  Plate: { Plate: ["thickness_in", "width_in", "length_in"] },
  Bar: {
    Round: ["diameter_in", "length_in"],
    Square: ["width_in", "length_in"],
    Rectangle: ["height_in", "width_in", "length_in"],
  },
  Tube: {
    Round: ["outer_diameter_in", "wall_thickness_in", "length_in"],
    Square: ["outer_dimension_in", "wall_thickness_in", "length_in"],
    Rectangle: ["height_in", "width_in", "wall_thickness_in", "length_in"],
  },
};

export const DIMENSION_LABELS: Record<DimensionField, string> = {
  thickness_in: "thickness",
  width_in: "width",
  length_in: "length",
  height_in: "height",
  diameter_in: "diameter",
  outer_diameter_in: "outside diameter",
  outer_dimension_in: "outside dimension",
  wall_thickness_in: "wall thickness",
};

/** Plate is the only form whose shape is implied by the product type. */
export function effectiveShape(line: ExtractedLine): Shape | null {
  if (line.shape.value) return line.shape.value;
  return line.product_type.value === "Plate" ? "Plate" : null;
}

export function requiredDimensions(productType: ProductType, shape: Shape): DimensionField[] | null {
  return REQUIRED[productType][shape] ?? null;
}

export function describeForm(productType: ProductType, shape: Shape): string {
  return productType === "Plate" ? "plate" : `${shape.toLowerCase()} ${productType.toLowerCase()}`;
}
